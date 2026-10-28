import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mountClientDiagnostics } from '../lib/client/diagnostics.js'
import * as requests from '../lib/client/diagnostics-request.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
function collect(t, mount = mountClientDiagnostics) {
  const reports = [], cleanups = []
  mount({ effect(fn) { cleanups.push(fn()) }, get() {} }, {
    window: new EventTarget(),
    fetch: async (url, init) => { reports.push({ url, payload: JSON.parse(init.body) }); return new Response('{}', { status: 202 }) },
  })
  t.after(() => { for (const cleanup of cleanups.reverse()) cleanup?.() })
  return reports
}

test('request wrapper preserves successful responses and forwards the original request unchanged', async t => {
  const reports = collect(t), response = new Response('{"items":[]}'), input = new Request('https://private.example/list?token=secret')
  const init = { method: 'POST', body: 'private body' }
  const result = await requests.diagnosticFetch(input, init, { operation: 'discovery', fetcher: async (actualInput, actualInit) => {
    assert.equal(actualInput, input); assert.equal(actualInit, init); return response
  } })
  assert.equal(result, response)
  assert.equal(response.bodyUsed, false)
  assert.deepEqual(await requests.diagnosticJson(response), { items: [] })
  await tick()
  assert.equal(reports.length, 0)
})

const require = createRequire(import.meta.url), { build } = require('esbuild')
const compiled = await build({ stdin: { contents: `export {mountClientDiagnostics} from './diagnostics.ts'; export {loadInstalledTalents} from './installed-talents.ts'; export {loadPublishedTalents,mutatePublishedTalent,PublishedCapabilityConfirmation} from './published-talents.ts'; export {loadCurrentSnapshotTalents} from './current-snapshot-talents.ts';`, resolveDir: fileURLToPath(new URL('../src/client/', import.meta.url)), sourcefile: 'diagnostic-helper-probe.ts', loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false })
const helpers = { exports: {} }
new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(helpers, helpers.exports, require)

test('all three owned talent discovery helpers report caught network failures without response content', async t => {
  const reports = collect(t, helpers.exports.mountClientDiagnostics)
  t.mock.method(globalThis, 'fetch', async () => { throw Error('private request URL and body') })
  for (const load of [helpers.exports.loadInstalledTalents, helpers.exports.loadPublishedTalents, helpers.exports.loadCurrentSnapshotTalents]) await assert.rejects(load(new AbortController().signal))
  await tick()
  assert.deepEqual(reports.map(report => report.payload.code), ['NETWORK_ERROR', 'NETWORK_ERROR', 'NETWORK_ERROR'])
  assert.doesNotMatch(JSON.stringify(reports), /private|URL|body/)
})

test('the current-snapshot compatibility fallback does not become an error report', async t => {
  const reports = collect(t, helpers.exports.mountClientDiagnostics)
  t.mock.method(globalThis, 'fetch', async () => new Response('not a JSON response', { status: 404 }))
  assert.deepEqual(await helpers.exports.loadCurrentSnapshotTalents(new AbortController().signal), [])
  await tick()
  assert.equal(reports.length, 0)
})

test('business capability confirmation stays silent while a real published conflict reports once', async t => {
  const reports = collect(t, helpers.exports.mountClientDiagnostics)
  const signal = new AbortController().signal, version = 'a'.repeat(64), card = { agentId: '10000000-0000-4000-8000-000000000001', version, available: true }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'AGENT_PERMISSION_CONFIRMATION_REQUIRED', capabilities: ['local.files'] }, { status: 409 }))
  await assert.rejects(helpers.exports.mutatePublishedTalent('install', card, signal), error => error instanceof helpers.exports.PublishedCapabilityConfirmation)
  await tick()
  assert.equal(reports.length, 0)
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ error: 'AGENT_RELEASE_CHANGED' }, { status: 409 }))
  await assert.rejects(helpers.exports.mutatePublishedTalent('install', card, signal), /平台版本已更新/)
  await tick()
  assert.equal(reports.length, 1)
  assert.deepEqual(reports[0].payload, { category: 'network', operation: 'discovery', severity: 'error', code: 'HTTP_ERROR', httpStatus: 409 })
})

