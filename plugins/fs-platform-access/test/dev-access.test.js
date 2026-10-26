import assert from 'node:assert/strict'
import test from 'node:test'
import { requireApplications } from '../lib/system-policy.js'

import {
  InMemoryTenantResources,
  PlatformApiError,
  PlatformDevAccessController,
} from '../lib/index.js'

const tenantId = '10000000-0000-4000-8000-000000000001'
const otherTenantId = '10000000-0000-4000-8000-000000000002'
const user = { userId: '20000000-0000-4000-8000-000000000001', displayName: 'DEV 用户', email: 'dev@example.invalid' }
const session = (activeTenantId = tenantId, suffix = 'initial') => ({
  accessToken: `private-access-token-${suffix}-with-entropy`,
  refreshToken: `private-refresh-token-${suffix}-with-entropy`,
  tokenType: 'Bearer', expiresIn: 900, audience: 'futurestaff-agent-pc-dev', activeTenantId,
})
const tenants = [
  { tenantId, displayName: 'DEV 甲公司', slug: 'dev-a', logoUrl: null, role: 'member' },
  { tenantId: otherTenantId, displayName: 'DEV 乙公司', slug: 'dev-b', logoUrl: null, role: 'org_admin' },
]
const application = activeTenantId => ({
  appId: 'agent', tenantId: activeTenantId, displayName: 'FutureStaff Agent',
  baseUrl: 'https://dev.fsstory.net', deepLinks: { home: '/' }, capabilities: ['agent.read'],
  contractRange: '>=0.1.1 <0.2.0',
})
const model = {
  modelId: '30000000-0000-4000-8000-000000000001', displayName: '平台默认模型',
  provider: 'openai', model: 'gpt-platform', supportsVision: true, isDefault: true,
}

test('access expiry refreshes once before concurrent Host operations without revoking views', async t => {
  t.mock.timers.enable({apis:['Date'], now:1_000_000})
  const api=new FakeDevApi(), vault=new FakeVault()
  let rotations=0
  api.refresh=async()=>{rotations++;return {session:session(tenantId,`rotation-${rotations}`)}}
  const access=new PlatformDevAccessController(api,vault,new InMemoryTenantResources())
  await access.login({loginIdentifier:'dev@example.invalid',password:'test-only'})
  const original=await access.authorizeLocal()
  t.mock.timers.tick(900_000)
  const [chat, local]=await Promise.all([access.authorizeChat(),access.authorizeLocal()])
  assert.equal(rotations,1)
  assert.match(chat.accessToken,/rotation-1/)
  assert.equal(local.signal,original.signal)
  assert.equal(original.signal.aborted,false)
  await access.logout()
  assert.equal(original.signal.aborted,true)
})

test('restoring persisted session refreshes before querying context', async()=>{
  const api=new FakeDevApi(), vault=new FakeVault()
  api.listTenants=async token=>{
    if(token===session().accessToken)throw new PlatformApiError('TOKEN_EXPIRED','expired',false,401)
    return {activeTenantId:tenantId,items:tenants}
  }
  const access=new PlatformDevAccessController(api,vault,new InMemoryTenantResources())
  assert.equal((await access.restore()).phase,'ready')
  assert.equal(vault.cleared,false)
  access.dispose()
})

test('explicit same-owner refresh leaves existing Host view signals valid',async()=>{
  const access=new PlatformDevAccessController(new FakeDevApi(),new FakeVault(),new InMemoryTenantResources())
  await access.restore()
  const original=await access.authorizeLocal()
  await access.refresh()
  assert.equal(original.signal.aborted,false)
  assert.equal((await access.authorizeLocal()).signal,original.signal)
  access.dispose()
})

test('temporary refresh failure preserves credentials and views for the next attempt',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1_000_000})
  const api=new FakeDevApi(),vault=new FakeVault()
  const access=new PlatformDevAccessController(api,vault,new InMemoryTenantResources())
  await access.login({loginIdentifier:'dev@example.invalid',password:'test-only'})
  const identity=await access.authorizeLocal(),refresh=api.refresh.bind(api)
  t.mock.timers.tick(900_000)
  api.refresh=async()=>{throw new PlatformApiError('PLATFORM_UNAVAILABLE','offline',true,503)}
  await assert.rejects(access.authorizeChat())
  assert.equal(identity.signal.aborted,false)
  assert.equal(vault.cleared,false)
  api.refresh=refresh
  assert.match((await access.authorizeChat()).accessToken,/refreshed/)
  access.dispose()
})

