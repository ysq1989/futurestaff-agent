import {identifyCandidates, sanitizeCandidateText, type CandidateDomain, type CandidateDraft, type CandidateOwner} from './governance-candidates.js'

/** Supplied by a trusted future Host bridge, never by event payloads or tools. */
export interface TrustedTaskBinding {
  owner: CandidateOwner; sessionId: string; taskId: string; turn: number
  authorizationVersion: string; firstLiveSeq: number
}
interface MinimalEventBase {seq: number; eventId: string; version: string; turn: number}
export type MinimalTaskEvent = MinimalEventBase & (
  | {type: 'user_statement'; source: 'user'; text: string}
  | {type: 'assistant_message'; text: string; interrupted: boolean}
  | {type: 'task_end'; outcome: 'completed' | 'aborted'}
  | {type: 'task_cancel'}
)
export interface TaskCandidateProposal {
  draft: CandidateDraft; origin: 'explicit_user' | 'rule_summary'; reason: string
  sourceEventIds: string[]; summary: string
}
export interface TaskCandidateSnapshot {
  epoch: number
  status: 'disabled' | 'not_connected' | 'idle' | 'listening' | 'summarizing' | 'ready' | 'cancelled' | 'blocked' | 'disposed'
  binding: TrustedTaskBinding | null; candidates: readonly TaskCandidateProposal[]; eventCount: number; reason: string
}
export interface TaskCandidateControllerOptions {
  sourceKind?: 'isolated_synthetic' | 'desktop_current_task'; enabled?: boolean; clock?: () => number
}
type AcceptResult = 'accepted' | 'duplicate' | 'ignored' | 'blocked'
const emptyCandidates: readonly TaskCandidateProposal[] = Object.freeze([])
const domains: CandidateDomain[] = ['enterprise_knowledge', 'platform_product_feedback']
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const index = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const clauses = (text: string): string[] => text.split(/(?<=[。；;！？!?])|\r?\n/u).map(item => item.trim()).filter(Boolean)
const taskPreference = (text: string): boolean => /(?:这次|本次|这张|本张|这幅|当前任务)/u.test(text)
const brandStandard = (text: string): boolean => !taskPreference(text) && /品牌/u.test(text) && /(?:长期|固定|始终|统一|一直)/u.test(text) && /(?:标准|规范|要求|使用|比例|画幅|尺寸)/u.test(text)
function enterpriseClaim(text: string): boolean {
  return clauses(text).some(clause => brandStandard(clause) || (!taskPreference(clause) && /(?:公司|企业)[\p{Script=Han}]{0,12}(?:规定|政策|制度|标准|要求|流程)|(?:公司|企业)(?:成立|位于|名称|属于|负责|统一|采用)|我们公司(?:长期|一直|每次)/u.test(clause)))
}
function feedbackClaim(text: string): boolean {
  if (/(?:并非|不是|并没有).{0,6}(?:无法|失败|缺少|没有选项)/u.test(text)) return false
  const actualGap = /(?:无法|不能|没法|不支持).{0,12}(?:生成|制作|选择|使用|设置|导出|保存)|(?:没有|缺少|找不到).{0,8}(?:选项|入口|按钮|功能)|(?:生成|制作|工具|功能|系统|流程|步骤).{0,12}(?:失败|报错|卡住|不支持|太慢|不好用|不方便)/u.test(text)
  const explicit = /(?:产品反馈|功能反馈|系统反馈|实际[：:].*(?:期望|无法|没有|失败))/u.test(text)
  const featureRequest = !taskPreference(text) && /(?:产品|平台|系统|工具|功能|图片制作|生成器|软件|应用|界面)/u.test(text) && /(?:希望|期望|建议|请|需要)/u.test(text) && /(?:支持|增加|新增|提供|允许|改进|优化|长期|每次|以后)/u.test(text)
  return actualGap || explicit || featureRequest
}

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function textBlocks(value: unknown): string {
  if (!Array.isArray(value)) return ''
  let result = ''
  for (const block of value.slice(0, 32)) {
    const item = record(block)
    if (item?.type === 'text' && typeof item.text === 'string') result += (result ? '\n' : '') + item.text.slice(0, 1000 - result.length)
    if (result.length >= 1000) break
  }
  return result.trim()
}

