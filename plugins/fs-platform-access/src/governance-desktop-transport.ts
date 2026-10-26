import {canonicalContractJson, validateConsentManifest, validateContractSchema, type ContractInputs} from './governance-desktop-contract.js'
import {parseDesktopResponse, decodeDesktopPublicResponse, type DesktopParsedResponse, type DesktopPublicResponse, type DesktopResponseBinding} from './governance-desktop-responses.js'

/** Verified 2026-10-26 atomic consent wire planning, not the older confirmed-then-submit exercise.
 * Human confirmation performs the first payload intake on Web. Desktop commit only replays a receipt.
 * No HTTP, credentials, human approval or payload upload transport is implemented here.
 */
const schemaByOperation = {context: 'DesktopProbe', requests: 'PrepareDesktop', status: 'RecoveryTarget', commit: 'DesktopTarget', cancellations: 'CancelDesktop'} as const
const semantics = {context: 'metadata_only', requests: 'metadata_only', status: 'original_target_status', commit: 'receipt_replay_only', cancellations: 'cancellation_intent_only'} as const
export type DesktopOperation = keyof typeof schemaByOperation
export type DesktopPlanningOperation = Exclude<DesktopOperation, 'status' | 'cancellations'>
export type DesktopOperationInput<K extends DesktopOperation> = ContractInputs[(typeof schemaByOperation)[K]]
export interface DesktopRequestDescriptor<K extends DesktopOperation = DesktopOperation> {
  readonly operation: K
  readonly method: 'POST'
  readonly path: `/api/governance/v1/desktop/${K}`
  readonly headers: Readonly<{'X-Contract-Version': '1'; 'X-Request-ID': string; 'Idempotency-Key': string}>
  readonly body: DesktopOperationInput<K>
  readonly semantic: (typeof semantics)[K]
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item) }
  return value
}
function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(error)
  return value as Record<string, unknown>
}
function exact(value: Record<string, unknown>, fields: string): boolean { return Object.keys(value).sort().join(',') === fields.split(',').sort().join(',') }
function operation(value: unknown): value is DesktopOperation { return typeof value === 'string' && Object.hasOwn(schemaByOperation, value) }

function wireDescriptor<K extends DesktopOperation>(kind: K, input: unknown, traceId: string): DesktopRequestDescriptor<K> {
  if (!operation(kind)) throw Error('UNSUPPORTED_DESKTOP_OPERATION')
  validateContractSchema('WebTarget', {request_id: traceId})
  const body = validateContractSchema(schemaByOperation[kind], input) as DesktopOperationInput<K>
  if (kind === 'requests') validateConsentManifest((body as ContractInputs['PrepareDesktop']).manifest)
  const idempotencyKey = kind === 'cancellations' ? (body as ContractInputs['CancelDesktop']).operation_request_id : body.request_id
  return freeze({operation: kind, method: 'POST', path: `/api/governance/v1/desktop/${kind}`, headers: {'X-Contract-Version': '1', 'X-Request-ID': traceId, 'Idempotency-Key': idempotencyKey}, body: structuredClone(body), semantic: semantics[kind]})
}
/** requests contains a manifest, never the candidate body. Recovery builders additionally require the original owner. */
export function buildDesktopDescriptor<K extends DesktopPlanningOperation>(kind: K, input: unknown, traceId: string): DesktopRequestDescriptor<K> {
  if (!operation(kind)) throw Error('UNSUPPORTED_DESKTOP_OPERATION')
  if ((kind as DesktopOperation) === 'status' || (kind as DesktopOperation) === 'cancellations') throw Error('RECOVERY_OWNER_CONTEXT_REQUIRED')
  return wireDescriptor(kind, input, traceId)
}

/** Metadata from a future trusted Host source. These fields and TypeScript types do not authenticate it. */
export interface DesktopRecoveryOwner {tenantId: string; actorId: string; identityId: string}
export interface DesktopRecoveryRecord {
  readonly schema: 1
  readonly owner: DesktopRecoveryOwner
  readonly target: ContractInputs['RecoveryTarget']
  readonly cancellation: Pick<ContractInputs['CancelDesktop'], 'operation_request_id' | 'reason'> | null
}
function decodeOwner(value: unknown): DesktopRecoveryOwner {
  const owner = object(value, 'INVALID_RECOVERY_OWNER')
  if (!exact(owner, 'tenantId,actorId,identityId')) throw Error('INVALID_RECOVERY_OWNER')
  for (const key of ['tenantId', 'actorId', 'identityId']) {
    try { validateContractSchema('WebTarget', {request_id: owner[key]}) } catch { throw Error('INVALID_RECOVERY_OWNER') }
  }
  return structuredClone(value) as DesktopRecoveryOwner
}

