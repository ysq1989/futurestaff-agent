/** Verified schema/canonical primitives only; neither authentication nor a completed desktop handoff. */
import {desktopConsentSchemas, knownProhibitedPattern} from './governance-desktop-contract-schemas.js'

export type ContractDomain = 'enterprise_knowledge' | 'platform_product_feedback'
export type ContractJson = null | boolean | number | string | ContractJson[] | {[key: string]: ContractJson}
export interface DesktopContext {agent_id: string; agent_version: string; agent_release_version: string; client_version: string; client_task_id: string}
export interface ConsentScope {policy_id: string; policy_version: number; audiences: string[]; purpose: string; valid_until: string | null}
export interface ConsentManifest {
  domain: ContractDomain; recipient: string; purpose: string; payload_hash: string; evidence_manifest_hash: string
  scope: ConsentScope; source_versions: {source_id: string; version: string}[]; selected_fields: string[]
  privacy_transform_version: string; policy_version: string; allow_cross_tenant_aggregation: boolean
}
export interface ConsentEvidence {
  evidence_id: string; excerpt: string; basis: 'explicit_user' | 'model_inference'; relation: 'supports' | 'refutes' | 'context'
  sensitivity: 'ordinary'; redaction_status: 'not_needed' | 'redacted'; redaction_version: string; asset_refs: []
  source: {source_id: string; kind: 'user_statement'; resource_app: null; opaque_locator: null; version: string; content_hash: string; observed_at: string; verification_status: 'reported' | 'unverified'; rights_basis: string}
}
export interface KnowledgePayload {kind: 'new_fact' | 'correction' | 'expression' | 'resource_change'; title: string; proposed_content: string; basis: 'explicit_user' | 'model_inference'; base_version_id: string | null; scope: ConsentScope; evidence: ConsentEvidence[]}
export interface FeedbackPayload {
  goal: string; expected: string; actual: string; entrypoint: string; versions: {application: string; client: string; agent: string; tool: string | null}
  category: 'feature_request' | 'suspected_bug' | 'operation_help' | 'model_limitation' | 'unknown'; subcategory: 'discoverability' | 'capability_gap_pending_verification' | 'other' | null
  basis: 'explicit_user' | 'model_inference'; capability_status: 'unknown' | 'reported'; aspect_ratio: {width: number; height: number} | null; pixel_size: {width: number; height: number} | null; repro_steps: string[]; evidence: ConsentEvidence[]
}
export type ConsentPayload = KnowledgePayload | FeedbackPayload
export interface DesktopProbe {request_id: string; context: DesktopContext}
export interface PrepareDesktop extends DesktopProbe {manifest: ConsentManifest}
export interface RecoveryTarget {request_id: string; domain: ContractDomain; payload_hash: string}
export interface DesktopTarget extends RecoveryTarget {context: DesktopContext}
export interface CancelDesktop extends RecoveryTarget {operation_request_id: string; reason: 'user_cancelled' | 'identity_changed' | 'intent_expired'}
export interface WebTarget {request_id: string}
export interface WebPreview extends WebTarget {target_hash: string}
export interface ConfirmDesktop {operation_request_id: string; confirmation_id: string; preview_hash: string; challenge: string; payload: ContractJson}
export interface ContractInputs {DesktopContext: DesktopContext; DesktopProbe: DesktopProbe; PrepareDesktop: PrepareDesktop; DesktopTarget: DesktopTarget; RecoveryTarget: RecoveryTarget; CancelDesktop: CancelDesktop; WebTarget: WebTarget; WebPreview: WebPreview; ConfirmDesktop: ConfirmDesktop}
export type DesktopSchemaName = keyof ContractInputs

const MAX_BYTES = 60000
const MAX_DEPTH = 32
const MAX_NODES = 8192
const encoder = new TextEncoder()
function fail(code: string): never { throw Error(code) }
function unicode(text: string): void {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) { const low = text.charCodeAt(++i); if (!(low >= 0xdc00 && low <= 0xdfff)) fail('LONE_SURROGATE') }
    else if (code >= 0xdc00 && code <= 0xdfff) fail('LONE_SURROGATE')
  }
}
function textBytes(text: string): Uint8Array<ArrayBuffer> { unicode(text); const bytes = encoder.encode(text); if (bytes.length > MAX_BYTES) fail('CONTRACT_SIZE_LIMIT'); return bytes }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CONTRACT_OBJECT_REQUIRED'); return value as Record<string, unknown> }

