import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AgentInstallationStore } from '../lib/agent-distribution.js'
import { mountAgentDistribution } from '../lib/agent-distribution-host.js'

const tenantId = '10000000-0000-4000-8000-000000000001', userId = '20000000-0000-4000-8000-000000000001'
const identity = { environment: 'dev', tenantId, userId }
const signal = new AbortController().signal
function release(number = 1) {
  const agentId = `30000000-0000-4000-8000-${String(number).padStart(12, '0')}`
  const raw = Buffer.from(JSON.stringify({ contractVersion: '2.0.0', notes: `ERP ${number}`,
    requirements: { minClientVersion: '3.3.0', capabilities: ['core.chat'] }, snapshot: {
      agentId, name: 'ERP 助理', description: 'Read inventory', version: 'a'.repeat(64), legacyVersion: 'b'.repeat(64),
      modelPolicy: { primaryModelId: tenantId, fallbackModelId: null }, businessSystems: ['erp'], files: [{ path: 'soul.md', content: 'private fixture prompt' }],
    } }))
  const version = createHash('sha256').update(raw).digest('hex')
  return { agentId, raw, version, card: { agentId, name: 'ERP 助理', description: 'Read inventory', version, sha256: version,
    bytes: raw.length, notes: '', requirements: { minClientVersion: '3.3.0', capabilities: ['core.chat'] }, available: true, unavailableReason: null, publishedAt: null } }
}
async function fixture(t, releases = [release()]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fs-release-metadata-')); t.after(() => rm(root, { recursive: true, force: true }))
  const store = new AgentInstallationStore(root, identity), routes = [], counters = { catalog: 0, downloads: 0, inFlight: 0, peak: 0 }
  let cards = releases.map(item => item.card)
  const fetcher = async url => {
    const pathname = new URL(url).pathname
    if (pathname === '/desktop/v1/agent-distribution') { counters.catalog++; return Response.json({ contractVersion: '2.0.0', activeTenantId: tenantId, items: cards }) }
    counters.downloads++; counters.inFlight++; counters.peak = Math.max(counters.peak, counters.inFlight)
    await new Promise(resolve => setTimeout(resolve, 5)); counters.inFlight--
    const item = releases.find(value => pathname.endsWith('/' + value.version))
    return item ? new Response(item.raw) : new Response('', { status: 404 })
  }
  const mounted = mountAgentDistribution({ effect: fn => fn(), webServer: { register: route => { routes.push(route); return () => {} } }, get: () => undefined },
    'https://dev.fsstory.net', store, async () => ({ ...identity, accessToken: 'host-only-fixture', signal, applications: [{ appId: 'erp', tenantId, capabilities: ['erp.read'] }] }), fetcher)
  return { store, mounted, counters, setCards: value => { cards = value } }
}
test('published ERP classification comes from an immutable package and cached metadata never caches authorization', async t => {
  const item = release(), { store, mounted, counters, setCards } = await fixture(t, [item])
  let snapshot = await mounted.snapshot()
  assert.deepEqual(snapshot.items[0].businessSystems, ['erp'])
  assert.equal(snapshot.items[0].classificationKnown, true)
  assert.equal(await store.state(item.agentId), undefined, 'reading metadata must not install a package')
  assert.equal(counters.downloads, 1)
  await mounted.snapshot()
  assert.equal(counters.catalog, 2); assert.equal(counters.downloads, 1)
  setCards([{ ...item.card, available: false, unavailableReason: '平台已停用' }])
  snapshot = await mounted.snapshot()
  assert.equal(snapshot.items[0].available, false); assert.equal(snapshot.items[0].unavailableReason, '平台已停用')
  await store.install(item.agentId, item.version, item.raw, signal)
  setCards([])
  snapshot = await mounted.snapshot()
  assert.equal(counters.catalog, 4, 'the current server-authorized catalog is read every time')
  assert.equal(counters.downloads, 1)
  assert.deepEqual(snapshot.items, [], 'a revoked or retired release must not be resurrected from a retained installation')
  assert.equal((await store.state(item.agentId)).enabled, true, 'hiding authorization does not disable or delete the installation')
  assert.equal((await store.read(item.agentId, item.version)).snapshot.files[0].content, 'private fixture prompt', 'historical material stays intact')
  assert.doesNotMatch(JSON.stringify(snapshot), /private fixture prompt|host-only-fixture/)
})
test('retained release metadata is reused and a size mismatch never becomes a general category', async t => {
  const item = release(), { store, mounted, counters, setCards } = await fixture(t, [item])
  await store.install(item.agentId, item.version, item.raw, signal)
  let snapshot = await mounted.snapshot()
  assert.equal(counters.downloads, 0)
  assert.deepEqual(snapshot.items[0].businessSystems, ['erp'])
  setCards([{ ...item.card, bytes: item.raw.length + 1 }])
  snapshot = await mounted.snapshot()
  assert.equal(snapshot.items[0].classificationKnown, false)
  assert.equal(snapshot.items[0].businessSystems, undefined)
  assert.equal(snapshot.items[0].available, false)
  assert.match(snapshot.items[0].unavailableReason, /分类信息暂不可用/)
  assert.equal(snapshot.items[0].installedVersion, item.version)
})
test('metadata downloads use at most four concurrent read-only package requests', async t => {
  const releases = Array.from({ length: 7 }, (_, index) => release(index + 1))
  const { mounted, counters } = await fixture(t, releases)
  const snapshot = await mounted.snapshot()
  assert.equal(snapshot.items.length, 7)
  assert.ok(snapshot.items.every(item => item.classificationKnown && item.businessSystems.includes('erp')))
  assert.ok(counters.peak > 1 && counters.peak <= 4)
})
