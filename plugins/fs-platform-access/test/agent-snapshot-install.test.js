import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, readFile, writeFile, rm, access, mkdir, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

// Source fixture avoids racing another agent's shared lib build.
const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/agent-host.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false })
const fixture = await mkdtemp(path.join(os.tmpdir(), 'fs-snapshot-module-'))
const modulePath = path.join(fixture, 'host.mjs')
await writeFile(modulePath, compiled.outputFiles[0].contents)
const { mountAgents } = await import(pathToFileURL(modulePath).href)
test.after(() => rm(fixture, { recursive: true, force: true }))

const identity = { environment: 'production', tenantId: '40000000-0000-4000-8000-000000000001', userId: '50000000-0000-4000-8000-000000000001' }
const agentId = '30000000-0000-4000-8000-000000000001'
const primaryModelId = '10000000-0000-4000-8000-000000000001'
const old = { agentId, name: 'SHOP', description: 'Current member SHOP assistant', version: 'a'.repeat(64), files: [{ path: 'soul.md', content: 'historical soul' }, { path: 'skills/shop/SKILL.md', content: 'historical skill' }], businessSystems: ['shop'] }
const modern = { ...old, version: 'c'.repeat(64), legacyVersion: 'b'.repeat(64), modelPolicy: { primaryModelId, fallbackModelId: null }, files: [{ path: 'soul.md', content: 'current soul' }, { path: 'skills/shop/SKILL.md', content: 'current skill' }] }

async function bench(t) {
 const root = await mkdtemp(path.join(os.tmpdir(), 'fs-current-snapshot-'))
 t.after(() => rm(root, { recursive: true, force: true }))
 const routes = new Map(), sessions = new Map(), registry = []
 const control = new AbortController()
 const state = { current: modern, listed: true, allowed: true, foreign: false }
 const host = mountAgents({ effect: run => run(), webServer: { register: route => { routes.set(route.path, route.handler); return () => {} } }, get: name => name === 'sessions' ? { get: id => sessions.get(id) } : name === 'workspaceRegistry' ? { create: async (directory, title) => { registry.push({ directory, title }); return { id: directory, path: directory } } } : undefined }, 'https://platform.fsstory.net', identity, root,
  async () => ({ ...identity, ...(state.foreign ? { userId: '50000000-0000-4000-8000-000000000002' } : {}), accessToken: 'fixture-only', signal: control.signal, applications: state.allowed ? [{ appId: 'shop', tenantId: identity.tenantId, capabilities: ['shop.admin'] }] : [] }),
  async url => {
   await state.onFetch?.(String(url))
   const current = state.current, isModern = String(url).endsWith('?contractVersion=1.1.0')
   return Response.json({ contractVersion: isModern ? '1.1.0' : '1.0.0', activeTenantId: identity.tenantId,
    ...(String(url).includes('/snapshot') ? { snapshot: isModern ? current : { ...old, version: current.legacyVersion, files: current.files } } : { items: state.listed ? [{ agentId, name: old.name, description: old.description, available: true, unavailableReason: null }] : [] }) })
  })
 const request = async (route, body, overrides = {}) => {
  const handler = routes.get('/_futurestaff/agents/' + route)
  assert.ok(handler, 'normal snapshot lifecycle route is mounted: ' + route)
  const req = Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), { method: body === undefined ? 'GET' : 'POST', headers: { 'x-futurestaff-agent': '1', host: '127.0.0.1:9123' }, socket: { remoteAddress: '127.0.0.1' }, ...overrides })
  let text = ''; const response = { statusCode: 0, setHeader() {}, end(value) { text += value } }
  await handler(req, response)
  return { status: response.statusCode, body: JSON.parse(text) }
 }
 return { root, host, sessions, state, request, registry, control }
}

