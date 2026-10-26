import {CandidateConsentClient} from '../governance-desktop-window-client.js'
import {useEffect, useId, useRef, useState, useSyncExternalStore} from 'react'
import type {Context} from '@deepseek-ai/cordis'
import type {PlatformDevClientController} from './index.js'
import {identifyCandidates, sanitizeCandidateText, candidateHash, type CandidateDraft, type CandidateOwner, type CandidateDomain} from '../governance-candidates.js'
import {LocalCandidateOutbox} from '../governance-outbox.js'
import {inspectCandidateDraftCompatibility, type DraftCompatibilityIssue} from '../governance-desktop-draft-compatibility.js'
import {MessageCard, MessageCardAction, MessageCardNotice} from './message-card.js'
import type {TaskCandidateController} from '../governance-task-events.js'

type TaskSuggestion = ReturnType<TaskCandidateController['getSnapshot']>['candidates'][number]
const noTaskSnapshot = {epoch: 0, binding: null, candidates: [] as TaskSuggestion[], status: 'not_connected'}
const noTaskSubscription = () => () => {}

const names: Record<CandidateDomain, string> = {enterprise_knowledge: '企业知识候选', platform_product_feedback: '产品反馈'}
const css = `
.fs-candidate-dock{box-sizing:border-box;flex:none;min-width:0;width:calc(100% - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-side-clearance,16px) - 4 * var(--dsh-composer-dock-inset,8px));max-width:calc(var(--dsh-composer-card-max-width,832px) - 4 * var(--dsh-composer-dock-inset,8px));margin:0 auto;border:1px solid var(--border-default);border-radius:8px;background:var(--bg-primary);font-size:13px;line-height:1.5;color:var(--text-primary);overflow-wrap:anywhere}
.fs-candidate-dock *{box-sizing:border-box;min-width:0}
.fs-candidate-dock>summary{cursor:pointer;min-height:36px;padding:8px 12px;color:var(--text-secondary);font-weight:500;border-radius:inherit}
.fs-candidate-dock[open]>summary{border-bottom:1px solid var(--border-default);border-radius:8px 8px 0 0}
.fs-candidate-dock__body{max-height:min(var(--dsh-composer-text-max-height,336px),32dvh);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;padding:12px}
.fs-candidate-dock summary{cursor:pointer;color:var(--text-secondary)}
.fs-candidate-dock label{display:block;margin:10px 0}
.fs-candidate-dock textarea,.fs-candidate-dock input[type=text],.fs-candidate-dock select{box-sizing:border-box;width:100%;max-width:100%;padding:8px;color:var(--text-primary);background:var(--bg-primary);border:1px solid var(--border-default);border-radius:6px;font:inherit}
.fs-candidate-dock textarea{min-height:84px;max-height:160px;resize:vertical}
.fs-candidate-dock :focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}
.fs-candidate-dock>summary:focus-visible{outline-offset:-3px}
.fs-candidate-dock pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
.fs-candidate-dock .fs-candidate-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.fs-candidate-dock .fs-candidate-evidence{color:var(--text-secondary)}
.fs-candidate-dock input[type=checkbox]{accent-color:var(--accent-primary);margin-right:6px}
.fs-candidate-dock p{overflow-wrap:anywhere}
@media(max-width:640px){.fs-candidate-dock .fs-candidate-fields{grid-template-columns:1fr}.fs-candidate-dock>summary{min-height:44px}}
`

/** Confirmed sanitized previews use a separate local key; this storage never grants Platform permission. */
function storageKey(owner: CandidateOwner): string { return 'futurestaff.governance.local.v1:' + JSON.stringify([owner.tenantId, owner.actorId]) }

