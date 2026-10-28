import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import * as diagnosticsObservers from '../lib/diagnostics-observers.js'
const { mountDiagnosticsObservers } = diagnosticsObservers
const markDiagnosticRequestReported = id => diagnosticsObservers.markDiagnosticRequestReported(id)

const sessionId = '00000000-0000-4000-8000-000000000001'
const requestId = '00000000-0000-4000-8000-000000000002'
function fixture({ rejectionHandlers = 1 } = {}) {
  const callbacks = new Map(), cleanups = [], reports = [], processCallbacks = new Map()
  const ctx = {
    on(name, fn) { callbacks.set(name, fn); return () => callbacks.delete(name) },
    effect(fn) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) },
    get(name) { return name === 'tools' ? { get(tool) { return tool === 'write' ? { name: tool } : undefined } } : undefined },
  }
  const proc = { listenerCount(name) { return name === 'unhandledRejection' ? rejectionHandlers : 0 }, on(name, fn) { processCallbacks.set(name, fn) }, off(name, fn) { if (processCallbacks.get(name) === fn) processCallbacks.delete(name) } }
  mountDiagnosticsObservers(ctx, input => reports.push(input), { process: proc })
  const session = { header: { id: sessionId }, get id() { return this.header.id }, firstLiveSeq: 10 }, agent = { id: sessionId, session }
  const event = (type, data, seq = 10) => callbacks.get('session/event')?.(session, { type, data, seq })
  return { callbacks, reports, processCallbacks, session, agent, event, dispose: () => { for (const cleanup of cleanups.reverse()) cleanup() } }
}

test('LLM attempts are collected without content and final turn/agent errors do not double report', () => {
  const f = fixture()
  f.event('step/start', { turn: 1, step: 2 })
  const failure = { code: 'FUTURESTAFF_PROVIDER', requestId, status: 503, message: 'private bearer and reply' }
  f.event('assistant/chunk', { turn: 1, step: 2, chunk: { type: 'finish', reason: { kind: 'error', failure } } })
  f.callbacks.get('agent/error')({ agent: f.agent, turn: 1, step: 2, error: { failure, code: failure.code } })
  f.event('turn/end', { turn: 1, reason: { kind: 'error', error: failure } })
  assert.equal(f.reports.length, 1)
  assert.deepEqual(f.reports[0], { category: 'llm', operation: 'chat', severity: 'error', code: failure.code, requestId, httpStatus: 503, sessionId, turn: 1, step: 2 })
  assert.doesNotMatch(JSON.stringify(f.reports), /private|bearer|reply|message|stack/)
  f.dispose()
})

