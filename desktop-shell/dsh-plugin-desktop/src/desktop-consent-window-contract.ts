/** Host-only admission input. Its shape is not server authentication. */
export interface NativeConsentWindowRequest {
  requestId: string; targetHash: string; actorId: string; tenantId: string
  expiresAt: string; payloadJson: string; platformOrigin: string; handoffOrigin: string; signal: AbortSignal
}
/** Separately configured by the Host, never selected from a renderer request. */
export interface NativeConsentWindowPolicy { platformOrigin: string; handoffOrigin: string }
export type NativeConsentWindowState = 'opening' | 'awaiting_web' | 'transferred' | 'cancelled' | 'expired' | 'closed' | 'not_connected'
export interface NativeConsentWindowSession { state(): NativeConsentWindowState; cancel(reason?: 'cancelled' | 'identity_changed'): void }
export interface ConsentWindowTarget {
  requestId: string; targetHash: string; actorId: string; tenantId: string; expiresAt: string
  platformOrigin: string; handoffOrigin: string; confirmationUrl: string; openerUrl: string; payloadJson: string
}
const id = (x: unknown): x is string => typeof x === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(x)
const digest = (x: unknown): x is string => typeof x === 'string' && /^[a-f0-9]{64}$/u.test(x)
export function consentWindowTarget(request: NativeConsentWindowRequest, policy: NativeConsentWindowPolicy | undefined, localOrigin: string, now = Date.now()): ConsentWindowTarget | null {
  try {
    if (!policy || !request || request.signal.aborted || !id(request.requestId) || !id(request.actorId) || !id(request.tenantId) || !digest(request.targetHash)) return null
    const platform = new URL(policy.platformOrigin), local = new URL(localOrigin)
    if (platform.origin !== policy.platformOrigin || platform.protocol !== 'https:' || platform.username || platform.password || platform.port === '0') return null
    if (local.origin !== localOrigin || local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || !local.port || local.port === '0') return null
    if (policy.handoffOrigin !== localOrigin || request.handoffOrigin !== policy.handoffOrigin || request.platformOrigin !== policy.platformOrigin) return null
    if (typeof request.expiresAt !== 'string' || !Number.isFinite(Date.parse(request.expiresAt)) || Date.parse(request.expiresAt) <= now || Date.parse(request.expiresAt) > now + 300000) return null
    if (typeof request.payloadJson !== 'string' || !request.payloadJson.length || new TextEncoder().encode(request.payloadJson).byteLength > 60000) return null
    const payload: unknown = JSON.parse(request.payloadJson)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || JSON.stringify(payload) !== request.payloadJson) return null
    return {requestId:request.requestId,targetHash:request.targetHash,actorId:request.actorId,tenantId:request.tenantId,expiresAt:request.expiresAt,payloadJson:request.payloadJson,
      platformOrigin:policy.platformOrigin,handoffOrigin:localOrigin,
      confirmationUrl:`${policy.platformOrigin}/module/governance/desktop-consent/${request.requestId}`,
      openerUrl:`${localOrigin}/__futurestaff/desktop-consent/${request.requestId}`}
  } catch { return null }
}
export interface ConsentReadyEnvelope {
  type: 'futurestaff.desktop-consent.ready.v1'; channel_id: string; request_id: string; target_hash: string
  binding: string; actor_id: string; tenant_id: string; expires_at: string; max_bytes: 60000
}
/** Web uses a fresh millisecond ISO deadline; it is not the DTO timestamp spelling. */
export function consentReadyEnvelope(value: unknown, target: ConsentWindowTarget, now = Date.now()): ConsentReadyEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).sort().join(',') !== 'actor_id,binding,channel_id,expires_at,max_bytes,request_id,target_hash,tenant_id,type') return null
  if (v.type !== 'futurestaff.desktop-consent.ready.v1' || typeof v.channel_id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(v.channel_id) || typeof v.binding !== 'string' || !/^[a-f0-9]{64}$/u.test(v.binding) || v.request_id !== target.requestId || v.target_hash !== target.targetHash || v.actor_id !== target.actorId || v.tenant_id !== target.tenantId || v.max_bytes !== 60000) return null
  if (typeof v.expires_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(v.expires_at)) return null
  const deadline = Date.parse(v.expires_at)
  if (!Number.isFinite(deadline) || new Date(deadline).toISOString() !== v.expires_at || deadline <= now || deadline > Date.parse(target.expiresAt) || deadline > now + 60000) return null
  return structuredClone(value) as ConsentReadyEnvelope
}
