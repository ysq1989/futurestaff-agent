import {candidateHash, decodeCandidateDraft, sanitizeCandidateText, type CandidateDomain, type CandidateDraft} from './governance-candidates.js'

/** Future Host-supplied metadata only. This type does not authenticate its caller. */
export interface DesktopBridgeContext {
  tenantId: string; actorId: string; identityId: string; desktopSessionId: string
  appId: string; appVersion: string; agentId: string; agentVersion: string; releaseId: string
  serverTaskId: string; authorizationVersion: string; validUntil: number
  hostSessionId: string; turn: number; runtimeEpoch: string; firstLiveSeq: number
  grants: {domain: CandidateDomain; policyId: string; policyVersion: string; purpose: string; audiences: string[]; receiver: string}[]
}
export interface DesktopBridgeReference {
  requestId: string; operationId: string; domain: CandidateDomain; previewHash: string; bindingHash: string
  context: DesktopBridgeContext
}
export interface DesktopBridgeBinding {reference: DesktopBridgeReference; draft: CandidateDraft}
export interface DesktopBridgeApprovedConfirmation {confirmationId: string; confirmedAt: number; expiresAt: number}
export interface DesktopBridgeSubmission {binding: DesktopBridgeBinding; confirmation: DesktopBridgeApprovedConfirmation}
export type DesktopBridgeConfirmation =
  | {status: 'pending' | 'denied'; reference: DesktopBridgeReference}
  | {status: 'confirmed'; reference: DesktopBridgeReference; confirmationId: string; confirmedAt: number; expiresAt: number}
export interface DesktopBridgeReceipt {status: 'received' | 'cancelled' | 'revoked'; reference: DesktopBridgeReference}
/** Fixture-only dependency injection. There is deliberately no production implementation. */
export interface IsolatedDesktopIntakeAdapter {
  kind: 'isolated_mock'
  beginConfirmation(binding: DesktopBridgeBinding, signal: AbortSignal): Promise<DesktopBridgeConfirmation>
  queryConfirmation(reference: DesktopBridgeReference, signal: AbortSignal): Promise<DesktopBridgeConfirmation>
  submit(submission: DesktopBridgeSubmission, signal: AbortSignal): Promise<DesktopBridgeReceipt>
  queryReceipt(reference: DesktopBridgeReference, signal: AbortSignal): Promise<DesktopBridgeReceipt | null>
  cancel(reference: DesktopBridgeReference, cancellationOperationId: string, signal: AbortSignal): Promise<DesktopBridgeReceipt>
}
export interface DesktopBridgeSnapshot {
  status: 'not_connected' | 'awaiting_confirmation' | 'ready' | 'submitting' | 'unknown' | 'querying' | 'received' | 'expired' | 'revoked' | 'cancelled'
  localOnly: true; binding: DesktopBridgeBinding | null; reference: DesktopBridgeReference | null
  confirmation: DesktopBridgeApprovedConfirmation | null
  needsQuery: boolean; reason: string
}