/** No source text, task context, grants, bearer or human confirmation may enter a recovery record. */
export function decodeDesktopRecoveryRecord(value: unknown): DesktopRecoveryRecord {
  const record = object(value, 'INVALID_DESKTOP_RECOVERY_RECORD')
  if (!exact(record, 'schema,owner,target,cancellation') || record.schema !== 1) throw Error('INVALID_DESKTOP_RECOVERY_RECORD')
  const owner = decodeOwner(record.owner), target = validateContractSchema('RecoveryTarget', record.target)
  let cancellation: DesktopRecoveryRecord['cancellation'] = null
  if (record.cancellation !== null) {
    const raw = object(record.cancellation, 'INVALID_DESKTOP_RECOVERY_RECORD')
    if (!exact(raw, 'operation_request_id,reason')) throw Error('INVALID_DESKTOP_RECOVERY_RECORD')
    const validated = validateContractSchema('CancelDesktop', {...target, ...raw})
    cancellation = {operation_request_id: validated.operation_request_id, reason: validated.reason}
  }
  return freeze({schema: 1, owner, target: structuredClone(target), cancellation})
}
export function createDesktopRecoveryRecord(owner: DesktopRecoveryOwner, target: ContractInputs['RecoveryTarget']): DesktopRecoveryRecord { return decodeDesktopRecoveryRecord({schema: 1, owner, target, cancellation: null}) }

/** This records intent only. A retry must retain both operation id and reason, never claim an ack. */
export function recordCancellationIntent(value: DesktopRecoveryRecord, operationRequestId: string, reason: ContractInputs['CancelDesktop']['reason']): DesktopRecoveryRecord {
  const record = decodeDesktopRecoveryRecord(value)
  const validated = validateContractSchema('CancelDesktop', {...record.target, operation_request_id: operationRequestId, reason})
  const cancellation = {operation_request_id: validated.operation_request_id, reason: validated.reason}
  if (record.cancellation && canonicalContractJson(record.cancellation) !== canonicalContractJson(cancellation)) throw Error('CANCELLATION_IDEMPOTENCY_CONFLICT')
  return decodeDesktopRecoveryRecord({...record, cancellation})
}
function authorizedRecovery(value: DesktopRecoveryRecord, current: DesktopRecoveryOwner): DesktopRecoveryRecord {
  const record = decodeDesktopRecoveryRecord(value), owner = decodeOwner(current)
  if (canonicalContractJson(record.owner) !== canonicalContractJson(owner)) throw Error('RECOVERY_OWNER_MISMATCH')
  return record
}
/** Checks supplied owner metadata for consistency, not authentication; a future Host must verify the real
 * current principal again. Recovery neither supplies nor revives an old task grant.
 */
export function buildRecoveryStatusDescriptor(value: DesktopRecoveryRecord, current: DesktopRecoveryOwner, traceId: string): DesktopRequestDescriptor<'status'> {
  return wireDescriptor('status', authorizedRecovery(value, current).target, traceId)
}
export function buildRecoveryCancellationDescriptor(value: DesktopRecoveryRecord, current: DesktopRecoveryOwner, traceId: string): DesktopRequestDescriptor<'cancellations'> {
  const record = authorizedRecovery(value, current)
  if (!record.cancellation) throw Error('CANCELLATION_INTENT_REQUIRED')
  return wireDescriptor('cancellations', {...record.target, ...record.cancellation}, traceId)
}

export interface IsolatedDesktopTransport {
  readonly kind: 'isolated_mock'
  send(descriptor: DesktopRequestDescriptor, signal: AbortSignal): Promise<unknown>
}
export type DesktopTransportResult =
  | {readonly status: 'not_connected'; readonly dispatched: false}
  | {readonly status: 'unknown'; readonly dispatched: boolean; readonly responseValidation: 'invalid_response' | 'transport_error' | 'aborted'}
  | {readonly status: 'validated'; readonly dispatched: true; readonly response: DesktopParsedResponse}

