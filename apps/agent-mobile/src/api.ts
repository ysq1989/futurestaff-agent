export interface Member {
  authenticated: true
  user: {userId: string; displayName: string}
  tenantId: string
  csrf: string
  tenants: {tenantId: string; displayName: string}[]
}
export interface Agent {agentId: string; displayName: string; name?: string; description?: string; available?: boolean; unavailableReason?: string | null}
export interface BusinessSystem {systemId: string; displayName: string; available: boolean; unavailableReason?: string; agents: Agent[]; entryUrl?: string; mode: 'chat' | 'external'}
export interface Attachment {id: string; url: string; mime: string; name: string}
export interface Message {id: string; role: 'user' | 'assistant' | 'tool' | 'system'; text: string; time: number | string; attachments?: Attachment[];semanticReceipt?:unknown}
export interface Question {id: string; prompt: string; options?: string[]}
export interface Conversation {
  id: string
  title: string
  agentName: string
  status: string
  systemId: string
  scope: {kind: string; id?: string}
  contextVersion: string
  readOnly?: boolean
  updatedAt?: number | string
  messages: Message[]
  question?: Question
  attachments?: Attachment[]
}
export type ConversationRow = Omit<Conversation, 'messages'>

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(message: string, status = 0, code = 'NETWORK_ERROR') {super(message); this.status = status; this.code = code}
}

export async function request<T>(path: string, options: {
  method?: string
  body?: unknown
  csrf?: string
  signal?: AbortSignal
  file?: File
  systemId?: string
  contextVersion?: string
} = {}): Promise<T> {
  const headers = new Headers({'accept': 'application/json'})
  if (options.csrf) headers.set('x-csrf-token', options.csrf)
  if (options.systemId) headers.set('x-fs-system', options.systemId)
  if (options.contextVersion) headers.set('x-fs-context', options.contextVersion)
  if (options.file) {
    headers.set('content-type', options.file.type)
    headers.set('x-file-name', encodeURIComponent(options.file.name))
  } else if (options.body !== undefined) headers.set('content-type', 'application/json')
  let response: Response
  try {
    response = await fetch('/api/v1' + path, {
      method: options.method ?? 'GET', headers, credentials: 'same-origin', cache: 'no-store',
      redirect: 'error', signal: options.signal ?? null,
      ...(options.file ? {body: options.file} : options.body === undefined ? {} : {body: JSON.stringify(options.body)}),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('连接未完成，请检查网络后重试。')
  }
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const failure = value as {error?: {message?: unknown; code?: unknown}} | undefined
    throw new ApiError(typeof failure?.error?.message === 'string' ? failure.error.message : '请求未完成，请重试。',
      response.status, typeof failure?.error?.code === 'string' ? failure.error.code : 'REQUEST_FAILED')
  }
  if (value === undefined) throw new ApiError('服务返回不完整，请刷新查看实际状态。', response.status, 'INVALID_RESPONSE')
  return value as T
}

export function newRequestId(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 15) | 64
  bytes[8] = (bytes[8]! & 63) | 128
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

export function safeLink(value: string): string | undefined {
  try {
    const target = new URL(value, location.origin)
    if (target.username || target.password || !['https:', 'http:'].includes(target.protocol)) return
    if (target.origin === location.origin && !target.pathname.startsWith('/api/v1/sessions/')) return
    return target.href
  } catch {return}
}

export function attachmentLink(value: string): string | undefined {
  try {
    const target = new URL(value, location.origin)
    if (target.origin === location.origin && target.pathname.startsWith('/api/v1/sessions/') &&
      !target.username && !target.password) return target.href
  } catch {return}
}

export function systemEntryLink(system: Pick<BusinessSystem, 'systemId' | 'entryUrl'>): string | undefined {
  return system.systemId === 'aigc' && system.entryUrl === 'https://aigc.fsstory.net/create' ? system.entryUrl : undefined
}
