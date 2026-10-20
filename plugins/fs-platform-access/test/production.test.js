import test from 'node:test'
import assert from 'node:assert/strict'
import { PlatformDevApi, PlatformSessionVault, PlatformPkceTransaction, platformOrigin, decodePlatformDevAccessSnapshot } from '../lib/index.js'
import { FutureStaffChatAdapter } from '../lib/chat.js'
import { apply as applyDefault } from '../lib/model-default.js'

test('PROD uses one fixed HTTPS origin and never restores a DEV credential', async () => {
  const values = new Map([['futurestaff.platform.session.v1', 'must-not-read-dev-token']]), reads = []
  const secrets = { available: async () => true, has: async key => values.has(key),
    read: async key => { reads.push(key); return values.get(key) }, write: async (key,v) => values.set(key,v), delete: async key => values.delete(key) }
  assert.equal(await new PlatformSessionVault(secrets, 'production').load(), undefined)
  assert.deepEqual(reads, ['futurestaff.platform.session.v1.production'])
  assert.equal(values.get('futurestaff.platform.session.v1'), 'must-not-read-dev-token')
  const api = new PlatformDevApi(async (url, init) => {
    assert.equal(url, 'https://platform.fsstory.net/desktop/v1/models')
    assert.equal(init.redirect, 'error')
    return new Response(JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'required', retryable: false }, meta: { contractVersion: '0.1.1', simulated: false } }), {status:401})
  }, platformOrigin('production'))
  await assert.rejects(api.listModels('prod-host-token'), error => error.code === 'AUTHENTICATION_REQUIRED')
  assert.throws(() => platformOrigin('unexpected'))
  assert.throws(() => new PlatformDevApi(fetch, 'https://platform.fsstory.net.evil.invalid'))
  assert.throws(() => new PlatformDevApi(fetch, 'https://platform.fsstory.net/desktop'))
  assert.equal(new URL(new PlatformPkceTransaction({ environment: 'production' }).begin().authorizationUrl).origin, 'https://platform.fsstory.net')
})

test('a production root-relative tenant logo is normalized on the same trusted origin before model discovery', async () => {
  const tenantId = '10000000-0000-4000-8000-000000000001', meta = { contractVersion: '0.1.1', simulated: false }
  let logoUrl = '/uploads/branding/tenant-logo.png', role = 'member'
  const api = new PlatformDevApi(async () => new Response(JSON.stringify({ activeTenantId: tenantId,
    items: [{ tenantId, displayName: '测试主体', slug: 'fixture', logoUrl, role }], meta }), {status:200}), platformOrigin('production'))
  const result = await api.listTenants('host-only-fixture-token')
  assert.equal(result.items[0].logoUrl, 'https://platform.fsstory.net/uploads/branding/tenant-logo.png')
  assert.doesNotThrow(() => decodePlatformDevAccessSnapshot({ phase: 'no_apps', simulated: false, contractVersion: '0.1.1',
    user: { userId: '20000000-0000-4000-8000-000000000001', displayName: '测试用户', email: null },
    activeTenantId: tenantId, tenants: result.items, applications: [], models: [], activeModelId: null }))
  for (const invalid of ['//evil.invalid/logo.png','/\\evil.invalid/logo.png','javascript:alert(1)']) {
    logoUrl = invalid
    await assert.rejects(api.listTenants('host-only-fixture-token'), error => error.code === 'CONTRACT_MISMATCH')
  }
  logoUrl = '/uploads/branding/tenant-logo.png'; role = 'unexpected-admin'
  await assert.rejects(api.listTenants('host-only-fixture-token'), error => error.code === 'CONTRACT_MISMATCH')
})

test('chat lists only offered tenant models and binds the selected ID in Host', async () => {
  const modelId = '30000000-0000-4000-8000-000000000001', requested = []
  const model = { modelId, displayName: '正式平台模型' }
  const adapter = new FutureStaffChatAdapter(async id => { requested.push(id); return {
    accessToken: 'host-token', tenantId: 'tenant', userId: 'user', modelId, signal: new AbortController().signal,
  } }, { read: async () => undefined, write: async () => {} }, async()=>new Response(JSON.stringify({type:'result',content:'ok',toolCalls:[],finishReason:'stop'})+'\n',
    {headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}}), platformOrigin('production'), async () => [model])
  assert.deepEqual((await adapter.listModels()).map(m => m.id), ['default', modelId])
  const prepared=await adapter.prepareCall('futurestaff', modelId)
  assert.deepEqual(requested, [])
  for await(const _ of prepared.stream({provider:'futurestaff',model:modelId,sessionId:'explicit-model-session',messages:[{role:'user',source:{kind:'user'},content:[{type:'text',text:'hello'}]}]})){}
  assert.deepEqual(requested,[modelId])
  await assert.rejects(adapter.prepareCall('futurestaff', '30000000-0000-4000-8000-000000000099'))
  adapter.dispose()
  let service, tenant = 'tenant-a'
  applyDefault({ provide: (_, value) => { service = value } }, {
    snapshot: () => ({ user: { userId: 'user' }, activeTenantId: tenant, models: tenant === 'tenant-a' ? [model] : [] }),
    authorize: async id => { if (id !== modelId) throw new Error('denied') },
  })
  await service.saveSelection({ provider: 'futurestaff', model: modelId })
  assert.equal(service.currentSelection().model, 'default')
  tenant = 'tenant-b'; assert.equal(service.currentSelection().model, 'default')
  await assert.rejects(service.saveSelection({ provider: 'direct', model: modelId }))
})
