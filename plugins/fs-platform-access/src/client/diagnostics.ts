import type { Context } from '@deepseek-ai/cordis'
import type { DiagnosticInput } from '../diagnostics.js'

interface DiagnosticWindow {
  addEventListener(name: string, callback: EventListener): void
  removeEventListener(name: string, callback: EventListener): void
}
interface ConnectionSource { getSnapshot(): unknown; subscribe(listener: () => void): () => void }
interface IdentitySnapshot { phase?: string; activeTenantId?: string; user?: { userId?: string } }
interface IdentitySource { getSnapshot(): IdentitySnapshot; subscribe(listener: () => void): () => void }
const types = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'AbortError', 'TimeoutError'])
const clientCodes = new Set(['UNCLASSIFIED', 'NETWORK_ERROR', 'HTTP_ERROR', 'CONTRACT_MISMATCH', 'PLATFORM_UNAVAILABLE',
  'RENDERER_ERROR', 'RENDERER_UNHANDLED_REJECTION', 'RENDERER_COMPONENT_ERROR', 'RENDERER_CONNECTION_LOST'])
const categories = new Set(['llm', 'tool', 'network', 'auth', 'renderer', 'host', 'crash', 'system'])
const operations = new Set(['chat', 'tool', 'login', 'refresh', 'discovery', 'system', 'runtime', 'render', 'bootstrap', 'unknown'])
const subscribers = new Set<(input: DiagnosticInput) => void>()
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
function untilAborted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener('abort', aborted)
    const aborted = (): void => { cleanup(); reject(signal.reason) }
    signal.addEventListener('abort', aborted, { once: true })
    operation.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

/** Owned request helpers report fixed DTOs without replacing global fetch or console. */
export function reportClientDiagnostic(input: DiagnosticInput): void {
  try {
    const safe: DiagnosticInput = {
      category: typeof input.category === 'string' && categories.has(input.category) ? input.category : 'network',
      operation: typeof input.operation === 'string' && operations.has(input.operation) ? input.operation : 'unknown',
      severity: input.severity === 'fatal' ? 'fatal' : 'error',
      code: typeof input.code === 'string' && clientCodes.has(input.code) ? input.code : 'UNCLASSIFIED',
    }
    if (typeof input.exceptionType === 'string' && (types.has(input.exceptionType) || input.exceptionType === 'other')) safe.exceptionType = input.exceptionType
    for (const key of ['sessionId', 'requestId'] as const) {
      const source = input[key], value = key === 'sessionId' && typeof source === 'string' && source.startsWith('session-') ? source.slice(8) : source
      if (typeof value === 'string' && uuid.test(value)) safe[key] = value
    }
    for (const [key, minimum, maximum] of [['httpStatus', 100, 599], ['durationMs', 0, 3_600_000], ['requestBytes', 0, 100_000_000], ['turn', 0, 1_000_000], ['step', 0, 1_000_000]] as const) {
      const value = input[key]; if (typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum) safe[key] = value
    }
    for (const receive of subscribers) { try { receive(safe) } catch { /* No error channel into the caller. */ } }
  } catch { /* A foreign getter is not diagnostic data. */ }
}
function exceptionType(value: unknown): DiagnosticInput['exceptionType'] {
  try { const name = value !== null && typeof value === 'object' ? (value as { name?: unknown }).name : undefined; return typeof name === 'string' && types.has(name) ? name as DiagnosticInput['exceptionType'] : 'other' } catch { return 'other' }
}