/** Session-scoped, opt-in excerpt workbench. It never reads chat history or invokes a network adapter. */
export function CandidateWorkbench({owner, sessionId, storage, taskSource, windowSource}: {owner: CandidateOwner; sessionId: string; storage?: Storage; taskSource?: TaskCandidateController; windowSource?: CandidateConsentClient}) {
  const snapshot = useSyncExternalStore(taskSource?.subscribe ?? noTaskSubscription, () => taskSource?.getSnapshot() ?? noTaskSnapshot, () => noTaskSnapshot)
  const binding = snapshot.binding
  const matches = binding?.owner.tenantId === owner.tenantId && binding.owner.actorId === owner.actorId && binding.sessionId === sessionId
  const viewKey = JSON.stringify([owner.tenantId, owner.actorId, sessionId])
  const previousView = useRef(viewKey)
  useEffect(() => () => taskSource?.revoke(), [taskSource])
  useEffect(() => {
    const changed = previousView.current !== viewKey
    previousView.current = viewKey
    if (changed && taskSource) {
      const current = taskSource.getSnapshot().binding
      if (current && (current.owner.tenantId !== owner.tenantId || current.owner.actorId !== owner.actorId || current.sessionId !== sessionId)) taskSource.revoke()
    }
  }, [viewKey, taskSource, owner.tenantId, owner.actorId, sessionId])
  return <ScopedWorkbench key={JSON.stringify([owner.tenantId, owner.actorId, sessionId, snapshot.epoch, matches ? binding.taskId : null])}
    owner={owner} sessionId={sessionId} taskCandidates={matches ? snapshot.candidates : []} taskStatus={matches ? snapshot.status : 'not_connected'}
    {...(windowSource ? {windowSource} : {})} {...(taskSource && matches ? {taskSource} : {})} {...(storage ? {storage} : {})}/>
}