/** Pure projection of post-commit live SessionEvents; does not subscribe to or read a session. */
export function normalizeTaskSessionEvent(envelope: unknown, context: {firstLiveSeq: number; turn: number; activeTurn: number}): MinimalTaskEvent | null {
  const event = record(envelope)
  if (!event || !index(event.seq) || !index(context.firstLiveSeq) || !index(context.turn) || context.activeTurn !== context.turn || event.seq < context.firstLiveSeq || (event.surfaceOp !== undefined && event.surfaceOp !== 'append')) return null
  const data = record(event.data)
  if (!data) return null
  const base: MinimalEventBase = {seq: event.seq, eventId: `session-event:${event.seq}`, version: String(event.seq), turn: context.turn}
  if (event.type === 'user/message') {
    if (data.role !== 'user' || record(data.source)?.kind !== 'user') return null
    const text = textBlocks(data.content)
    return text ? {...base, type: 'user_statement', source: 'user', text} : null
  }
  if (data.turn !== context.turn) return null
  if (event.type === 'assistant/message') {
    const message = record(data.message)
    if (message?.role !== 'assistant' || data.interrupted === true) return null
    const text = textBlocks(message.content)
    return text ? {...base, type: 'assistant_message', text, interrupted: false} : null
  }
  if (event.type === 'turn/end') return {...base, type: 'task_end', outcome: record(data.reason)?.kind === 'completed' ? 'completed' : 'aborted'}
  return null
}

function decodeEvent(value: unknown): MinimalTaskEvent | null {
  const event = record(value)
  if (!event || !index(event.seq) || !index(event.turn) || typeof event.eventId !== 'string' || !event.eventId || event.eventId.length > 128 || typeof event.version !== 'string' || !event.version || event.version.length > 80) return null
  const base = 'eventId,seq,turn,type,version'
  const expected = event.type === 'user_statement' ? base + ',source,text' : event.type === 'assistant_message' ? base + ',interrupted,text' : event.type === 'task_end' ? base + ',outcome' : event.type === 'task_cancel' ? base : ''
  if (!expected || Object.keys(event).sort().join(',') !== expected.split(',').sort().join(',')) return null
  if (event.type === 'user_statement' && event.source !== 'user') return null
  if ((event.type === 'user_statement' || event.type === 'assistant_message') && (typeof event.text !== 'string' || !event.text.trim() || event.text.length > 1000)) return null
  if (event.type === 'assistant_message' && typeof event.interrupted !== 'boolean') return null
  if (event.type === 'task_end' && event.outcome !== 'completed' && event.outcome !== 'aborted') return null
  return structuredClone(value) as MinimalTaskEvent
}

/** In-memory, synthetic-only task aggregation. Desktop input stays disconnected even when enabled. */
export class TaskCandidateController {
  private enabled: boolean
  private sourceKind: NonNullable<TaskCandidateControllerOptions['sourceKind']>
  private clock: () => number
  private generation = 0
  private closing = false
  private terminated = false
  private disposed = false
  private seenIds = new Map<string, {seq: number; version: string; hash: string}>()
  private seenSeq = new Map<number, string>()
  private highWater = -1
  private closedSeq: number | null = null
  private events: (MinimalTaskEvent & {redacted: boolean})[] = []
  private suppressed = new Set<CandidateDomain>()
  private listeners = new Set<() => void>()
  private inputChain: Promise<void> = Promise.resolve()
  private pendingEnd: Promise<void> | null = null
  private snapshot: TaskCandidateSnapshot

