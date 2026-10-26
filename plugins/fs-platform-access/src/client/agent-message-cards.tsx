import {useEffect, useId, useMemo, useRef, useState, useSyncExternalStore} from 'react'
import type {Context} from '@deepseek-ai/cordis'
import type {ToolCallViewProps} from '@deepseek-ai/dsh-client-ui-tool/client'
import {agentMessageCardSnapshot, parseAgentCardValues, type AgentMessageCardView} from '../agent-message-card-contract.js'
import {MessageCard, MessageCardAction, MessageCardNotice} from './message-card.js'
import {agentMessageCardDefinition, agentMessageCardsAt, type AgentMessageCardMeta, type AgentMessageCardItem} from './agent-message-card-gallery.js'

export interface AgentCardAuthorization {
  current(): string
  subscribe(listener: () => void): () => void
}
type CardAction = 'view' | 'respond' | 'retry'
type CardFailure = Error & {code?: string}
interface CardPrincipal {owner: string; revision: number}
const unavailablePrincipal: CardPrincipal = {owner: '', revision: -1}
function principalStore(authorization: AgentCardAuthorization) {
  let snapshot: CardPrincipal = {owner: authorization.current(), revision: 0}
  const current = () => {
    const owner = authorization.current()
    if (owner !== snapshot.owner) snapshot = {owner, revision: snapshot.revision + 1}
    return snapshot
  }
  return {current, subscribe: (listener: () => void) => authorization.subscribe(() => {current(); listener()})}
}
const expiredCode = 'AGENT_CARD_EXPIRED'
const forbiddenCodes = new Set(['AGENT_CARD_FORBIDDEN', 'AGENT_CARD_SESSION_INACTIVE', 'AGENT_CARD_SESSION_REQUIRED', 'AGENT_IDENTITY_MISMATCH', 'PLATFORM_LOGIN_REQUIRED'])
const messages: Record<string, string> = {
  AGENT_CARD_EXPIRED: '这张卡片已过期。请让 Agent 重新生成卡片后再回答。',
  AGENT_CARD_FORBIDDEN: '当前身份无法访问这张卡片，请在当前账号的会话中重新生成。',
  AGENT_CARD_SESSION_REQUIRED: '原会话不存在或尚未加载，请重新打开原会话后核对。',
  AGENT_CARD_SESSION_INACTIVE: '原 Agent 会话当前不可用，请重新打开原会话。',
  AGENT_CARD_HISTORY_UNAVAILABLE: '历史卡片暂时无法读取，请稍后重新核对；尚未提交新的回答。',
  AGENT_CARD_RESPONSE_INVALID: '请补全必填项，并使用卡片提供的选项。',
  AGENT_CARD_ALREADY_ANSWERED: '此卡片已记录回答，请核对原回答。',
}
async function cardApi(action: CardAction, meta: Pick<AgentMessageCardMeta, 'sessionId' | 'viewId'>, extra?: {actionId: string; values: Record<string, string>}): Promise<AgentMessageCardView> {
  const response = await fetch('/_futurestaff/message-card', {method: 'POST', headers: {'content-type': 'application/json', 'x-futurestaff-card': '1'}, body: JSON.stringify({action, sessionId: meta.sessionId, viewId: meta.viewId, ...extra}), cache: 'no-store'})
  const body: unknown = await response.json()
  if (!response.ok) {
    const code = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'AGENT_CARD_UNAVAILABLE'
    throw Object.assign(Error(messages[code] ?? '卡片暂时不可用，请稍后核对原卡片。'), {code})
  }
  const view = agentMessageCardSnapshot(body)
  if (!view || view.viewId !== meta.viewId || view.sessionId !== meta.sessionId) throw Error('卡片回执无效，请核对原卡片。')
  return view
}

/** Rendering/replaying only reads the original view. No user response is sent on mount. */
export function AgentMessageCard({meta, authorization}: {meta: AgentMessageCardMeta; authorization: AgentCardAuthorization}) {
  const store = useMemo(() => principalStore(authorization), [authorization])
  const principal = useSyncExternalStore(store.subscribe, store.current, () => unavailablePrincipal)
  const isCurrent = useMemo(() => () => store.current() === principal, [store, principal])
  // A new principal gets an empty component before paint. The Host must authorize
  // every new read; an earlier member's snapshot or pending answer is never reused.
  return <ScopedAgentMessageCard key={`${principal.revision}:${principal.owner}`} meta={meta} owner={principal.owner} isCurrent={isCurrent}/>
}