function ScopedWorkbench({owner, sessionId, storage, taskSource, taskCandidates, taskStatus, windowSource}: {owner: CandidateOwner; sessionId: string; storage?: Storage; taskSource?: TaskCandidateController; taskCandidates: readonly TaskSuggestion[]; taskStatus: string; windowSource?: CandidateConsentClient}) {
  const [windowClient] = useState(() => windowSource ?? new CandidateConsentClient(sessionId))
  useEffect(() => () => windowClient.dispose(), [windowClient])
  const [outbox] = useState(() => new LocalCandidateOutbox(owner))
  const [drafts, setDrafts] = useState<CandidateDraft[]>([])
  const [text, setText] = useState(''), [authorized, setAuthorized] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [, update] = useState(0)
  const generation = useRef(0), pending = useRef(false), revision = useRef(0)
  const [permissions, setPermissions] = useState<Record<CandidateDomain, boolean>>({enterprise_knowledge: false, platform_product_feedback: false})
  const excerptId = useId()
  const localStorageRef = useRef<Storage | undefined>(storage)
  const taskMetadata = useRef(new Map<string, TaskSuggestion>())
  const taskKey = (draft: CandidateDraft) => `${draft.domain}:${draft.requestId}`
  useEffect(() => {
    if (taskCandidates.length) {
      for (const suggestion of taskCandidates) taskMetadata.current.set(taskKey(suggestion.draft), suggestion)
      setDrafts(items => [...items, ...taskCandidates.filter(suggestion => !items.some(item => item.domain === suggestion.draft.domain && item.requestId === suggestion.draft.requestId)).map(suggestion => suggestion.draft)])
    }
  }, [taskCandidates])
  useEffect(() => {
    try {
      localStorageRef.current ??= window.localStorage
      const saved = localStorageRef.current.getItem(storageKey(owner))
      if (saved) { outbox.restore(saved); update(value => value + 1) }
    } catch { setError('本地队列读取失败，保存功能已关闭。'); localStorageRef.current = undefined }
    return () => { generation.current++; outbox.setOwner(null) }
  }, [outbox])
  const persist = (): boolean => {
    try {
      if (!localStorageRef.current) throw Error('LOCAL_STORAGE_UNAVAILABLE')
      localStorageRef.current.setItem(storageKey(owner), outbox.serialize())
      update(value => value + 1)
      return true
    } catch { setError('本地保存失败，请保留摘录并重试；内容尚未上报。'); return false }
  }
  const identify = async () => {
    if (pending.current || !authorized) return
    windowClient.invalidate()
    pending.current = true; setBusy(true); setError('')
    const current = generation.current
    try {
      const items = await identifyCandidates({owner, conversationId: sessionId, activeConversationId: sessionId,
        sourceId: `${sessionId}:excerpt`, sourceVersion: String(++revision.current), text, authorized})
      if (current !== generation.current) return
      setDrafts(current => [...current.filter(draft => taskMetadata.current.has(taskKey(draft))), ...items]); setText(sanitizeCandidateText(text).text)
      if (!items.length) setError('这段摘录暂未识别到候选，可补充明确的新事实、纠正、目标、期望或实际表现。')
    } catch { if (current === generation.current) setError('无法识别此摘录，请缩短为当前对话的必要文字并重新授权。') }
    finally { if (current === generation.current) { pending.current = false; setBusy(false) } }
  }
  const save = async (draft: CandidateDraft) => {
    if (pending.current || !permissions[draft.domain] || !localStorageRef.current) return
    pending.current = true; setBusy(true); setError('')
    const current = generation.current
    try {
      const existing = outbox.entries.find(entry => entry.draft.domain === draft.domain && entry.draft.requestId === draft.requestId)
      let confirmed = draft
      if (existing && existing.previewHash !== await candidateHash(draft)) {
        if (current !== generation.current) return
        if (existing.needsQuery) { setError('原回执待核验，桌面查询未连接；此候选不能修改或更换请求号。'); return }
        outbox.cancel(draft.domain, draft.requestId)
        confirmed = {...draft, requestId: crypto.randomUUID()}
      }
      await outbox.confirm(confirmed)
      if (current === generation.current) {
        if (confirmed.requestId !== draft.requestId) {
          const metadata = taskMetadata.current.get(taskKey(draft))
          if (metadata) { taskMetadata.current.delete(taskKey(draft)); taskMetadata.current.set(taskKey(confirmed), {...metadata, draft: confirmed}) }
          setDrafts(items => items.map(item => item.domain === draft.domain && item.requestId === draft.requestId ? confirmed : item))
        }
        if (persist()) {
          setDrafts(items => items.filter(item => item.domain !== draft.domain || (item.requestId !== draft.requestId && item.requestId !== confirmed.requestId)))
          if (taskMetadata.current.has(taskKey(confirmed))) { taskSource?.dismiss(draft.domain); taskMetadata.current.delete(taskKey(confirmed)) }
        }
      }
    } catch { if (current === generation.current) setError('本地确认已失效或内容需重新核对，请重新识别并确认。') }
    finally { if (current === generation.current) { pending.current = false; setBusy(false) } }
  }
  const permission = (domain: CandidateDomain, allowed: boolean) => {
    if (!allowed) windowClient.invalidate()
    outbox.setPermission(domain, allowed)
    setPermissions(value => ({...value, [domain]: allowed}))
    if (!allowed) persist()
  }
  return <details className="fs-candidate-dock">
    <style>{css}</style><summary>候选草稿{taskCandidates.length ? ` · ${taskCandidates.length} 项任务建议` : ''}</summary>
    <div className="fs-candidate-dock__body" role="region" aria-label="候选草稿内容" tabIndex={0}>
    <MessageCardNotice>桌面提交未连接。仅保存本地候选；平台接收域、可见成员与权限须另行核验。</MessageCardNotice>
    <section aria-label="当前任务建议" data-task-suggestions-status={taskStatus}>
      <p>{!taskSource || ['disabled', 'not_connected'].includes(taskStatus) ? '当前任务建议未开启，可信事件桥未连接。' : taskStatus === 'ready' ? taskCandidates.length ? '当前任务已结束，建议已合并。请核对来源与分享范围后决定。' : '当前任务已结束，暂无待核对建议。' : taskStatus === 'listening' ? '当前任务建议：等待任务结束后统一整理，不逐句打断。' : taskStatus === 'summarizing' ? '正在合并本次任务建议…' : '本次任务建议已停止，未确认内容已清理。'}</p>
      {taskSource && <p>当前为隔离合成事件验证；未订阅真实用户对话，未调用模型。</p>}
    </section>
    <label htmlFor={excerptId}>当前对话的必要摘录</label>
    <textarea id={excerptId} aria-label="当前对话的必要摘录" disabled={busy} maxLength={4000} value={text} onChange={event => {setText(event.target.value);setAuthorized(false)}}/>
    <label><input type="checkbox" disabled={busy} checked={authorized} onChange={event => setAuthorized(event.target.checked)}/>我授权仅分析这段当前对话摘录</label>
    <MessageCardAction disabled={!authorized || !text.trim() || busy} onClick={() => void identify()}>识别本地候选</MessageCardAction>
    {busy && <p role="status">正在处理本地候选…</p>}
    {error && <p role="alert">{error}</p>}
    {drafts.map(draft => <CandidateCard key={`${draft.domain}:${draft.requestId}`} draft={draft} windowClient={windowClient} busy={busy} permission={permissions[draft.domain]}
      suggestion={taskMetadata.current.get(taskKey(draft))}
      queryPending={outbox.entries.some(entry => entry.draft.domain === draft.domain && entry.draft.requestId === draft.requestId && entry.needsQuery)}
      onPermission={allowed => permission(draft.domain, allowed)} onSave={value => void save(value)}
      onDismiss={() => {windowClient.invalidate();if (outbox.entries.some(entry => entry.draft.domain === draft.domain && entry.draft.requestId === draft.requestId)) {outbox.dismiss(draft.domain, draft.requestId);persist()}if (taskMetadata.current.has(taskKey(draft))) {taskSource?.dismiss(draft.domain);taskMetadata.current.delete(taskKey(draft))}setDrafts(items => items.filter(item => item.domain !== draft.domain || item.requestId !== draft.requestId))}}/>) }
    {outbox.entries.filter(entry => entry.status !== 'dismissed' && !drafts.some(draft => draft.domain === entry.draft.domain && draft.requestId === entry.draft.requestId)).map(entry => <section key={`${entry.draft.domain}:${entry.draft.requestId}`} data-governance-queued={entry.draft.domain}>
      <MessageCard title={entry.draft.title} eyebrow={names[entry.draft.domain]} status="readonly" statusLabel="仅本地记录"
        actions={<>{entry.status === 'needs_confirmation' && <MessageCardAction onClick={() => setDrafts(items => [...items.filter(item => item.requestId !== entry.draft.requestId || item.domain !== entry.draft.domain), entry.draft])}>重新核对</MessageCardAction>}<MessageCardAction disabled={entry.status === 'cancelled'} onClick={() => {windowClient.invalidate();outbox.cancel(entry.draft.domain, entry.draft.requestId);persist()}}>取消本地候选</MessageCardAction></>}>
        <p>{entry.status === 'cancelled' ? '已取消，迟到提交将被阻止。' : entry.status === 'needs_confirmation' ? '已恢复本地记录，需重新核对并确认。' : entry.needsQuery ? '原回执待核验，桌面查询未连接。' : '已保存到本机，尚未上报'}</p>
        <pre>{entry.draft.content}</pre><DraftCompatibilityNotice draft={entry.draft}/><CandidateConsentControls draft={entry.draft} source={windowClient}/><p>当前仅本机当前账号可见。恢复后需重新确认，平台权限尚未核验。</p>
      </MessageCard>
    </section>)}
    </div>
  </details>
}