  constructor(options: TaskCandidateControllerOptions = {}) {
    this.enabled = options.enabled ?? false; this.sourceKind = options.sourceKind ?? 'desktop_current_task'; this.clock = options.clock ?? Date.now
    this.snapshot = {epoch: 0, status: this.initialStatus(), binding: null, candidates: emptyCandidates, eventCount: 0, reason: ''}
  }
  getSnapshot = (): TaskCandidateSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  setBinding(binding: TrustedTaskBinding | null): void {
    if (this.disposed) return
    if (binding && (!binding.owner.tenantId || !binding.owner.actorId || !binding.sessionId || !binding.taskId || !binding.authorizationVersion || !index(binding.turn) || !index(binding.firstLiveSeq))) throw Error('INVALID_TRUSTED_TASK_BINDING')
    const current = this.snapshot.binding
    if ((!binding && !current) || (binding && current && binding.owner.tenantId === current.owner.tenantId && binding.owner.actorId === current.owner.actorId && binding.sessionId === current.sessionId && binding.taskId === current.taskId && binding.turn === current.turn && binding.authorizationVersion === current.authorizationVersion && binding.firstLiveSeq === current.firstLiveSeq)) return
    this.clear(); this.highWater = binding ? binding.firstLiveSeq - 1 : -1
    this.publish({binding: binding ? structuredClone(binding) : null, epoch: this.snapshot.epoch + 1, status: this.initialStatus(binding), candidates: emptyCandidates, eventCount: 0, reason: ''})
  }
  setEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.enabled) return
    this.enabled = enabled; this.clear()
    this.publish({epoch: this.snapshot.epoch + 1, status: this.initialStatus(), candidates: emptyCandidates, eventCount: 0, reason: ''})
  }
  revoke(): void { if (!this.disposed) { this.enabled = false; this.clear(); this.publish({epoch: this.snapshot.epoch + 1, status: 'disabled', candidates: emptyCandidates, eventCount: 0, reason: '本任务候选权限已撤回'}) } }
  cancel(): void { if (!this.disposed) { this.clear(); this.terminated = true; this.publish({epoch: this.snapshot.epoch + 1, status: 'cancelled', candidates: emptyCandidates, eventCount: 0, reason: '本任务已取消'}) } }
  dispose(): void { if (!this.disposed) { this.clear(); this.disposed = true; this.publish({epoch: this.snapshot.epoch + 1, status: 'disposed', candidates: emptyCandidates, eventCount: 0, reason: ''}); this.listeners.clear() } }
  dismiss(domain: CandidateDomain): void {
    if (!domains.includes(domain)) throw Error('INVALID_CANDIDATE_DOMAIN')
    this.suppressed.add(domain)
    const candidates = this.snapshot.candidates.filter(item => item.draft.domain !== domain)
    if (candidates.length !== this.snapshot.candidates.length) this.publish({candidates})
  }

  /** Accept one normalized increment in arrival order; fingerprints contain no retained raw content. */
  accept(value: unknown): Promise<AcceptResult> {
    if (!this.canRead()) return Promise.resolve('ignored')
    const event = decodeEvent(value), binding = this.snapshot.binding!
    if (event && (event.type === 'task_cancel' || (event.type === 'task_end' && event.outcome === 'aborted'))) {
      if (event.turn !== binding.turn || event.seq < binding.firstLiveSeq || event.seq < this.highWater) return Promise.resolve('ignored')
      if (this.seenIds.has(event.eventId) || this.seenSeq.has(event.seq)) return Promise.resolve(this.block('取消事件与已有事件冲突'))
      this.cancel(); return Promise.resolve('accepted')
    }
    if (this.closing) return Promise.resolve('ignored')
    const generation = this.generation
    const run = this.inputChain.then(async (): Promise<AcceptResult> => {
      if (generation !== this.generation || !this.canRead()) return 'ignored'
      if (!event) return this.block('增量事件字段不合法')
      const binding = this.snapshot.binding!
      if (event.turn !== binding.turn || event.seq < binding.firstLiveSeq) return 'ignored'
      const fingerprint = await hash(JSON.stringify(Object.entries(event).sort(([a], [b]) => a.localeCompare(b))))
      if (generation !== this.generation || !this.canRead()) return 'ignored'
      const previous = this.seenIds.get(event.eventId), sequenceOwner = this.seenSeq.get(event.seq)
      if (previous) return previous.seq === event.seq && previous.version === event.version && previous.hash === fingerprint ? 'duplicate' : this.block('同一事件出现冲突')
      if (sequenceOwner !== undefined) return this.block('同一事件序号出现冲突')
      if (this.closedSeq !== null && event.seq > this.closedSeq) return 'ignored'
      if (event.seq <= this.highWater) return 'ignored'
      if (this.seenIds.size >= 64) return this.block('本任务增量达到本地上限')
      this.seenIds.set(event.eventId, {seq: event.seq, version: event.version, hash: fingerprint}); this.seenSeq.set(event.seq, event.eventId); this.highWater = event.seq
      if (event.type === 'task_end') { this.closedSeq = event.seq; void this.end(); return 'accepted' }
      if (event.type === 'assistant_message' && event.interrupted) return 'ignored'
      const sanitized = sanitizeCandidateText(event.text)
      this.events.push({...event, text: sanitized.text, redacted: sanitized.redacted})
      this.publish({eventCount: this.events.length})
      return 'accepted'
    })
    this.inputChain = run.then(() => undefined, () => undefined)
    return run
  }

  /** Seal the task and create at most one local proposal per domain; repeated ends do not regenerate ids. */
  end(): Promise<void> {
    if (this.pendingEnd) return this.pendingEnd
    if (!this.canRead() || this.terminated) return Promise.resolve()
    this.closing = true
    const generation = this.generation
    this.pendingEnd = this.inputChain.then(async () => {
      if (generation !== this.generation || !this.canRead() || this.terminated) return
      this.closedSeq ??= this.highWater
      this.publish({status: 'summarizing'})
      const candidates = await this.summarize(generation)
      if (generation !== this.generation || !this.canRead() || this.terminated) return
      this.publish({status: 'ready', candidates: candidates.filter(item => !this.suppressed.has(item.draft.domain)), reason: candidates.length ? '规则整理完成，尚未提交' : '没有足够的候选信息'})
    })
    return this.pendingEnd
  }
  flush(): Promise<void> { return this.end() }

  private initialStatus(binding: TrustedTaskBinding | null = this.snapshot?.binding ?? null): TaskCandidateSnapshot['status'] { return !this.enabled ? 'disabled' : this.sourceKind !== 'isolated_synthetic' ? 'not_connected' : binding ? 'listening' : 'idle' }
  private canRead(): boolean { return !this.disposed && !this.terminated && this.enabled && this.sourceKind === 'isolated_synthetic' && !!this.snapshot.binding }
  private publish(update: Partial<TaskCandidateSnapshot>): void { this.snapshot = {...this.snapshot, ...update}; for (const listener of this.listeners) listener() }
  private clear(): void { this.generation++; this.events = []; this.seenIds.clear(); this.seenSeq.clear(); this.suppressed.clear(); this.closing = false; this.closedSeq = null; this.terminated = false; this.inputChain = Promise.resolve(); this.pendingEnd = null; this.highWater = this.snapshot.binding ? this.snapshot.binding.firstLiveSeq - 1 : -1 }
  private block(reason: string): 'blocked' { this.clear(); this.terminated = true; this.publish({epoch: this.snapshot.epoch + 1, status: 'blocked', candidates: emptyCandidates, eventCount: 0, reason}); return 'blocked' }

  private async summarize(generation: number): Promise<TaskCandidateProposal[]> {
    const binding = this.snapshot.binding!, groups = new Map<CandidateDomain, TaskCandidateProposal[]>()
    const namespace = await hash(JSON.stringify([binding.owner.tenantId, binding.owner.actorId, binding.sessionId, binding.taskId, binding.turn, binding.authorizationVersion]))
    const authorizationHash = await hash(binding.authorizationVersion)
    let question = ''
    const contexts = new Map<CandidateDomain, TaskCandidateProposal>()
    for (const event of this.events) {
      if (generation !== this.generation) return []
      if (event.type === 'assistant_message') { question = /[？?]|(?:请补充|请确认|还缺|需要提供)/u.test(event.text) ? event.text : ''; continue }
      if (event.type !== 'user_statement') continue
      const sourceId = `s:${binding.sessionId.slice(0, 40)}|t:${binding.taskId.slice(0, 40)}|e:${event.seq}|h:${await hash(JSON.stringify([namespace, event.eventId, event.seq]))}`
      const sourceVersion = `local-seq:${event.seq};auth:${authorizationHash}`
      const input = {owner: binding.owner, activeConversationId: binding.sessionId, conversationId: binding.sessionId, sourceId, sourceVersion, authorized: true, now: this.clock()}
      const directTexts: [CandidateDomain, string][] = [
        ['enterprise_knowledge', clauses(event.text).filter(enterpriseClaim).join('')],
        ['platform_product_feedback', clauses(event.text).filter(feedbackClaim).join('')],
      ]
      let drafts: CandidateDraft[] = []
      let inferred = false
      const transformedTexts = new Map<CandidateDomain, string>()
      let context: TaskCandidateProposal | undefined
      for (const [domain, necessary] of directTexts) {
        if (!necessary) continue
        const prefix = domain === 'enterprise_knowledge' ? '新事实' : '用户反馈'
        const template = (await identifyCandidates({...input, text: `${prefix}：${necessary}`})).find(draft => draft.domain === domain)
        if (template) { drafts.push(template); transformedTexts.set(domain, necessary) }
      }
      if (!drafts.length && question && contexts.has('enterprise_knowledge') && /(?:适用|范围|规定|事实|有效期|哪个部门|哪个区域)/u.test(question)) {
        drafts = await identifyCandidates({...input, text: `适用范围补充：${event.text}`}); inferred = true; context = contexts.get('enterprise_knowledge')
      }
      if (!drafts.length && question && contexts.has('platform_product_feedback') && /(?:目标|期望|入口|版本|实际|反馈|比例|尺寸|分辨率|画幅|宽高比)/u.test(question)) {
        drafts = await identifyCandidates({...input, text: `用户反馈补充：${event.text}`}); inferred = true; context = contexts.get('platform_product_feedback')
      }
      if (!drafts.length && contexts.size === 1 && /(?:不对|不是|改成|应该|实际是|更正为)/u.test(event.text)) {
        context = [...contexts.values()][0]
        drafts = await identifyCandidates({...input, text: `${context?.draft.domain === 'platform_product_feedback' ? '用户反馈纠正' : '更正（适用域待核对）'}：${event.text}`}); inferred = true
      }
      for (const draft of drafts) {
        draft.evidence = draft.evidence.map(item => ({...item, redacted: item.redacted || event.redacted}))
        if (inferred || transformedTexts.has(draft.domain)) {
          const excerpt = (transformedTexts.get(draft.domain) ?? event.text).slice(0, 600)
          draft.evidence = [...(context?.draft.evidence ?? []), {sourceId, sourceVersion, sourceHash: await hash(excerpt), excerpt, redacted: event.redacted, kind: 'user_statement' as const}].slice(-4)
          if (transformedTexts.has(draft.domain) && !inferred) draft.content = excerpt
        }
        if (draft.domain === 'platform_product_feedback') draft.verification = 'unverified'
        if (inferred) { draft.title = '规则整理的待核对候选'; draft.basis = 'rule_summary'; draft.verification = 'unverified' }
        const items = groups.get(draft.domain) ?? []
        const normalized = (text: string): string => text.normalize('NFKC').replace(/\s/gu, '').replace(/[。.!！?？;；]+$/gu, '')
        const duplicate = items.find(item => normalized(item.draft.content) === normalized(draft.content))
        const sourceEventIds = [...(context?.sourceEventIds ?? []), event.eventId]
        const proposal: TaskCandidateProposal = {draft, origin: inferred ? 'rule_summary' : 'explicit_user', sourceEventIds, reason: inferred ? '根据同域用户前文关联澄清回答，未调用模型，需要用户核对' : '当前任务中用户明确提供的企业事实或产品诉求，尚未核实', summary: draft.content}
        if (duplicate) duplicate.sourceEventIds.push(...sourceEventIds)
        else items.push(proposal)
        if (!inferred) contexts.set(draft.domain, duplicate ?? proposal)
        groups.set(draft.domain, items); question = ''
      }
    }
    return [...groups.values()].map(items => {
      const selected = items.slice(-4), last = selected[selected.length - 1]!, combined = selected.length > 1 || selected.some(item => item.origin === 'rule_summary')
      const draft = structuredClone(last.draft)
      draft.content = selected.map(item => item.draft.content).join('\n').slice(0, 4000)
      draft.evidence = [...new Map(selected.flatMap(item => item.draft.evidence).map(item => [`${item.sourceId}:${item.sourceVersion}:${item.sourceHash}`, item])).values()].slice(-4)
      for (const field of ['goal', 'expected', 'actual', 'entrypoint', 'aspectRatio'] as const) draft[field] = [...selected].reverse().map(item => item.draft[field]).find(Boolean) ?? ''
      if (selected.some(item => item.draft.knowledgeKind === 'correction')) draft.knowledgeKind = 'correction'
      if (combined) { draft.title = '规则整理的任务候选'; draft.basis = 'rule_summary'; draft.verification = 'unverified' }
      return {draft, origin: combined ? 'rule_summary' : 'explicit_user', reason: combined ? '按当前任务规则合并同域必要原话，未调用模型，需要用户核对' : last.reason, sourceEventIds: [...new Set(selected.flatMap(item => item.sourceEventIds))], summary: combined ? `规则整理（${selected.length}条必要原话）：${selected.map(item => item.summary).join('；')}` : last.summary}
    })
  }
}

/** Explicit synthetic opt-in for isolated fixtures; never attaches a desktop event listener. */
export function createSyntheticTaskCandidateController(binding: TrustedTaskBinding, options: {clock?: () => number} = {}): TaskCandidateController {
  const controller = new TaskCandidateController({...options, sourceKind: 'isolated_synthetic', enabled: true})
  controller.setBinding(binding)
  return controller
}