test('current SHOP installs into a fresh version namespace and old files/bindings remain byte-identical', async t => {
 const b = await bench(t), signal = b.control.signal
 const historical = await b.host.store.materialize(old, signal)
 b.sessions.set('old-session', { header: { cwd: path.join(historical, 'workspace') } })
 await b.host.resolveBinding('old-session')
 const bindingFile = path.join(b.root, 'agent-session-bindings', (await import('node:crypto')).createHash('sha256').update('old-session').digest('hex') + '.json')
 const oldBinding = await readFile(bindingFile), oldDefinition = await readFile(path.join(historical, 'definition', 'snapshot.json'))
 const oldSkill = path.join(historical, 'workspace', '.agents', 'skills', 'shop', 'SKILL.md')
 await writeFile(oldSkill, 'human edited historical skill')
 await assert.rejects(b.host.resolvePolicyBinding('old-session'), /AGENT_MODEL_VERSION_CHANGED/)
 const catalog = await b.request('current-snapshots')
 assert.equal(catalog.status, 200); assert.equal(catalog.body.items[0].installed, false)
 assert.equal(JSON.stringify(catalog.body).includes('current soul'), false)
 assert.equal((await b.request('install-snapshot', { agentId, version: modern.version })).status, 200)
 assert.equal((await b.request('current-snapshots')).body.items[0].installed, true)
 const opened = await b.request('open-snapshot', { agentId, version: modern.version })
 assert.equal(opened.status, 200)
 assert.equal(opened.body.path, path.join(b.root, 'agents', agentId, 'snapshots', modern.version, 'workspace'))
 b.sessions.set('new-session', { header: { cwd: opened.body.path } })
 const binding = await b.host.resolveBinding('new-session')
 assert.equal(binding.version, modern.legacyVersion); assert.equal(binding.modelVersion, modern.version); assert.equal(binding.snapshotVersion, modern.version)
 assert.equal(await b.host.workspacePath(binding), opened.body.path)
 const newBindingFile = path.join(b.root, 'agent-session-bindings', (await import('node:crypto')).createHash('sha256').update('new-session').digest('hex') + '.json')
 assert.equal(Object.hasOwn(JSON.parse(await readFile(newBindingFile, 'utf8')), 'snapshotVersion'), false, 'derived cwd marker is never persisted in the binding contract')
 assert.equal((await b.host.resolvePolicyBinding('new-session')).version, modern.version)
 assert.equal((await b.host.authorizeBusiness('new-session', 'shop')).version, modern.legacyVersion)
 await assert.rejects(b.host.authorizeBusiness('new-session', 'erp'), /AGENT_BUSINESS_SCOPE_DENIED/)
 assert.deepEqual(await readFile(bindingFile), oldBinding); assert.deepEqual(await readFile(path.join(historical, 'definition', 'snapshot.json')), oldDefinition)
 assert.equal(await readFile(oldSkill, 'utf8'), 'human edited historical skill')
 await assert.rejects(b.host.resolvePolicyBinding('old-session'), /AGENT_MODEL_VERSION_CHANGED/)
})

test('normal snapshot entry rejects stale versions, invisible agents, missing scope and foreign identity before install', async t => {
 const b = await bench(t), input = { agentId, version: modern.version }
 assert.equal((await b.request('open-snapshot', input)).status, 409, 'opening never silently installs')
 assert.equal((await b.request('install-snapshot', { ...input, version: 'd'.repeat(64) })).status, 409)
 assert.equal((await b.request('install-snapshot', { ...input, path: b.root })).status, 409)
 b.state.listed = false
 assert.equal((await b.request('current-snapshots')).body.items.length, 0)
 assert.equal((await b.request('install-snapshot', input)).status, 409)
 b.state.listed = true; b.state.allowed = false
 assert.equal((await b.request('current-snapshots')).body.items.length, 0)
 assert.equal((await b.request('install-snapshot', input)).status, 409)
 b.state.allowed = true; b.state.foreign = true
 assert.equal((await b.request('install-snapshot', input)).status, 409)
 b.state.foreign = false
 assert.equal((await b.request('install-snapshot', input, { headers: { 'x-futurestaff-agent': '1', host: '127.0.0.1:9123', origin: 'https://outside.invalid' } })).status, 403)
})

test('reopen preserves installed local files and a later policy/content change fails closed for the new session too', async t => {
 const b = await bench(t), input = { agentId, version: modern.version }
 await b.request('install-snapshot', input)
 const first = await b.request('open-snapshot', input)
 const skill = path.join(first.body.path, '.agents', 'skills', 'shop', 'SKILL.md')
 await writeFile(skill, 'human private note')
 assert.equal((await b.request('install-snapshot', input)).status, 200)
 assert.equal(await readFile(skill, 'utf8'), 'human private note', 'idempotent install never reconciles existing user files')
 b.sessions.set('new-session', { header: { cwd: first.body.path } })
 await b.host.resolvePolicyBinding('new-session')
 b.state.current = { ...modern, version: 'e'.repeat(64), legacyVersion: 'f'.repeat(64) }
 await assert.rejects(b.host.resolvePolicyBinding('new-session'), /AGENT_MODEL_VERSION_CHANGED/)
 await assert.rejects(b.host.authorizeBusiness('new-session', 'shop'), /AGENT_VERSION_CHANGED/)
 assert.equal((await b.request('open-snapshot', input)).status, 409)
 assert.equal((await b.request('current-snapshots')).body.items[0].installed, false)
})

test('a server version change during installation cannot activate or open its isolated stale candidate', async t => {
 const b = await bench(t); let reads = 0
 b.state.onFetch = async url => { if (url.endsWith('?contractVersion=1.1.0') && ++reads === 2) b.state.current = { ...modern, version: 'd'.repeat(64) } }
 const result = await b.request('install-snapshot', { agentId, version: modern.version })
 assert.equal(result.status, 409); assert.equal(result.body.error, 'AGENT_SNAPSHOT_CHANGED')
 assert.equal(b.registry.length, 0)
 await assert.rejects(access(path.join(b.root, 'agents', agentId, 'snapshots', modern.version, 'definition', 'snapshot.json')), { code: 'ENOENT' }, 'failed version CAS must leave no published installation')
 assert.equal((await b.request('open-snapshot', { agentId, version: modern.version })).status, 409)
 const catalog = await b.request('current-snapshots')
 assert.equal(catalog.body.items[0].version, 'd'.repeat(64)); assert.equal(catalog.body.items[0].installed, false)
})