/** A response observation never grants task authority. Revalidate the current owner in
 * the future Host; this function only checks consistency and preserves local intent.
 */
export function mergeDesktopRecoveryResponse(value: DesktopRecoveryRecord, current: DesktopRecoveryOwner, response: unknown, previous: unknown = null): {readonly status: 'pending' | 'received' | 'cancelled' | 'cancellation_pending'; readonly record: DesktopRecoveryRecord; readonly response: DesktopPublicResponse} {
  const record = authorizedRecovery(value, current)
  const prior = previous === null ? null : decodeDesktopPublicResponse(previous, record.target)
  const incoming = decodeDesktopPublicResponse(response, record.target, prior ? {server_task_id: prior.server_task_id, target_hash: prior.target_hash} : undefined)
  // Durable state and receipt revision never regress under delayed status replies.
  const rank = {pending: 0, received: 1, cancelled: 2} as const
  let observed = incoming
  if (prior) {
    if (rank[incoming.status] < rank[prior.status]) observed = prior
    else if (incoming.status === prior.status && prior.receipt) {
      if (!incoming.receipt || incoming.receipt.revision < prior.receipt.revision) observed = prior
      else if (incoming.receipt.revision === prior.receipt.revision && canonicalContractJson(incoming.receipt) !== canonicalContractJson(prior.receipt)) throw Error('RECOVERY_RECEIPT_CONFLICT')
    }
  }
  const status = observed.status === 'cancelled' ? 'cancelled' : record.cancellation ? 'cancellation_pending' : observed.status
  return freeze({status, record, response: observed})
}

function decodeDescriptor(value: unknown): DesktopRequestDescriptor {
  const descriptor = object(value, 'INVALID_DESKTOP_DESCRIPTOR')
  if (!exact(descriptor, 'operation,method,path,headers,body,semantic') || !operation(descriptor.operation)) throw Error('INVALID_DESKTOP_DESCRIPTOR')
  const headers = object(descriptor.headers, 'INVALID_DESKTOP_DESCRIPTOR')
  if (!exact(headers, 'X-Contract-Version,X-Request-ID,Idempotency-Key') || typeof headers['X-Request-ID'] !== 'string') throw Error('INVALID_DESKTOP_DESCRIPTOR')
  const checked = wireDescriptor(descriptor.operation, descriptor.body, headers['X-Request-ID'])
  if (canonicalContractJson(checked) !== canonicalContractJson(value)) throw Error('INVALID_DESKTOP_DESCRIPTOR')
  return checked
}

/** Defaults closed; only explicit isolated fixtures may observe a descriptor.
 * No candidate plaintext or credentials are accepted. An unknown response keeps
 * only the original metadata recovery record; raw bodies/errors are discarded.
 * A validated fixture is protocol evidence, never real transport/authentication.
 */
export async function sendDesktopDescriptor(descriptor: DesktopRequestDescriptor, options: {adapter?: IsolatedDesktopTransport; signal?: AbortSignal; binding?: DesktopResponseBinding} = {}): Promise<DesktopTransportResult> {
  const adapter = options.adapter
  if (!adapter || adapter.kind !== 'isolated_mock') return freeze({status: 'not_connected', dispatched: false})
  if (typeof adapter.send !== 'function') throw Error('INVALID_ISOLATED_DESKTOP_TRANSPORT')
  const checked = decodeDescriptor(descriptor), signal = options.signal ?? new AbortController().signal
  if (signal.aborted) return freeze({status: 'unknown', dispatched: false, responseValidation: 'aborted'})
  let raw: unknown
  try { raw = await adapter.send(checked, signal) } catch { return freeze({status: 'unknown', dispatched: true, responseValidation: signal.aborted ? 'aborted' : 'transport_error'}) }
  if (signal.aborted) return freeze({status: 'unknown', dispatched: true, responseValidation: 'aborted'})
  try { return freeze({status: 'validated', dispatched: true, response: parseDesktopResponse(checked, raw, options.binding)}) }
  catch { return freeze({status: 'unknown', dispatched: true, responseValidation: 'invalid_response'}) }
}