test('revoked refresh credentials fail closed and revoke existing system views',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1_000_000})
  const api=new FakeDevApi(),vault=new FakeVault()
  const access=new PlatformDevAccessController(api,vault,new InMemoryTenantResources())
  await access.login({loginIdentifier:'dev@example.invalid',password:'test-only'})
  const identity=await access.authorizeLocal()
  t.mock.timers.tick(900_000)
  api.refresh=async()=>{throw new PlatformApiError('AUTHENTICATION_REQUIRED','revoked',false,401)}
  await assert.rejects(access.authorizeLocal())
  assert.equal(identity.signal.aborted,true)
  assert.equal(vault.cleared,true)
  assert.equal(access.getSnapshot().phase,'expired')
  access.dispose()
})

test('all embedded system handoffs use a renewed desktop token after idle expiry',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1_000_000})
  const api=new FakeDevApi(),vault=new FakeVault(),tokens=[]
  api.listApplications=async()=>({activeTenantId:tenantId,items:['erp','geo','futurestaff_ai'].map(appId=>({...application(tenantId),appId}))})
  api.authorizeModuleBrowser=async token=>{tokens.push(token);return {redirectUrl:'fixture'}}
  api.authorizeGeoBrowser=async token=>{tokens.push(token);return {redirectUrl:'fixture'}}
  api.authorizeAiWeb=async token=>{tokens.push(token);return {code:'fixture',state:'fixture'}}
  const access=new PlatformDevAccessController(api,vault,new InMemoryTenantResources())
  await access.login({loginIdentifier:'dev@example.invalid',password:'test-only'})
  for(let cycle=0;cycle<4;cycle++){
    t.mock.timers.tick(900_000)
    await Promise.all([access.authorizeModuleBrowser('erp',{}),access.authorizeGeoBrowser({}),access.authorizeAiWeb({})])
  }
  assert.equal(tokens.length,12)
  assert.ok(tokens.every(token=>token===session(tenantId,'refreshed').accessToken))
  access.dispose()
})

test('refresh identity mismatch cannot move a guest into another tenant',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1_000_000})
  const api=new FakeDevApi(),vault=new FakeVault()
  const access=new PlatformDevAccessController(api,vault,new InMemoryTenantResources())
  await access.login({loginIdentifier:'dev@example.invalid',password:'test-only'})
  const identity=await access.authorizeLocal()
  t.mock.timers.tick(900_000)
  api.refresh=async()=>({session:session(otherTenantId,'foreign')})
  await assert.rejects(access.authorizeLocal())
  assert.equal(identity.signal.aborted,true)
  assert.equal(vault.value,undefined)
  access.dispose()
})

class FakeVault {
  value = { session: session(), user }
  saves = []
  cleared = false
  async load() { return this.value }
  async save(value) { this.value = value; this.saves.push(value) }
  async clear() { this.cleared = true; this.value = undefined }
}

test('template authority rereads current applications and keeps stable snapshots until grants change', async () => {
  const api = new FakeDevApi(), access = new PlatformDevAccessController(api, new FakeVault(), new InMemoryTenantResources())
  await access.restore()
  let items = [application(tenantId), { ...application(tenantId), appId: 'erp', capabilities: ['erp.read'] }]
  api.listApplications = async () => ({ activeTenantId: tenantId, items })
  const first = await access.authorizeTemplates()
  assert.deepEqual(first.applications.map(app => app.appId), ['agent', 'erp'])
  const snapshot = access.getSnapshot()
  await access.authorizeTemplates()
  assert.equal(access.getSnapshot(), snapshot, 'identical server grants must not retrigger renderer effects')
  items = [application(tenantId)]
  assert.deepEqual((await access.authorizeTemplates()).applications.map(app => app.appId), ['agent'])
  assert.deepEqual(access.getSnapshot().applications.map(app => app.appId), ['agent'])
  api.listApplications = async () => ({ activeTenantId: otherTenantId, items: [{ ...application(otherTenantId) }] })
  await assert.rejects(access.authorizeTemplates())
  api.listApplications = async () => { throw new PlatformApiError('PLATFORM_UNAVAILABLE', 'offline', true, 503) }
  await assert.rejects(access.authorizeTemplates(), 'no stale grants on network failure')
  access.dispose()
})

