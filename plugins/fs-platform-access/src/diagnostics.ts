import {createHash, randomUUID} from 'node:crypto'
import {lstat, mkdir, readFile, rename, unlink, writeFile} from 'node:fs/promises'
import path from 'node:path'

export const DIAGNOSTIC_CODES = Object.freeze([
  'UNCLASSIFIED', 'FUTURESTAFF_PROVIDER', 'FUTURESTAFF_CHAT', 'FUTURESTAFF_CHAT_LIMIT',
  'FUTURESTAFF_AUTH', 'FUTURESTAFF_TENANT', 'FUTURESTAFF_MODEL_ACCESS', 'FUTURESTAFF_CONTRACT',
  'FUTURESTAFF_SESSION', 'FUTURESTAFF_STORAGE', 'FUTURESTAFF_LIMIT', 'FUTURESTAFF_IMAGES',
  'FUTURESTAFF_AGENT_BINDING', 'FUTURESTAFF_AGENT_VERSION', 'FUTURESTAFF_AGENT_REQUIRED',
  'FUTURESTAFF_AGENT_MODEL', 'FUTURESTAFF_AGENT_LIMIT', 'FUTURESTAFF_MODEL_BINDING', 'FUTURESTAFF_TEXT_ONLY',
  'INVALID_ARGS', 'UNKNOWN_TOOL', 'INVALID_TOOL_OUTPUT', 'TOOL_VALIDATION_ERROR', 'TOOL_EXECUTION_ERROR', 'NETWORK_ERROR', 'HTTP_ERROR',
  'PLATFORM_UNAVAILABLE', 'PLATFORM_LOGIN_REQUIRED', 'CONTRACT_MISMATCH',
  'AUTHENTICATION_REQUIRED', 'TOKEN_EXPIRED', 'TOKEN_AUDIENCE_INVALID', 'APPLICATION_ACCESS_DENIED',
  'TENANT_ACCESS_DENIED', 'TENANT_MEMBERSHIP_REQUIRED', 'INVALID_REQUEST', 'NOT_FOUND',
  'AGENT_UNAVAILABLE', 'AGENT_CONTRACT_INVALID', 'AGENT_PERMISSION_CONFIRMATION_REQUIRED',
  'AGENT_DISTRIBUTION_UPGRADE_REQUIRED', 'AGENT_RELEASE_CHANGED', 'AGENT_PACKAGE_INTEGRITY', 'AGENT_NOT_INSTALLED',
  'LOGIN_UNAVAILABLE', 'SESSION_UNAVAILABLE', 'SYSTEM_SSO_UNAVAILABLE', 'APPLICATION_UNAVAILABLE',
  'RENDERER_ERROR', 'RENDERER_UNHANDLED_REJECTION', 'RENDERER_COMPONENT_ERROR', 'RENDERER_CONNECTION_LOST',
  'HOST_UNCAUGHT_EXCEPTION', 'HOST_UNHANDLED_REJECTION', 'PREVIOUS_RUN_ABNORMAL',
  'NATIVE_RENDERER_PROCESS_GONE', 'NATIVE_RENDERER_LOAD_FAILED', 'NATIVE_RENDERER_BOOT_FAILED',
] as const)
const codes = new Set<string>(DIAGNOSTIC_CODES)
const categories = ['llm', 'tool', 'network', 'auth', 'renderer', 'host', 'crash', 'system'] as const
const operations = ['chat', 'tool', 'login', 'refresh', 'discovery', 'system', 'runtime', 'render', 'bootstrap', 'unknown'] as const
const exceptionTypes = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'AbortError', 'TimeoutError', 'other'] as const
const platforms = ['win32', 'darwin', 'linux', 'unknown'] as const
const toolNames = new Set(['read','write','edit','glob','grep','pwsh','bash','read_image','web_fetch','web_search',
  'agent_message_card','ask_user_question','workflow','agent','job_output','job_kill','create_goal','get_goal','update_goal',
  'website_tools','website_call','website_image_generate','website_image_download','website_image_save','erp_query',
  'erp_prepare_action','erp_order_form','call_erp_api','shop_tools','shop_call','shop_query','shop_operation_status',
  'shop_recommend_products','shop_theme_tools','shop_theme_call','shop_theme_asset_from_image','agent_image_generate',
  'fashion_image_generate','fashion_image_process','product_hub_tools','product_hub_call','call_product_hub_api',
  'call_agent_admin_api','visa_query','geo_projects_list','geo_questions_list','geo_collection_create','geo_collection_list',
  'geo_collection_get','geo_collection_run','geo_doubao_open','geo_effect_report'])
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const semver = /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[A-Za-z0-9.-]{1,40})?(?:\+[A-Za-z0-9.-]{1,40})?$/
const MAX_EVENTS = 200, MAX_BYTES = 256 * 1024, TTL = 7 * 24 * 60 * 60 * 1000
const MAX_BATCH_EVENTS = 20, MAX_BATCH_BYTES = 32 * 1024, MAX_ACK_BYTES = 64 * 1024, MAX_ATTEMPTS = 8