const adapters = new WeakMap<DesktopIntakeBridge, IsolatedDesktopIntakeAdapter>()
const domains: CandidateDomain[] = ['enterprise_knowledge', 'platform_product_feedback']
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_BRIDGE_CONTEXT')
  return value as Record<string, unknown>
}
const exact = (value: Record<string, unknown>, keys: string): boolean => Object.keys(value).sort().join(',') === keys.split(',').sort().join(',')
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !/[\x00-\x1f]/u.test(value) && sanitizeCandidateText(value).text === value
const timestamp = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
const canonical = (value: unknown): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value !== null && typeof value === 'object' ? '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}' : JSON.stringify(value)
const contextHashInput = (value: DesktopBridgeContext): string => canonical(value)
function decodeContext(value: unknown): DesktopBridgeContext {
  const c = object(value)
  if (!exact(c, 'tenantId,actorId,identityId,desktopSessionId,appId,appVersion,agentId,agentVersion,releaseId,serverTaskId,authorizationVersion,validUntil,hostSessionId,turn,runtimeEpoch,firstLiveSeq,grants')) throw Error('INVALID_BRIDGE_CONTEXT')
  for (const key of ['tenantId', 'actorId', 'identityId', 'desktopSessionId', 'appId', 'appVersion', 'agentId', 'agentVersion', 'releaseId', 'serverTaskId', 'authorizationVersion', 'hostSessionId', 'runtimeEpoch']) if (!text(c[key])) throw Error('INVALID_BRIDGE_CONTEXT')
  if (!Number.isSafeInteger(c.turn) || Number(c.turn) < 0 || !Number.isSafeInteger(c.firstLiveSeq) || Number(c.firstLiveSeq) < 0 || !timestamp(c.validUntil) || !Array.isArray(c.grants) || !c.grants.length || c.grants.length > 2) throw Error('INVALID_BRIDGE_CONTEXT')
  const seen = new Set<string>()
  for (const raw of c.grants) {
    const g = object(raw)
    if (!exact(g, 'domain,policyId,policyVersion,purpose,audiences,receiver') || !domains.includes(g.domain as CandidateDomain) || seen.has(String(g.domain))) throw Error('INVALID_BRIDGE_CONTEXT')
    seen.add(String(g.domain))
    if (![g.policyId, g.policyVersion, g.purpose, g.receiver].every(text) || !Array.isArray(g.audiences) || !g.audiences.length || g.audiences.length > 10 || !g.audiences.every(text) || new Set(g.audiences).size !== g.audiences.length) throw Error('INVALID_BRIDGE_CONTEXT')
  }
  return structuredClone(value) as DesktopBridgeContext
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item) }
  return value
}
async function localDigest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map(item => item.toString(16).padStart(2, '0')).join('')
}

/** Single-candidate, in-memory synthetic state machine. No credentials, persistence, HTTP or Host listeners. */
export class DesktopIntakeBridge {
  private clock: () => number
  private context: DesktopBridgeContext | null = null
  private contextInput = ''
  private generation = 0
  private controller: AbortController | undefined
  private reference: DesktopBridgeReference | null = null
  private input = ''
  private lockedKey = ''
  private operationId = ''
  private startedAt = 0
  private expiresAt = 0
  private cancellationId = ''
  private cancellationPending = false
  private uncertain = false
  private preparing: Promise<DesktopBridgeSnapshot> | null = null
  private polling: Promise<DesktopBridgeSnapshot> | null = null
  private sending: Promise<DesktopBridgeSnapshot> | null = null
  private querying: Promise<DesktopBridgeSnapshot> | null = null
  private listeners = new Set<() => void>()
  private snapshot: DesktopBridgeSnapshot = freeze({status: 'not_connected', localOnly: true, binding: null, reference: null, confirmation: null, needsQuery: false, reason: 'Desktop confirmation bridge is not connected'})

  constructor(options: {clock?: () => number} = {}) { this.clock = options.clock ?? Date.now }
  getSnapshot = (): DesktopBridgeSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  setContext(value: DesktopBridgeContext | null): void {
    let next: DesktopBridgeContext | null
    try { next = value === null ? null : decodeContext(value) }
    catch { this.context = null; this.contextInput = ''; this.invalidate('revoked', 'Invalid trusted context replacement'); throw Error('INVALID_BRIDGE_CONTEXT') }
    const input = next ? contextHashInput(next) : ''
    if (input === this.contextInput) return
    const hadContext = this.context !== null
    this.context = next; this.contextInput = input
    if (hadContext || this.lockedKey) this.invalidate('revoked', 'Trusted context changed; a previous dispatched request may still exist')
  }
  revoke(): void { this.context = null; this.contextInput = ''; this.invalidate('revoked', 'Authorization revoked') }
  refresh(): DesktopBridgeSnapshot {
    if (!['received', 'cancelled', 'revoked'].includes(this.snapshot.status) && (this.context && this.context.validUntil <= this.clock() || this.expiresAt && this.expiresAt <= this.clock() && ['awaiting_confirmation', 'ready', 'submitting'].includes(this.snapshot.status))) this.invalidate('expired', 'Authorization or confirmation expired')
    return this.snapshot
  }

