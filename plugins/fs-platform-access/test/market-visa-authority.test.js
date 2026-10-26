import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { LocalRoleStore } from '../lib/market.js'
import { mountMarket } from '../lib/market-host.js'

const identity = { environment: 'dev', tenantId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000001' }
const templateId = '30000000-0000-4000-8000-000000000001'
function recipe() {
  const body = { templateId, name: 'Vietnam Visa Agent', description: 'Read allowed visa resources', icon: 'V', category: 'vietnam-visa-system', capabilityBullets: [],
    instructions: 'Read only.', skills: [], compatible: true, unavailableReason: null, requiredApplications: ['vietnam_immigration'], tools: ['visa_query'], businessSystems: ['visa'] }
  return { ...body, version: createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(body).sort().map(key => [key, body[key]])))).digest('hex') }
}
async function fixture(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'fs-visa-authority-')), originalFetch = globalThis.fetch
  t.after(async () => { globalThis.fetch = originalFetch; await rm(temp, { recursive: true, force: true }) })
  const root = path.join(temp, 'roles'), baseline = path.join(temp, 'standard'), controller = new AbortController(), current = recipe()
  await mkdir(baseline); await writeFile(path.join(baseline, 'agent.cordis.yml'), '- id: trusted-tools\n')
  const store = new LocalRoleStore(root), presetId = await store.install(current, baseline, '/fixed/role.js', controller.signal)
  const history = path.join(store.workspacePath(presetId), 'original.txt'); await mkdir(path.dirname(history), { recursive: true }); await writeFile(history, 'original project and history')
  const config = { status: 200, networkFailure: false, grant: {}, grantStatus: 200, afterPermissions: () => {}, recipes: [current],
    permissions: { menus: ['cases'], actions: ['case.read'], role: 'reader' }, auth: { ...identity, accessToken: 'fixture-desktop-token', signal: controller.signal, applications: [{ appId: 'vietnam_immigration', tenantId: identity.tenantId, capabilities: ['visa.read'] }] } }
  const requests = [], routes = [], sessions = new Map(), workspaces = new Map()
  globalThis.fetch = async (url, init = {}) => {
    const address = new URL(url); requests.push({ origin: address.origin, path: address.pathname, method: init.method ?? 'GET', redirect: init.redirect })
    if (address.pathname === '/desktop/v1/agent-templates') return Response.json({ contractVersion: '0.3.0', activeTenantId: identity.tenantId, items: config.recipes })
    if (address.pathname === '/desktop/v1/system-assistants/vietnam_immigration/token') {
      assert.equal(address.origin, 'https://dev.fsstory.net'); assert.deepEqual(JSON.parse(init.body), { templateId })
      return Response.json({ schema_version: 1, tokenType: 'Bearer', accessToken: 'fixture-short-grant', expiresIn: 60, audience: 'futurestaff-visa-dev-new', tenantId: identity.tenantId,
        memberId: identity.userId, assistantTemplateId: templateId, permissions: ['visa.read'], apiBaseUrl: 'https://visa-dev-new.fsstory.net', ...config.grant }, { status: config.grantStatus })
    }
    assert.equal(address.origin, 'https://visa-dev-new.fsstory.net'); assert.equal(address.pathname, '/api/immigration/me/permissions'); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error')
    if (config.networkFailure) throw Error('fixture network unavailable')
    config.afterPermissions()
    return Response.json(config.permissions, { status: config.status })
  }
  const services = {
    agentPresets: { list: async () => [{ id: 'standard', path: path.join(baseline, 'agent.cordis.yml') }, { id: presetId, path: path.join(root, presetId, 'agent.cordis.yml') }] },
    workspaceRegistry: { create: async directory => { const workspace = { id: 'workspace', path: directory }; workspaces.set(workspace.id, workspace); return workspace } },
    sessionController: { create: async request => { const sessionId = 'session-' + sessions.size; sessions.set(sessionId, { header: { agentPreset: request.agentPreset, cwd: workspaces.get(request.workspaceId).path } }); return { sessionId, agentPreset: request.agentPreset } } },
    sessions: { get: id => sessions.get(id), flush: async () => true }, sessionProjections: { stateOf: session => session.header.agentPreset },
  }
  const market = mountMarket({ effect: fn => fn(), webServer: { register: route => routes.push(route) }, get: name => services[name] }, 'https://dev.fsstory.net', identity, root, async () => config.auth)
  async function call(suffix, body) {
    const request = Readable.from(body ? [JSON.stringify(body)] : []); request.method = ['catalog', 'mine'].includes(suffix) ? 'GET' : 'POST'
    request.headers = { 'x-futurestaff-market': '1' }; request.socket = { remoteAddress: '127.0.0.1' }
    let result; const response = { statusCode: 0, setHeader() {}, end: raw => { result = JSON.parse(raw) } }
    await routes.find(route => route.path.endsWith('/' + suffix)).handler(request, response)
    return { status: response.statusCode, body: result }
  }
  return { config, call, market, current, presetId, store, history, controller, requests, baseline }
}
test('Visa local-role discovery and admission require a fresh independent local-position permission read', async t => {
  const f = await fixture(t)
  assert.equal((await f.call('catalog')).body.items.length, 1)
  const opened = await f.call('open', { presetId: f.presetId }); assert.equal(opened.status, 200)
  for (const status of [401, 403]) {
    f.config.status = status
    assert.deepEqual((await f.call('catalog')).body.items, [])
    assert.deepEqual((await f.call('mine')).body.items, [])
    assert.equal((await f.call('install', { templateId, version: f.current.version })).status, 409)
    assert.equal((await f.call('open', { presetId: f.presetId })).status, 409)
    await assert.rejects(f.market.resolveBinding(opened.body.sessionId))
    assert.equal(await readFile(f.history, 'utf8'), 'original project and history')
    assert.equal((await f.store.list()).length, 1)
  }
  f.config.status = 200
  for (const status of [401, 403]) {
    f.config.grantStatus = status
    assert.deepEqual((await f.call('catalog')).body.items, [])
  }
  f.config.grantStatus = 200
  f.config.status = 200
  assert.equal((await f.call('mine')).body.items.length, 1, 'restoring the existing local position needs no reinstall or subscription')
  assert.ok(f.requests.some(request => request.path.endsWith('/me/permissions')))
  assert.ok(f.requests.every(request => !request.path.includes('/cases') && request.redirect === 'error'))
})
test('Visa preflight outages, malformed grants and wrong member scope fail closed without changing installations', async t => {
  const f = await fixture(t)
  for (const grant of [{ audience: 'foreign' }, { memberId: templateId }, { tenantId: templateId }, { assistantTemplateId: identity.userId }, { apiBaseUrl: 'https://foreign.invalid' }, { permissions: ['unknown'] }]) {
    f.config.grant = grant
    const catalog = await f.call('catalog')
    assert.equal(catalog.status, 200); assert.equal(catalog.body.items[0].compatible, false)
    assert.equal((await f.call('open', { presetId: f.presetId })).status, 409)
  }
  f.config.grant = {}
  for (const status of [500, 503]) { f.config.status = status; assert.equal((await f.call('mine')).body.items[0].compatible, false) }
  f.config.status = 200; f.config.networkFailure = true
  assert.equal((await f.call('catalog')).body.items[0].compatible, false)
  assert.equal((await f.store.list()).length, 1)
  assert.equal(await readFile(f.history, 'utf8'), 'original project and history')
})
test('a Visa permission outage disables only Visa while generic catalog and installed roles remain usable', async t => {
  const f = await fixture(t)
  const general = { ...f.current, templateId: '40000000-0000-4000-8000-000000000001', name: 'Project Manager', category: 'office', requiredApplications: [], tools: [], businessSystems: [] }
  general.version = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(general).filter(key => key !== 'version').sort().map(key => [key, general[key]])))).digest('hex')
  await f.store.install(general, f.baseline, '/fixed/role.js', f.controller.signal)
  f.config.recipes = [f.current, general]; f.config.status = 503
  for (const route of ['catalog', 'mine']) {
    const response = await f.call(route); assert.equal(response.status, 200)
    assert.equal(response.body.items.find(item => item.templateId === general.templateId).compatible, true)
    const visa = response.body.items.find(item => item.templateId === templateId)
    assert.equal(visa.compatible, false); assert.match(visa.unavailableReason, /岗位权限暂时无法核验/)
  }
  assert.equal((await f.call('open', { presetId: f.presetId })).status, 409)
  assert.equal(await readFile(f.history, 'utf8'), 'original project and history')
})
test('Visa permission responses arriving after authorization cancellation cannot admit or publish a role', async t => {
  const f = await fixture(t)
  f.config.afterPermissions = () => f.controller.abort()
  assert.equal((await f.call('catalog')).status, 409)
  assert.equal((await f.store.list()).length, 1)
  assert.equal(await readFile(f.history, 'utf8'), 'original project and history')
})