export interface DiagnosticInput {
  category?: typeof categories[number] | undefined
  code?: string | undefined
  operation?: typeof operations[number] | undefined
  severity?: 'error' | 'fatal' | undefined
  sessionId?: string | undefined
  requestId?: string | undefined
  httpStatus?: number | undefined
  durationMs?: number | undefined
  requestBytes?: number | undefined
  turn?: number | undefined
  step?: number | undefined
  toolName?: string | undefined
  exceptionType?: typeof exceptionTypes[number] | undefined
  stackHash?: string | undefined
}
export interface DiagnosticEvent extends DiagnosticInput {
  eventId: string
  occurredAt: string
  category: typeof categories[number]
  code: string
  operation: typeof operations[number]
  severity: 'error' | 'fatal'
  appVersion: string
  platform: typeof platforms[number]
  count: number
}
export interface DiagnosticsIdentity {environment: 'dev' | 'production'; tenantId: string; userId: string}
export interface DiagnosticsOptions {
  directory: string
  identity: DiagnosticsIdentity
  origin: string
  authorize: () => Promise<{accessToken: string; userId: string; tenantId: string; signal: AbortSignal}>
  appVersion: string
  platform: string
  fetcher?: typeof fetch
  now?: () => number
  autoFlush?: boolean
  setTimer?: (callback: () => void, delayMs: number) => unknown
  clearTimer?: (handle: unknown) => void
}
interface QueueRecord {event: DiagnosticEvent; sealed: boolean}
interface QueueState {schema: 1; owner: DiagnosticsIdentity; records: QueueRecord[]; attempts: number; nextAttemptAt: number; localCounters: {rejectedEvents: number}}

export function safeCode(input: unknown): string {return typeof input === 'string' && codes.has(input) ? input : 'UNCLASSIFIED'}
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const enumValue = <T extends string>(value: unknown, choices: readonly T[], fallback: T): T => typeof value === 'string' && choices.includes(value as T) ? value as T : fallback

/** A fixed metadata projection. Exceptions, arbitrary messages, paths and extra keys never cross it. */
export function sanitizeDiagnosticInput(input: unknown): DiagnosticInput {
  try {
    const raw = isRecord(input) ? input : {}
    const output: DiagnosticInput = {category: enumValue(raw.category, categories, 'host'), code: safeCode(raw.code),
      operation: enumValue(raw.operation, operations, 'unknown'), severity: raw.severity === 'fatal' ? 'fatal' : 'error'}
    for (const name of ['sessionId','requestId'] as const) {
      const value = raw[name]
      if (typeof value !== 'string') continue
      const normalized = name === 'sessionId' && value.startsWith('session-') ? value.slice(8) : value
      if (uuid.test(normalized)) output[name] = normalized.toLowerCase()
    }
    for (const [name, min, max] of [['httpStatus',100,599],['durationMs',0,3600000],['requestBytes',0,100000000],['turn',0,1000000],['step',0,1000000]] as const) {
      const value = raw[name]
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max) output[name] = value
    }
    if (typeof raw.toolName === 'string' && toolNames.has(raw.toolName)) output.toolName = raw.toolName
    if (raw.exceptionType !== undefined) output.exceptionType = enumValue(raw.exceptionType, exceptionTypes, 'other')
    if (typeof raw.stackHash === 'string' && /^[a-f0-9]{64}$/.test(raw.stackHash)) output.stackHash = raw.stackHash
    return output
  } catch {return {category:'host',code:'UNCLASSIFIED',operation:'unknown',severity:'error'}}
}