  async prepare(value: CandidateDraft): Promise<DesktopBridgeSnapshot> {
    const adapter = adapters.get(this)
    if (!adapter) return this.snapshot
    if (this.uncertain || this.cancellationPending) throw Error('ORIGINAL_RECEIPT_QUERY_REQUIRED')
    const draft = decodeCandidateDraft(value), context = this.validContext()
    if (draft.owner.tenantId !== context.tenantId || draft.owner.actorId !== context.actorId) throw Error('BRIDGE_OWNER_MISMATCH')
    const grant = context.grants.find(item => item.domain === draft.domain)
    if (!grant || grant.policyId !== draft.scope.policyId || grant.policyVersion !== draft.scope.policyVersion || grant.purpose !== draft.scope.purpose || canonical(grant.audiences) !== canonical(draft.scope.audiences) || draft.scope.validUntil > context.validUntil) throw Error('BRIDGE_SCOPE_MISMATCH')
    const input = canonical({draft, context}), key = canonical([context.tenantId, context.actorId, draft.domain, draft.requestId])
    if (this.lockedKey) {
      if (this.lockedKey !== key) throw Error('BRIDGE_ACTIVE_REQUEST')
      if (this.input && this.input !== input) throw Error('PREVIEW_HASH_CONFLICT')
      if (!this.input && this.reference && await candidateHash(draft) !== this.reference.previewHash) throw Error('PREVIEW_HASH_CONFLICT')
      return this.preparing ?? this.refresh()
    }
    this.lockedKey = key; this.input = input; this.operationId = crypto.randomUUID(); this.startedAt = this.clock()
    this.expiresAt = Math.min(this.startedAt + 300_000, context.validUntil, draft.scope.validUntil)
    if (this.expiresAt <= this.startedAt) { this.invalidate('expired', 'Preview expired'); return this.snapshot }
    const generation = this.generation, controller = this.newController()
    this.preparing = (async () => {
      const previewHash = await candidateHash(draft)
      const bindingHash = await localDigest(canonical({draft, context, operationId: this.operationId, startedAt: this.startedAt, expiresAt: this.expiresAt}))
      if (!this.current(generation, controller)) return this.snapshot
      if (this.expiresAt <= this.clock()) { this.invalidate('expired', 'Preview expired during preparation'); return this.snapshot }
      this.reference = {requestId: draft.requestId, operationId: this.operationId, domain: draft.domain, previewHash, bindingHash, context}
      const binding = {reference: this.reference, draft}
      this.publish({status: 'awaiting_confirmation', binding, reference: this.reference, reason: ''})
      if (!this.current(generation, controller) || this.expiresAt <= this.clock()) return this.snapshot
      try { this.applyConfirmation(await adapter.beginConfirmation(structuredClone(binding), controller.signal), generation, controller) }
      catch { if (this.current(generation, controller)) this.publish({reason: 'Confirmation outcome unavailable; no submission is permitted'}) }
      return this.snapshot
    })()
    try { return await this.preparing }
    catch (error) { if (this.current(generation, controller)) this.invalidate('revoked', 'Invalid local preview binding'); throw error }
    finally { this.preparing = null }
  }

  async pollConfirmation(): Promise<DesktopBridgeSnapshot> {
    if (this.polling) return this.polling
    this.refresh()
    if (this.snapshot.status !== 'awaiting_confirmation' || !this.reference) return this.snapshot
    const adapter = adapters.get(this)
    if (!adapter) return this.snapshot
    const generation = this.generation, controller = this.newController(), reference = structuredClone(this.reference)
    this.polling = (async () => {
      try { this.applyConfirmation(await adapter.queryConfirmation(reference, controller.signal), generation, controller) }
      catch { if (this.current(generation, controller)) this.publish({reason: 'Confirmation outcome unavailable; no submission is permitted'}) }
      return this.snapshot
    })()
    try { return await this.polling } finally { this.polling = null }
  }

