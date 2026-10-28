import assert from 'node:assert/strict'
import test from 'node:test'
import { mountClientDiagnostics, reportClientDiagnostic } from '../lib/client/diagnostics.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(fetcher = async () => new Response('{}', { status: 202 }), { initialOwner = { phase: 'ready', activeTenantId: 'tenant-a', user: { userId: 'user-a' } } } = {}) {
  const browser = new EventTarget(), cleanups = [], calls = []
  let slotError, connectionListener, identityListener, state = 'connected', owner = initialOwner
  const connection = { state: { getSnapshot: () => state, subscribe(listener) { connectionListener = listener; return () => { connectionListener = undefined } } } }
  const identity = { getSnapshot: () => owner, subscribe(listener) { identityListener = listener; return () => { identityListener = undefined } } }
  const ctx = {
    effect(fn) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) },
    get(name) { return name === 'connection' ? connection : name === 'platformClientSession' ? identity : undefined },
    slots: { onEntryError(listener) { slotError = listener; return () => { slotError = undefined } } },
  }
  mountClientDiagnostics(ctx, { window: browser, fetch: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return fetcher(url, init) } })
  return {
    calls, browser, slot: (...args) => slotError?.(...args),
    connection(next) { state = next; connectionListener?.() },
    owner(next) { owner = { phase: 'ready', ...next }; identityListener?.() },
    event(name, data) { const event = new Event(name); for (const [key, value] of Object.entries(data)) Object.defineProperty(event, key, { value }); browser.dispatchEvent(event) },
    dispose() { for (const cleanup of cleanups.reverse()) cleanup() },
    hasListeners: () => Boolean(slotError || connectionListener || identityListener),
  }
}

test('window and component errors send only fixed diagnostic fields to the guarded local route', async () => {
  const f = fixture()
  f.event('error', { error: new TypeError('private prompt'), message: 'private message', filename: 'C:/secret', lineno: 9 })
  f.event('unhandledrejection', { reason: new RangeError('private model output') })
  f.slot('arbitrary private slotKey', { component: 'private' }, new Error('secret token'), { abdicated: true })
  await tick()
  assert.deepEqual(f.calls.map(call => call.body.code), ['RENDERER_ERROR', 'RENDERER_UNHANDLED_REJECTION', 'RENDERER_COMPONENT_ERROR'])
  assert.deepEqual(f.calls.map(call => call.body.exceptionType), ['TypeError', 'RangeError', 'Error'])
  for (const { url, init, body } of f.calls) {
    assert.equal(url, '/_futurestaff/platform-dev/diagnostics')
    assert.equal(init.method, 'POST')
    assert.equal(init.headers['x-futurestaff-diagnostics'], '1')
    assert.deepEqual(Object.keys(body).sort(), ['category', 'code', 'exceptionType', 'operation', 'severity'])
    assert.doesNotMatch(init.body, /private|secret|prompt|output|slotKey|filename|message|stack/)
  }
  f.dispose()
})

test('one connection outage is reported once until a confirmed recovery', async () => {
  const f = fixture()
  f.connection('connecting'); f.connection('disconnected'); f.connection('connecting')
  await tick()
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].body.code, 'RENDERER_CONNECTION_LOST')
  f.connection('connected'); f.connection('disconnected')
  await tick()
  assert.equal(f.calls.length, 2)
  f.dispose()
})

test('owned request helpers share the bounded channel and arbitrary fields/codes are discarded', async () => {
  const f = fixture()
  assert.doesNotThrow(() => reportClientDiagnostic({ category: 'network', operation: 'discovery', code: 'HTTP_ERROR', httpStatus: 503, message: 'private response body', stack: 'private local path', toolName: 'secret' }))
  reportClientDiagnostic({ code: 'PRIVATE_TOKEN_IN_CODE', httpStatus: 900 })
  await tick()
  assert.equal(f.calls.length, 2)
  assert.deepEqual(f.calls[0].body, { category: 'network', operation: 'discovery', severity: 'error', code: 'HTTP_ERROR', httpStatus: 503 })
  assert.deepEqual(f.calls[1].body, { category: 'network', operation: 'unknown', severity: 'error', code: 'UNCLASSIFIED' })
  f.dispose()
  reportClientDiagnostic({ code: 'HTTP_ERROR' })
  await tick()
  assert.equal(f.calls.length, 2)
})

test('normal cancellation and hostile exception fields do not leak or break the client', async () => {
  const f = fixture()
  f.event('unhandledrejection', { reason: new DOMException('private', 'AbortError') })
  f.event('error', { error: new DOMException('private', 'AbortError') })
  await tick()
  assert.equal(f.calls.length, 0)
  const hostile = new Proxy({}, { get() { throw Error('private getter') } })
  f.event('unhandledrejection', { reason: hostile })
  await tick()
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].body.exceptionType, 'other')
  f.dispose()
})

test('report delivery failures do not recursively report and disposal cancels pending work', async () => {
  let signal
  const f = fixture(async (_url, init) => { signal = init.signal; throw Error('network secret') })
  f.event('error', { error: new Error('failure') })
  await tick()
  assert.equal(f.calls.length, 1)
  f.dispose()
  assert.equal(signal.aborted, true)
  assert.equal(f.hasListeners(), false)
  f.event('error', { error: new Error('after dispose') }); f.slot('slot', {}, new Error('after dispose'))
  await tick()
  assert.equal(f.calls.length, 1)
})