function CandidateCard({draft, windowClient, busy, permission, queryPending, suggestion, onPermission, onSave, onDismiss}: {
  draft: CandidateDraft; windowClient: CandidateConsentClient; busy: boolean; permission: boolean; onPermission(allowed: boolean): void
  queryPending: boolean
  suggestion: TaskSuggestion | undefined
  onSave(value: CandidateDraft): void; onDismiss(): void
}) {
  const [editing, setEditing] = useState(false), [content, setContent] = useState(draft.content)
  const [basis, setBasis] = useState(draft.basis)
  const [fields, setFields] = useState({goal: draft.goal, expected: draft.expected, actual: draft.actual, entrypoint: draft.entrypoint})
  const [versions, setVersions] = useState(draft.versions), [aspectRatio, setAspectRatio] = useState(draft.aspectRatio)
  const labels = {goal: '目标', expected: '期望', actual: '实际', entrypoint: '入口'}
  const versionLabels = {application: '应用版本', client: '客户端版本', agent: 'Agent 版本', tool: '工具版本'}
  const currentDraft: CandidateDraft = {...draft, content, basis, verification: basis === 'explicit_user' ? 'reported' : 'unverified', ...fields, versions, aspectRatio}
  const submit = () => onSave(currentDraft)
  return <section data-governance-domain={draft.domain}>
    <MessageCard title={draft.title} eyebrow={names[draft.domain]} status="pending" statusLabel="本地草稿 · 待核对" busy={busy}
      description="确认内容与必要依据后保存到本机；不会自动上报。"
      actions={<>
        <MessageCardAction variant="primary" disabled={!permission || !content.trim()} onClick={submit}>{editing ? '修改后保存' : '保存候选到本机'}</MessageCardAction>
        <MessageCardAction disabled={queryPending} onClick={() => {windowClient.invalidate();setEditing(value => !value)}}>{editing ? '返回预览' : '修改内容'}</MessageCardAction>
        <MessageCardAction variant="quiet" onClick={onDismiss}>仅本次</MessageCardAction>
      </>}
      footer={draft.domain === 'enterprise_knowledge' ? '候选入箱另需平台确认；来源复用授权和管理员正式发布为独立步骤。' : '反馈仅作私域分类；缺少选项不直接判为缺陷，也不代表已排期。'}>
      {suggestion && <aside data-task-candidate-source={suggestion.origin}>
        <p>来源：当前获授权任务的必要事件片段 · {suggestion.origin === 'rule_summary' ? '规则摘要（未调用模型）' : '用户明确原话'}</p>
        <p>{suggestion.summary}</p><p>触发原因：{suggestion.reason}；本地事件序号：{suggestion.sourceEventIds.join('、')}</p>
      </aside>}
      {editing ? <fieldset disabled={busy} style={{border: 0, padding: 0, margin: 0, minWidth: 0}}>
        <label>候选内容<textarea aria-label="候选内容" maxLength={600} value={content} onChange={event => setContent(event.target.value)}/></label>
        <label>依据类型<select value={basis} onChange={event => setBasis(event.target.value as CandidateDraft['basis'])}><option value="explicit_user">用户明确陈述</option><option value="rule_summary">规则摘要（未调用模型）</option><option value="model_inference">AI 推测（待用户核实）</option></select></label>
        {draft.domain === 'platform_product_feedback' && <div className="fs-candidate-fields">{(Object.keys(labels) as (keyof typeof fields)[]).map(key => <label key={key}>{labels[key]}<input type="text" maxLength={600} value={fields[key]} onChange={event => setFields(value => ({...value, [key]: event.target.value}))}/></label>)}{(Object.keys(versionLabels) as (keyof typeof versions)[]).map(key => <label key={key}>{versionLabels[key]}<input type="text" maxLength={200} value={versions[key]} onChange={event => setVersions(value => ({...value, [key]: event.target.value}))}/></label>)}<label>宽高比<input type="text" maxLength={20} value={aspectRatio} onChange={event => setAspectRatio(event.target.value)}/></label></div>}
      </fieldset> : <><pre>{content}</pre><p>{basis === 'explicit_user' ? '用户明确陈述 · 未经独立核实' : basis === 'rule_summary' ? '规则摘要 · 待核对（未调用模型）' : 'AI 推测 · 待用户核实'}</p></>}
      <DraftCompatibilityNotice draft={currentDraft}/><CandidateConsentControls draft={currentDraft} source={windowClient}/>
      {queryPending && <MessageCardNotice>原回执待核验，桌面查询未连接；核验前不能修改或换请求号。</MessageCardNotice>}
      <details className="fs-candidate-evidence"><summary>必要依据（已最小化）</summary>{draft.evidence.map(evidence => <p key={evidence.sourceId}>{evidence.excerpt} · {evidence.redacted ? '含脱敏' : '必要文字摘录'} · 本地摘录版本 {evidence.sourceVersion}</p>)}</details>
      <dl><div><dt>接收域</dt><dd>{names[draft.domain]} · 未连接</dd></div><div><dt>谁可见</dt><dd>目前仅本机；{draft.scope.audiences.join('、')}</dd></div><div><dt>用途</dt><dd>{draft.scope.purpose}</dd></div><div><dt>适用域</dt><dd>当前主体；策略与版本待平台核验</dd></div></dl>
      {draft.domain === 'platform_product_feedback' && <p>目标：{fields.goal || '待补充'}；期望：{fields.expected || '待补充'}；实际：{fields.actual || '待补充'}；入口：{fields.entrypoint || '待补充'}。版本：{Object.values(versions).filter(Boolean).join(' / ') || '待补充'}。宽高比：{aspectRatio || '未提供'}；像素尺寸：未提供。</p>}
      <label><input type="checkbox" checked={permission} onChange={event => onPermission(event.target.checked)}/>{`允许在本机保存${names[draft.domain]}`}</label>
    </MessageCard>
  </section>
}