  async submit(): Promise<DesktopBridgeSnapshot> {
    if (!adapters.has(this)) return this.snapshot
    if (this.sending) return this.sending
    if (this.uncertain || this.cancellationPending) return this.snapshot
    this.refresh()
    if (this.snapshot.status !== 'ready' || !this.snapshot.binding || !this.snapshot.confirmation) throw Error('HUMAN_CONFIRMATION_REQUIRED')
    this.validContext()
    const generation = this.generation, controller = this.newController(), submission = structuredClone({binding: this.snapshot.binding, confirmation: this.snapshot.confirmation})
    this.uncertain = true; this.publish({status: 'submitting', needsQuery: true})
    this.sending = (async () => {
      if (!this.current(generation, controller)) return this.snapshot
      try {
        const result = await adapters.get(this)!.submit(submission, controller.signal)
        this.refresh()
        if (this.current(generation, controller)) this.applyReceipt(result)
      } catch { if (this.current(generation, controller)) this.markUnknown('Query the original request before any further action') }
      return this.snapshot
    })()
    try { return await this.sending } finally { this.sending = null }
  }

  async recover(): Promise<DesktopBridgeSnapshot> {
    if (this.querying) return this.querying
    if ((!this.uncertain && !this.cancellationPending) || !this.reference) return this.snapshot
    const context = this.context
    if (!context || context.validUntil <= this.clock() || contextHashInput(context) !== contextHashInput(this.reference.context)) throw Error('ORIGINAL_CONTEXT_REQUIRED')
    const adapter = adapters.get(this)
    if (!adapter) return this.snapshot
    const generation = this.generation, controller = this.newController(), reference = structuredClone(this.reference)
    this.publish({status: 'querying', reference, needsQuery: true, binding: null, confirmation: null})
    this.querying = (async () => {
      if (!this.current(generation, controller)) return this.snapshot
      try {
        const result = await adapter.queryReceipt(reference, controller.signal)
        this.refresh()
        if (this.current(generation, controller)) result === null ? this.markUnknown('No definitive receipt; the original request remains uncertain') : this.applyReceipt(result)
      } catch { if (this.current(generation, controller)) this.markUnknown('Receipt query failed; the original request remains uncertain') }
      return this.snapshot
    })()
    try { return await this.querying } finally { this.querying = null }
  }

  async cancel(): Promise<DesktopBridgeSnapshot> {
    if (!this.lockedKey || !adapters.has(this)) return this.snapshot
    this.cancellationId ||= crypto.randomUUID()
    this.cancellationPending ||= this.reference !== null
    this.invalidate('cancelled', 'Local cancellation tombstone prevents further submission')
    const reference = this.reference, adapter = adapters.get(this), context = this.context
    if (!reference || !adapter || !context || context.validUntil <= this.clock() || contextHashInput(context) !== contextHashInput(reference.context)) return this.snapshot
    const generation = this.generation, controller = this.newController()
    try {
      const result = await adapter.cancel(structuredClone(reference), this.cancellationId, controller.signal)
      if (this.current(generation, controller) && this.matchesReceipt(result) && ['cancelled', 'revoked'].includes(result.status)) { this.uncertain = false; this.cancellationPending = false; this.publish({needsQuery: false, reason: 'Final cancellation or revocation receipt verified'}) }
    } catch { /* A local tombstone does not claim the server cancellation succeeded. */ }
    return this.snapshot
  }

