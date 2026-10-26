import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/client/published-talents.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'cjs', write: false })
const container = { exports: {} }
new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(container, container.exports, createRequire(import.meta.url))
const { loadPublishedTalents, mutatePublishedTalent, PublishedCapabilityConfirmation } = container.exports
const id = '10000000-0000-4000-8000-000000000001', first = 'a'.repeat(64), second = 'b'.repeat(64)
const card = overrides => ({ agentId: id, name: '发布助手', description: 'Versioned local assistant', version: second, sha256: second,
  bytes: 1024, notes: '', available: true, unavailableReason: null, publishedAt: null,
  requirements: { minClientVersion: '3.3.0', capabilities: ['core.chat'] }, installedVersion: first, versions: [first, second], updateAvailable: true, ...overrides })

test('published catalog validates identities, versions, bounded fields and unavailable retained installs', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/_futurestaff/agents/distribution'); assert.equal(options.headers['x-futurestaff-agent'], '1')
    return Response.json({ items: [card({ bytes: 0, available: false, unavailableReason: '授权已撤销', updateAvailable: false })] })
  })
  const items = await loadPublishedTalents(new AbortController().signal)
  assert.equal(items.length, 1); assert.equal(items[0].installedVersion, first); assert.equal(items[0].available, false)
  for (const invalid of [card({ agentId: 'not-a-uuid' }), card({ sha256: first }), card({ versions: [first, first] }), card({ bytes: 0 }), card({ requirements: { minClientVersion: '3.3.0', capabilities: ['unsafe payload'] } })]) {
    globalThis.fetch.mock.mockImplementation(async () => Response.json({ items: [invalid] }))
    await assert.rejects(loadPublishedTalents(new AbortController().signal), /目录格式不兼容/)
  }
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ items: [card({}), card({})] }))
  await assert.rejects(loadPublishedTalents(new AbortController().signal), /目录格式不兼容/)
})
test('published capability confirmation does not activate or notify until explicit retry succeeds', async t => {
  const previous = globalThis.window, events = new EventTarget(), calls = []
  globalThis.window = events; t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous })
  let notifications = 0; events.addEventListener('futurestaff:installed-talents-changed', () => notifications++)
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) })
    return options.body.includes('confirmCapabilities') ? Response.json({ ok: true })
      : Response.json({ error: 'AGENT_PERMISSION_CONFIRMATION_REQUIRED', capabilities: ['core.chat', 'local.files'] }, { status: 409 })
  })
  const signal = new AbortController().signal
  await assert.rejects(mutatePublishedTalent('install', card({}), signal), error => error instanceof PublishedCapabilityConfirmation && error.capabilities.includes('local.files'))
  assert.equal(notifications, 0)
  await mutatePublishedTalent('install', card({}), signal, second, true)
  assert.deepEqual(calls.at(-1), { url: '/_futurestaff/agents/install', body: { agentId: id, version: second, confirmCapabilities: true } })
  assert.equal(notifications, 1)
})
test('rollback uses a retained version and uninstall only sends the published identity', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return Response.json({ ok: true }) })
  const signal = new AbortController().signal
  await mutatePublishedTalent('rollback', card({}), signal, first)
  await mutatePublishedTalent('uninstall', card({ available: false }), signal)
  assert.deepEqual(calls, [{ url: '/_futurestaff/agents/rollback', body: { agentId: id, version: first } }, { url: '/_futurestaff/agents/uninstall', body: { agentId: id } }])
  await assert.rejects(mutatePublishedTalent('rollback', card({}), signal, 'c'.repeat(64)), /目录格式不兼容/)
  assert.equal(calls.length, 2)
})
test('aborted operations neither issue new writes nor notify a replacement account', async t => {
  const previous = globalThis.window, events = new EventTarget(), abort = new AbortController()
  globalThis.window = events; t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous })
  let notifications = 0, writes = 0; events.addEventListener('futurestaff:installed-talents-changed', () => notifications++)
  t.mock.method(globalThis, 'fetch', async () => { writes++; abort.abort(); return Response.json({ ok: true }) })
  await assert.rejects(mutatePublishedTalent('install', card({}), abort.signal))
  await assert.rejects(mutatePublishedTalent('uninstall', card({}), abort.signal))
  assert.equal(writes, 1); assert.equal(notifications, 0)
})
test('published failures expose only stable messages and never raw provider or local details', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'PRIVATE_PATH_OR_TOKEN', details: 'private-secret' }, { status: 409 }))
  await assert.rejects(mutatePublishedTalent('install', card({}), new AbortController().signal), error => !/PRIVATE|private-secret/.test(error.message))
  globalThis.fetch.mock.mockImplementation(async () => { throw Error('private transport details and user path') })
  await assert.rejects(mutatePublishedTalent('install', card({}), new AbortController().signal), error => !/private/.test(error.message))
})