/** Send bounded, fixed browser diagnostic metadata through the Host's local guard. */
export function mountClientDiagnostics(ctx: Context, internals: { window?: DiagnosticWindow; fetch?: typeof fetch } = {}): void {
  const browser = internals.window ?? (typeof window === 'undefined' ? undefined : window)
  if (!browser) return
  const fetcher = internals.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const lifetime = new AbortController(), queue: DiagnosticInput[] = []
  let identitySignal = new AbortController(), identityGeneration = 0
  let active = true, sending = false
  const flush = async (): Promise<void> => {
    if (!active || sending) return
    sending = true
    const startedGeneration = identityGeneration
    try {
      while (active && queue.length > 0) {
        const input = queue[0]
        const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), 5_000)
        const signal = AbortSignal.any([lifetime.signal, identitySignal.signal, timeout.signal])
        try {
          const response = await untilAborted(fetcher('/_futurestaff/platform-dev/diagnostics', {
            method: 'POST', cache: 'no-store', credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'x-futurestaff-diagnostics': '1' },
            body: JSON.stringify(input), signal,
          }), signal)
          if (signal.aborted || !active) break
          await untilAborted(response.body?.cancel().catch(() => {}) ?? Promise.resolve(), signal)
          // A reporting failure is never a new diagnostic or an automatic retry loop.
          if (!response.ok) break
          if (queue[0] === input) queue.shift()
        } catch { break } finally { clearTimeout(timer) }
      }
    } finally {
      sending = false
      if (active && identityGeneration !== startedGeneration && queue.length > 0) void flush()
    }
  }
  const report = (code: string, error?: unknown, category: DiagnosticInput['category'] = 'renderer'): void => {
    if (!active) return
    const type = exceptionType(error)
    if (type === 'AbortError') return
    const input: DiagnosticInput = { category, operation: category === 'network' ? 'runtime' : 'render', severity: 'error', code, ...(error === undefined ? {} : { exceptionType: type }) }
    enqueue(input)
  }
  const enqueue = (input: DiagnosticInput): void => {
    if (!active) return
    // Keep only short fixed DTOs; a stalled local Host cannot grow browser memory.
    if (queue.length < 32) queue.push(input)
    void flush()
  }
  subscribers.add(enqueue)
  const error: EventListener = event => { try { report('RENDERER_ERROR', (event as ErrorEvent).error) } catch { /* Foreign event getters are untrusted. */ } }
  const rejection: EventListener = event => { try { report('RENDERER_UNHANDLED_REJECTION', (event as PromiseRejectionEvent).reason) } catch { /* Foreign event getters are untrusted. */ } }
  browser.addEventListener('error', error); browser.addEventListener('unhandledrejection', rejection)
  let removeSlot: (() => void) | undefined, removeConnection: (() => void) | undefined, removeIdentity: (() => void) | undefined
  const identity = ctx.get('platformClientSession') as unknown as IdentitySource | undefined
  if (identity && typeof identity.subscribe === 'function' && typeof identity.getSnapshot === 'function') {
    const verifiedOwner = (snapshot: IdentitySnapshot): { tenantId: string; userId: string } | undefined => {
      if (!['ready', 'no_apps'].includes(snapshot.phase ?? '') || !snapshot.activeTenantId || !snapshot.user?.userId) return undefined
      return { tenantId: snapshot.activeTenantId, userId: snapshot.user.userId }
    }
    const discard = (): void => { identityGeneration++; identitySignal.abort(); identitySignal = new AbortController(); queue.length = 0 }
    let previousOwner = verifiedOwner(identity.getSnapshot())
    removeIdentity = identity.subscribe(() => {
      try {
        const snapshot = identity.getSnapshot()
        if (['signed_out', 'expired', 'selecting_tenant'].includes(snapshot.phase ?? '')) { previousOwner = undefined; discard(); return }
        const next = verifiedOwner(snapshot)
        if (next) {
          if (!previousOwner || next.tenantId !== previousOwner.tenantId || next.userId !== previousOwner.userId) { previousOwner = next; discard() }
          return
        }
        // A transport failure clears the controller's presentation snapshot. It
        // is not evidence of logout: keep its report bound to the verified owner.
        // Concrete replacement fields still revoke the previous owner immediately.
        if (previousOwner && (snapshot.activeTenantId !== undefined && snapshot.activeTenantId !== previousOwner.tenantId
          || snapshot.user?.userId !== undefined && snapshot.user.userId !== previousOwner.userId)) { previousOwner = undefined; discard() }
      } catch { /* Session health is owned by the access controller. */ }
    })
  }
  const slots = ctx.get('slots') as unknown as { onEntryError?: (listener: (key: unknown, entry: unknown, error: unknown) => void) => () => void } | undefined
  const slotService = slots ?? (ctx as unknown as { slots?: typeof slots }).slots
  if (typeof slotService?.onEntryError === 'function') removeSlot = slotService.onEntryError((_key, _entry, cause) => report('RENDERER_COMPONENT_ERROR', cause))
  const connection = ctx.get('connection') as unknown as { state?: ConnectionSource } | undefined
  if (connection?.state) {
    let connected = false, outageReported = false
    const changed = (): void => {
      const state = connection.state!.getSnapshot()
      if (state === 'connected') { connected = true; outageReported = false; void flush() }
      else if ((state === 'disconnected' || state === 'connecting' && connected) && !outageReported) { outageReported = true; report('RENDERER_CONNECTION_LOST', undefined, 'network') }
    }
    changed(); removeConnection = connection.state.subscribe(changed)
  }
  ctx.effect(() => () => {
    active = false; lifetime.abort(); identitySignal.abort(); queue.length = 0
    subscribers.delete(enqueue)
    browser.removeEventListener('error', error); browser.removeEventListener('unhandledrejection', rejection)
    removeSlot?.(); removeConnection?.(); removeIdentity?.()
  }, 'FutureStaff browser diagnostics lifecycle')
}