  private validContext(): DesktopBridgeContext {
    if (!this.context || this.context.validUntil <= this.clock()) throw Error('VALID_BRIDGE_CONTEXT_REQUIRED')
    return this.context
  }
  private newController(): AbortController { this.controller?.abort(); return this.controller = new AbortController() }
  private current(generation: number, controller: AbortController): boolean {
    this.refresh()
    return generation === this.generation && !controller.signal.aborted && this.context !== null && this.context.validUntil > this.clock()
  }
  private publish(update: Partial<DesktopBridgeSnapshot>): void { this.snapshot = freeze(structuredClone({...this.snapshot, ...update})); for (const listener of this.listeners) listener() }
  private invalidate(status: 'revoked' | 'expired' | 'cancelled', reason: string): void {
    this.generation++; this.controller?.abort(); this.input = ''
    this.publish({status, binding: null, reference: null, confirmation: null, needsQuery: this.uncertain || this.cancellationPending, reason})
  }
  private applyConfirmation(value: unknown, generation: number, controller: AbortController): void {
    if (!this.current(generation, controller)) return
    this.refresh()
    if (!this.current(generation, controller)) return
    try {
      const result = object(value), expected = result.status === 'confirmed' ? 'status,reference,confirmationId,confirmedAt,expiresAt' : 'status,reference'
      if (!exact(result, expected) || !['pending', 'denied', 'confirmed'].includes(String(result.status)) || canonical(result.reference) !== canonical(this.reference)) throw Error('INVALID_CONFIRMATION')
      if (result.status === 'denied') { this.invalidate('revoked', 'Human confirmation denied'); return }
      if (result.status === 'pending') return
      if (!text(result.confirmationId) || !timestamp(result.confirmedAt) || !timestamp(result.expiresAt) || result.confirmedAt < this.startedAt || result.confirmedAt > this.clock() || result.expiresAt <= this.clock() || result.expiresAt > this.expiresAt || result.expiresAt - result.confirmedAt > 300_000) throw Error('INVALID_CONFIRMATION')
      this.expiresAt = result.expiresAt
      this.publish({status: 'ready', confirmation: {confirmationId: result.confirmationId, confirmedAt: result.confirmedAt, expiresAt: result.expiresAt}, reason: ''})
    } catch { this.invalidate('revoked', 'Malformed or mismatched confirmation; submission is blocked') }
  }
  private matchesReceipt(value: unknown): value is DesktopBridgeReceipt {
    try { const result = object(value); return exact(result, 'status,reference') && ['received', 'cancelled', 'revoked'].includes(String(result.status)) && canonical(result.reference) === canonical(this.reference) } catch { return false }
  }
  private markUnknown(reason: string): void { this.publish({status: this.cancellationId ? 'cancelled' : 'unknown', needsQuery: true, reason}) }
  private applyReceipt(value: unknown): void {
    if (!this.matchesReceipt(value)) { this.markUnknown('Mismatched receipt; query the original request'); return }
    this.uncertain = false
    this.input = ''
    if (this.cancellationId) {
      if (value.status !== 'received') this.cancellationPending = false
      this.publish({status: 'cancelled', needsQuery: this.cancellationPending, binding: null, confirmation: null, reason: this.cancellationPending ? 'Original receipt found; cancellation is still unacknowledged. Retry the same cancellation operation' : 'Final cancellation or revocation receipt verified'})
      return
    }
    this.publish({status: value.status, needsQuery: false, binding: null, confirmation: null, reason: value.status === 'received' ? 'Candidate received only; source reuse and administrator publication remain separate' : ''})
  }
}

/** Explicit synthetic fixture opt-in. Never installs a production transport or authorizes supplied identities. */
export function createIsolatedDesktopIntakeBridge(adapter: IsolatedDesktopIntakeAdapter, options: {clock?: () => number} = {}): DesktopIntakeBridge {
  if (!adapter || adapter.kind !== 'isolated_mock' || !['beginConfirmation', 'queryConfirmation', 'submit', 'queryReceipt', 'cancel'].every(key => typeof adapter[key as keyof IsolatedDesktopIntakeAdapter] === 'function')) throw Error('INVALID_ISOLATED_DESKTOP_ADAPTER')
  const bridge = new DesktopIntakeBridge(options); adapters.set(bridge, adapter); return bridge
}
