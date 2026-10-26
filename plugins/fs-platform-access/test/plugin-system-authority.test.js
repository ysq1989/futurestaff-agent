import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../lib/plugin.js'
import { PlatformSessionVault } from '../lib/session-vault.js'
import { workspaceDirectory, workspaceName } from '../lib/workspace.js'
import { AgentWorkspaceStore } from '../lib/agents.js'

function barrier() {
  let enter, release
  return { entered: new Promise(resolve => { enter = resolve }), wait: new Promise(resolve => { release = resolve }), enter: () => enter(), release: () => release() }
}
test('real plugin ERP, Shop and Website callbacks cancel only their current application epoch', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'fs-plugin-scope-')), originalFetch = globalThis.fetch, originalLocal = process.env.LOCALAPPDATA
  process.env.LOCALAPPDATA = temp
  const identity = { environment: 'dev', tenantId: randomUUID(), userId: randomUUID() }, agentId = randomUUID(), name = workspaceName(identity)
  const data = workspaceDirectory(identity), profile = path.join(temp, name), source = path.join(temp, 'futurestaff-alpha')
  const cleanups = [], routes = [], tools = new Map(), values = new Map(), services = new Map(), shopGate = barrier(), webGate = barrier()
  let appIds = ['agent', 'erp', 'shop', 'web'], shopSignal, webSignal, live
  t.after(async () => {
    shopGate.release(); webGate.release()
    for (const cleanup of cleanups.reverse()) await cleanup()
    globalThis.fetch = originalFetch
    if (originalLocal === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = originalLocal
    await rm(data, { recursive: true, force: true }); await rm(temp, { recursive: true, force: true })
  })
  await mkdir(profile); await mkdir(source)
  await writeFile(path.join(profile, 'futurestaff-workspace.json'), JSON.stringify(identity))
  await writeFile(path.join(profile, 'cordis.patch.yml'), '# FutureStaff role market workspace v2\n')
  await writeFile(path.join(profile, 'package.json'), '{}'); await writeFile(path.join(source, 'package.json'), '{}')
  const secrets = { available: async () => true, has: async key => values.has(key), read: async key => values.get(key), write: async (key, value) => { values.set(key, value) }, delete: async key => { values.delete(key) } }
  const session = { accessToken: 'fixture-access-token-with-entropy', refreshToken: 'fixture-refresh-token-with-entropy', tokenType: 'Bearer', expiresIn: 900, audience: 'futurestaff-agent-pc-dev', activeTenantId: identity.tenantId }
  const user = { userId: identity.userId, displayName: 'Fixture', email: null }, meta = { contractVersion: '0.1.1', simulated: false }
  await new PlatformSessionVault(secrets, 'dev', name).save({ session, user })
  const snapshot = { agentId, name: 'Scoped role', description: '', version: 'a'.repeat(64), businessSystems: ['erp', 'shop', 'web'], files: [] }
  const store = new AgentWorkspaceStore(data, identity), directory = await store.materialize(snapshot, new AbortController().signal)
  live = { header: { cwd: path.join(directory, 'workspace') } }
  globalThis.fetch = async (url, init = {}) => {
    const pathname = new URL(url).pathname
    if (pathname === '/desktop/v1/auth/refresh') return Response.json({ session, meta })
    if (pathname === '/desktop/v1/profile') return Response.json({ activeTenantId: identity.tenantId, user, meta })
    if (pathname === '/desktop/v1/tenants') return Response.json({ activeTenantId: identity.tenantId, items: [{ tenantId: identity.tenantId, displayName: 'Fixture', slug: 'fixture', logoUrl: null, role: 'member' }], meta })
    if (pathname === '/desktop/v1/models') return Response.json({ activeTenantId: identity.tenantId, activeModelId: null, items: [], meta })
    if (pathname === '/desktop/v1/apps') return Response.json({ activeTenantId: identity.tenantId, items: appIds.map(appId => ({ appId, tenantId: identity.tenantId, displayName: appId, baseUrl: appId === 'shop' ? 'https://store.example.com' : 'https://dev.fsstory.net', deepLinks: { home: '/' }, capabilities: [appId === 'web' ? 'web.manage' : appId === 'shop' ? 'shop.admin' : `${appId}.read`], contractRange: '>=0.1.1 <0.2.0' })), meta })
    if (pathname.endsWith('/snapshot')) return Response.json({ contractVersion: '1.0.0', activeTenantId: identity.tenantId, snapshot })
    if (pathname.endsWith('/website-tools')) { webSignal = init.signal; webGate.enter(); await webGate.wait; return Response.json({ agentVersion: snapshot.version }) }
    throw Error('unexpected fixture request')
  }
  const ctx = {
    effect: factory => { const cleanup = factory(); if (typeof cleanup === 'function') cleanups.push(cleanup) }, on: () => {},
    provide: (id, value) => { services.set(id, value) },
    webServer: { host: '127.0.0.1', port: 43821, register: route => { routes.push(route); return () => {} } },
    get: id => id === 'desktopProtectedSecrets' ? secrets : id === 'desktopProfiles' ? { current: { name, dir: profile }, list: () => [], select: async () => {} } : id === 'sessions' ? { get: () => live } : id === 'desktopRuntime' ? { requestSystem: async (_appId, target, init) => { assert.equal(target, '/adminapi/platform_login'); shopSignal = init.signal; shopGate.enter(); await shopGate.wait; return Response.json({ status: 200, data: { token: 'fixture-shop-token' } }) } } : services.get(id),
    inject: (deps, callback) => { if (deps.includes('tools')) callback({ effect: ctx.effect, tools: { register: definition => { tools.set(definition.name, definition); return () => {} } } }); else if (deps.includes('llm')) callback({ effect: ctx.effect, llm: { registerAdapter: () => () => {} } }) },
  }
  apply(ctx)
  const login = services.get('platformDevLogin'); assert.equal((await login.snapshot()).phase, 'ready')
  let erpEnded = false
  await routes.find(route => route.path === '/_futurestaff/erp/events').handler({ method: 'GET', headers: { 'x-futurestaff-erp': '1' }, socket: { remoteAddress: '127.0.0.1' } }, { setHeader() {}, write() {}, on() {}, end() { erpEnded = true } })
  assert.equal(erpEnded, false)
  const execution = { agent: { id: 'session', session: { deriveMessages: () => [] } }, signal: new AbortController().signal }
  const shop = tools.get('shop_theme_tools').execute({}, execution).catch(error => error)
  const web = tools.get('website_tools').execute({}, execution).catch(error => error)
  await Promise.race([Promise.all([shopGate.entered, webGate.entered]), shop.then(result => { throw result instanceof Error ? result : Error('Shop ended before the request gate') }), web.then(result => { throw result instanceof Error ? result : Error('Website ended before the request gate') })])
  appIds = appIds.filter(id => id !== 'erp'); await login.refresh()
  assert.equal(erpEnded, true, 'the actual ERP callback must retain the ERP epoch')
  assert.equal(shopSignal.aborted, false); assert.equal(webSignal.aborted, false)
  appIds = appIds.filter(id => id !== 'shop'); await login.refresh()
  assert.equal(shopSignal.aborted, true, 'the actual Shop bridge must retain the Shop epoch')
  assert.equal(webSignal.aborted, false)
  appIds = appIds.filter(id => id !== 'web'); await login.refresh()
  assert.equal(webSignal.aborted, true, 'the actual Website callback must retain the Web epoch')
  shopGate.release(); webGate.release(); await Promise.all([shop, web])
})
