import { describe, expect, it } from 'vitest'
import { consentWindowTarget, consentReadyEnvelope } from '../src/desktop-consent-window-contract.ts'

const id = '00000000-0000-4000-8000-000000000001'
const actor = '00000000-0000-4000-8000-000000000002'
const policy = { platformOrigin: 'https://platform.invalid', handoffOrigin: 'http://127.0.0.1:43120' }
const now = Date.parse('2026-10-26T12:00:00Z')
const request = () => ({ requestId: id, targetHash: 'a'.repeat(64), actorId: actor, tenantId: id,
  platformOrigin: policy.platformOrigin, handoffOrigin: policy.handoffOrigin,
  expiresAt: '2026-10-26T12:01:00+00:00', payloadJson: '{"goal":"synthetic"}', signal: new AbortController().signal })

describe('dedicated native consent boundary', () => {
  it('defaults closed and binds both configured origins, UUID path and bounded in-memory content', () => {
    expect(consentWindowTarget(request(), undefined, policy.handoffOrigin, now)).toBeNull()
    const target = consentWindowTarget(request(), policy, policy.handoffOrigin, now)!
    expect(target.confirmationUrl).toBe(`${policy.platformOrigin}/module/governance/desktop-consent/${id}`)
    expect(target.openerUrl).toBe(`${policy.handoffOrigin}/__futurestaff/desktop-consent/${id}`)
    for (const change of [{platformOrigin:'http://platform.invalid'}, {platformOrigin:'https://other.invalid'}, {requestId:'../secret'}, {payloadJson:'x'.repeat(60001)}, {expiresAt:'invalid'}]) {
      expect(consentWindowTarget({...request(), ...change}, policy, policy.handoffOrigin, now)).toBeNull()
    }
    expect(consentWindowTarget(request(), policy, 'http://127.0.0.1:43121', now)).toBeNull()
    const aborted = request(); (aborted.signal as AbortSignal); const controller = new AbortController(); controller.abort()
    expect(consentWindowTarget({...aborted, signal:controller.signal}, policy, policy.handoffOrigin, now)).toBeNull()
  })
  it('accepts actual Web millisecond envelope only within deadline, with exact closed fields', () => {
    const config = consentWindowTarget(request(), policy, policy.handoffOrigin, now)!
    const base = {type:'futurestaff.desktop-consent.ready.v1',channel_id:id,request_id:id,target_hash:'a'.repeat(64),binding:'b'.repeat(64),actor_id:actor,tenant_id:id,expires_at:'2026-10-26T12:00:45.123Z',max_bytes:60000}
    expect(consentReadyEnvelope(base, config, now)).toEqual(base)
    for (const change of [{actor_id:id}, {target_hash:'c'.repeat(64)}, {max_bytes:60001}, {expires_at:'2026-10-26T12:02:00.000Z'}, {payload_json:'secret'}, {type:'other'}]) expect(consentReadyEnvelope({...base,...change},config,now)).toBeNull()
  })
})
