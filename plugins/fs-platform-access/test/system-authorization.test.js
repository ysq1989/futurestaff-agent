import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, mkdir, readdir, writeFile, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { decodeRecipe, fetchRecipes, LocalRoleStore } from '../lib/market.js'
import { mountMarket } from '../lib/market-host.js'
import { PlatformDevAccessController, InMemoryTenantResources } from '../lib/index.js'
import { AgentInstallationStore } from '../lib/agent-distribution.js'
import { mountAgentDistribution } from '../lib/agent-distribution-host.js'
import { mountAgents } from '../lib/agent-host.js'
import { applicationsAllowed, decodeRequiredApplications, scopeApplications } from '../lib/system-policy.js'

const identity = { environment: 'dev', tenantId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000001' }
const agentId = '30000000-0000-4000-8000-000000000001', signal = new AbortController().signal
const application = appId => ({ appId, tenantId: identity.tenantId, capabilities: [appId === 'web' ? 'web.manage' : appId === 'agent' ? 'agent.admin' : appId === 'shop' ? 'shop.admin' : appId === 'vietnam_immigration' ? 'visa.read' : `${appId}.read`] })
const credentials = applications => ({ ...identity, accessToken: 'host-only', signal, applications: applications.map(application) })
function recipe(requiredApplications) {
  const body = { templateId: agentId, name: 'Template', description: '', icon: '', category: 'general', capabilityBullets: [], instructions: 'Use tools.', skills: [], compatible: true, unavailableReason: null,
    ...(requiredApplications === undefined ? {} : { requiredApplications, tools: [], businessSystems: [] }) }
  return { ...body, version: createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(body).sort().map(k => [k, body[k]])))).digest('hex') }
}
function release(scope, name = 'Role') {
  const snapshot = { agentId, name, description: '', version: 'a'.repeat(64), legacyVersion: 'b'.repeat(64), modelPolicy: { primaryModelId: identity.tenantId, fallbackModelId: null }, files: [], ...(scope === undefined ? {} : { businessSystems: scope }) }
  const raw = Buffer.from(JSON.stringify({ contractVersion: '2.0.0', notes: '', snapshot, requirements: { minClientVersion: '3.3.0', capabilities: ['core.chat'] } }))
  const version = createHash('sha256').update(raw).digest('hex')
  return { raw, version, snapshot, card: { agentId, name, description: '', version, sha256: version, bytes: raw.length, notes: '', publishedAt: null, available: true, unavailableReason: null, requirements: { minClientVersion: '3.3.0', capabilities: ['core.chat'] } } }
}
async function call(routes, suffix, body, kind = 'agent') {
  const request = Readable.from(body ? [JSON.stringify(body)] : [])
  request.method = ['distribution', 'catalog', 'mine'].includes(suffix) ? 'GET' : 'POST'
  request.headers = { ['x-futurestaff-' + kind]: '1' }; request.socket = { remoteAddress: '127.0.0.1' }
  let result
  const response = { statusCode: 0, setHeader() {}, end: raw => { result = JSON.parse(raw) } }
  await routes.find(route => route.path.endsWith('/' + suffix)).handler(request, response)
  return { status: response.statusCode, body: result }
}
async function authority(t) {
  let appIds = ['agent', 'erp']
  const session = { accessToken: 'host-only', refreshToken: 'host-refresh', tokenType: 'Bearer', expiresIn: 900, audience: 'futurestaff-agent-pc-dev', activeTenantId: identity.tenantId }
  const user = { userId: identity.userId, displayName: 'Fixture' }
  const access = new PlatformDevAccessController({
    refresh: async () => ({ session }), logout: async () => {},
    listTenants: async () => ({ activeTenantId: identity.tenantId, items: [{ tenantId: identity.tenantId, displayName: 'Fixture', slug: 'fixture', role: 'member', logoUrl: null }] }),
    listModels: async () => ({ items: [], activeModelId: null }),
    listApplications: async () => ({ activeTenantId: identity.tenantId, items: appIds.map(appId => ({ ...application(appId), displayName: appId, baseUrl: 'https://dev.fsstory.net', deepLinks: { home: '/' }, contractRange: '>=0.1.1 <0.2.0' })) }),
  }, { load: async () => ({ session, user }), save: async () => {}, clear: async () => {} }, new InMemoryTenantResources())
  t.after(() => access.dispose()); await access.restore()
  return { authorize: () => access.authorizeTemplates(), revoke: async () => { appIds = ['agent']; await access.authorizeTemplates() } }
}
function barrier() {
  let enter, release
  return { entered: new Promise(resolve => { enter = resolve }), wait: new Promise(resolve => { release = resolve }), enter: () => enter(), release: () => release() }
}
test('fresh recipes negotiate 0.3 requirements and never downgrade while legacy immutable recipes remain readable', async () => {
  assert.equal(decodeRecipe(recipe()).requiredApplications, undefined)
  assert.deepEqual(decodeRecipe(recipe(['erp'])).requiredApplications, ['erp'])
  assert.throws(() => decodeRecipe(recipe(['not-a-system'])))
  assert.throws(() => decodeRecipe(recipe(['erp', 'erp'])))
  const auth = credentials(['erp'])
  const fetcher = async (_url, init) => {
    assert.equal(init.headers['x-futurestaff-template-contract'], '0.3.0')
    return Response.json({ contractVersion: '0.3.0', activeTenantId: identity.tenantId, items: [recipe(['erp'])] })
  }
  assert.equal((await fetchRecipes('https://dev.fsstory.net', auth, fetcher)).length, 1)
  await assert.rejects(fetchRecipes('https://dev.fsstory.net', auth, async () => Response.json({ contractVersion: '0.1.0', activeTenantId: identity.tenantId, items: [recipe()] })))
  await assert.rejects(fetchRecipes('https://dev.fsstory.net', auth, async () => Response.json({ contractVersion: '0.3.0', activeTenantId: identity.tenantId, items: [recipe()] })))
})
test('system grants require the current subject, capabilities and every canonical application', () => {
  const required = scopeApplications(['erp', 'web', 'product-hub', 'visa', 'geo', 'shop'])
  assert.deepEqual(required, ['erp', 'web', 'product_hub', 'vietnam_immigration', 'geo', 'shop'])
  assert.equal(applicationsAllowed(credentials(required), required), true)
  assert.equal(applicationsAllowed(credentials(required.slice(1)), required), false)
  assert.equal(applicationsAllowed({ ...credentials([]), applications: [{ ...application('erp'), tenantId: 'foreign' }] }, ['erp']), false)
  assert.equal(applicationsAllowed({ ...credentials([]), applications: [{ ...application('erp'), capabilities: [] }] }, ['erp']), false)
  assert.equal(applicationsAllowed(credentials(['agent']), decodeRequiredApplications(['agent'])), true)
  assert.equal(applicationsAllowed(credentials([]), []), true)
  assert.throws(() => scopeApplications(['erp', 'unknown']))
  assert.throws(() => decodeRequiredApplications(['futurestaff_ai']))
})
test('system grants reject blank capabilities and require Website management and Agent administration', () => {
  const allowed = (appId, capabilities) => applicationsAllowed({ ...credentials([]), applications: [{ ...application(appId), capabilities }] }, [appId])
  for (const capabilities of [[], [''], ['  '], ['\t'], ['erp.read', ' ']]) assert.equal(allowed('erp', capabilities), false)
  assert.equal(allowed('web', ['web.access']), false)
  assert.equal(allowed('web', ['web.manage']), true)
  assert.equal(allowed('agent', ['agent.read']), false)
  assert.equal(allowed('agent', ['agent.admin']), true)
  for (const [appId, prefix] of [['erp', 'erp'], ['product_hub', 'product_hub'], ['vietnam_immigration', 'visa'], ['geo', 'geo']]) {
    for (const permission of ['read', 'operator', 'admin']) assert.equal(allowed(appId, [`${prefix}.${permission}`]), true, 'read-authorized assistants need no additional tier')
    for (const capabilities of [['foreign.read'], [`${prefix}.unknown`]]) assert.equal(allowed(appId, capabilities), false)
  }
  assert.equal(allowed('vietnam_immigration', ['visa.reviewer']), true)
  assert.equal(allowed('shop', ['shop.admin']), true)
  assert.equal(allowed('shop', ['shop.read']), false)
})
test('installed system roles require current member capabilities and fresh template visibility without deleting history', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'fs-member-role-scope-')), originalFetch = globalThis.fetch
  t.after(async () => { globalThis.fetch = originalFetch; await rm(temp, { recursive: true, force: true }) })
  const root = path.join(temp, 'roles'), baseline = path.join(temp, 'standard')
  await mkdir(baseline); await writeFile(path.join(baseline, 'agent.cordis.yml'), '- id: trusted-tools\n')
  let auth = credentials([]), recipes = []
  globalThis.fetch = async url => String(url).endsWith('/token')
    ? Response.json({ schema_version: 1, tokenType: 'Bearer', accessToken: 'fixture-short-grant', expiresIn: 60, audience: 'futurestaff-visa-dev-new', tenantId: identity.tenantId, memberId: identity.userId,
      assistantTemplateId: agentId, permissions: ['visa.read'], apiBaseUrl: 'https://visa-dev-new.fsstory.net' })
    : String(url).endsWith('/permissions') ? Response.json({ menus: ['cases'] })
    : Response.json({ contractVersion: '0.3.0', activeTenantId: identity.tenantId, items: recipes })
  const routes = [], sessions = new Map(), workspaces = new Map()
  const services = {
    agentPresets: { list: async () => {
      let directories = []; try { directories = await readdir(root, { withFileTypes: true }) } catch (error) { if (error.code !== 'ENOENT') throw error }
      return [{ id: 'standard', path: path.join(baseline, 'agent.cordis.yml') }, ...directories.filter(entry => entry.isDirectory() && entry.name.startsWith('fs-')).map(entry => ({ id: entry.name, path: path.join(root, entry.name, 'agent.cordis.yml') }))]
    } },
    workspaceRegistry: { create: async directory => { const workspace = { id: `workspace-${workspaces.size}`, path: directory }; workspaces.set(workspace.id, workspace); return workspace } },
    sessionController: { create: async request => { const sessionId = `session-${sessions.size}`; sessions.set(sessionId, { header: { agentPreset: request.agentPreset, cwd: workspaces.get(request.workspaceId).path } }); return { sessionId, agentPreset: request.agentPreset } } },
    sessions: { get: id => sessions.get(id), flush: async () => true }, sessionProjections: { stateOf: session => session.header.agentPreset },
  }
  const market = mountMarket({ effect: fn => fn(), webServer: { register: route => routes.push(route) }, get: name => services[name] }, 'https://dev.fsstory.net', identity, root, async () => auth)
  for (const [appId, denied] of [['web', 'web.access'], ['agent', 'agent.read'], ['erp', 'erp.unknown'], ['product_hub', 'foreign.read'], ['vietnam_immigration', 'visa.unknown']]) {
    const current = recipe([appId]); recipes = [current]; auth = credentials([appId])
    const installed = await call(routes, 'install', { templateId: current.templateId, version: current.version }, 'market'); assert.equal(installed.status, 200)
    const opened = await call(routes, 'open', { presetId: installed.body.presetId }, 'market'); assert.equal(opened.status, 200)
    const history = path.join(opened.body.path, 'existing-history.txt'); await writeFile(history, 'original history')
    for (const capabilities of [[], [' '], [denied]]) {
      auth = { ...credentials([]), applications: [{ ...application(appId), capabilities }] }
      assert.deepEqual((await call(routes, 'catalog', undefined, 'market')).body.items, [], appId + ' catalog hidden')
      assert.deepEqual((await call(routes, 'mine', undefined, 'market')).body.items, [], appId + ' installed hidden')
      assert.equal((await call(routes, 'install', { templateId: current.templateId, version: current.version }, 'market')).status, 409)
      assert.equal((await call(routes, 'open', { presetId: installed.body.presetId }, 'market')).status, 409)
      await assert.rejects(market.resolveBinding(opened.body.sessionId), /APPLICATION|SCOPE/)
    }
    auth = { ...credentials([appId]), userId: 'same-tenant-other-member' }
    assert.equal((await call(routes, 'mine', undefined, 'market')).status, 409)
    await assert.rejects(market.resolveBinding(opened.body.sessionId), /IDENTITY/)
    auth = credentials([appId]); recipes = []
    assert.deepEqual((await call(routes, 'mine', undefined, 'market')).body.items, [], 'fresh directory revocation hides an old installation even with an unchanged app grant')
    assert.equal((await call(routes, 'open', { presetId: installed.body.presetId }, 'market')).status, 409)
    assert.equal(await readFile(history, 'utf8'), 'original history')
    recipes = [current]
    assert.equal((await call(routes, 'mine', undefined, 'market')).body.items.length, 1, 'restoring authority exposes the retained installation without reinstalling')
  }
})
test('published directories and all activation paths require every current subject application without deleting retained data', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fs-system-authority-')); t.after(() => rm(root, { recursive: true, force: true }))
  const erp = release(['erp', 'product-hub']), generic = release(undefined, 'Legacy general'), routes = []
  const store = new AgentInstallationStore(root, identity)
  let auth = credentials(['erp', 'product_hub']), current = erp, registrations = 0
  const mounted = mountAgentDistribution({ effect: fn => fn(), webServer: { register: route => routes.push(route) }, get: () => ({ create: async () => { registrations++ } }) }, 'https://dev.fsstory.net', store, async () => auth,
    async url => String(url).endsWith('/agent-distribution') ? Response.json({ contractVersion: '2.0.0', activeTenantId: identity.tenantId, items: [current.card] }) : new Response(String(url).endsWith(erp.version) ? erp.raw : generic.raw))
  assert.equal((await mounted.snapshot()).items.length, 1)
  assert.equal((await call(routes, 'install', { agentId, version: erp.version })).status, 200)
  auth = credentials(['erp'])
  assert.deepEqual((await mounted.snapshot()).items, [])
  for (const route of ['install', 'rollback']) assert.equal((await call(routes, route, { agentId, version: erp.version, applications: ['product_hub'] })).status, 409)
  assert.equal((await call(routes, 'open-installed', { agentId })).status, 409)
  assert.equal(registrations, 0)
  current = generic
  assert.equal((await call(routes, 'rollback', { agentId, version: erp.version })).status, 409, 'latest general metadata cannot authorize an ERP rollback')
  assert.equal((await mounted.snapshot()).items.length, 0, 'an inaccessible installed version stays out of choices even if the latest release is general')
  assert.equal((await store.state(agentId)).enabled, true)
  assert.equal((await store.read(agentId, erp.version)).snapshot.name, 'Role')
  assert.equal((await call(routes, 'uninstall', { agentId })).status, 200)
  assert.equal((await mounted.snapshot()).items.length, 1, 'legacy packages without a declared business scope retain general compatibility')
  assert.equal((await call(routes, 'install', { agentId, version: generic.version })).status, 200)
  current = erp
  assert.equal((await call(routes, 'open-installed', { agentId })).status, 409, 'new opens must still satisfy the current directory head even if an older installed release was general')
})
test('old system sessions and direct legacy selection cannot execute after application revocation', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fs-system-binding-')); t.after(() => rm(root, { recursive: true, force: true }))
  const item = release(['erp']), routes = []
  let auth = credentials(['erp']), live
  const host = mountAgents({ effect: fn => fn(), webServer: { register: route => routes.push(route) }, get: name => name === 'sessions' ? { get: () => live } : { create: async () => {} } },
    'https://dev.fsstory.net', identity, root, async () => auth, async url => Response.json({ contractVersion: String(url).includes('1.1.0') ? '1.1.0' : '1.0.0', activeTenantId: identity.tenantId, snapshot: String(url).includes('1.1.0') ? item.snapshot : { ...item.snapshot, version: item.snapshot.legacyVersion, modelPolicy: undefined, legacyVersion: undefined } }))
  const directory = await host.store.materialize(item.snapshot, signal); live = { header: { cwd: path.join(directory, 'workspace') } }
  assert.equal((await host.resolvePolicyBinding('old-session')).agentId, agentId)
  auth = credentials([])
  await assert.rejects(host.resolvePolicyBinding('old-session'), /APPLICATION/)
  await assert.rejects(host.authorizeBusiness('old-session', 'erp'), /APPLICATION/)
  assert.equal((await call(routes, 'select', { agentId })).status, 409)
  assert.equal((await host.store.binding('old-session')).agentId, agentId)
})
test('published Visa roles and old sessions require the canonical template local-position preflight', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fs-published-visa-scope-')); t.after(() => rm(root, { recursive: true, force: true }))
  const item = release(['visa']), auth = credentials(['vietnam_immigration']), routes = [], store = new AgentInstallationStore(root, identity)
  const templateId = '40000000-0000-4000-8000-000000000001'
  const body = { ...recipe(['vietnam_immigration']), templateId, name: 'Vietnam Visa Agent', category: 'vietnam-visa-system', tools: ['visa_query'], businessSystems: ['visa'] }
  body.version = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(body).filter(key => key !== 'version').sort().map(key => [key, body[key]])))).digest('hex')
  let status = 403, currentTemplates = [body], registrations = 0
  const requests = []
  const fetcher = async (url, init = {}) => {
    const pathname = new URL(url).pathname; requests.push(pathname)
    if (pathname.endsWith('/agent-distribution')) return Response.json({ contractVersion: '2.0.0', activeTenantId: identity.tenantId, items: [item.card] })
    if (pathname.endsWith('/agent-templates')) return Response.json({ contractVersion: '0.3.0', activeTenantId: identity.tenantId, items: currentTemplates })
    if (pathname.endsWith('/token')) {
      assert.deepEqual(JSON.parse(init.body), { templateId }, 'a publication Agent ID is never substituted for the authoritative builtin template ID')
      return Response.json({ schema_version: 1, tokenType: 'Bearer', accessToken: 'fixture-short-grant', expiresIn: 60, audience: 'futurestaff-visa-dev-new', tenantId: identity.tenantId,
        memberId: identity.userId, assistantTemplateId: templateId, permissions: ['visa.read'], apiBaseUrl: 'https://visa-dev-new.fsstory.net' })
    }
    if (pathname.endsWith('/permissions')) return Response.json({ menus: ['cases'] }, { status })
    if (pathname.endsWith('/snapshot')) return Response.json({ contractVersion: '1.0.0', activeTenantId: identity.tenantId, snapshot: item.snapshot })
    return new Response(item.raw)
  }
  await store.install(agentId, item.version, item.raw, signal)
  const mounted = mountAgentDistribution({ effect: fn => fn(), webServer: { register: route => routes.push(route) }, get: () => ({ create: async () => { registrations++ } }) }, 'https://dev.fsstory.net', store, async () => auth, fetcher)
  assert.deepEqual((await mounted.snapshot()).items, [], 'an installed publication cannot reintroduce an inaccessible Visa role')
  for (const route of ['install', 'rollback']) assert.equal((await call(routes, route, { agentId, version: item.version })).status, 409)
  assert.equal((await call(routes, 'open-installed', { agentId })).status, 409)
  assert.equal(registrations, 0)
  status = 200
  assert.equal((await mounted.snapshot()).items.length, 1)
  assert.equal((await call(routes, 'open-installed', { agentId })).status, 200)
  const workspace = await store.runtime(item.version).workspacePath(agentId)
  const host = mountAgents({ effect: fn => fn(), webServer: { register() {} }, get: name => name === 'sessions' ? { get: () => ({ header: { cwd: workspace } }) } : undefined }, 'https://dev.fsstory.net', identity, root, async () => auth, fetcher)
  assert.equal((await host.resolvePolicyBinding('retained-visa-session')).agentId, agentId)
  status = 403
  await assert.rejects(host.resolvePolicyBinding('retained-visa-session'), /APPLICATION/)
  await assert.rejects(host.authorizeBusiness('retained-visa-session', 'visa'), /APPLICATION/)
  status = 200; currentTemplates = []
  assert.deepEqual((await mounted.snapshot()).items, [], 'missing canonical Visa metadata fails closed instead of guessing an ID')
  assert.equal((await call(routes, 'open-installed', { agentId })).status, 409)
  assert.equal((await store.state(agentId)).enabled, true)
  assert.equal((await store.read(agentId, item.version)).snapshot.name, 'Role')
  assert.equal((await host.store.binding('retained-visa-session')).agentId, agentId)
  assert.ok(requests.every(pathname => !pathname.includes('/cases')))
})
test('a package with an unknown declared system cannot become a general assistant or an active installation', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fs-unknown-system-')); t.after(() => rm(root, { recursive: true, force: true }))
  const item = release(['unrecognized-system']), routes = [], store = new AgentInstallationStore(root, identity)
  const mounted = mountAgentDistribution({ effect: fn => fn(), webServer: { register: route => routes.push(route) }, get: () => undefined }, 'https://dev.fsstory.net', store, async () => credentials(['erp']),
    async url => String(url).endsWith('/agent-distribution') ? Response.json({ contractVersion: '2.0.0', activeTenantId: identity.tenantId, items: [item.card] }) : new Response(item.raw))
  const card = (await mounted.snapshot()).items[0]
  assert.equal(card.classificationKnown, false)
  assert.equal(card.available, false)
  assert.equal(card.businessSystems, undefined)
  assert.equal(card.requiredApplications, undefined)
  assert.equal((await call(routes, 'install', { agentId, version: item.version })).status, 409)
  assert.equal(await store.state(agentId), undefined)
})
test('an in-flight published download cannot activate after another Host operation discovers revocation', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fs-pending-system-release-')); t.after(() => rm(root, { recursive: true, force: true }))
  const item = release(['erp']), gate = barrier(), auth = await authority(t), routes = [], store = new AgentInstallationStore(root, identity)
  mountAgentDistribution({ effect: fn => fn(), webServer: { register: route => routes.push(route) }, get: () => undefined }, 'https://dev.fsstory.net', store, auth.authorize,
    async url => {
      if (String(url).endsWith('/agent-distribution')) return Response.json({ contractVersion: '2.0.0', activeTenantId: identity.tenantId, items: [item.card] })
      gate.enter(); await gate.wait; return new Response(item.raw)
    })
  const installing = call(routes, 'install', { agentId, version: item.version })
  await gate.entered; await auth.revoke(); gate.release()
  assert.equal((await installing).status, 409)
  assert.equal(await store.state(agentId), undefined)
})
test('pending native admission and queued local install stop on their system epoch while generic admission survives', async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  for (const required of [['erp'], []]) {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'fs-pending-role-')); t.after(() => rm(temp, { recursive: true, force: true }))
    const root = path.join(temp, 'roles'), baseline = path.join(temp, 'standard'), auth = await authority(t), gate = barrier()
    await mkdir(baseline); await writeFile(path.join(baseline, 'agent.cordis.yml'), '- id: trusted-tools\n')
    const store = new LocalRoleStore(root), original = recipe(required), presetId = await store.install(original, baseline, '/fixed/role.js', signal)
    const project = path.join(store.workspacePath(presetId), 'project.txt'); await mkdir(path.dirname(project), { recursive: true }); await writeFile(project, 'history remains')
    let current = original
    globalThis.fetch = async () => Response.json({ contractVersion: '0.3.0', activeTenantId: identity.tenantId, items: [current] })
    const routes = [], live = new Map(), workspaces = new Map()
    const services = {
      agentPresets: { list: async () => [{ id: 'standard', path: path.join(baseline, 'agent.cordis.yml') }, { id: presetId, path: path.join(root, presetId, 'agent.cordis.yml') }] },
      workspaceRegistry: { create: async directory => { const workspace = { id: 'workspace', path: directory }; workspaces.set(workspace.id, workspace); return workspace } },
      sessionController: { create: async request => { live.set('pending', { header: { agentPreset: request.agentPreset, cwd: workspaces.get(request.workspaceId).path } }); gate.enter(); await gate.wait; return { sessionId: 'pending', agentPreset: request.agentPreset } } },
      sessions: { get: id => live.get(id), flush: async () => true }, sessionProjections: { stateOf: session => session.header.agentPreset },
    }
    const market = mountMarket({ effect: fn => fn(), webServer: { register: route => routes.push(route) }, get: name => services[name] }, 'https://dev.fsstory.net', identity, root, auth.authorize)
    const opening = call(routes, 'open', { presetId }, 'market')
    await gate.entered
    let queued
    if (required.length) {
      current = recipe(required); current.instructions = 'An updated immutable recipe'
      const content = Object.fromEntries(Object.keys(current).filter(key => key !== 'version').sort().map(key => [key, current[key]]))
      current.version = createHash('sha256').update(JSON.stringify(content)).digest('hex')
      queued = call(routes, 'install', { templateId: current.templateId, version: current.version }, 'market')
      await new Promise(setImmediate)
    }
    await auth.revoke(); gate.release()
    assert.equal((await opening).status, required.length ? 409 : 200)
    if (queued) {
      assert.equal((await queued).status, 409)
      assert.deepEqual((await store.list()).map(role => role.presetId), [presetId])
      await assert.rejects(market.resolveBinding('pending'), 'a rejected native creation cannot acquire durable session admission')
    } else assert.equal((await market.resolveBinding('pending')).kind, 'local-template')
    assert.equal(await readFile(project, 'utf8'), 'history remains')
  }
})
