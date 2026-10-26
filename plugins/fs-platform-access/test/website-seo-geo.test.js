import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WebsiteService } from '../lib/website.js'
import { mountAgents } from '../lib/agent-host.js'

const origin = 'https://dev.fsstory.net'
const agentId = '30000000-0000-4000-8000-000000000001'
const member = { environment: 'dev', tenantId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000001' }
const legacyVersion = 'b'.repeat(64), releaseVersion = 'c'.repeat(64)
const signal = new AbortController().signal
const identity = { ...member, agentId, version: legacyVersion, releaseVersion, accessToken: 'fixture-host-only', signal }
const requestId = '40000000-0000-4000-8000-000000000001'
// These names are the thirteen additions in Platform's exact bridge allowlist.
// Their schemas deliberately remain remote data, not a client implementation.
const additions = [
  'website_content_contract', 'website_content_manifest', 'website_content_read',
  'website_reference_observation_get', 'website_requirement_demo_bindings_list',
  'website_requirement_comparison_drafts_list', 'website_requirement_comparison_draft_get',
  'website_requirement_comparisons_list', 'website_requirement_comparison_get',
  'website_requirement_comparison_begin', 'website_requirement_comparison_items_save',
  'website_requirement_comparison_finalize', 'website_requirement_comparison_review',
]
const envelope = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] })

test('published Website bridge consumes current content, observation and comparison schemas without fixing the method in the client', async () => {
  const tools = additions.map((name, index) => ({ name, inputSchema: { type: 'object', properties: { remoteRevision: { const: index } }, required: ['remoteRevision'], additionalProperties: false } }))
  const calls = []
  const service = new WebsiteService(origin, async () => identity, async (url, init) => {
    calls.push({ url: new URL(url), body: init.body && JSON.parse(init.body) })
    if (init.method === 'GET') return Response.json({ mode: 'connected', agentVersion: legacyVersion, tools })
    return Response.json(envelope({ accepted: JSON.parse(init.body).arguments }))
  })
  assert.deepEqual((await service.tools('published-session')).tools, tools)
  for (const [remoteRevision, name] of additions.entries()) {
    const arguments_ = { remoteRevision, ...(remoteRevision >= 9 ? { requestId, revision: 7 } : {}) }
    assert.deepEqual(await service.call('published-session', { name, arguments: arguments_ }), envelope({ accepted: arguments_ }))
  }
  assert.equal(calls[0].url.searchParams.get('agentReleaseVersion'), releaseVersion)
  for (const { body } of calls.slice(1)) {
    assert.equal(body.agentVersion, legacyVersion)
    assert.equal(body.agentReleaseVersion, releaseVersion)
  }
})

test('seoGeo readiness, evidence requirements and recordsReady=false remain exactly as the live capabilities report', async () => {
  const capabilities = { seoGeo: { version: '1.0.0', executionMode: 'agent-guided', automatedAuditReady: false, geoMeasurementReady: false, procedure: { steps: ['live remote instruction'] }, evidence: { responseHeaders: 'unmeasured', indexInclusion: 'unmeasured', aiCitations: 'unmeasured' } }, requirements: { recordsReady: false } }
  const service = new WebsiteService(origin, async () => identity, async () => Response.json(envelope(capabilities)))
  assert.deepEqual(await service.call('published-session', { name: 'website_capabilities', arguments: {} }), envelope(capabilities))
  const legacy = new WebsiteService(origin, async () => identity, async () => Response.json(envelope({ requirements: {} })))
  assert.deepEqual(await legacy.call('published-session', { name: 'website_capabilities', arguments: {} }), envelope({ requirements: {} }))
})

test('missing remote tools and unsupported readiness fail closed without inventing capabilities or retrying', async () => {
  let calls = 0
  const service = new WebsiteService(origin, async () => identity, async (_url, init) => {
    calls++
    if (init.method === 'GET') return Response.json({ mode: 'connected', agentVersion: legacyVersion, tools: [] })
    return Response.json({ detail: 'WEBSITE_FEATURE_UNAVAILABLE' }, { status: 409 })
  })
  assert.deepEqual((await service.tools('published-session')).tools, [])
  await assert.rejects(service.call('published-session', { name: 'website_content_read', arguments: {} }), /WEBSITE_REQUEST_DENIED: 409/)
  assert.equal(calls, 2)
  const rejected = envelope({ code: 'RECORDS_NOT_READY', recordsReady: false }); rejected.isError = true
  const notReady = new WebsiteService(origin, async () => identity, async () => Response.json(rejected))
  assert.deepEqual(await notReady.call('published-session', { name: 'website_requirement_comparison_begin', arguments: { requestId, revision: 7 } }), rejected)
})

