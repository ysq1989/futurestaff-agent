import type { Context } from '@deepseek-ai/cordis'
import { safeCode, sanitizeDiagnosticInput, type DiagnosticInput } from './diagnostics.js'

type Row = Record<string, unknown>
type Capture = (input: DiagnosticInput) => void
interface DiagnosticProcess {
  on(name: 'uncaughtExceptionMonitor' | 'unhandledRejection' | 'removeListener', listener: (error: unknown, detail?: unknown) => void): unknown
  off(name: 'uncaughtExceptionMonitor' | 'unhandledRejection' | 'removeListener', listener: (error: unknown, detail?: unknown) => void): unknown
  listenerCount?(name: 'unhandledRejection'): number
}
interface SessionState {
  turn?: number | undefined
  step?: number | undefined
  lastFailure?: string
  toolFailures: Map<string, number>
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const reportedRequests = new Map<string, number>()
const requestMarkerTtl = 5 * 60_000
function pruneRequestMarkers(now: number): void {
  for (const [requestId, at] of reportedRequests) if (now - at >= requestMarkerTtl || now < at) reportedRequests.delete(requestId)
}
/** Correlate direct transport diagnostics with their later public failure events. */
export function markDiagnosticRequestReported(requestId: string): void {
  if (typeof requestId !== 'string' || !uuid.test(requestId)) return
  const now = Date.now(), key = requestId.toLowerCase()
  pruneRequestMarkers(now)
  reportedRequests.delete(key)
  reportedRequests.set(key, now)
  if (reportedRequests.size > 1000) {
    const oldest = reportedRequests.keys().next().value
    if (oldest !== undefined) reportedRequests.delete(oldest)
  }
}
function alreadyReported(requestId: string | undefined): boolean {
  pruneRequestMarkers(Date.now())
  return requestId !== undefined && reportedRequests.has(requestId.toLowerCase())
}
const exceptionTypes = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'AbortError', 'TimeoutError'])
const cancellations = new Set(['ABORTED', 'ABORTED_BEFORE_DISPATCH', 'ABORT_ERR', 'CANCELLED', 'CANCELED'])
function row(value: unknown): Row | undefined { return value !== null && typeof value === 'object' ? value as Row : undefined }
function number(value: unknown): number | undefined { return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000 ? value as number : undefined }
function id(value: unknown): string | undefined { return typeof value === 'string' && uuid.test(value) ? value : undefined }
function exceptionType(value: unknown): DiagnosticInput['exceptionType'] {
  try { const name = row(value)?.name; return typeof name === 'string' && exceptionTypes.has(name) ? name as DiagnosticInput['exceptionType'] : 'other' } catch { return 'other' }
}
function cancelled(value: unknown): boolean {
  try { const error = row(value); return error?.name === 'AbortError' || cancellations.has(String(error?.code ?? '')) } catch { return false }
}