const keysEqual = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key))
const sameOwner = (a: DiagnosticsIdentity, b: DiagnosticsIdentity) => a.environment === b.environment && a.tenantId === b.tenantId && a.userId === b.userId
const fingerprint = (event: DiagnosticEvent) => {
  const {eventId: _id, occurredAt: _time, count: _count, ...metadata} = event
  return createHash('sha256').update(JSON.stringify(metadata)).digest('hex')
}
async function untilAborted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let listener: (() => void) | undefined
  const cancelled = new Promise<never>((_resolve,reject) => {
    listener = () => reject(Error('DIAGNOSTIC_CANCELLED'))
    if (signal.aborted) listener(); else signal.addEventListener('abort',listener,{once:true})
  })
  try {return await Promise.race([operation,cancelled])}
  finally {if (listener) signal.removeEventListener('abort',listener)}
}
async function readAcknowledgement(response: Response, signal: AbortSignal): Promise<unknown> {
  const declared = response.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_ACK_BYTES) {
    void response.body?.cancel().catch(() => {})
    throw Error('DIAGNOSTIC_ACK_TOO_LARGE')
  }
  if (!response.body) throw Error('DIAGNOSTIC_ACK_INVALID')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let bytes = 0, complete = false
  try {
    for (;;) {
      signal.throwIfAborted()
      const next = await untilAborted(reader.read(),signal)
      if (next.done) {complete = true;break}
      bytes += next.value.byteLength
      if (bytes > MAX_ACK_BYTES) throw Error('DIAGNOSTIC_ACK_TOO_LARGE')
      chunks.push(next.value)
    }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes))) as unknown
  } finally {if (!complete) void reader.cancel().catch(() => {})}
}

async function ensurePrivateTree(directory: string): Promise<void> {
  const parent = path.dirname(directory)
  if (parent !== directory) await ensurePrivateTree(parent)
  try {const info = await lstat(directory); if (!info.isDirectory() || info.isSymbolicLink()) throw Error('DIAGNOSTIC_DIRECTORY_INVALID')}
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    try {await mkdir(directory,{mode:0o700})} catch (cause) {if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause}
    const info = await lstat(directory); if (!info.isDirectory() || info.isSymbolicLink()) throw Error('DIAGNOSTIC_DIRECTORY_INVALID')
  }
}

/** Owner-scoped, metadata-only outbox. Delivery retries never replay a model or a tool. */
export class FutureStaffDiagnostics {
  readonly ready: Promise<void>
  readonly #options: DiagnosticsOptions
  readonly #owner: DiagnosticsIdentity
  readonly #file: string
  readonly #now: () => number
  readonly #fetch: typeof fetch
  readonly #setTimer: (callback: () => void, delayMs: number) => unknown
  readonly #clearTimer: (handle: unknown) => void
  readonly #lifetime = new AbortController()
  #records: QueueRecord[] = []
  #pending: DiagnosticEvent[] = []
  #captureDrainScheduled = false
  #work: Promise<void> = Promise.resolve()
  #flight: Promise<void> | undefined
  #timer: unknown
  #blocked = false
  #authorizationPaused = false
  #disposed = false
  #attempts = 0
  #nextAttemptAt = 0
  #rejectedEvents = 0