test('server version races preserve the exact AGENT_VERSION_CHANGED code so old unbound clients can handle it', async () => {
  let calls = 0
  const service = new WebsiteService(origin, async () => ({ ...identity, releaseVersion: undefined }), async () => {
    calls++
    return Response.json({ detail: 'AGENT_VERSION_CHANGED' }, { status: 409 })
  })
  await assert.rejects(service.call('legacy-session', { name: 'website_content_read', arguments: {} }), { message: 'AGENT_VERSION_CHANGED' })
  assert.equal(calls, 1)
})

test('arbitrary denial payloads cannot become trusted errors or leak backend content', async () => {
  for (const [status, detail] of [[403, 'AGENT_VERSION_CHANGED'], [409, 'AGENT_VERSION_CHANGED fixture-host-only'], [500, { message: 'fixture-host-only' }]]) {
    const service = new WebsiteService(origin, async () => identity, async () => Response.json({ detail }, { status }))
    await assert.rejects(service.call('published-session', { name: 'website_content_read', arguments: {} }), { message: 'WEBSITE_REQUEST_DENIED: ' + status })
  }
})

test('malformed, oversized and interrupted conflict bodies cannot be accepted as a version change', async () => {
  const candidates = [
    () => new Response('not JSON fixture-host-only', { status: 409 }),
    () => Response.json([{ detail: 'AGENT_VERSION_CHANGED' }], { status: 409 }),
    () => Response.json({ detail: { code: 'AGENT_VERSION_CHANGED' } }, { status: 409 }),
    () => Response.json({ detail: 'AGENT_VERSION_CHANGED', padding: 'x'.repeat(8192) }, { status: 409 }),
    () => new Response(new ReadableStream({ start(controller) { controller.error(Error('fixture-host-only')) } }), { status: 409 }),
  ]
  for (const response of candidates) {
    const service = new WebsiteService(origin, async () => identity, async () => response())
    await assert.rejects(service.call('published-session', { name: 'website_content_read', arguments: {} }), { message: 'WEBSITE_REQUEST_DENIED: 409' })
  }
})

test('a stalled conflict body is cancelled when its request times out without trusting a partial error', async t => {
  const timeout = new AbortController(); t.mock.method(AbortSignal, 'timeout', () => timeout.signal)
  let cancelled = false
  const service = new WebsiteService(origin, async () => identity, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"detail":"AGENT_VERSION_CHANGED"')) },
    cancel() { cancelled = true },
  }), { status: 409 }))
  const pending = service.call('published-session', { name: 'website_content_read', arguments: {} })
  setImmediate(() => timeout.abort(new DOMException('simulated timeout', 'TimeoutError')))
  await assert.rejects(pending, { message: 'WEBSITE_REQUEST_DENIED: 409' })
  assert.equal(cancelled, true)
})

test('ambiguous writes retain the original operation and revision and query that request instead of retrying', async () => {
  const received = []
  const service = new WebsiteService(origin, async () => identity, async (_url, init) => {
    const body = JSON.parse(init.body); received.push(body)
    if (body.name === 'website_requirement_comparison_items_save') throw new DOMException('simulated transport timeout', 'TimeoutError')
    return Response.json(envelope({ requestId: body.arguments.requestId, state: 'committed', revision: 8 }))
  })
  const arguments_ = { requestId, revision: 7, comparisonId: 'existing-comparison', items: [] }
  await assert.rejects(service.call('published-session', { name: 'website_requirement_comparison_items_save', arguments: arguments_ }), /WEBSITE_RESULT_UNCONFIRMED/)
  assert.equal(received.length, 1)
  assert.deepEqual(received[0].arguments, arguments_)
  assert.deepEqual(await service.call('published-session', { name: 'website_requirement_operation_get', arguments: { requestId } }), envelope({ requestId, state: 'committed', revision: 8 }))
  assert.equal(received.filter(item => item.name === 'website_requirement_comparison_items_save').length, 1)
})

function release(text, contentVersion) {
  const snapshot = { agentId, name: 'Website fixture', description: '', version: createHash('sha256').update(text).digest('hex'), legacyVersion: contentVersion, modelPolicy: { primaryModelId: member.tenantId, fallbackModelId: null }, businessSystems: ['web'], files: [{ path: 'skills/website-design/SKILL.md', content: text }] }
  const raw = Buffer.from(JSON.stringify({ contractVersion: '2.0.0', snapshot, notes: '', requirements: { minClientVersion: '3.3.0', capabilities: ['core.chat'] } }))
  return { snapshot, raw, version: createHash('sha256').update(raw).digest('hex') }
}