/** Observe public runtime events without changing an execution outcome or replaying work. */
export function mountDiagnosticsObservers(ctx: Context, capture: Capture, internals: { process?: DiagnosticProcess } = {}): void {
  const sessions = new WeakMap<object, SessionState>()
  let active = true
  const emit = (input: DiagnosticInput): void => { if (active) { try { capture(sanitizeDiagnosticInput(input)) } catch { /* Diagnostics never affect the task. */ } } }
  const stateOf = (session: unknown): SessionState | undefined => {
    if (!row(session)) return undefined
    let state = sessions.get(session as object)
    if (!state) { state = { toolFailures: new Map() }; sessions.set(session as object, state) }
    return state
  }
  const position = (session: unknown, turn?: unknown, step?: unknown): Pick<DiagnosticInput, 'sessionId' | 'turn' | 'step'> => {
    const source = row(session), rawId = source?.id ?? row(source?.header)?.id
    const sessionId = typeof rawId === 'string' && (uuid.test(rawId) || rawId.startsWith('session-') && uuid.test(rawId.slice(8))) ? rawId : undefined
    const safeTurn = number(turn), safeStep = number(step)
    return { ...(sessionId ? { sessionId } : {}), ...(safeTurn === undefined ? {} : { turn: safeTurn }), ...(safeStep === undefined ? {} : { step: safeStep }) }
  }
  const reportFailure = (session: unknown, failure: unknown, turn: unknown, step: unknown, deduplicate: boolean): void => {
    if (cancelled(failure)) return
    const source = row(failure), state = stateOf(session), code = safeCode(source?.code)
    const requestId = id(source?.requestId), status = source?.status
    const httpStatus = Number.isInteger(status) && Number(status) >= 100 && Number(status) <= 599 ? status as number : undefined
    const key = JSON.stringify([number(turn), number(step), code, requestId, httpStatus])
    if (deduplicate && state?.lastFailure === key) return
    if (state) state.lastFailure = key
    if (alreadyReported(requestId)) return
    emit({ category: 'llm', operation: 'chat', severity: 'error', code, ...position(session, turn, step), ...(requestId ? { requestId } : {}), ...(httpStatus === undefined ? {} : { httpStatus }) })
  }
  const registrations: (() => void)[] = []
  // Event handlers are containment boundaries as well: even hostile foreign errors
  // cannot prevent another plugin from observing a committed runtime event.
  const listen = (name: string, observer: (...args: unknown[]) => void): void => {
    const on = ctx.on as unknown as (name: string, callback: (...args: unknown[]) => void) => (() => void)
    const off = on.call(ctx, name, (...args) => { if (active) { try { observer(...args) } catch { /* Ignore unrepresentable diagnostics. */ } } })
    if (typeof off === 'function') registrations.push(off)
  }
  listen('session/event', (subject, rawEvent) => {
    const event = row(rawEvent), session = row(subject), data = row(event?.data)
    if (!event || !session || !data || (typeof session.firstLiveSeq === 'number' && typeof event.seq === 'number' && event.seq < session.firstLiveSeq)) return
    const state = stateOf(subject)!
    if (event.type === 'step/start') {
      state.turn = number(data.turn); state.step = number(data.step); delete state.lastFailure; state.toolFailures.clear()
    } else if (event.type === 'assistant/chunk') {
      const chunk = row(data.chunk), reason = row(chunk?.reason)
      if (chunk?.type !== 'finish') return
      if (reason?.kind === 'error') reportFailure(subject, reason.failure, data.turn, data.step, false)
      else if (reason?.kind !== 'aborted') delete state.lastFailure
    } else if (event.type === 'tool/result') {
      const failure = row(data.error)
      if (!failure || cancelled(failure)) return
      const code = safeCode(failure.code), pending = state.toolFailures.get(code) ?? 0
      if (pending > 0) { if (pending === 1) state.toolFailures.delete(code); else state.toolFailures.set(code, pending - 1); return }
      emit({ category: 'tool', operation: 'tool', severity: 'error', code, ...position(subject, data.turn, data.step) })
    } else if (event.type === 'turn/end') {
      const reason = row(data.reason)
      if (reason?.kind === 'error') reportFailure(subject, reason.error, data.turn, state.step, true)
      state.toolFailures.clear()
    }
  })
  listen('tools/result', (rawExecution, rawResult) => {
    const execution = row(rawExecution), result = row(rawResult)
    if (!execution || result?.isError !== true) return
    const failure = row(result.error), info = row(failure?.info)
    if (cancelled(info)) return
    const code = info?.code === undefined ? 'TOOL_EXECUTION_ERROR' : safeCode(info.code)
    const agent = row(execution.agent), session = agent?.session, state = stateOf(session)
    if (state && state.toolFailures.size < 64) state.toolFailures.set(code, Math.min(64, (state.toolFailures.get(code) ?? 0) + 1))
    let toolName: string | undefined
    if (typeof execution.name === 'string' && execution.name.length <= 100 && /^[A-Za-z0-9_.:-]+$/.test(execution.name)) {
      const tools = ctx.get('tools') as unknown as { get?: (name: string, scope?: unknown) => unknown } | undefined
      if (typeof tools?.get === 'function' && row(tools.get(execution.name, execution.agent))?.name === execution.name) toolName = execution.name
    }
    emit({ category: 'tool', operation: 'tool', severity: 'error', code, ...position(session, state?.turn, state?.step), ...(toolName ? { toolName } : {}) })
  })
  listen('agent/error', rawPayload => {
    const payload = row(rawPayload), error = row(payload?.error)
    if (!payload || cancelled(payload.error)) return
    const session = row(payload.agent)?.session, state = stateOf(session), failure = row(error?.failure)
    if (failure) { reportFailure(session, failure, payload.turn, payload.step, true); return }
    const code = safeCode(error?.code), key = JSON.stringify([number(payload.turn), number(payload.step), code, undefined, undefined])
    if (state?.lastFailure === key) return
    if (state) state.lastFailure = key
    emit({ category: 'host', operation: 'runtime', severity: 'error', code, exceptionType: exceptionType(payload.error), ...position(session, payload.turn, payload.step) })
  })
  const proc = internals.process ?? process
  const uncaught = (error: unknown, origin?: unknown): void => { if (!cancelled(error)) emit({ category: 'host', operation: 'runtime', severity: 'fatal', code: origin === 'unhandledRejection' ? 'HOST_UNHANDLED_REJECTION' : 'HOST_UNCAUGHT_EXCEPTION', exceptionType: exceptionType(error) }) }
  const rejection = (error: unknown): void => { if (!cancelled(error)) emit({ category: 'host', operation: 'runtime', severity: 'fatal', code: 'HOST_UNHANDLED_REJECTION', exceptionType: exceptionType(error) }) }
  proc.on('uncaughtExceptionMonitor', uncaught)
  // Installing the first rejection listener would suppress Node's default fatal
  // promotion. With no other owner, observe that promotion through the monitor.
  let observeRejections = typeof proc.listenerCount === 'function' && proc.listenerCount('unhandledRejection') > 0
  const listenerRemoved = (name: unknown, listener?: unknown): void => {
    if (name === 'unhandledRejection' && listener !== rejection && observeRejections && proc.listenerCount?.('unhandledRejection') === 1) {
      observeRejections = false
      proc.off('unhandledRejection', rejection)
    }
  }
  if (observeRejections) { proc.on('unhandledRejection', rejection); proc.on('removeListener', listenerRemoved) }
  ctx.effect(() => () => {
    active = false
    for (const off of registrations) off()
    proc.off('uncaughtExceptionMonitor', uncaught)
    proc.off('removeListener', listenerRemoved)
    if (observeRejections) proc.off('unhandledRejection', rejection)
  }, 'FutureStaff diagnostics public observers')
}