  constructor(options: DiagnosticsOptions) {
    const origins = {dev:'https://dev.fsstory.net', production:'https://platform.fsstory.net'}
    if (!path.isAbsolute(options.directory) || !options.identity || !uuid.test(options.identity.tenantId) || !uuid.test(options.identity.userId)
      || origins[options.identity.environment] !== options.origin) throw Error('DIAGNOSTIC_CONFIGURATION_INVALID')
    this.#options = {...options}
    this.#owner = Object.freeze({environment:options.identity.environment,tenantId:options.identity.tenantId.toLowerCase(),userId:options.identity.userId.toLowerCase()})
    this.#file = path.join(options.directory,'outbox.json')
    this.#now = options.now ?? Date.now
    this.#fetch = options.fetcher ?? globalThis.fetch
    this.#setTimer = options.setTimer ?? ((callback, delay) => {const timer = setTimeout(callback,delay); timer.unref?.(); return timer})
    this.#clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>))
    this.ready = this.#load().catch(() => {this.#blocked = true})
    this.#work = this.ready
    void this.ready.then(() => this.#schedule())
  }

  capture(input: DiagnosticInput): void {
    try {
      if (this.#disposed) return
      const safe = sanitizeDiagnosticInput(input)
      const event: DiagnosticEvent = {...safe,eventId:randomUUID(),occurredAt:new Date(this.#now()).toISOString(),
        category:safe.category!,code:safe.code!,operation:safe.operation!,severity:safe.severity!,
        appVersion:semver.test(this.#options.appVersion) ? this.#options.appVersion : '0.0.0',
        platform:enumValue(this.#options.platform,platforms,'unknown'),count:1}
      const pendingMatch = [...this.#pending].reverse().find(item => item.count < 1000
        && this.#now() - Date.parse(item.occurredAt) <= 60000 && fingerprint(item) === fingerprint(event))
      if (pendingMatch) pendingMatch.count++
      else this.#pending.push(event)
      while (this.#pending.length > MAX_EVENTS || Buffer.byteLength(JSON.stringify(this.#pending)) > MAX_BYTES) this.#pending.shift()
      if (this.#captureDrainScheduled) return
      this.#captureDrainScheduled = true
      void this.#serialize(async () => {
        const pending = this.#pending; this.#pending = []; this.#captureDrainScheduled = false
        if (this.#blocked) return
        this.#prune()
        for (const item of pending) {
          const match = [...this.#records].reverse().find(record => !record.sealed && record.event.count + item.count <= 1000
            && this.#now() - Date.parse(record.event.occurredAt) <= 60000 && fingerprint(record.event) === fingerprint(item))
          if (match) match.event = {...match.event,count:match.event.count+item.count}
          else this.#records.push({event:item,sealed:false})
        }
        this.#prune(); await this.#persist()
      }).then(() => this.#schedule()).catch(() => {})
    } catch { /* Diagnostics cannot fail a business operation. */ }
  }

  flush(): Promise<void> {
    if (this.#flight) return this.#flight
    if (this.#timer !== undefined) {this.#clearTimer(this.#timer);this.#timer = undefined}
    this.#authorizationPaused = false
    const pending = this.#flush().catch(() => {}).finally(() => {if (this.#flight === pending) this.#flight = undefined; this.#schedule()})
    this.#flight = pending
    return pending
  }

  async dispose(): Promise<void> {
    this.#disposed = true; this.#lifetime.abort()
    if (this.#timer !== undefined) {this.#clearTimer(this.#timer); this.#timer = undefined}
    await this.#flight
    await this.#work
  }

  #serialize(operation: () => Promise<void>): Promise<void> {
    const pending = this.#work.then(operation,operation).catch(() => {this.#blocked = true})
    this.#work = pending
    return pending
  }

  #state(): QueueState {return {schema:1,owner:this.#owner,records:this.#records,attempts:this.#attempts,nextAttemptAt:this.#nextAttemptAt,localCounters:{rejectedEvents:this.#rejectedEvents}}}
  #prune(): void {
    const now = this.#now()
    this.#records = this.#records.filter(({event}) => Date.parse(event.occurredAt) > now - TTL && Date.parse(event.occurredAt) <= now + 300000)
    while (this.#records.length > MAX_EVENTS || Buffer.byteLength(JSON.stringify(this.#state())) > MAX_BYTES) this.#records.shift()
  }

  async #persist(): Promise<void> {
    await ensurePrivateTree(this.#options.directory)
    try {const info = await lstat(this.#file); if (!info.isFile() || info.isSymbolicLink()) throw Error('DIAGNOSTIC_FILE_INVALID')}
    catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error}
    const temporary = this.#file + '.' + randomUUID() + '.tmp'
    try {await writeFile(temporary,JSON.stringify(this.#state()),{flag:'wx',mode:0o600}); await rename(temporary,this.#file)}
    finally {await unlink(temporary).catch(() => {})}
  }

  async #load(): Promise<void> {
    await ensurePrivateTree(this.#options.directory)
    let value: unknown
    try {
      const info = await lstat(this.#file)
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw Error('DIAGNOSTIC_FILE_INVALID')
      value = JSON.parse(await readFile(this.#file,'utf8'))
    } catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error}
    if (!isRecord(value) || !(keysEqual(value,['schema','owner','records','attempts','nextAttemptAt']) || keysEqual(value,['schema','owner','records','attempts','nextAttemptAt','localCounters'])) || value.schema !== 1 || !isRecord(value.owner)
      || !keysEqual(value.owner,['environment','tenantId','userId']) || !sameOwner(value.owner as unknown as DiagnosticsIdentity,this.#owner)
      || !Array.isArray(value.records) || value.records.length > MAX_EVENTS || !Number.isInteger(value.attempts) || Number(value.attempts) < 0 || Number(value.attempts) > MAX_ATTEMPTS
      || !Number.isSafeInteger(value.nextAttemptAt) || Number(value.nextAttemptAt) < 0) throw Error('DIAGNOSTIC_STATE_INVALID')
    if (value.localCounters !== undefined && (!isRecord(value.localCounters) || !keysEqual(value.localCounters,['rejectedEvents'])
      || !Number.isSafeInteger(value.localCounters.rejectedEvents) || Number(value.localCounters.rejectedEvents) < 0)) throw Error('DIAGNOSTIC_STATE_INVALID')
    const records: QueueRecord[] = [], seen = new Set<string>()
    for (const record of value.records) {
      if (!isRecord(record) || !keysEqual(record,['event','sealed']) || typeof record.sealed !== 'boolean' || !isRecord(record.event)) throw Error('DIAGNOSTIC_STATE_INVALID')
      const event = record.event, safe = sanitizeDiagnosticInput(event)
      const metadata = ['eventId','occurredAt','appVersion','platform','count']
      if (!keysEqual(event,[...Object.keys(safe),...metadata]) || Object.entries(safe).some(([key,item]) => event[key] !== item)
        || typeof event.eventId !== 'string' || !uuid.test(event.eventId) || seen.has(event.eventId) || typeof event.occurredAt !== 'string'
        || !Number.isFinite(Date.parse(event.occurredAt)) || new Date(event.occurredAt).toISOString() !== event.occurredAt
        || typeof event.appVersion !== 'string' || !semver.test(event.appVersion) || !platforms.includes(event.platform as typeof platforms[number])
        || !Number.isSafeInteger(event.count) || Number(event.count) < 1 || Number(event.count) > 1000) throw Error('DIAGNOSTIC_STATE_INVALID')
      seen.add(event.eventId);records.push({event:event as unknown as DiagnosticEvent,sealed:record.sealed})
    }
    this.#records = records; this.#attempts = Number(value.attempts); this.#nextAttemptAt = Math.min(Number(value.nextAttemptAt),this.#now()+300000)
    this.#rejectedEvents = isRecord(value.localCounters) ? Number(value.localCounters.rejectedEvents) : 0
    this.#prune()
  }

  #schedule(): void {
    if (this.#options.autoFlush === false || this.#disposed || this.#blocked || this.#authorizationPaused || this.#flight || this.#timer !== undefined || !this.#records.length) return
    const delay = Math.min(Math.max(0,this.#nextAttemptAt-this.#now()),300000)
    this.#timer = this.#setTimer(() => {this.#timer = undefined;void this.flush()},delay)
  }

  async #flush(): Promise<void> {
    await this.#work
    if (this.#disposed || this.#blocked) return
    await this.#serialize(async () => {this.#prune();if (this.#records.length === 0) this.#nextAttemptAt = 0; await this.#persist()})
    if (this.#disposed || this.#blocked || !this.#records.length || this.#now() < this.#nextAttemptAt) return
    const timeout = new AbortController(), authorizationSignal = AbortSignal.any([timeout.signal,this.#lifetime.signal])
    const timer = this.#setTimer(() => timeout.abort(),5000)
    let credentials: Awaited<ReturnType<DiagnosticsOptions['authorize']>>
    try {credentials = await untilAborted(this.#options.authorize(),authorizationSignal)}
    catch {this.#clearTimer(timer);if (!this.#disposed) await this.#failed();return}
    if (this.#disposed || credentials.signal.aborted || credentials.tenantId.toLowerCase() !== this.#owner.tenantId || credentials.userId.toLowerCase() !== this.#owner.userId) {this.#authorizationPaused = true;this.#clearTimer(timer);return}
    let events: DiagnosticEvent[] = []
    await this.#serialize(async () => {
      this.#prune()
      for (const record of this.#records) {
        if (events.length >= MAX_BATCH_EVENTS) break
        const next = [...events,record.event]
        if (Buffer.byteLength(JSON.stringify({contractVersion:'1.0.0',events:next})) > MAX_BATCH_BYTES) break
        record.sealed = true; events = next
      }
      await this.#persist()
    })
    if (!events.length || this.#blocked || this.#disposed || credentials.signal.aborted) {if (credentials.signal.aborted) this.#authorizationPaused = true;this.#clearTimer(timer);return}
    const signal = AbortSignal.any([authorizationSignal,credentials.signal])
    try {
      const upload = async () => {
        signal.throwIfAborted()
        const response = await this.#fetch(this.#options.origin+'/desktop/v1/diagnostics/events',{method:'POST',redirect:'error',cache:'no-store',signal,
          headers:{authorization:'Bearer '+credentials.accessToken,'content-type':'application/json'},body:JSON.stringify({contractVersion:'1.0.0',events})})
        if (!response.ok) {
          const retryAfter = response.status === 429 ? response.headers.get('retry-after') : null
          void response.body?.cancel().catch(() => {})
          return {ok:false as const,status:response.status,retryAfter}
        }
        const ack = await readAcknowledgement(response,signal)
        return {ok:true as const,ack}
      }
      const result = await untilAborted(upload(),signal)
      signal.throwIfAborted()
      if (!result.ok) {
        if (result.status === 401 || result.status === 403) {this.#authorizationPaused = true;return}
        if ([400,409,422].includes(result.status)) {
          const rejected = new Set(events.map(event=>event.eventId))
          await this.#serialize(async () => {
            if (this.#disposed || signal.aborted) return
            const count = this.#records.filter(record=>rejected.has(record.event.eventId)).length
            this.#records = this.#records.filter(record=>!rejected.has(record.event.eventId))
            this.#rejectedEvents = Math.min(Number.MAX_SAFE_INTEGER,this.#rejectedEvents+count)
            this.#attempts = 0;this.#nextAttemptAt = 0
            await this.#persist()
          })
          return
        }
        await this.#failed(result.retryAfter);return
      }
      const ack = result.ack, ids = new Set(events.map(event=>event.eventId))
      if (!isRecord(ack) || !keysEqual(ack,['contractVersion','acceptedEventIds','duplicateEventIds']) || ack.contractVersion !== '1.0.0'
        || !Array.isArray(ack.acceptedEventIds) || !Array.isArray(ack.duplicateEventIds)) throw Error('DIAGNOSTIC_ACK_INVALID')
      const received = [...ack.acceptedEventIds,...ack.duplicateEventIds]
      if (received.length > events.length || new Set(received).size !== received.length || received.some(id=>typeof id !== 'string'||!ids.has(id))) throw Error('DIAGNOSTIC_ACK_INVALID')
      await this.#serialize(async () => {
        if (this.#disposed || signal.aborted) return
        this.#records = this.#records.filter(record=>!received.includes(record.event.eventId))
        this.#attempts = received.length ? 0 : Math.min(MAX_ATTEMPTS,this.#attempts+1)
        this.#nextAttemptAt = received.length ? 0 : this.#now()+60000
        await this.#persist()
      })
    } catch {if (credentials.signal.aborted) this.#authorizationPaused = true;else if (!this.#disposed) await this.#failed()}
    finally {this.#clearTimer(timer)}
  }

  async #failed(retryAfter?: string | null): Promise<void> {
    if (this.#disposed || this.#blocked) return
    await this.#serialize(async () => {
      this.#attempts = Math.min(MAX_ATTEMPTS,this.#attempts+1)
      let delay = this.#attempts >= MAX_ATTEMPTS ? 300000 : Math.min(300000,1000*2**(this.#attempts-1))
      if (retryAfter) {
        const numeric = /^\d{1,8}$/.test(retryAfter) ? Number(retryAfter)*1000 : Date.parse(retryAfter)-this.#now()
        if (Number.isFinite(numeric)) delay = Math.max(delay,Math.min(300000,Math.max(0,numeric)))
      }
      this.#nextAttemptAt = this.#now()+delay
      await this.#persist()
    })
  }
}
