import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { decodeRecipe, fetchRecipes, LocalRoleStore, roleRoot } from '../lib/market.js'
import { apply as applyRole } from '../lib/role.js'
import { mountMarket } from '../lib/market-host.js'
import { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
// Use the Host registry's scope identity, not another workspace dependency copy.
const promptRequire = createRequire(import.meta.resolve('@deepseek-ai/dsh-system-prompt'))
const { createScope } = await import(pathToFileURL(promptRequire.resolve('@deepseek-ai/dsh-scope')).href)

function recipe(changes = {}) {
  const body = { templateId: '10000000-0000-4000-8000-000000000001', name: '工程师', description: '写代码',
    icon: 'FE', category: 'software-development', capabilityBullets: ['Code'], instructions: 'Use the project rules.',
    skills: [], compatible: true, unavailableReason: null, requiredApplications: [], tools: [], businessSystems: [], ...changes }
  return { ...body, version: createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(body).sort().map(k => [k, body[k]])))).digest('hex') }
}
test('strict recipe rejects executable config, bad checksums and template interpolation', () => {
  assert.equal(decodeRecipe(recipe()).name, '工程师')
  assert.throws(() => decodeRecipe({ ...recipe(), plugins: [] }))
  assert.throws(() => decodeRecipe({ ...recipe(), instructions: 'Altered' }))
  assert.throws(() => decodeRecipe(recipe({ instructions: '{{token}}' })))
})
test('catalog binds trusted origin and tenant and enforces size', async () => {
  const credentials = { tenantId: 'tenant-a', accessToken: 'test-only', signal: new AbortController().signal }
  const fetcher = async (url, init) => {
    assert.equal(url, 'https://dev.fsstory.net/desktop/v1/agent-templates')
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers['x-futurestaff-template-contract'], '0.3.0')
    return Response.json({ contractVersion: '0.3.0', activeTenantId: credentials.tenantId, items: [recipe()] })
  }
  assert.equal((await fetchRecipes('https://dev.fsstory.net', credentials, fetcher)).length, 1)
  await assert.rejects(fetchRecipes('https://evil.invalid', credentials, fetcher))
  await assert.rejects(fetchRecipes('https://dev.fsstory.net', credentials, async () => Response.json({ contractVersion: '0.1.0', activeTenantId: 'other', items: [] })))
  await assert.rejects(fetchRecipes('https://dev.fsstory.net', credentials, async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))))
})
test('atomic immutable installation preserves trusted tools/assets and survives new store', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'fs-role-'))
  try {
    const baseline = path.join(temp, 'standard'); await mkdir(baseline)
    const composition = '- id: tool-fs\n  name: trusted-file-tool\n- id: tool-shell\n  name: trusted-shell\n'
    await writeFile(path.join(baseline, 'agent.cordis.yml'), composition)
    await writeFile(path.join(baseline, 'skill.md'), 'Trusted asset')
    await mkdir(path.join(baseline, 'assets'))
    const binary = Buffer.from([0, 255, 1, 128])
    await writeFile(path.join(baseline, 'assets', 'fixture.bin'), binary)
    const root = path.join(temp, 'roles'); const store = new LocalRoleStore(root)
    const signal = new AbortController().signal
    const id = await store.install(recipe(), baseline, '/fixed/role.js', signal)
    assert.equal(await store.install(recipe(), baseline, '/fixed/role.js', signal), id)
    assert.equal((await new LocalRoleStore(root).list()).length, 1)
    assert.ok((await readFile(path.join(root, id, 'agent.cordis.yml'), 'utf8')).startsWith(composition))
    assert.equal(await readFile(path.join(root, id, 'skill.md'), 'utf8'), 'Trusted asset')
    assert.deepEqual(await readFile(path.join(root, id, 'assets', 'fixture.bin')), binary)
    const v2 = await store.install(recipe({ instructions: 'New role version' }), baseline, '/fixed/role.js', signal)
    assert.notEqual(v2, id)
    assert.deepEqual((await store.list()).map(role => role.presetId), [v2], 'one atomic pointer chooses the active version of each template')
    assert.equal((await store.read(id, true)).recipe.version, recipe().version)
    await store.uninstall(id)
    assert.deepEqual((await store.list()).map(role => role.presetId), [v2], 'uninstalling an old version preserves the newer active version')
    assert.equal(JSON.parse(await readFile(path.join(root, id, 'recipe.json'), 'utf8')).instructions, 'Use the project rules.')
    await assert.rejects(store.install(recipe({ compatible: false, unavailableReason: 'Missing tool' }), baseline, '/fixed/role.js', signal))
    const aborted = AbortSignal.abort()
    await assert.rejects(store.install(recipe({ name: 'Cancelled' }), baseline, '/fixed/role.js', aborted))
  } finally { await rm(temp, { recursive: true, force: true }) }
})
test('role contributes a scoped section without replacing tools or system prompt', () => {
  let section; let disposed = false
  applyRole({ effect: fn => fn(), systemPrompt: { section: value => { section = value; return () => { disposed = true } } } }, { instructions: 'Role text' })
  assert.equal(section.text, 'Role text'); assert.equal(section.complete, undefined)
  assert.equal(disposed, false)
})
test('local installation rejects changed artifacts and cancellation cannot reactivate an uninstalled version', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'fs-role-integrity-'))
  try {
    const baseline = path.join(temp, 'standard'); await mkdir(baseline)
    await writeFile(path.join(baseline, 'agent.cordis.yml'), '- id: trusted-tools\n')
    const store = new LocalRoleStore(path.join(temp, 'roles')), auth = new AbortController()
    const presetId = await store.install(recipe(), baseline, '/fixed/role.js', auth.signal)
    await store.uninstall(presetId)
    const read = store.read.bind(store)
    store.read = async (...args) => { const role = await read(...args); auth.abort(); return role }
    await assert.rejects(store.install(recipe(), baseline, '/fixed/role.js', auth.signal))
    store.read = read
    assert.equal((await store.list()).length, 0)
    const active = await store.install(recipe(), baseline, '/fixed/role.js', new AbortController().signal)
    assert.equal(active, presetId)
    await writeFile(path.join(store.root, presetId, 'agent.cordis.yml'), '- id: unreviewed-code\n')
    await assert.rejects(store.read(presetId), /MARKET_INSTALLATION_CHANGED/)
  } finally { await rm(temp, { recursive: true, force: true }) }
})
test('workspace identity isolates role directories', () => {
  const a = { environment: 'dev', tenantId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000001' }
  assert.notEqual(roleRoot(a), roleRoot({ ...a, environment: 'production' }))
  assert.notEqual(roleRoot(a), roleRoot({ ...a, tenantId: '10000000-0000-4000-8000-000000000002' }))
  assert.notEqual(roleRoot(a), roleRoot({ ...a, userId: '20000000-0000-4000-8000-000000000002' }))
})
test('real DSH prompt assembly isolates roles and preserves the host tool catalog', async () => {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, { persona: 'Trusted DSH persona.' })
  ctx.systemPrompt.tools(() => ({ schemas: [{ name: 'read_file', description: 'Read', parameters: { type: 'object' } }] }))
  const first = {}, second = {}
  const a = createScope(ctx, first), b = createScope(ctx, second)
  try {
    const plugin = { apply: applyRole, inject: ['systemPrompt'] }
    await a.ctx.plugin(plugin, { instructions: 'Engineer role.' })
    await b.ctx.plugin(plugin, { instructions: 'Research role.' })
    const engineer = await ctx.systemPrompt.assemble({ scope: first })
    const research = await ctx.systemPrompt.assemble({ scope: second })
    assert.match(renderPrompt(engineer), /Engineer role/)
    assert.doesNotMatch(renderPrompt(engineer), /Research role/)
    assert.match(renderPrompt(research), /Research role/)
    assert.match(renderPrompt(engineer), /Trusted DSH persona/)
    assert.equal(engineer.tools[0].name, 'read_file')
    assert.doesNotMatch(renderPrompt(await ctx.systemPrompt.assemble()), /Engineer role|Research role/)
  } finally { await a.dispose(); await b.dispose(); await ctx.fiber.dispose() }
})
test('Host market installs locally and creates exact version sessions without changing defaults or platform employment', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'fs-market-host-'))
  const originalFetch = globalThis.fetch
  try {
    const root = path.join(temp, 'roles'), baseline = path.join(temp, 'standard')
    await mkdir(baseline)
    await writeFile(path.join(baseline, 'agent.cordis.yml'), '- id: trusted-tools\n  name: trusted-tools\n')
    const identity = { environment: 'dev', tenantId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000001' }
    const credentials = { ...identity, accessToken: 'host-only-test', signal: new AbortController().signal }
    let activeCredentials = credentials
    let catalogRecipes = [recipe()]
    globalThis.fetch = async (url, init) => {
      assert.equal(new URL(url).pathname, '/desktop/v1/agent-templates')
      assert.equal(init.method, undefined, 'local installation never creates a platform employee')
      return Response.json({ contractVersion: '0.3.0', activeTenantId: identity.tenantId, items: catalogRecipes })
    }
    const routes = [], updates = [], sessionCalls = [], flushed = []
    const live = new Map(), workspaces = new Map(), projectedPresets = new Map()
    let brokenPreset = ''
    const presets = { list: async () => {
      let directories = []
      try { directories = await readdir(root, { withFileTypes: true }) } catch (error) { if (error.code !== 'ENOENT') throw error }
      return [{ id: 'standard', path: path.join(baseline, 'agent.cordis.yml') }, ...directories.filter(entry => entry.isDirectory() && entry.name.startsWith('fs-'))
        .map(entry => ({ id: entry.name, path: path.join(root, entry.name, 'agent.cordis.yml'), ...(entry.name === brokenPreset ? { broken: 'native composition failed' } : {}) }))]
    } }
    const services = {
      agentPresets: presets,
      settings: { update: async (ns, patch) => updates.push([ns, patch]) },
      workspaceRegistry: { create: async directory => {
        const item = { id: `workspace-${workspaces.size + 1}`, path: directory }; workspaces.set(item.id, item); return item
      } },
      sessionController: { create: async request => {
        assert.deepEqual(Object.keys(request).sort(), ['agentPreset', 'workspaceId'])
        sessionCalls.push(request)
        const sessionId = `template-session-${sessionCalls.length}`
        live.set(sessionId, { header: { cwd: workspaces.get(request.workspaceId).path, agentPreset: request.agentPreset } })
        projectedPresets.set(sessionId, request.agentPreset)
        return { sessionId, agentPreset: request.agentPreset }
      } },
      sessions: { get: id => live.get(id), flush: async session => { flushed.push(session); return true } },
      sessionProjections: { stateOf: session => projectedPresets.get([...live].find(([, value]) => value === session)[0]) },
    }
    const market = mountMarket({ effect: fn => fn(), webServer: { register: route => routes.push(route) },
      get: name => services[name] },
    'https://dev.fsstory.net', identity, root, async () => activeCredentials)
    async function call(suffix, body, header = '1') {
      const request = Readable.from(body ? [JSON.stringify(body)] : [])
      request.method = ['catalog', 'mine'].includes(suffix) ? 'GET' : 'POST'
      request.headers = { 'x-futurestaff-market': header }; request.socket = { remoteAddress: '127.0.0.1' }
      let result; const response = { statusCode: 0, setHeader() {}, end: raw => { result = JSON.parse(raw) } }
      await routes.find(r => r.path.endsWith(suffix)).handler(request, response)
      return { status: response.statusCode, body: result }
    }
    assert.equal((await call('catalog', undefined, '')).status, 403)
    const catalog = await call('catalog')
    assert.equal(catalog.status, 200)
    assert.equal(catalog.body.items[0].instructions, undefined)
    assert.doesNotMatch(JSON.stringify(catalog.body), /host-only-test/)
    assert.equal((await call('install', { templateId: recipe().templateId, version: 'stale' })).status, 409)
    const installed = await call('install', { templateId: recipe().templateId, version: recipe().version })
    assert.equal(installed.status, 200)
    assert.deepEqual(updates, [], 'install must not alter the global preset default')
    const mine = await call('mine'); assert.equal(mine.body.items.length, 1)
    assert.equal(mine.body.items[0].instructions, undefined)
    assert.equal(mine.body.items[0].presetId, installed.body.presetId)
    assert.ok(path.isAbsolute(mine.body.items[0].path))
    assert.equal((await call('open', { presetId: installed.body.presetId, tenantId: identity.tenantId })).status, 409)
    const opened = await call('open', { presetId: installed.body.presetId })
    assert.equal(opened.status, 200)
    assert.deepEqual(sessionCalls[0], { workspaceId: 'workspace-1', agentPreset: installed.body.presetId })
    assert.equal(flushed.length, 1)
    assert.equal(opened.body.sessionId, 'template-session-1')
    assert.equal(opened.body.version, recipe().version)
    const binding = await market.resolveBinding(opened.body.sessionId)
    assert.deepEqual(binding, { kind: 'local-template', templateId: recipe().templateId, version: recipe().version,
      identity: { tenantId: identity.tenantId, userId: identity.userId }, businessSystems: [], tools: [], signal: credentials.signal })
    assert.equal(binding.agentId, undefined)
    assert.equal(await market.resolveWorkspace(opened.body.sessionId), opened.body.path)
    const project = path.join(opened.body.path, 'user-project.txt')
    await writeFile(project, 'keep project and conversation history')
    catalogRecipes = [recipe({ instructions: 'Second immutable version' })]
    const updated = await call('install', { templateId: catalogRecipes[0].templateId, version: catalogRecipes[0].version })
    assert.equal(updated.status, 200)
    assert.deepEqual((await call('mine')).body.items.map(item => item.presetId), [updated.body.presetId])
    const second = await call('open', { presetId: updated.body.presetId })
    assert.equal(second.status, 200)
    assert.notEqual(second.body.path, opened.body.path)
    const secondRecipe = catalogRecipes[0]
    catalogRecipes = [recipe({ instructions: 'Broken native composition' })]
    brokenPreset = `fs-${catalogRecipes[0].templateId}-${catalogRecipes[0].version}`
    assert.equal((await call('install', { templateId: catalogRecipes[0].templateId, version: catalogRecipes[0].version })).status, 409)
    assert.deepEqual((await call('mine')).body.items.map(item => item.presetId), [updated.body.presetId], 'a failed native preset cannot replace the active installation')
    brokenPreset = ''; catalogRecipes = [secondRecipe]
    assert.equal((await market.resolveBinding(opened.body.sessionId)).version, recipe().version)
    assert.equal((await call('uninstall', { presetId: installed.body.presetId })).status, 200)
    assert.equal((await call('mine')).body.items.length, 1)
    assert.equal((await call('open', { presetId: installed.body.presetId })).status, 409)
    assert.equal((await market.resolveBinding(opened.body.sessionId)).version, recipe().version, 'uninstall only prevents new sessions')
    live.set('forged-native-session', { header: { ...live.get(opened.body.sessionId).header } })
    projectedPresets.set('forged-native-session', installed.body.presetId)
    await assert.rejects(market.resolveBinding('forged-native-session'), 'native headers alone cannot admit a new template conversation after uninstall')
    assert.equal(await readFile(project, 'utf8'), 'keep project and conversation history')
    projectedPresets.set(opened.body.sessionId, 'standard')
    await assert.rejects(market.resolveBinding(opened.body.sessionId), /MARKET_SESSION_MISMATCH/)
    projectedPresets.set(opened.body.sessionId, installed.body.presetId)
    const priorCwd = live.get(opened.body.sessionId).header.cwd
    live.get(opened.body.sessionId).header.cwd = baseline
    await assert.rejects(market.resolveBinding(opened.body.sessionId), /MARKET_SESSION_MISMATCH/)
    live.get(opened.body.sessionId).header.cwd = priorCwd
    const flush = services.sessions.flush
    services.sessions.flush = async () => false
    assert.deepEqual(await call('open', { presetId: updated.body.presetId }), { status: 409, body: { error: 'MARKET_RUNTIME_UNAVAILABLE' } })
    await assert.rejects(market.resolveBinding(`template-session-${sessionCalls.length}`), 'a session without a successful durability checkpoint never receives an admission binding')
    services.sessions.flush = flush
    let releaseWorkspace, enteredWorkspace
    const release = new Promise(resolve => { releaseWorkspace = resolve })
    const entered = new Promise(resolve => { enteredWorkspace = resolve })
    const createWorkspace = services.workspaceRegistry.create
    services.workspaceRegistry.create = async directory => { enteredWorkspace(); await release; return createWorkspace(directory) }
    const opening = call('open', { presetId: updated.body.presetId })
    await entered
    const cancelled = new AbortController()
    activeCredentials = { ...credentials, signal: cancelled.signal }
    const uninstalling = call('uninstall', { presetId: updated.body.presetId })
    await new Promise(setImmediate)
    cancelled.abort()
    activeCredentials = credentials
    releaseWorkspace()
    assert.equal((await opening).status, 200)
    assert.equal((await uninstalling).status, 409, 'a queued uninstall cannot commit after its login scope is cancelled')
    assert.deepEqual((await call('mine')).body.items.map(item => item.presetId), [updated.body.presetId])
    services.workspaceRegistry.create = createWorkspace
    catalogRecipes = [recipe({ requiredApplications: ['erp', 'product_hub'], instructions: 'Multi-system role' })]
    assert.deepEqual((await call('catalog')).body.items, [])
    assert.deepEqual((await call('mine')).body.items, [])
    assert.equal((await call('install', { templateId: catalogRecipes[0].templateId, version: catalogRecipes[0].version })).status, 409)
    assert.equal((await call('open', { presetId: updated.body.presetId })).status, 409)
    await assert.rejects(market.resolveBinding(opened.body.sessionId), /APPLICATION/)
    activeCredentials = { ...credentials, applications: ['erp', 'product_hub'].map(appId => ({ appId, tenantId: identity.tenantId, capabilities: [`${appId}.read`] })) }
    assert.deepEqual((await call('mine')).body.items[0].requiredApplications, ['erp', 'product_hub'])
    const systemRole = await call('install', { templateId: catalogRecipes[0].templateId, version: catalogRecipes[0].version })
    assert.equal(systemRole.status, 200)
    const systemSession = await call('open', { presetId: systemRole.body.presetId }); assert.equal(systemSession.status, 200)
    activeCredentials = { ...credentials, applications: [{ appId: 'erp', tenantId: identity.tenantId, capabilities: ['erp.read'] }] }
    assert.deepEqual((await call('mine')).body.items, [])
    await assert.rejects(market.resolveBinding(systemSession.body.sessionId), /APPLICATION/)
    assert.equal((await call('open', { presetId: systemRole.body.presetId })).status, 409)
    assert.equal((await call('uninstall', { presetId: systemRole.body.presetId })).status, 200)
    assert.equal(await readFile(project, 'utf8'), 'keep project and conversation history')
    activeCredentials = credentials
    catalogRecipes = []
    await assert.rejects(market.resolveBinding(opened.body.sessionId), /MARKET_UNSUPPORTED/)
    assert.equal((await call('open', { presetId: updated.body.presetId })).status, 409)
    assert.deepEqual((await call('mine')).body.items, [], 'a missing current recipe never resurrects an orphan installation')
    activeCredentials = { ...credentials, tenantId: 'other' }
    assert.equal((await call('mine')).status, 409)
  } finally { globalThis.fetch = originalFetch; await rm(temp, { recursive: true, force: true }) }
})