/** Open only a Host-issued handle whose frozen local preview still matches this card. */
function CandidateConsentControls({draft, source}: {draft: CandidateDraft; source: CandidateConsentClient}) {
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
  const [previewState, setPreviewState] = useState<{signature: string; hash: string} | null>(null)
  const signature = JSON.stringify(draft)
  useEffect(() => {let live = true;void candidateHash(draft).then(hash => {if (live) setPreviewState({signature, hash})}).catch(() => {if (live) setPreviewState(null)});return () => {live = false}}, [signature])
  const previewHash = previewState?.signature === signature ? previewState.hash : null
  const offer = snapshot.candidates.find(item => item.candidateId === draft.requestId && item.previewHash === previewHash && item.expiresAt > Date.now())
  const active = snapshot.active && snapshot.candidates.some(item => item.candidateId === draft.requestId && item.handle === snapshot.active?.handle) ? snapshot.active : null
  useEffect(() => {
    if (previewHash && snapshot.candidates.some(item => item.candidateId === draft.requestId && item.previewHash !== previewHash)) source.invalidate()
  }, [previewHash, signature, snapshot.candidates, source])
  useEffect(() => {if (!active || !['opening', 'awaiting_web', 'transferred'].includes(active.state)) return;const timer = setInterval(() => {void source.act('status', active.handle)}, 1000);return () => clearInterval(timer)}, [active?.handle, active?.state, source])
  const messages = {not_connected: '确认窗口未连接；未取得平台入箱回执。', ready: '当前候选已绑定，可由本人打开确认窗口。', opening: '正在打开本次受控确认窗口…', awaiting_web: '等待本人在平台接收并核对必要内容。', transferred: '必要内容已交接到确认页，尚未取得平台入箱回执。', cancelled: '本地交接已取消；这不代表平台已撤回。', expired: '本次确认已过期，需要重新核对。', closed: '确认窗口已关闭；没有平台成功回执。', unknown: '平台结果未知；仅能核对原请求，不能重新发送正文。'}
  return <section data-candidate-window={active?.state ?? (offer ? 'ready' : 'not_connected')}>
    <p role="status">{messages[active?.state ?? (offer ? 'ready' : 'not_connected')]}</p>
    {!active && !offer && <MessageCardAction onClick={() => void source.list()}>检查本次确认窗口</MessageCardAction>}
    {offer && !active && <MessageCardAction onClick={() => void source.act('open', offer.handle)}>在平台确认此候选</MessageCardAction>}
    {active && <><MessageCardAction onClick={() => void source.act('status', active.handle)}>检查原请求状态</MessageCardAction><MessageCardAction onClick={() => void source.act('cancel', active.handle)}>关闭本次交接</MessageCardAction></>}
    {active && !active.queryConnected && <p>平台回执查询尚未连接；窗口状态不等于入箱成功。</p>}
  </section>
}