/** Strict raw JSON parser preserves duplicate-key and numeric-lexeme failures before JSON loses them. */
export function parseContractJson(text: string): ContractJson {
  textBytes(text)
  let position = 0, nodes = 0
  const whitespace = (): void => { while (/[ \t\r\n]/u.test(text[position] ?? '') && position < text.length) position++ }
  const string = (): string => {
    const start = position++
    while (position < text.length) {
      const char = text[position++]
      if (char === '\\') { position++; continue }
      if (char === '"') { let value: unknown; try { value = JSON.parse(text.slice(start, position)) } catch { return fail('INVALID_JSON_STRING') }; if (typeof value !== 'string') fail('INVALID_JSON_STRING'); unicode(value); return value }
      if (char && char.charCodeAt(0) < 32) fail('INVALID_JSON_STRING')
    }
    return fail('INVALID_JSON_STRING')
  }
  const read = (depth: number): ContractJson => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('CONTRACT_COMPLEXITY_LIMIT')
    whitespace(); const char = text[position]
    if (char === '"') return string()
    if (char === '{') {
      position++; whitespace(); const result: {[key: string]: ContractJson} = Object.create(null), keys = new Set<string>()
      if (text[position] === '}') { position++; return result }
      while (true) {
        whitespace(); if (text[position] !== '"') fail('INVALID_JSON_OBJECT'); const key = string()
        if (!/^[\x00-\x7f]*$/u.test(key)) fail('NON_ASCII_OBJECT_KEY')
        if (keys.has(key)) fail('DUPLICATE_JSON_KEY'); keys.add(key)
        whitespace(); if (text[position++] !== ':') fail('INVALID_JSON_OBJECT')
        result[key] = read(depth + 1); whitespace(); const delimiter = text[position++]
        if (delimiter === '}') return result
        if (delimiter !== ',') fail('INVALID_JSON_OBJECT')
      }
    }
    if (char === '[') {
      position++; whitespace(); const result: ContractJson[] = []
      if (text[position] === ']') { position++; return result }
      while (true) { result.push(read(depth + 1)); whitespace(); const delimiter = text[position++]; if (delimiter === ']') return result; if (delimiter !== ',') fail('INVALID_JSON_ARRAY') }
    }
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]] as const) if (text.startsWith(literal, position)) { position += literal.length; return value }
    const token = text.slice(position).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u)?.[0]
    if (!token || /[.eE]/u.test(token)) fail('INTEGER_JSON_REQUIRED')
    const value = Number(token); if (!Number.isSafeInteger(value)) fail('UNSAFE_INTEGER'); position += token.length; return value
  }
  const result = read(0); whitespace(); if (position !== text.length) fail('INVALID_JSON_TRAILING_DATA'); return result
}
/** Compact JSON with ASCII object-key sorting, UTF-8 text and no Unicode normalization. */
export function canonicalContractJson(value: unknown): string {
  let nodes = 0, bytes = 0
  const ancestors = new Set<object>()
  const emit = (chunk: string): string => { bytes += encoder.encode(chunk).length; if (bytes > MAX_BYTES) fail('CONTRACT_SIZE_LIMIT'); return chunk }
  const visit = (item: unknown, depth: number): string => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('CONTRACT_COMPLEXITY_LIMIT')
    if (item === null) return emit('null')
    if (typeof item === 'boolean') return emit(item ? 'true' : 'false')
    if (typeof item === 'number') { if (!Number.isSafeInteger(item)) fail('SAFE_INTEGER_REQUIRED'); return emit(JSON.stringify(item)) }
    if (typeof item === 'string') { unicode(item); return emit(JSON.stringify(item)) }
    if (typeof item !== 'object') return fail('JSON_VALUE_REQUIRED')
    if (ancestors.has(item)) fail('CYCLIC_JSON'); ancestors.add(item)
    try {
      if (Array.isArray(item)) {
        if (Reflect.ownKeys(item).length !== item.length + 1) fail('STRICT_JSON_ARRAY_REQUIRED')
        const values: string[] = []
        emit('['); for (let i = 0; i < item.length; i++) { const descriptor = Object.getOwnPropertyDescriptor(item, String(i)); if (!descriptor || !('value' in descriptor)) fail('STRICT_JSON_ARRAY_REQUIRED'); if (i) emit(','); values.push(visit(descriptor.value, depth + 1)) }; emit(']')
        return '[' + values.join(',') + ']'
      }
      const prototype = Object.getPrototypeOf(item)
      if (prototype !== null && prototype !== Object.prototype) fail('PLAIN_JSON_OBJECT_REQUIRED')
      const keys = Object.keys(item).sort(), values: string[] = []
      if (keys.length !== Reflect.ownKeys(item).length) fail('STRICT_JSON_OBJECT_REQUIRED')
      emit('{')
      for (const key of keys) {
        if (!/^[\x00-\x7f]*$/u.test(key)) fail('NON_ASCII_OBJECT_KEY')
        const descriptor = Object.getOwnPropertyDescriptor(item, key); if (!descriptor || !('value' in descriptor)) fail('JSON_ACCESSOR_FORBIDDEN')
        if (values.length) emit(','); const label = emit(JSON.stringify(key)); emit(':'); values.push(label + ':' + visit(descriptor.value, depth + 1))
      }
      emit('}'); return '{' + values.join(',') + '}'
    } finally { ancestors.delete(item) }
  }
  return visit(value, 0)
}
export async function hashContractJson(value: unknown): Promise<string> { return hashContractText(canonicalContractJson(value)) }
export async function hashContractText(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', textBytes(text))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
/** Only the finite keywords used by the independently verified schema package are supported. */
export function validateLimitedContractSchema(schema: unknown, value: unknown): void {
  canonicalContractJson(schema); canonicalContractJson(value)
  const root = object(schema), keywords = new Set(['$defs', '$ref', 'additionalProperties', 'anyOf', 'enum', 'format', 'items', 'maxItems', 'maxLength', 'maximum', 'minItems', 'minLength', 'minimum', 'pattern', 'properties', 'required', 'title', 'type'])
  const patterns = new Set(['^[a-f0-9]{64}$', '^[0-9]{1,5}\\.[0-9]{1,5}\\.[0-9]{1,5}$', '^[A-Za-z0-9_.:-]{1,120}$'])
  const definitions = root.$defs === undefined ? {} : object(root.$defs)
  const audit = (input: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) fail('SCHEMA_COMPLEXITY_LIMIT')
    const s = object(input)
    for (const key of Object.keys(s)) if (!keywords.has(key)) fail('UNSUPPORTED_SCHEMA_KEYWORD')
    if (s.type !== undefined && !['object', 'array', 'string', 'integer', 'boolean', 'null'].includes(String(s.type))) fail('UNSUPPORTED_SCHEMA_TYPE')
    if (s.format !== undefined && !['uuid', 'date-time'].includes(String(s.format))) fail('UNSUPPORTED_SCHEMA_FORMAT')
    if (s.pattern !== undefined && (typeof s.pattern !== 'string' || !patterns.has(s.pattern))) fail('UNSUPPORTED_SCHEMA_PATTERN')
    if (s.$ref !== undefined && (typeof s.$ref !== 'string' || !/^#\/\$defs\/[A-Za-z][A-Za-z0-9]*$/u.test(s.$ref) || !Object.hasOwn(definitions, s.$ref.slice(8)))) fail('UNSUPPORTED_SCHEMA_REFERENCE')
    for (const key of ['minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength']) if (s[key] !== undefined && !Number.isSafeInteger(s[key])) fail('INVALID_SCHEMA_LIMIT')
    if (s.additionalProperties !== undefined && typeof s.additionalProperties !== 'boolean') fail('UNSUPPORTED_ADDITIONAL_PROPERTIES')
    if (s.title !== undefined && typeof s.title !== 'string') fail('INVALID_SCHEMA_TITLE')
    if (s.required !== undefined && (!Array.isArray(s.required) || s.required.some(key => typeof key !== 'string'))) fail('INVALID_SCHEMA_REQUIRED')
    if (s.enum !== undefined && (!Array.isArray(s.enum) || !s.enum.length)) fail('INVALID_SCHEMA_ENUM')
    for (const key of ['$defs', 'properties']) if (s[key] !== undefined) for (const child of Object.values(object(s[key]))) audit(child, depth + 1)
    if (s.items !== undefined) audit(s.items, depth + 1)
    if (s.anyOf !== undefined) { if (!Array.isArray(s.anyOf) || !s.anyOf.length || s.anyOf.length > 16) fail('INVALID_SCHEMA_ANYOF'); s.anyOf.forEach(child => audit(child, depth + 1)) }
  }
  const check = (input: unknown, item: unknown, depth: number): void => {
    if (depth > 64) fail('SCHEMA_REFERENCE_DEPTH')
    const s = object(input)
    if (s.$ref !== undefined) check(definitions[String(s.$ref).slice(8)], item, depth + 1)
    if (s.anyOf !== undefined) {
      let matched = false
      for (const branch of s.anyOf as unknown[]) { try { check(branch, item, depth + 1); matched = true; break } catch { /* A validated alternative may reject this value. */ } }
      if (!matched) fail('SCHEMA_ANYOF_MISMATCH')
    }
    if (s.enum !== undefined && !(s.enum as unknown[]).some(option => canonicalContractJson(option) === canonicalContractJson(item))) fail('SCHEMA_ENUM_MISMATCH')
    if (s.type === 'null' && item !== null) fail('SCHEMA_TYPE_MISMATCH')
    if (s.type === 'boolean' && typeof item !== 'boolean') fail('SCHEMA_TYPE_MISMATCH')
    if (s.type === 'integer') {
      if (typeof item !== 'number' || !Number.isSafeInteger(item)) fail('SCHEMA_TYPE_MISMATCH')
      if ((s.minimum !== undefined && item < Number(s.minimum)) || (s.maximum !== undefined && item > Number(s.maximum))) fail('SCHEMA_INTEGER_RANGE')
    }
    if (s.type === 'string') {
      if (typeof item !== 'string') fail('SCHEMA_TYPE_MISMATCH')
      const length = [...item].length
      if ((s.minLength !== undefined && length < Number(s.minLength)) || (s.maxLength !== undefined && length > Number(s.maxLength))) fail('SCHEMA_STRING_LENGTH')
      if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(item)) fail('SCHEMA_PATTERN_MISMATCH')
      if (s.format === 'uuid' && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(item)) fail('CANONICAL_UUID_REQUIRED')
      if (s.format === 'date-time') utcDate(item)
    }
    if (s.type === 'array') {
      if (!Array.isArray(item)) fail('SCHEMA_TYPE_MISMATCH')
      if ((s.minItems !== undefined && item.length < Number(s.minItems)) || (s.maxItems !== undefined && item.length > Number(s.maxItems))) fail('SCHEMA_ARRAY_LENGTH')
      if (s.items !== undefined) item.forEach(child => check(s.items, child, depth + 1))
    }
    if (s.type === 'object') {
      const obj = object(item), properties = s.properties === undefined ? {} : object(s.properties)
      if (s.required !== undefined) for (const key of s.required as string[]) if (!Object.hasOwn(obj, key)) fail('SCHEMA_REQUIRED_FIELD')
      for (const [key, child] of Object.entries(obj)) {
        if (Object.hasOwn(properties, key)) check(properties[key], child, depth + 1)
        else if (s.additionalProperties === false) fail('SCHEMA_UNKNOWN_FIELD')
      }
    }
  }
  audit(root, 0); check(root, value, 0)
}

/** Conservative DTO subset: lower-case UUIDs and exact UTC spelling; strings are never normalized. */
function utcDate(text: string): void {
  const fields = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{6}))?Z$/u)
  if (!fields) fail('CANONICAL_UTC_REQUIRED')
  const [year, month, day, hour, minute, second] = fields.slice(1, 7).map(Number)
  if (year === undefined || month === undefined || day === undefined || hour === undefined || minute === undefined || second === undefined) fail('INVALID_UTC_DATE')
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0), days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0) || hour > 23 || minute > 59 || second > 59) fail('INVALID_UTC_DATE')
}