test('client reporting has a bounded queue while a request is unresolved', async () => {
  let release, attempts = 0
  const f = fixture(() => ++attempts === 1 ? new Promise(resolve => { release = resolve }) : new Response('{}', { status: 202 }))
  for (let i = 0; i < 1000; i++) f.event('error', { error: new Error(String(i)) })
  assert.equal(f.calls.length, 1)
  release(new Response('{}', { status: 202 }))
  await tick()
  assert.equal(f.calls.length, 32)
  f.dispose()
})

test('account changes discard old pending metadata and cancel the old local request', async () => {
  let release, firstSignal, requests = 0
  const f = fixture((_url, init) => {
    if (++requests === 1) { firstSignal = init.signal; return new Promise(resolve => { release = resolve }) }
    return new Response('{}', { status: 202 })
  })
  f.event('error', { error: new Error('first') })
  f.event('unhandledrejection', { reason: new Error('queued old owner') })
  f.owner({ activeTenantId: 'tenant-b', user: { userId: 'user-b' } })
  assert.equal(firstSignal.aborted, true)
  reportClientDiagnostic({ category: 'network', code: 'HTTP_ERROR', httpStatus: 503 })
  release(new Response('{}', { status: 202 }))
  await tick()
  assert.deepEqual(f.calls.map(call => call.body.code), ['RENDERER_ERROR', 'HTTP_ERROR'])
  assert.doesNotMatch(JSON.stringify(f.calls.map(call => call.body)), /tenant|user/)
  f.dispose()
})

test('a fetch that ignores cancellation cannot block a new owner forever', async () => {
  let requests = 0
  const f = fixture(() => ++requests === 1 ? new Promise(() => {}) : new Response('{}', { status: 202 }))
  f.event('error', { error: new Error('old') })
  f.owner({ activeTenantId: 'tenant-b', user: { userId: 'user-b' } })
  reportClientDiagnostic({ category: 'network', code: 'HTTP_ERROR', httpStatus: 503 })
  await tick()
  assert.equal(f.calls.length, 2)
  f.dispose()
})

test('the finite request timeout releases a stalled sender even if fetch ignores AbortSignal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let requests = 0, signal
  const f = fixture((_url, init) => { signal = init.signal; return ++requests === 1 ? new Promise(() => {}) : new Response('{}', { status: 202 }) })
  f.event('error', { error: new Error('first') })
  t.mock.timers.tick(5001)
  await tick()
  assert.equal(signal.aborted, true)
  reportClientDiagnostic({ category: 'network', code: 'HTTP_ERROR', httpStatus: 503 })
  await tick()
  assert.equal(f.calls.length, 3)
  f.dispose()
})

test('publishing a transient controller error keeps its own failure report under the verified owner', async () => {
  let release, signal
  const f = fixture((_url, init) => { signal = init.signal; return new Promise(resolve => { release = resolve }) })
  // This is the controller's #publishFailure ordering: report, then publish a
  // temporary error snapshot whose login identity fields are absent.
  reportClientDiagnostic({ category: 'network', operation: 'discovery', code: 'PLATFORM_UNAVAILABLE' })
  f.owner({ phase: 'error', error: { code: 'PLATFORM_UNAVAILABLE' } })
  assert.equal(signal.aborted, false)
  f.owner({ phase: 'loading' })
  assert.equal(signal.aborted, false)
  release(new Response('{}', { status: 202 }))
  await tick()
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].body.code, 'PLATFORM_UNAVAILABLE')
  f.dispose()
})

test('explicit logout, expiry and tenant selection still cancel pending reports after a transient error', async () => {
  for (const phase of ['signed_out', 'expired', 'selecting_tenant']) {
    let signal
    const f = fixture((_url, init) => { signal = init.signal; return new Promise(() => {}) })
    f.event('error', { error: new Error('pending') })
    f.owner({ phase: 'error' })
    f.owner({ phase })
    assert.equal(signal.aborted, true, phase)
    await tick()
    assert.equal(f.calls.length, 1)
    f.dispose()
  }
})

test('a concrete replacement identity cancels old reports even during loading', async () => {
  let signal
  const f = fixture((_url, init) => { signal = init.signal; return new Promise(() => {}) })
  f.event('error', { error: new Error('pending') })
  f.owner({ phase: 'loading', user: { userId: 'user-b' } })
  assert.equal(signal.aborted, true)
  f.dispose()
})

test('an initial unverified error snapshot cannot assign old pending reports to a later login', async () => {
  let signal
  const f = fixture((_url, init) => { signal = init.signal; return new Promise(() => {}) }, { initialOwner: { phase: 'loading' } })
  f.event('error', { error: new Error('before a verified login') })
  f.owner({ phase: 'error', activeTenantId: 'tenant-a', user: { userId: 'user-a' } })
  assert.equal(signal.aborted, false)
  f.owner({ phase: 'ready', activeTenantId: 'tenant-a', user: { userId: 'user-a' } })
  assert.equal(signal.aborted, true)
  f.dispose()
})