test('recovered request errors still count while later independent failures are retained', () => {
  const f = fixture(), failure = { code: 'FUTURESTAFF_PROVIDER', requestId }
  f.event('step/start', { turn: 1, step: 1 })
  for (const id of [requestId, '00000000-0000-4000-8000-000000000003']) {
    f.event('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'error', failure: { ...failure, requestId: id } } } })
  }
  f.event('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'tool-calls' } } })
  f.event('step/start', { turn: 1, step: 2 })
  f.event('turn/end', { turn: 1, reason: { kind: 'error', error: failure } })
  assert.equal(f.reports.length, 3)
  f.dispose()
})

test('tools/result includes validation failures and session fallback avoids reading tool output or double reports', () => {
  const f = fixture()
  f.event('step/start', { turn: 3, step: 4 })
  const outcome = { isError: true, error: { info: { code: 'INVALID_ARGS', name: 'ToolArgsError' } } }
  Object.defineProperty(outcome, 'content', { get() { throw Error('private result was read') } })
  f.callbacks.get('tools/result')({ agent: f.agent, name: 'write', callId: 'call-1' }, outcome)
  const data = { turn: 3, step: 4, error: { code: 'INVALID_ARGS', name: 'ToolArgsError' } }
  Object.defineProperty(data, 'message', { get() { throw Error('private message was read') } })
  f.event('tool/result', data)
  assert.equal(f.reports.length, 1)
  assert.deepEqual(f.reports[0], { category: 'tool', operation: 'tool', severity: 'error', code: 'INVALID_ARGS', toolName: 'write', sessionId, turn: 3, step: 4 })
  f.event('tool/result', { turn: 3, step: 4, error: { code: 'UNKNOWN_TOOL', name: 'ToolNotFoundError' } })
  assert.equal(f.reports.length, 2)
  assert.equal(f.reports[1].code, 'UNKNOWN_TOOL')
  f.callbacks.get('tools/result')({ agent: f.agent, name: 'private-unregistered-name' }, { isError: true, error: { info: { code: 'UNKNOWN_TOOL' } } })
  assert.equal(f.reports[2].toolName, undefined)
  assert.doesNotMatch(JSON.stringify(f.reports), /private-unregistered-name/)
  f.dispose()
})

test('cancellation and seeded events are ignored; unknown exceptions never expose attacker strings', () => {
  const f = fixture()
  f.event('turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'FUTURESTAFF_CHAT' } } }, 9)
  f.event('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } })
  f.callbacks.get('tools/result')({ agent: f.agent, name: 'write_file' }, { isError: true, error: { info: { code: 'ABORTED' } } })
  f.callbacks.get('agent/error')({ agent: f.agent, turn: 2, step: 1, error: new DOMException('private', 'AbortError') })
  assert.equal(f.reports.length, 0)
  const unknown = new TypeError('private file C:/secret prompt')
  f.callbacks.get('agent/error')({ agent: f.agent, turn: 2, step: 1, error: unknown })
  assert.equal(f.reports.length, 1)
  assert.equal(f.reports[0].code, 'UNCLASSIFIED')
  assert.equal(f.reports[0].exceptionType, 'TypeError')
  assert.doesNotMatch(JSON.stringify(f.reports), /private|C:|prompt|message|stack/)
  f.dispose()
})

test('Host monitors report fixed metadata, preserve fatal semantics and clean up every listener', () => {
  const f = fixture()
  assert.equal(f.processCallbacks.has('uncaughtException'), false)
  f.processCallbacks.get('uncaughtExceptionMonitor')(new RangeError('private native stack'))
  f.processCallbacks.get('unhandledRejection')(new Error('private rejection'))
  assert.deepEqual(f.reports.map(report => [report.code, report.severity, report.exceptionType]), [
    ['HOST_UNCAUGHT_EXCEPTION', 'fatal', 'RangeError'], ['HOST_UNHANDLED_REJECTION', 'fatal', 'Error'],
  ])
  f.dispose()
  assert.equal(f.processCallbacks.size, 0)
  assert.equal(f.callbacks.size, 0)
})

test('without an existing rejection handler only the monitor observes Node fatal rejection promotion', () => {
  const f = fixture({ rejectionHandlers: 0 })
  assert.equal(f.processCallbacks.has('unhandledRejection'), false)
  f.processCallbacks.get('uncaughtExceptionMonitor')(new Error('private rejected value'), 'unhandledRejection')
  assert.equal(f.reports.length, 1)
  assert.equal(f.reports[0].code, 'HOST_UNHANDLED_REJECTION')
  assert.equal(f.reports[0].severity, 'fatal')
  f.dispose()
})

test('the Node default exit remains fatal when no other rejection handler exists', () => {
  const moduleUrl = new URL('../lib/diagnostics-observers.js', import.meta.url).href
  const script = `import {mountDiagnosticsObservers} from ${JSON.stringify(moduleUrl)}; mountDiagnosticsObservers({on(){return()=>{}},effect(fn){fn()}}, input=>process.stdout.write(input.code+'\\n')); Promise.reject(new Error('intentional fatal rejection'));`
  const result = spawnSync(process.execPath, ['--unhandled-rejections=throw', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 5000 })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /HOST_UNHANDLED_REJECTION/)
})

test('removing the pre-existing rejection owner restores Node default fatal behavior', () => {
  const moduleUrl = new URL('../lib/diagnostics-observers.js', import.meta.url).href
  const script = `import {mountDiagnosticsObservers} from ${JSON.stringify(moduleUrl)}; const owner=()=>{}; process.on('unhandledRejection',owner); mountDiagnosticsObservers({on(){return()=>{}},effect(fn){fn()}}, input=>process.stdout.write(input.code+'\\n')); process.off('unhandledRejection',owner); Promise.reject(new Error('intentional fatal rejection'));`
  const result = spawnSync(process.execPath, ['--unhandled-rejections=throw', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 5000 })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /HOST_UNHANDLED_REJECTION/)
})

test('native session-prefixed identifiers retain their UUID correlation', () => {
  const f = fixture()
  f.session.header.id = 'session-' + sessionId
  f.event('turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'FUTURESTAFF_PROVIDER' } } })
  assert.equal(f.reports[0].sessionId, sessionId)
  f.dispose()
})

test('directly reported request IDs suppress observer copies until the five minute expiry', t => {
  let now = 1_000_000
  t.mock.method(Date, 'now', () => now)
  const f = fixture(), directId = '00000000-0000-4000-8000-000000000005'
  const failure = { code: 'FUTURESTAFF_PROVIDER', requestId: directId, status: 503 }
  markDiagnosticRequestReported(directId)
  f.event('step/start', { turn: 1, step: 1 })
  f.event('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'error', failure } } })
  f.callbacks.get('agent/error')({ agent: f.agent, turn: 1, step: 1, error: { failure } })
  f.event('turn/end', { turn: 1, reason: { kind: 'error', error: failure } })
  assert.equal(f.reports.length, 0)
  now += 300_001
  f.event('step/start', { turn: 2, step: 1 })
  f.event('assistant/chunk', { turn: 2, step: 1, chunk: { type: 'finish', reason: { kind: 'error', failure } } })
  assert.equal(f.reports.length, 1)
  f.dispose()
})

test('reported request markers are UUID-only and bounded to the latest thousand requests', () => {
  const f = fixture(), oldest = 'ffffffff-0000-4000-8000-000000000004'
  markDiagnosticRequestReported(oldest)
  markDiagnosticRequestReported('private arbitrary string')
  for (let index = 0; index < 1000; index++) markDiagnosticRequestReported(index.toString(16).padStart(8, '0') + '-0000-4000-8000-000000000004')
  f.event('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'FUTURESTAFF_PROVIDER', requestId: oldest } } } })
  assert.equal(f.reports.length, 1)
  assert.equal(f.reports[0].requestId, oldest)
  f.dispose()
})

test('throwing capture and hostile error getters never escape an observer', () => {
  const callbacks = new Map(), cleanups = []
  mountDiagnosticsObservers({ on(name, fn) { callbacks.set(name, fn); return () => {} }, effect(fn) { cleanups.push(fn()) } }, () => { throw Error('reporter unavailable') }, { process: { on() {}, off() {} } })
  const hostile = new Proxy({}, { get() { throw Error('getter') } })
  assert.doesNotThrow(() => callbacks.get('agent/error')({ error: hostile }))
  assert.doesNotThrow(() => callbacks.get('tools/result')({}, { isError: true, error: { info: { code: 'INVALID_ARGS' } } }))
  for (const cleanup of cleanups.reverse()) cleanup?.()
})