async function boundFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fs-website-seogeo-')); t.after(() => rm(root, { recursive: true, force: true }))
  const old = release('old website skill', legacyVersion), current = release('current website skill', 'e'.repeat(64))
  const credentials = { ...member, accessToken: 'fixture-host-only', signal, applications: [{ appId: 'web', tenantId: member.tenantId, capabilities: ['web.manage'] }] }
  let authority = credentials, snapshot = old.snapshot, cwd
  const network = []
  const fetcher = async (url, init) => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/snapshot')) {
      const modern = parsed.searchParams.get('contractVersion') === '1.1.0'
      const legacy = { ...snapshot, version: snapshot.legacyVersion }; delete legacy.legacyVersion; delete legacy.modelPolicy
      return Response.json({ contractVersion: modern ? '1.1.0' : '1.0.0', activeTenantId: member.tenantId, snapshot: modern ? snapshot : legacy })
    }
    if (parsed.pathname.includes('/releases/')) return new Response(parsed.pathname.endsWith(old.version) ? old.raw : current.raw)
    network.push({ url: parsed, body: init.body && JSON.parse(init.body) })
    const selected = parsed.searchParams.get('agentReleaseVersion') || (init.body && JSON.parse(init.body).agentReleaseVersion)
    return Response.json(init.method === 'GET' ? { mode: 'connected', agentVersion: selected === old.version ? legacyVersion : current.snapshot.legacyVersion, tools: [] } : envelope({ ok: true }))
  }
  const context = { effect: fn => fn(), webServer: { register() {} }, get: name => name === 'sessions' ? { get: () => ({ header: { cwd } }) } : undefined }
  const makeHost = () => mountAgents(context, origin, member, root, async () => authority, fetcher)
  let host = makeHost()
  const service = new WebsiteService(origin, async (sessionId, tool) => ({ ...authority, ...await host.authorizeBusiness(sessionId, 'web', tool) }), fetcher)
  return { root, old, current, service, network, get host() { return host }, credentials,
    authority: value => { authority = value }, snapshot: value => { snapshot = value }, cwd: value => { cwd = value }, restore: () => { host = makeHost() } }
}

test('installing new website content and restoring the Host keeps old published sessions and their projects on the old package', async t => {
  const f = await boundFixture(t)
  await f.host.installations.install(agentId, f.old.version, f.old.raw, signal)
  const oldWorkspace = await f.host.installations.runtime(f.old.version).workspacePath(agentId)
  await writeFile(path.join(oldWorkspace, 'member-project.txt'), 'existing member project')
  f.cwd(oldWorkspace); await f.host.resolveBinding('old-published')
  await f.host.installations.install(agentId, f.current.version, f.current.raw, signal)
  f.snapshot(f.current.snapshot); f.restore()
  assert.equal((await f.host.resolveBinding('old-published')).releaseVersion, f.old.version)
  await f.service.tools('old-published')
  await f.service.call('old-published', { name: 'website_content_read', arguments: {} })
  assert.equal(f.network[0].url.searchParams.get('agentReleaseVersion'), f.old.version)
  assert.equal(f.network[1].body.agentReleaseVersion, f.old.version)
  assert.equal(f.network[1].body.agentVersion, legacyVersion)
  assert.equal(await readFile(path.join(oldWorkspace, 'member-project.txt'), 'utf8'), 'existing member project')
  f.cwd(await f.host.installations.runtime(f.current.version).workspacePath(agentId))
  const fresh = await f.host.resolveBinding('new-published')
  assert.equal(fresh.releaseVersion, f.current.version)
  assert.equal(fresh.version, f.current.snapshot.legacyVersion)
  await f.service.tools('new-published')
  assert.equal(f.network[2].url.searchParams.get('agentReleaseVersion'), f.current.version)
})

test('unbound legacy sessions reject a changed draft explicitly while retaining the saved binding and project', async t => {
  const f = await boundFixture(t)
  const directory = await f.host.store.materialize(f.old.snapshot, signal)
  f.cwd(path.join(directory, 'workspace')); await f.host.resolveBinding('legacy-session')
  f.snapshot(f.current.snapshot); f.restore()
  await assert.rejects(f.service.tools('legacy-session'), /AGENT_VERSION_CHANGED/)
  assert.equal((await f.host.store.binding('legacy-session')).version, legacyVersion)
  assert.equal(f.network.length, 0)
})

test('current member revocation and foreign subject authority stop old published sessions before a Website operation', async t => {
  const f = await boundFixture(t)
  await f.host.installations.install(agentId, f.old.version, f.old.raw, signal)
  f.cwd(await f.host.installations.runtime(f.old.version).workspacePath(agentId)); await f.host.resolveBinding('published-session')
  f.authority({ ...f.credentials, applications: [] })
  await assert.rejects(f.service.tools('published-session'), /AGENT_APPLICATION_REQUIRED/)
  f.authority({ ...f.credentials, tenantId: '50000000-0000-4000-8000-000000000001' })
  await assert.rejects(f.service.tools('published-session'), /AGENT_IDENTITY_MISMATCH/)
  assert.equal(f.network.length, 0)
  assert.equal((await f.host.store.binding('published-session')).releaseVersion, f.old.version)
})
