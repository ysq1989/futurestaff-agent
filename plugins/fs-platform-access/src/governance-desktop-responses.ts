import {parseContractJson, validateContractSchema, validateConsentManifest, type ContractDomain, type RecoveryTarget} from './governance-desktop-contract.js'

/** Current-source response builders, not an authentication or permission grant.
 * Only a bounded raw JSON HTTP 200 envelope is accepted. Unknown HTTP/framework
 * failures stay unknown; neither error text nor raw response bodies escape here.
 */
export type DesktopResponseOperation = 'context' | 'requests' | 'status' | 'commit' | 'cancellations'
export interface DesktopResponseBinding {readonly server_task_id: string; readonly target_hash: string}
export interface DesktopReceipt extends RecoveryTarget {
  readonly status: 'received' | 'revoked'
  readonly resource_id: string | null
  readonly consent_receipt_id: string | null
  readonly received_at: string
  readonly revision: number
}
export interface DesktopPublicResponse extends RecoveryTarget, DesktopResponseBinding {
  readonly task_authorization_revision: 1
  readonly authority_source: 'none' | 'explicit_web_single_candidate_approval'
  readonly action: 'desktop.intake.consent'
  readonly status: 'pending' | 'received' | 'cancelled'
  readonly expires_at: string
  readonly receipt: DesktopReceipt | null
  readonly formal_knowledge_permission: false
  readonly agent_query_permission: false
  readonly expired?: boolean
}
export interface DesktopContextResponse {
  readonly channel: 'desktop_candidate_intake'; readonly actor_id: string; readonly tenant_id: string; readonly policy_id: string
  readonly scope_policy_version: 1; readonly policy_version: 'governance-private-text-v1'; readonly privacy_transform_version: 'redaction-v1'
  readonly audiences: readonly string[]; readonly purposes: readonly string[]; readonly client_version_attested: false
  readonly task_authorization: 'requires_web_single_candidate_approval'; readonly formal_knowledge_permission: false; readonly agent_query_permission: false
}
export type DesktopParsedResponse = {readonly kind: 'context'; readonly value: DesktopContextResponse} | {readonly kind: 'target'; readonly value: DesktopPublicResponse}
export interface IsolatedDesktopHttpResponse {readonly statusCode: number; readonly contentType: string; readonly body: string}
const requestSchemas = {context: 'DesktopProbe', requests: 'PrepareDesktop', status: 'RecoveryTarget', commit: 'DesktopTarget', cancellations: 'CancelDesktop'} as const
const publicFields = 'request_id,server_task_id,task_authorization_revision,authority_source,action,domain,payload_hash,target_hash,status,expires_at,receipt,formal_knowledge_permission,agent_query_permission'
function fail(): never { throw Error('INVALID_DESKTOP_RESPONSE') }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(); return value as Record<string, unknown> }
function exact(value: Record<string, unknown>, fields: string): void { if (Object.keys(value).sort().join(',') !== fields.split(',').sort().join(',')) fail() }
function uuid(value: unknown): void { if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value)) fail() }
function hash(value: unknown): void { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail() }
function utc(value: unknown): void {
  if (typeof value !== 'string') fail()
  // The Python dict builders use aware(...).isoformat(): +00:00, zero/six fractional digits.
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{6}))?\+00:00$/u)
  if (!parts) fail()
  const [year = 0, month = 0, day = 0, hour = 99, minute = 99, second = 99] = parts.slice(1, 7).map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0), days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0) || hour > 23 || minute > 59 || second > 59) fail()
}
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item) } return value }
function matches(value: Record<string, unknown>, target: RecoveryTarget): void { if (value.request_id !== target.request_id || value.domain !== target.domain || value.payload_hash !== target.payload_hash) fail() }
export function decodeDesktopResponseBinding(input: unknown): DesktopResponseBinding {
  const value = object(input); exact(value, 'server_task_id,target_hash'); uuid(value.server_task_id); hash(value.target_hash)
  return freeze(structuredClone(value)) as unknown as DesktopResponseBinding
}
/** Target hash is supplied by the server. Shape/continuity checks cannot authenticate server facts. */
export function decodeDesktopPublicResponse(input: unknown, target: RecoveryTarget, binding?: DesktopResponseBinding): DesktopPublicResponse {
  const expected = validateContractSchema('RecoveryTarget', target), value = object(input)
  const hasExpired = Object.hasOwn(value, 'expired'); exact(value, publicFields + (hasExpired ? ',expired' : ''))
  matches(value, expected); uuid(value.server_task_id); hash(value.target_hash); utc(value.expires_at)
  if (hasExpired && typeof value.expired !== 'boolean') fail()
  if (value.action !== 'desktop.intake.consent' || value.task_authorization_revision !== 1 || value.formal_knowledge_permission !== false || value.agent_query_permission !== false) fail()
  if (binding) { const checked = decodeDesktopResponseBinding(binding); if (value.server_task_id !== checked.server_task_id || value.target_hash !== checked.target_hash) fail() }
  if (!['pending', 'received', 'cancelled'].includes(String(value.status))) fail()
  const received = value.status === 'received'
  if (value.authority_source !== (received ? 'explicit_web_single_candidate_approval' : 'none')) fail()
  if (value.receipt !== null) {
    const receipt = object(value.receipt); exact(receipt, 'request_id,domain,status,resource_id,consent_receipt_id,payload_hash,received_at,revision')
    matches(receipt, expected); if (receipt.resource_id !== null) uuid(receipt.resource_id); if (receipt.consent_receipt_id !== null) uuid(receipt.consent_receipt_id); utc(receipt.received_at)
    if (!Number.isSafeInteger(receipt.revision) || Number(receipt.revision) < (received ? 1 : 2)) fail()
    if (value.status === 'pending' || receipt.status !== (received ? 'received' : 'revoked')) fail()
  } else if (received) fail()
  return freeze(structuredClone(value)) as unknown as DesktopPublicResponse
}
function sortedSubset(input: unknown, allowed: string[]): void {
  if (!Array.isArray(input) || input.length < 1 || input.length > allowed.length || input.some(item => typeof item !== 'string' || !allowed.includes(item)) || new Set(input).size !== input.length || input.join(',') !== [...input].sort().join(',')) fail()
}
function contextResponse(input: unknown): DesktopContextResponse {
  const value = object(input)
  exact(value, 'channel,actor_id,tenant_id,policy_id,scope_policy_version,policy_version,privacy_transform_version,audiences,purposes,client_version_attested,task_authorization,formal_knowledge_permission,agent_query_permission')
  uuid(value.actor_id); uuid(value.tenant_id); uuid(value.policy_id)
  if (value.channel !== 'desktop_candidate_intake' || value.scope_policy_version !== 1 || value.policy_version !== 'governance-private-text-v1' || value.privacy_transform_version !== 'redaction-v1' || value.client_version_attested !== false || value.task_authorization !== 'requires_web_single_candidate_approval' || value.formal_knowledge_permission !== false || value.agent_query_permission !== false) fail()
  sortedSubset(value.audiences, ['customer', 'employee', 'internal', 'partner', 'recruiting']); sortedSubset(value.purposes, ['answer_current_task'])
  return freeze(structuredClone(value)) as unknown as DesktopContextResponse
}
export function parseDesktopResponse(request: {readonly operation: DesktopResponseOperation; readonly body: unknown}, input: unknown, binding?: DesktopResponseBinding): DesktopParsedResponse {
  if (!Object.hasOwn(requestSchemas, request.operation)) fail()
  const body = validateContractSchema(requestSchemas[request.operation], request.body)
  const envelope = object(input); exact(envelope, 'statusCode,contentType,body')
  if (envelope.statusCode !== 200 || typeof envelope.contentType !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(envelope.contentType) || typeof envelope.body !== 'string') fail()
  const value = parseContractJson(envelope.body)
  if (request.operation === 'context') return freeze({kind: 'context', value: contextResponse(value)})
  const raw = object(body)
  let domain: ContractDomain, payloadHash: string
  if (request.operation === 'requests') { const manifest = validateConsentManifest(raw.manifest); domain = manifest.domain; payloadHash = manifest.payload_hash }
  else { domain = raw.domain as ContractDomain; payloadHash = raw.payload_hash as string }
  const parsed = decodeDesktopPublicResponse(value, {request_id: String(raw.request_id), domain, payload_hash: payloadHash}, binding)
  if (Object.hasOwn(parsed, 'expired') !== (request.operation === 'status') || (request.operation === 'commit' && parsed.status === 'pending') || (request.operation === 'cancellations' && parsed.status !== 'cancelled')) fail()
  return freeze({kind: 'target', value: parsed})
}