test('discovered application revocation cancels only old operations that claim that application', async () => {
  const api = new FakeDevApi(), access = new PlatformDevAccessController(api, new FakeVault(), new InMemoryTenantResources())
  await access.restore()
  let items = ['agent', 'erp', 'shop'].map(appId => ({ ...application(tenantId), appId, capabilities: [appId === 'shop' ? 'shop.admin' : `${appId}.read`] }))
  api.listApplications = async () => ({ activeTenantId: tenantId, items })
  const pending = await access.authorizeTemplates(), erp = await access.authorizeTemplates(), shop = await access.authorizeTemplates(), generic = await access.authorizeTemplates()
  requireApplications(erp, ['erp']); requireApplications(shop, ['shop']); requireApplications(generic, [])
  await access.authorizeTemplates()
  assert.equal(erp.signal.aborted, false, 'identical grant refreshes do not cancel each other')
  const sameErp = await access.authorizeTemplates(); requireApplications(sameErp, ['erp'])
  assert.equal(sameErp.signal, erp.signal, 'stable grants preserve the scope signal used by business credential caches')
  items = items.filter(app => app.appId !== 'erp')
  const after = await access.authorizeTemplates()
  assert.equal(erp.signal.aborted, true, 'an in-flight ERP operation must stop before activation or session admission')
  assert.equal(shop.signal.aborted, false, 'an unrelated application keeps its operation')
  assert.equal(generic.signal.aborted, false, 'generic local work has no business dependency')
  assert.throws(() => requireApplications(pending, ['erp']), 'a queued operation cannot claim an authority epoch revoked before it started')
  requireApplications(after, [])
  items.push({ ...application(tenantId), appId: 'erp', capabilities: ['erp.read'] })
  const regranted = await access.authorizeTemplates(); requireApplications(regranted, ['erp'])
  assert.equal(regranted.signal.aborted, false)
  assert.equal(erp.signal.aborted, true, 'reopening an application never revives old authority')
  await access.logout()
  assert.equal(generic.signal.aborted, true)
  access.dispose()
})

class FakeDevApi {
  order = []
  activeTenantId = tenantId
  tokenRequests = []
  async loginWithPassword() { return { session: session(), user, meta: { contractVersion: '0.1.1', simulated: false } } }
  async refresh() { return { session: session(this.activeTenantId, 'refreshed'), meta: { contractVersion: '0.1.1', simulated: false } } }
  async logout(token) { this.order.push(`remote:${token}`) }
  async listTenants() { return { activeTenantId: this.activeTenantId, items: tenants, meta: { contractVersion: '0.1.1', simulated: false } } }
  async listApplications(_token, activeTenantId) {
    return { activeTenantId, items: [application(activeTenantId)], meta: { contractVersion: '0.1.1', simulated: false } }
  }
  async listModels(_token, activeTenantId) {
    return { activeTenantId, activeModelId: model.modelId, items: [model], meta: { contractVersion: '0.1.1', simulated: false } }
  }
  async switchTenant(_token, activeTenantId) {
    this.activeTenantId = activeTenantId
    return { tenant: tenants.find(item => item.tenantId === activeTenantId), session: session(activeTenantId, 'switched'), meta: { contractVersion: '0.1.1', simulated: false } }
  }
  async issueApplicationToken(accessToken, appId, activeTenantId) {
    this.tokenRequests.push({ accessToken, appId, activeTenantId })
    return {
      accessToken: 'short-lived-product-hub-token-with-entropy', tokenType: 'Bearer', expiresIn: 60,
      audience: 'futurestaff-product-hub-dev', tenantId: activeTenantId,
      permissions: ['product_hub.read'], meta: { contractVersion: '0.1.1', simulated: false },
    }
  }
}