/** Explain local-format gaps without constructing or enabling a Platform submission. */
function DraftCompatibilityNotice({draft}: {draft: CandidateDraft}) {
  const review = inspectCandidateDraftCompatibility(draft)
  const issueLabels: Record<DraftCompatibilityIssue, string> = {
    invalid_local_draft: '本地记录需重新核对。',
    noncanonical_source_id: '本地来源编号尚不能作为平台证据编号。',
    duplicate_source_id: '来源编号重复，需逐项核对，不会自动合并。',
    expired_local_scope: '本次本地确认范围已过期，需重新核对。',
    missing_content: '候选标题或内容尚待补充。',
    missing_feedback_fields: '反馈的目标、期望、实际、入口或应用版本尚待补充。',
  }
  return <details className="fs-candidate-evidence" data-desktop-draft-compatibility={review.status} data-desktop-submit-enabled="false">
    <summary>仍是本地草稿 · 查看平台提交条件</summary>
    <p>本地保存不等于平台确认。目前桌面提交未连接，也不会自动迁移已有草稿。</p>
    <ul>
      <li>需要平台核验的账号、租户、任务和接收范围；手填版本不能作为授权。</li>
      <li>需要完整证据来源、观察时间、使用依据和脱敏版本；本地哈希不能复用为平台绑定。</li>
      <li>{draft.domain === 'enterprise_knowledge' ? '知识还需明确基准版本及适用范围。' : '反馈还需明确分类、能力核实状态和复现步骤；未提供与明确为空需区分。'}</li>
      <li>完整预览仍需当前本人在平台逐项确认；来源复用与正式发布另行授权。</li>
      {review.requirements.includes('local_summary_review') && <li>规则摘要需先人工核对，不能自动改成用户明确原话。</li>}
      {review.localIssues.map(issue => <li key={issue}>{issueLabels[issue]}</li>)}
    </ul>
  </details>
}

/** Register only a session-scoped local UI. No server route or credential is created. */
export function applyGovernanceCandidates(ctx: Context, controller: PlatformDevClientController): void {
  if (typeof document === 'undefined') return
  function Dock({sessionId}: {sessionId: string}) {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
    const tenantId = snapshot.activeTenantId, actorId = snapshot.user?.userId
    if (!['ready', 'no_apps'].includes(snapshot.phase) || !tenantId || !actorId || !sessionId) return null
    return <CandidateWorkbench owner={{tenantId, actorId}} sessionId={sessionId}/>
  }
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({name: 'conversation.input.dock', id: 'futurestaff-local-candidates', order: 40,
    inject: (sessionId: string) => ({sessionId})}, Dock))
}