const prohibited = new RegExp(knownProhibitedPattern, 'iu')
/** Known high-confidence credential forms only; this cannot establish general DLP coverage. */
function knownCredentials(value: unknown): void {
  if (typeof value === 'string') {
    if (prohibited.test(value) || /\b[a-z][a-z\d+.-]*:\/\/[^\s/@]+@|\b(?:Cookie|Set-Cookie|Authorization)["']?\s*:|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|密码|密钥|令牌)["']?\s*[:=：]\s*\S+/iu.test(value)) fail('KNOWN_CREDENTIAL_CONTENT')
  } else if (Array.isArray(value)) value.forEach(knownCredentials)
  else if (value && typeof value === 'object') Object.values(value).forEach(knownCredentials)
}

export function validateContractSchema<N extends DesktopSchemaName>(name: N, value: unknown): ContractInputs[N] {
  if (!Object.hasOwn(desktopConsentSchemas, name)) fail('UNKNOWN_CONTRACT_SCHEMA')
  validateLimitedContractSchema(desktopConsentSchemas[name], value); knownCredentials(value)
  if (name === 'PrepareDesktop') {
    const manifest = validateConsentManifest(object(value).manifest)
    if (manifest.source_versions.some(source => !/^[A-Za-z0-9_.:-]{1,120}$/u.test(source.version))) fail('DESKTOP_SOURCE_VERSION_MUST_BE_OPAQUE')
  }
  if (name === 'ConfirmDesktop') { const payload = object(value).payload; validateConsentPayload(Object.hasOwn(object(payload), 'kind') ? 'enterprise_knowledge' : 'platform_product_feedback', payload) }
  return structuredClone(value) as ContractInputs[N]
}
export function validateConsentManifest(value: unknown): ConsentManifest {
  const root = desktopConsentSchemas.PrepareDesktop
  validateLimitedContractSchema({...root.$defs.Manifest, $defs: root.$defs}, value); knownCredentials(value)
  const manifest = value as ConsentManifest
  const expected = manifest.domain === 'enterprise_knowledge' ? ['tenant_knowledge_intake', 'knowledge_candidate_review'] : ['tenant_feedback_intake', 'product_feedback_triage']
  if (manifest.allow_cross_tenant_aggregation !== false || manifest.recipient !== expected[0] || manifest.purpose !== expected[1] || manifest.privacy_transform_version !== 'redaction-v1' || manifest.policy_version !== 'governance-private-text-v1') fail('PRIVATE_MANIFEST_POLICY_MISMATCH')
  return structuredClone(manifest)
}
/** Schema plus this slice's stricter ordinary private-text subset; never represents authentication. */
export function validateConsentPayload(domain: ContractDomain, value: unknown): ConsentPayload {
  if (domain !== 'enterprise_knowledge' && domain !== 'platform_product_feedback') fail('UNKNOWN_CONTRACT_DOMAIN')
  const root = desktopConsentSchemas.ConfirmDesktop, definition = domain === 'enterprise_knowledge' ? root.$defs.KnowledgePayload : root.$defs.FeedbackPayload
  validateLimitedContractSchema({...definition, $defs: root.$defs}, value); knownCredentials(value)
  const payload = value as ConsentPayload
  for (const evidence of payload.evidence) if (!['explicit_user', 'model_inference'].includes(evidence.basis) || evidence.sensitivity !== 'ordinary' || !['not_needed', 'redacted'].includes(evidence.redaction_status) || evidence.asset_refs.length || evidence.source.kind !== 'user_statement' || !['reported', 'unverified'].includes(evidence.source.verification_status) || evidence.source.resource_app !== null || evidence.source.opaque_locator !== null) fail('PRIVATE_TEXT_EVIDENCE_ONLY')
  if ('capability_status' in payload && !['unknown', 'reported'].includes(payload.capability_status)) fail('UNVERIFIED_CAPABILITY_ONLY')
  return structuredClone(payload)
}
/**
 * Validate the payload metadata independently of the final bound-payload digest.
 * Evidence order is significant; source identity may appear at most once.
 * Excerpts hash canonical JSON strings, unlike local-only raw UTF-8 sourceHash.
 */
export async function checkPayloadMetadata(manifestValue: unknown, payloadValue: unknown): Promise<{evidenceHash: string; boundPayloadHashVerified: false}> {
  const manifest = validateConsentManifest(manifestValue), payload = validateConsentPayload(manifest.domain, payloadValue)
  for (const evidence of payload.evidence) if (await hashContractJson(evidence.excerpt) !== evidence.source.content_hash) fail('EXCERPT_CONTENT_HASH_MISMATCH')
  const evidenceHash = await hashContractJson(payload.evidence)
  if (evidenceHash !== manifest.evidence_manifest_hash) fail('EVIDENCE_MANIFEST_HASH_MISMATCH')
  if ('scope' in payload && canonicalContractJson(payload.scope) !== canonicalContractJson(manifest.scope)) fail('SCOPE_MISMATCH')
  const fields = Object.keys(payload).sort(), selected = [...manifest.selected_fields].sort()
  if (new Set(selected).size !== selected.length || canonicalContractJson(fields) !== canonicalContractJson(selected)) fail('SELECTED_FIELDS_SET_MISMATCH')
  const actual = payload.evidence.map(item => ({source_id: item.source.source_id, version: item.source.version}))
  if (new Set(actual.map(item => item.source_id)).size !== actual.length || canonicalContractJson(actual) !== canonicalContractJson(manifest.source_versions)) fail('SOURCE_VERSIONS_MISMATCH')
  return {evidenceHash, boundPayloadHashVerified: false}
}
/** Exact intake.service.bound_payload_hash preimage; array order is retained. */
export async function boundPayloadHash(manifestValue: unknown, payloadValue: unknown): Promise<string> {
  const manifest = validateConsentManifest(manifestValue), payload = validateConsentPayload(manifest.domain, payloadValue)
  const {payload_hash: _payloadHash, evidence_manifest_hash: _evidenceHash, ...bound} = manifest
  return hashContractJson({...bound, payload})
}
/** Hash consistency is not authentication, human confirmation or permission to send. */
export async function verifyPayloadMetadata(manifestValue: unknown, payloadValue: unknown): Promise<{evidenceHash: string; payloadHash: string; boundPayloadHashVerified: true}> {
  const manifest = validateConsentManifest(manifestValue), payload = validateConsentPayload(manifest.domain, payloadValue)
  const {evidenceHash} = await checkPayloadMetadata(manifest, payload)
  const payloadHash = await boundPayloadHash(manifest, payload)
  if (payloadHash !== manifest.payload_hash) fail('BOUND_PAYLOAD_HASH_MISMATCH')
  return {evidenceHash, payloadHash, boundPayloadHashVerified: true}
}

/**
 * Current Platform Web handoff is narrower than the backend DTO: UTF-16 length,
 * nonempty tool strings and nonempty repro steps. Reject for editing; never
 * normalize, truncate or silently discard content to make an existing hash fit.
 */
export function validateWebHandoffCompatibility(domain: ContractDomain, payloadValue: unknown): ConsentPayload {
  const payload = validateConsentPayload(domain, payloadValue)
  if ('versions' in payload && payload.versions.tool === '') fail('WEB_HANDOFF_EMPTY_TOOL')
  if ('repro_steps' in payload && payload.repro_steps.some(step => step === '')) fail('WEB_HANDOFF_EMPTY_REPRO_STEP')
  const root = desktopConsentSchemas.ConfirmDesktop
  const check = (schema: unknown, value: unknown): void => {
    const s = object(schema)
    if (typeof s.$ref === 'string') { check(root.$defs[s.$ref.slice(8) as keyof typeof root.$defs], value); return }
    if (Array.isArray(s.anyOf)) {
      const branch = s.anyOf.find(candidate => object(candidate).type === (value === null ? 'null' : typeof value))
      if (branch) check(branch, value)
    }
    if (typeof value === 'string' && typeof s.maxLength === 'number' && value.length > s.maxLength) fail('WEB_HANDOFF_UTF16_LENGTH')
    if (Array.isArray(value) && s.items !== undefined) value.forEach(item => check(s.items, item))
    if (value && typeof value === 'object' && !Array.isArray(value) && s.properties !== undefined) for (const [key, child] of Object.entries(object(s.properties))) check(child, object(value)[key])
  }
  check(domain === 'enterprise_knowledge' ? root.$defs.KnowledgePayload : root.$defs.FeedbackPayload, payload)
  return payload
}

function exactKeys(value: unknown, names: string[]): Record<string, unknown> {
  canonicalContractJson(value)
  const obj = object(value)
  if (canonicalContractJson(Object.keys(obj).sort()) !== canonicalContractJson([...names].sort())) fail('BINDING_FIELDS_MISMATCH')
  return obj
}
function bindingText(value: unknown, max = 512): asserts value is string { if (typeof value !== 'string' || !value.length || [...value].length > max) fail('BINDING_TEXT_INVALID') }
function bindingDigest(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail('BINDING_DIGEST_INVALID') }
function bindingId(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value)) fail('BINDING_ID_INVALID') }
/** Server isoformat timestamps retain their offset and fractional spelling. */
function serverTimestamp(value: unknown): asserts value is string {
  if (typeof value !== 'string') fail('BINDING_TIMESTAMP_INVALID')
  const match = value.match(/^(.*?)(Z|[+-](\d{2}):(\d{2}))$/u)
  if (!match || (match[2] !== 'Z' && (Number(match[3]) > 23 || Number(match[4]) > 59))) fail('BINDING_TIMESTAMP_INVALID')
  utcDate(`${match[1]}Z`)
}
export interface ServerDesktopFacts {
  actor_id: string; tenant_id: string; identity_id: string; role: string; session_id: string; client_id: string
  issued_at: number; token_expires_at: string; context: DesktopContext; client_policy_hash: string; authority: string
}
/** Shape validation only. Only a verified server record can supply authoritative facts. */
export function validateServerDesktopFacts(value: unknown): ServerDesktopFacts {
  const facts = exactKeys(value, ['actor_id', 'tenant_id', 'identity_id', 'role', 'session_id', 'client_id', 'issued_at', 'token_expires_at', 'context', 'client_policy_hash', 'authority'])
  for (const key of ['actor_id', 'tenant_id', 'identity_id']) bindingId(facts[key])
  for (const key of ['role', 'session_id']) bindingText(facts[key])
  if (facts.client_id !== 'futurestaff-desktop' || !Number.isSafeInteger(facts.issued_at) || Number(facts.issued_at) < 0) fail('BINDING_FACTS_INVALID')
  serverTimestamp(facts.token_expires_at); bindingDigest(facts.client_policy_hash); bindingDigest(facts.authority)
  validateContractSchema('DesktopContext', facts.context)
  return structuredClone(facts) as unknown as ServerDesktopFacts
}
/** Exact governance_desktop.service.target_hash, never an authorization grant. */
export async function hashDesktopTarget(targetValue: RecoveryTarget, serverFacts: unknown): Promise<string> {
  const target = validateContractSchema('RecoveryTarget', targetValue), facts = validateServerDesktopFacts(serverFacts)
  return hashContractJson({action: 'desktop.intake.consent', contract_version: 1, task_authorization_revision: 1, ...target, desktop_facts: facts})
}
/** Closed metadata preview; plaintext, extra permission claims and unknown fields are refused. */
export function validateDesktopPreview(value: unknown): Record<string, unknown> {
  const preview = exactKeys(value, ['action', 'server_task_id', 'task_authorization_revision', 'authority_source', 'target_hash', 'expires_at', 'proposal', 'source_identity_id', 'client_id', 'desktop_session_hash', 'client_version_attested', 'formal_knowledge_permission', 'agent_query_permission'])
  if (preview.action !== 'desktop.intake.consent' || preview.task_authorization_revision !== 1 || preview.authority_source !== 'explicit_web_single_candidate_approval' || preview.client_id !== 'futurestaff-desktop' || preview.client_version_attested !== false || preview.formal_knowledge_permission !== false || preview.agent_query_permission !== false) fail('PREVIEW_AUTHORITY_FIELDS_INVALID')
  bindingId(preview.server_task_id); bindingId(preview.source_identity_id); bindingDigest(preview.target_hash); bindingDigest(preview.desktop_session_hash); serverTimestamp(preview.expires_at)
  validateContractSchema('PrepareDesktop', preview.proposal)
  return structuredClone(preview)
}
/** Exact full server preview digest; equality proves content consistency only. */
export async function hashDesktopPreview(value: unknown): Promise<string> { return hashContractJson(validateDesktopPreview(value)) }