test('Host local workspace authorization needs a current session but no model and carries no token', async () => {
  const api = new FakeDevApi(), vault = new FakeVault()
  api.listModels = async (_token, activeTenantId) => ({ activeTenantId, activeModelId: null, items: [], meta: { contractVersion: '0.1.1', simulated: false } })
  const access = new PlatformDevAccessController(api, vault, new InMemoryTenantResources())
  await assert.rejects(access.authorizeLocal())
  await access.restore(); const principal = await access.authorizeLocal()
  assert.deepEqual(Object.keys(principal).sort(), ['signal','tenantId','userId'])
  assert.equal(principal.tenantId, tenantId); assert.equal(principal.userId, user.userId)
  await access.switchTenant(otherTenantId); assert.equal(principal.signal.aborted, true)
  assert.equal((await access.authorizeLocal()).tenantId, otherTenantId)
  await access.logout(); await assert.rejects(access.authorizeLocal())
})

test('module inference can select an offered model and rejects an unoffered model', async () => {
  const api = new FakeDevApi(), vault = new FakeVault()
  const selected = { ...model, modelId: '30000000-0000-4000-8000-000000000002', displayName: '用户选择模型', isDefault: false }
  api.listModels = async (_token, activeTenantId) => ({ activeTenantId, activeModelId: model.modelId, items: [model, selected], meta: { contractVersion: '0.1.1', simulated: false } })
  const access = new PlatformDevAccessController(api, vault, new InMemoryTenantResources())
  await access.restore()
  assert.equal((await access.authorizeChat(selected.modelId)).modelId, selected.modelId)
  assert.equal((await access.authorizeChat()).modelId, model.modelId)
  await assert.rejects(access.authorizeChat('30000000-0000-4000-8000-000000000099'))
  const credentials = await access.authorizeChat(selected.modelId)
  await access.logout(); assert.equal(credentials.signal.aborted, true)
  await assert.rejects(access.authorizeChat(selected.modelId))
})

test('DEV password login reports invalid credentials without reflecting platform details', async () => {
  const api = new FakeDevApi()
  api.loginWithPassword = async () => {
    throw new PlatformApiError('AUTHENTICATION_REQUIRED', 'private platform detail', false, 401)
  }
  const controller = new PlatformDevAccessController(api, new FakeVault(), new InMemoryTenantResources())

  const snapshot = await controller.login({ loginIdentifier: 'dev@example.invalid', password: 'private-password' })

  assert.equal(snapshot.phase, 'error')
  assert.equal(snapshot.error.code, 'AUTHENTICATION_REQUIRED')
  assert.equal(snapshot.error.message, '账号或密码错误，请重新输入。')
  assert.doesNotMatch(JSON.stringify(snapshot), /private platform detail|private-password/)
})

test('DEV password login explains the platform email-verification rejection', async () => {
  const api = new FakeDevApi()
  api.loginWithPassword = async () => {
    throw new PlatformApiError('AUTHENTICATION_REQUIRED', 'private verification detail', false, 403)
  }
  const controller = new PlatformDevAccessController(api, new FakeVault(), new InMemoryTenantResources())

  const snapshot = await controller.login({ loginIdentifier: 'dev@example.invalid', password: 'private-password' })

  assert.equal(snapshot.phase, 'error')
  assert.equal(snapshot.error.code, 'AUTHENTICATION_REQUIRED')
  assert.equal(snapshot.error.message, '账号尚未完成邮箱验证，请先在 FutureStaff 平台网页完成验证后重试。')
  assert.doesNotMatch(JSON.stringify(snapshot), /private verification detail|private-password/)
})

test('DEV password login explains missing membership and Agent authorization without server details', async () => {
  for (const [code, message] of [
    ['TENANT_MEMBERSHIP_REQUIRED', '当前账号没有可用的组织成员身份，请联系管理员开通。'],
    ['APPLICATION_ACCESS_DENIED', '当前账号尚未获授权使用 FutureStaff Agent，请联系管理员开通。'],
  ]) {
    const api = new FakeDevApi()
    api.loginWithPassword = async () => {
      throw new PlatformApiError(code, 'private platform detail', false, 403)
    }
    const controller = new PlatformDevAccessController(api, new FakeVault(), new InMemoryTenantResources())
    const snapshot = await controller.login({ loginIdentifier: 'dev@example.invalid', password: 'private-password' })
    assert.equal(snapshot.phase, 'error')
    assert.equal(snapshot.error.code, code)
    assert.equal(snapshot.error.message, message)
    assert.doesNotMatch(JSON.stringify(snapshot), /private platform detail|private-password/)
  }
})