test('a concurrent original directory wins publication and an aborted install leaves no published files', async t => {
 const b = await bench(t); let reads = 0
 const target = path.join(b.root, 'agents', agentId, 'snapshots', modern.version), original = path.join(target, 'human-original.txt')
 b.state.onFetch = async url => { if (url.endsWith('?contractVersion=1.1.0') && ++reads === 2) { await mkdir(target, { recursive: true }); await writeFile(original, 'concurrent original') } }
 assert.equal((await b.request('install-snapshot', { agentId, version: modern.version })).status, 409)
 assert.equal(await readFile(original, 'utf8'), 'concurrent original')
 assert.deepEqual(await readdir(target), ['human-original.txt'], 'transaction must not add managed files to another writer\'s directory')
 const c = await bench(t); let currentReads = 0
 c.state.onFetch = async url => { if (url.endsWith('?contractVersion=1.1.0') && ++currentReads === 2) c.control.abort() }
 assert.equal((await c.request('install-snapshot', { agentId, version: modern.version })).status, 409)
 await assert.rejects(access(path.join(c.root, 'agents', agentId, 'snapshots', modern.version)), { code: 'ENOENT' })
})

test('a forged local definition cannot admit a new binding and missing/revoked model or scope fails closed', async t => {
 const b = await bench(t), input = { agentId, version: modern.version }
 await b.request('install-snapshot', input)
 const opened = await b.request('open-snapshot', input)
 const definition = path.join(path.dirname(opened.body.path), 'definition', 'snapshot.json')
 await writeFile(definition, JSON.stringify({ ...modern, files: [{ path: 'soul.md', content: 'not the authoritative definition' }] }))
 b.sessions.set('forged', { header: { cwd: opened.body.path } })
 await assert.rejects(b.host.resolveBinding('forged'), /AGENT_MODEL_VERSION_CHANGED/)
 const file = path.join(b.root, 'agent-session-bindings', (await import('node:crypto')).createHash('sha256').update('forged').digest('hex') + '.json')
 await assert.rejects(access(file), { code: 'ENOENT' }, 'rejected local material must not create a persistent binding')
 await writeFile(definition, JSON.stringify(modern))
 b.sessions.set('legitimate', { header: { cwd: opened.body.path } })
 await b.host.resolvePolicyBinding('legitimate')
 b.state.current = { ...modern, version: 'e'.repeat(64), modelPolicy: { ...modern.modelPolicy, primaryModelId: null } }
 assert.equal((await b.request('current-snapshots')).body.items.length, 0)
 assert.equal((await b.request('install-snapshot', { agentId, version: b.state.current.version })).status, 409)
 await assert.rejects(b.host.authorizeBusiness('legitimate', 'shop'), /AGENT_MODEL_VERSION_CHANGED/)
 b.state.current = modern; b.state.allowed = false
 await assert.rejects(b.host.authorizeBusiness('legitimate', 'shop'), /AGENT_APPLICATION_REQUIRED/)
 await assert.rejects(b.host.resolvePolicyBinding('legitimate'), /AGENT_APPLICATION_REQUIRED/)
})

test('same-member scope revocation without abort blocks install/open and a live model-policy read', async t => {
 const b = await bench(t), input = { agentId, version: modern.version }; let reads = 0
 b.state.onFetch = async url => { if (url.endsWith('?contractVersion=1.1.0') && ++reads === 2) b.state.allowed = false }
 assert.equal((await b.request('install-snapshot', input)).status, 409)
 await assert.rejects(access(path.join(b.root, 'agents', agentId, 'snapshots', modern.version)), { code: 'ENOENT' })
 const c = await bench(t); await c.request('install-snapshot', input); let openReads = 0
 c.state.onFetch = async url => { if (url.endsWith('?contractVersion=1.1.0') && ++openReads === 2) c.state.allowed = false }
 assert.equal((await c.request('open-snapshot', input)).status, 409)
 assert.equal(c.registry.length, 0, 'revocation must be detected before registering a native workspace')
 c.state.onFetch = undefined; c.state.allowed = true
 const opened = await c.request('open-snapshot', input); c.sessions.set('new', { header: { cwd: opened.body.path } }); await c.host.resolvePolicyBinding('new')
 c.state.onFetch = async url => { if (url.endsWith('?contractVersion=1.1.0')) c.state.allowed = false }
 await assert.rejects(c.host.resolvePolicyBinding('new'), /AGENT_APPLICATION_REQUIRED/)
})