function ScopedAgentMessageCard({meta, owner, isCurrent}: {meta: AgentMessageCardMeta; owner: string; isCurrent: () => boolean}) {
  const prefix = useId(), generation = useRef(0), pending = useRef(false), fieldsRoot = useRef<HTMLFieldSetElement>(null)
  const [view, setView] = useState<AgentMessageCardView>(), [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [expiredByTimer, setExpired] = useState(false), [hidden, setHidden] = useState(false), [uncertain, setUncertain] = useState(false)
  // History returned by Host is read-only on its very first render, before effects.
  const expired = expiredByTimer || !!view && view.expiresAt <= Date.now()
  useEffect(() => {
    const epoch = ++generation.current
    pending.current = false; setView(undefined); setValues({}); setError(''); setBusy(false); setExpired(false); setUncertain(false); setHidden(false)
    let active = true
    const current = () => active && generation.current === epoch && isCurrent()
    if (owner && current()) void cardApi('view', meta).then(result => {if (current()) setView(result)}, reason => {
      if (!current()) return
      const failure = reason as CardFailure
      setError(failure.message)
      if (failure.code === expiredCode) {setExpired(true); setView(agentMessageCardSnapshot(meta.snapshot))}
      else if (forbiddenCodes.has(failure.code ?? '')) setHidden(true)
    })
    return () => {active = false; generation.current++; pending.current = false}
  }, [meta.sessionId, meta.viewId, isCurrent, owner])
  useEffect(() => {
    if (!view || hidden || expired) return
    const remaining = view.expiresAt - Date.now()
    if (remaining <= 0) {setExpired(true); return}
    const timeout = setTimeout(() => setExpired(true), Math.min(remaining, 2147483647))
    return () => clearTimeout(timeout)
  }, [view, hidden, expired])

  const current = (epoch: number) => generation.current === epoch && !!owner && isCurrent()
  async function operate(action: CardAction, extra?: {actionId: string; values: Record<string, string>}) {
    if (pending.current || hidden || expired || !owner || !isCurrent()) return
    const epoch = generation.current
    pending.current = true; setBusy(true); setError('')
    try {
      const result = await cardApi(action, meta, extra)
      if (current(epoch)) {setView(result); if (action !== 'view' || result.response) setUncertain(false)}
    } catch (reason) {
      if (!current(epoch)) return
      const failure = reason as CardFailure
      setError(failure.message)
      if (failure.code === expiredCode) {setExpired(true); setUncertain(false)}
      else if (forbiddenCodes.has(failure.code ?? '')) {setHidden(true); setView(undefined); setValues({})}
      else if (failure.code === 'AGENT_CARD_RESPONSE_INVALID' || failure.code === 'AGENT_CARD_INPUT_INVALID') setUncertain(false)
      else if (action !== 'view') {
        // A response may already be frozen in Host. Read it before offering any retry.
        setUncertain(true)
        try {
          const recorded = await cardApi('view', meta)
          if (current(epoch)) {setView(recorded); if (recorded.response) {setUncertain(false); setError('')}}
        } catch (readReason) {
          if (current(epoch)) {
            const readFailure = readReason as CardFailure
            if (readFailure.code === expiredCode) {setExpired(true); setUncertain(false)}
            else if (forbiddenCodes.has(readFailure.code ?? '')) {setHidden(true); setView(undefined); setValues({})}
          }
        }
      }
    } finally {if (current(epoch)) {pending.current = false; setBusy(false)}}
  }
  function respond(actionId: string) {
    if (!view || view.response || uncertain || pending.current || hidden || expired) return
    const action = view.data.actions?.find(action => action.id === actionId)
    if (!action) return
    if (action.submit !== false && fieldsRoot.current) {
      const fields = fieldsRoot.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')
      for (const field of fields) if (!field.reportValidity()) return
    }
    let parsed: Record<string, string>
    try {parsed = parseAgentCardValues(view.data, actionId, action.submit === false ? {} : values)} catch {setError(messages.AGENT_CARD_RESPONSE_INVALID!); return}
    void operate('respond', {actionId, values: parsed})
  }
  const response = view?.response, awaitingReturn = !!response && view?.conversationUpdated !== true
  const readonly = !owner || hidden || expired || !!response || uncertain || !view || busy
  const state = hidden ? 'readonly' : busy ? 'running' : expired ? response ? 'readonly' : 'expired' : uncertain || awaitingReturn ? 'unconfirmed' : response ? 'succeeded' : error ? 'failed' : !view ? 'loading' : view.data.actions?.length ? 'pending' : 'ready'
  const statusLabel = !owner ? '等待账号就绪' : busy ? '正在核对回答' : response && expired ? '已记录回答 · 历史只读' : response && !awaitingReturn ? '已记录回答' : awaitingReturn ? '等待返回原会话' : uncertain ? '回答待核实' : !hidden && !expired && !error && view?.data.actions?.length ? '等待回答' : undefined
  const hasActions = !!view?.data.actions?.length || awaitingReturn && !expired || uncertain && !expired
  const actions = !hidden && view && hasActions ? <>
    {view.data.actions?.map(action => <MessageCardAction key={action.id} data-agent-card-action={action.id} {...(action.variant ? {variant: action.variant} : {})} disabled={readonly} onClick={() => respond(action.id)}>{response?.actionId === action.id ? '✓ ' : ''}{action.label}</MessageCardAction>)}
    {awaitingReturn && !expired && <MessageCardAction data-agent-card-retry="true" onClick={() => {void operate('retry')}}>重试返回原会话</MessageCardAction>}
    {uncertain && !expired && <MessageCardAction data-agent-card-check="true" onClick={() => {void operate('view')}}>核对原回答</MessageCardAction>}
  </> : !hidden && !view && error && !expired ? <MessageCardAction onClick={() => {void operate('view')}}>重新读取卡片</MessageCardAction> : undefined
  return <MessageCard className="fs-agent-message-card" title={hidden ? '交互卡片不可访问' : view?.title ?? '交互卡片'} eyebrow="Agent 交互" status={state} {...(statusLabel ? {statusLabel} : {})} busy={busy} actions={actions}
    description={!owner ? '当前账号尚未就绪，恢复后会重新核对卡片。' : hidden ? '请在当前账号的会话中重新生成卡片。' : view?.data.description ?? (!view && !error ? '正在核对当前会话…' : undefined)}
    {...(error || expired || uncertain || response ? {footer: <>
      {error && !expired && <MessageCardNotice kind="error">{error}</MessageCardNotice>}
      {expired && <MessageCardNotice kind="warning">{response ? '已保留当时回答，仅供查看；需要新的选择时请让 Agent 重新生成卡片。' : '保留当时的内容供查看；旧卡片无法继续回答，请让 Agent 重新生成。'}</MessageCardNotice>}
      {uncertain && <MessageCardNotice kind="warning">尚未取得完整回答回执。请先核对原回答；暂不接受改答。</MessageCardNotice>}
      {response && <MessageCardNotice kind={awaitingReturn ? 'warning' : 'success'}>{awaitingReturn ? '回答已记录，原会话尚未确认收到。重试只发送这份回答。' : '回答已返回原 Agent 会话。'}按钮回答仅提供信息，业务操作仍需原业务确认。</MessageCardNotice>}
    </>} : {})}>
    {!hidden && view && <>
      {!!view.data.facts?.length && <dl>{view.data.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
      {!!view.data.fields?.length && <fieldset ref={fieldsRoot} className="fs-agent-card-fields" disabled={readonly} onKeyDown={event => {if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault()}}>
        <legend className="fs-agent-card-fields__legend">{response ? '已记录的信息' : '补充信息'}</legend>
        {view.data.fields.map(field => {
          const fieldId = `${prefix}-${field.id}`, value = response ? response.values[field.id] ?? '' : values[field.id] ?? ''
          const attributes = {id: fieldId, name: field.id, required: !!field.required, value, onChange: (event: {target: {value: string}}) => setValues(previous => ({...previous, [field.id]: event.target.value})), maxLength: 2000}
          return <div className="fs-agent-card-field" key={field.id}><label htmlFor={fieldId}>{field.label}{field.required && <span>（必填）</span>}</label>
            {field.type === 'select' ? <select {...attributes}><option value="">请选择</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea {...attributes} rows={3}/> : <input {...attributes} type="text" autoComplete="off"/>}
          </div>
        })}
      </fieldset>}
      {response && <p className="fs-agent-card-answer" role="status">已选择：{response.actionLabel}</p>}
    </>}
  </MessageCard>
}

export const agentMessageCardCss = `
.fs-agent-message-card .fs-message-card__content{white-space:pre-wrap}.fs-agent-card-fields{border:0;padding:0;margin:14px 0 0;min-width:0;display:grid;gap:12px}.fs-agent-card-fields__legend{font-size:13px;font-weight:600;padding:0 0 8px}.fs-agent-card-field{min-width:0;display:grid;gap:5px}.fs-agent-card-field label{font-size:13px;font-weight:500;overflow-wrap:anywhere}.fs-agent-card-field label span{font-size:12px;color:var(--text-secondary);font-weight:400}.fs-agent-card-field input,.fs-agent-card-field textarea,.fs-agent-card-field select{box-sizing:border-box;min-width:0;width:100%;max-width:100%;padding:8px 10px;border:1px solid var(--border-default);border-radius:6px;color:var(--text-primary);background:var(--bg-primary);font:inherit;font-size:13px;line-height:1.5}.fs-agent-card-field textarea{resize:vertical}.fs-agent-card-field :focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}.fs-agent-card-fields:disabled input,.fs-agent-card-fields:disabled textarea,.fs-agent-card-fields:disabled select{color:var(--text-secondary);background:var(--bg-tertiary);opacity:1}.fs-agent-card-answer{margin:14px 0 0;font-size:13px;font-weight:600}.fs-agent-message-card .fs-message-card__footer>*+*{margin-top:8px}
@media(max-width:560px){.fs-agent-card-field input,.fs-agent-card-field select{min-height:44px}.fs-agent-card-fields{gap:14px}}
`

export function applyAgentMessageCardClient(ctx: Context): void {
  const authorization: AgentCardAuthorization = {
    current: () => {const snapshot = ctx.platformClientSession.getSnapshot(); return ['ready', 'no_apps'].includes(snapshot.phase) && snapshot.activeTenantId && snapshot.user?.userId ? `${snapshot.activeTenantId}:${snapshot.user.userId}` : ''},
    subscribe: listener => ctx.platformClientSession.subscribe(listener),
  }
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({name: 'tool.call.toolview', key: 'agent_message_card'}, (props: ToolCallViewProps) => {
    const block = props.block
    if (!('kind' in block) || block.kind !== 'tool-result') return <p>正在准备交互卡片…</p>
    return block.isError ? <p role="alert">交互卡片未生成，请根据会话提示重试。</p> : <p>交互卡片已显示在本轮回答下方。</p>
  }))
  ctx.inject(['uiConversation'], scope => {
    scope.effect(() => scope.uiConversation.events.register(agentMessageCardDefinition))
    ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({name: 'conversation.chat.turnTail', priority: -80, select: (owner: {turn: {data: {get(key: 'futurestaff-agent-cards'): {items: AgentMessageCardItem[]} | undefined}}; seq: number}) => {
      const cards = agentMessageCardsAt(owner.turn.data.get('futurestaff-agent-cards')?.items ?? [], owner.seq)
      return cards.length ? cards : null
    }}, (props: {matched: AgentMessageCardMeta[]}) => <>{props.matched.map(meta => <AgentMessageCard key={meta.viewId} meta={meta} authorization={authorization}/>)}</>))
  })
  if (typeof document !== 'undefined') ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.futurestaffAgentCards = 'true'; style.textContent = agentMessageCardCss; document.head.append(style)
    return () => style.remove()
  })
}