test('DEV password login distinguishes an unpublished platform route from invalid credentials', async () => {
  const api = new FakeDevApi()
  api.loginWithPassword = async () => {
    throw new PlatformApiError('CONTRACT_MISMATCH', 'platform returned an unknown route', false, 404)
  }
  const controller = new PlatformDevAccessController(api, new FakeVault(), new InMemoryTenantResources())

  const snapshot = await controller.login({ loginIdentifier: 'dev@example.invalid', password: 'private-password' })

  assert.equal(snapshot.phase, 'error')
  assert.equal(snapshot.error.code, 'CONTRACT_MISMATCH')
  assert.equal(snapshot.error.message, 'FutureStaff Platform DEV 登录服务尚未发布，请联系管理员更新平台。')
  assert.doesNotMatch(JSON.stringify(snapshot), /unknown route|private-password/)
})

test('DEV access restores a credential-free tenant snapshot from the protected Vault', async () => {
  const controller = new PlatformDevAccessController(new FakeDevApi(), new FakeVault(), new InMemoryTenantResources())
  const snapshot = await controller.restore()

  assert.equal(snapshot.phase, 'ready')
  assert.equal(snapshot.simulated, false)
  assert.equal(snapshot.contractVersion, '0.1.1')
  assert.equal(snapshot.user.displayName, 'DEV 用户')
  assert.equal(snapshot.tenants.length, 2)
  assert.equal(snapshot.applications[0].tenantId, tenantId)
  assert.equal(snapshot.models[0].displayName, '平台默认模型')
  assert.doesNotMatch(JSON.stringify(snapshot), /private-access|private-refresh/)
})

test('DEV access persists refresh and authorized tenant switch, then clears locally before logout', async () => {
  const vault = new FakeVault()
  const api = new FakeDevApi()
  const resources = new InMemoryTenantResources()
  const controller = new PlatformDevAccessController(api, vault, resources)
  await controller.restore()

  await controller.refresh()
  assert.match(vault.saves.at(-1).session.accessToken, /refreshed/)
  await controller.switchTenant(otherTenantId)
  assert.equal(controller.getSnapshot().phase, 'ready')
  assert.equal(controller.getSnapshot().activeTenantId, otherTenantId)
  assert.match(vault.saves.at(-1).session.accessToken, /switched/)
  await assert.rejects(() => controller.switchTenant('30000000-0000-4000-8000-000000000003'), /not authorized/)

  const originalClear = vault.clear.bind(vault)
  vault.clear = async () => { api.order.push('local'); await originalClear() }
  await controller.logout()
  assert.deepEqual(api.order, ['local', `remote:${session(otherTenantId, 'switched').refreshToken}`])
  assert.equal(controller.getSnapshot().phase, 'signed_out')
})

test('DEV access expires and clears protected state after an authentication rejection', async () => {
  const vault = new FakeVault()
  const api = new FakeDevApi()
  api.listTenants = async () => { throw new PlatformApiError('TOKEN_EXPIRED', 'must not reflect', false, 401) }
  const controller = new PlatformDevAccessController(api, vault, new InMemoryTenantResources())

  const snapshot = await controller.restore()
  assert.equal(snapshot.phase, 'expired')
  assert.equal(snapshot.error.code, 'TOKEN_EXPIRED')
  assert.equal(vault.cleared, true)
  assert.doesNotMatch(JSON.stringify(snapshot), /must not reflect|private-/)
})

test('DEV access serializes protected refresh and tenant mutations', async () => {
  const vault = new FakeVault()
  const api = new FakeDevApi()
  const controller = new PlatformDevAccessController(api, vault, new InMemoryTenantResources())
  await controller.restore()
  const order = []
  let releaseRefresh
  api.refresh = async () => {
    order.push('refresh:start')
    await new Promise(resolve => { releaseRefresh = resolve })
    order.push('refresh:end')
    return { session: session(tenantId, 'refreshed'), meta: { contractVersion: '0.1.1', simulated: false } }
  }
  api.switchTenant = async (_token, activeTenantId) => {
    order.push('switch')
    api.activeTenantId = activeTenantId
    return { tenant: tenants[1], session: session(activeTenantId, 'switched'), meta: { contractVersion: '0.1.1', simulated: false } }
  }

  const refreshing = controller.refresh()
  await new Promise(resolve => setImmediate(resolve))
  const switching = controller.switchTenant(otherTenantId)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(order, ['refresh:start'])
  releaseRefresh()
  await Promise.all([refreshing, switching])
  assert.deepEqual(order, ['refresh:start', 'refresh:end', 'switch'])
  assert.equal(controller.getSnapshot().phase, 'ready')
  assert.equal(controller.getSnapshot().activeTenantId, otherTenantId)
})