test('invalid JSON in each owned catalog is collected while existing rejection behavior remains', async t => {
  const reports = collect(t, helpers.exports.mountClientDiagnostics)
  t.mock.method(globalThis, 'fetch', async () => new Response('private malformed document'))
  for (const load of [helpers.exports.loadInstalledTalents, helpers.exports.loadPublishedTalents, helpers.exports.loadCurrentSnapshotTalents]) await assert.rejects(load(new AbortController().signal))
  await tick()
  assert.deepEqual(reports.map(report => report.payload.code), ['CONTRACT_MISMATCH', 'CONTRACT_MISMATCH', 'CONTRACT_MISMATCH'])
  assert.doesNotMatch(JSON.stringify(reports), /private|malformed|document/)
})

test('network failure is rethrown unchanged and only a fixed diagnostic is reported', async t => {
  const reports = collect(t), error = new Error('secret URL https://private.example/?token=abc and private body')
  await assert.rejects(requests.diagnosticFetch('https://private.example/?token=abc', { body: 'private request body' }, {
    operation: 'system', fetcher: async () => { throw error },
  }), actual => actual === error)
  await tick()
  assert.deepEqual(reports, [{ url: '/_futurestaff/platform-dev/diagnostics', payload: { category: 'network', operation: 'system', severity: 'error', code: 'NETWORK_ERROR' } }])
  assert.doesNotMatch(JSON.stringify(reports), /secret|private|token|body|message|stack/)
})

test('HTTP failures preserve the response and report status without reading its body', async t => {
  const reports = collect(t), response = new Response('private response content', { status: 503 })
  assert.equal(await requests.diagnosticFetch('/owned-path', undefined, { fetcher: async () => response }), response)
  assert.equal(response.bodyUsed, false)
  await tick()
  assert.deepEqual(reports[0].payload, { category: 'network', operation: 'discovery', severity: 'error', code: 'HTTP_ERROR', httpStatus: 503 })
  assert.doesNotMatch(JSON.stringify(reports), /owned-path|private|content/)
})

test('an explicitly compatible 404 remains silent while other HTTP failures still report', async t => {
  const reports = collect(t), olderHost = new Response('not present', { status: 404 })
  assert.equal(await requests.diagnosticFetch('/current-snapshots', undefined, { ignoreStatuses: [404], fetcher: async () => olderHost }), olderHost)
  assert.equal(olderHost.bodyUsed, false)
  await requests.diagnosticFetch('/current-snapshots', undefined, { ignoreStatuses: [404], fetcher: async () => new Response('{}', { status: 500 }) })
  await tick()
  assert.equal(reports.length, 1)
  assert.equal(reports[0].payload.httpStatus, 500)
})

test('normal cancellation is never a network or JSON diagnostic', async t => {
  const reports = collect(t), controller = new AbortController(), cancelled = new Error('private cancellation reason')
  controller.abort(cancelled)
  for (const [init, failure] of [[undefined, new DOMException('private', 'AbortError')], [{ signal: controller.signal }, cancelled]]) {
    await assert.rejects(requests.diagnosticFetch('/owned', init, { fetcher: async () => { throw failure } }), error => error === failure)
  }
  const abort = new DOMException('private body read', 'AbortError')
  await assert.rejects(requests.diagnosticJson({ ok: true, json: async () => { throw abort } }), error => error === abort)
  await tick()
  assert.equal(reports.length, 0)
})

test('JSON parse failures report a fixed contract error once and rethrow the same error', async t => {
  const reports = collect(t), syntax = new SyntaxError('private document content')
  await assert.rejects(requests.diagnosticJson({ ok: true, json: async () => { throw syntax } }, 'system'), error => error === syntax)
  await assert.rejects(requests.diagnosticJson({ ok: false, json: async () => { throw syntax } }), error => error === syntax)
  await tick()
  assert.deepEqual(reports.map(report => report.payload), [{ category: 'network', operation: 'system', severity: 'error', code: 'CONTRACT_MISMATCH' }])
  assert.doesNotMatch(JSON.stringify(reports), /private|document|message|stack/)
})