test('DEV access maps an application authorization denial to the safe empty state', async () => {
  const api = new FakeDevApi()
  api.listApplications = async () => {
    throw new PlatformApiError('APPLICATION_ACCESS_DENIED', 'must not reflect', false, 403)
  }
  const controller = new PlatformDevAccessController(api, new FakeVault(), new InMemoryTenantResources())

  const snapshot = await controller.restore()
  assert.equal(snapshot.phase, 'no_apps')
  assert.equal(snapshot.applications.length, 0)
  assert.equal(snapshot.tenants.length, 2)
  assert.doesNotMatch(JSON.stringify(snapshot), /must not reflect|private-/)
})

test('DEV access issues an application token only for the active authorized Product Hub', async () => {
  const api = new FakeDevApi()
  api.listApplications = async (_token, activeTenantId) => ({
    activeTenantId, items: [application(activeTenantId), {
      ...application(activeTenantId), appId: 'product_hub', displayName: '未来市集',
      capabilities: ['product_hub.read'],
    }], meta: { contractVersion: '0.1.1', simulated: false },
  })
  const controller = new PlatformDevAccessController(api, new FakeVault(), new InMemoryTenantResources())
  await controller.restore()

  const token = await controller.issueApplicationToken('product_hub')
  assert.equal(token.expiresIn, 60)
  assert.equal(token.tenantId, tenantId)
  assert.deepEqual(api.tokenRequests, [{
    accessToken: session(tenantId, 'refreshed').accessToken, appId: 'product_hub', activeTenantId: tenantId,
  }])
  await assert.rejects(() => controller.issueApplicationToken('erp'), /not authorized/)
  assert.equal(api.tokenRequests.length, 1)
  await controller.logout()
  await assert.rejects(() => controller.issueApplicationToken('product_hub'), /not authorized/)
  assert.equal(api.tokenRequests.length, 1)
})

test('Host chat authorization uses the discovered default and invalidates its signal on tenant switch/logout', async () => {
  const controller = new PlatformDevAccessController(new FakeDevApi(), new FakeVault(), new InMemoryTenantResources())
  await assert.rejects(() => controller.authorizeChat(), /登录/)
  await controller.restore()
  const initial = await controller.authorizeChat()
  assert.equal(initial.modelId, model.modelId)
  assert.equal(initial.tenantId, tenantId)
  assert.equal(initial.signal.aborted, false)
  await controller.switchTenant(otherTenantId)
  assert.equal(initial.signal.aborted, true)
  const switched = await controller.authorizeChat()
  assert.equal(switched.tenantId, otherTenantId)
  await controller.logout()
  assert.equal(switched.signal.aborted, true)
  await assert.rejects(() => controller.authorizeChat(), /登录/)
})


test('production application tokens keep their environment audience boundary', async () => {
  const api = new FakeDevApi()
  api.listApplications = async (_token, activeTenantId) => ({ activeTenantId,
    items: [{ ...application(activeTenantId), appId: 'product_hub', capabilities: ['product_hub.read'] }],
    meta: { contractVersion: '0.1.1', simulated: false } })
  let audience = 'futurestaff-product-hub'
  api.issueApplicationToken = async (_token, _app, activeTenantId) => ({ accessToken: 'offline-fixture-token-with-entropy',
    tokenType: 'Bearer', expiresIn: 60, audience, tenantId: activeTenantId, permissions: ['product_hub.read'],
    meta: { contractVersion: '0.1.1', simulated: false } })
  const controller = new PlatformDevAccessController(api, new FakeVault(), new InMemoryTenantResources(), undefined, 'futurestaff-product-hub')
  await controller.restore()
  assert.equal((await controller.issueApplicationToken('product_hub')).audience, audience)
  audience = 'futurestaff-product-hub-dev'
  await assert.rejects(() => controller.issueApplicationToken('product_hub'), /contract mismatch/)
  await controller.logout()
})
