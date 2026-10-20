import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { VideoHost, mountVideoTools, validateVideoToolInput, videoApprovalDecision, videoOwnerKey, safeVideoOutput, videoToolSchemas } from '../lib/host.js'

const projectId = '10000000-0000-4000-8000-000000000001'
const revisionId = '10000000-0000-4000-8000-000000000002'
const jobId = '10000000-0000-4000-8000-000000000003'
const createInput = { requestId: 'request-case-001', title: '街角咖啡', brief: '介绍一家虚构咖啡店', scenes: [{ id: 'intro', title: '一杯香气', narration: '从新鲜咖啡开始。', lines: ['欢迎到店'], visual: 'hero' }] }
async function fixture(t, overrides = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'futurestaff-video-host-'))
  const workspacePath = await realpath(temporary)
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const ownerAbort = new AbortController(), calls = []
  let identity = { environment: 'production', tenantId: '20000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000002', agentId: '20000000-0000-4000-8000-000000000003', agentVersion: 'a'.repeat(64), workspacePath, signal: ownerAbort.signal }
  const engine = Object.fromEntries(['create', 'revise', 'get', 'render', 'status', 'cancel', 'list'].map(name => [name, async input => { calls.push({ name, input }); return { status: name === 'render' ? 'queued' : 'ready', projectId, revisionId, jobId } }]))
  const workspace = { authorize: async () => identity }
  const factories = []
  const options = { workspace, deviceId: 'test-workstation', engineFactory: input => { factories.push(input); return engine }, ...overrides }
  const host = new VideoHost(options)
  t.after(() => host.dispose())
  return { host, options, workspace, engine, calls, factories, ownerAbort, root: workspacePath, setIdentity: next => { identity = { ...identity, ...next } }, identity: () => identity }
}
const signal = () => new AbortController().signal

test('all native wire schemas can be compiled by the pinned Harness SDK', () => {
  for (const schema of Object.values(videoToolSchemas)) assert.doesNotThrow(() => assertObjectJsonSchema(schema))
})

test('all local tools declare approval and a trusted target device; unknown tools do not inherit approval', async t => {
  const f = await fixture(t)
  assert.deepEqual(f.host.metadata, { execution: 'local', requiresApproval: true, tenantScoped: true, deviceId: 'test-workstation' })
  assert.equal(Object.isFrozen(f.host.metadata), true)
  assert.equal(videoApprovalDecision('video_project_render', 'test-workstation').kind, 'ask')
  assert.match(videoApprovalDecision('video_project_get', 'test-workstation').reason, /test-workstation/)
  assert.equal(videoApprovalDecision('unrelated_tool', 'test-workstation'), undefined)
  assert.throws(() => new VideoHost({ ...f.options, deviceId: '' }), /deviceId/)
})

test('strict tool boundary rejects model paths, scripts and nested unknown fields before any engine runs', () => {
  for (const input of [{ ...createInput, workspaceRoot: 'C:/other' }, { ...createInput, command: 'calc.exe' }, { ...createInput, scenes: [{ ...createInput.scenes[0], html: '<script/>' }] }, { ...createInput, voice: { provider: 'edge', endpoint: 'http://internal' } }]) {
    assert.throws(() => validateVideoToolInput('video_project_create', input), /VIDEO_INPUT_INVALID/)
  }
  assert.throws(() => validateVideoToolInput('video_project_get', { projectId: '../another-agent' }), /VIDEO_INPUT_INVALID/)
  assert.throws(() => validateVideoToolInput('video_project_revise', { requestId: 'request-revision', projectId, baseRevisionId: revisionId, changes: {} }), /VIDEO_INPUT_INVALID/)
  assert.throws(() => validateVideoToolInput('video_project_render', { requestId: 'request-render', projectId, revisionId, shell: 'ffmpeg' }), /VIDEO_INPUT_INVALID/)
  assert.equal(validateVideoToolInput('video_project_create', createInput).title, createInput.title)
})

test('pipeline receives the authorized Agent workspace and owner hash; different members and Agents stay separate', async t => {
  const f = await fixture(t)
  await f.host.execute('video_project_create', createInput, 'session-one', signal())
  await f.host.execute('video_project_get', { projectId }, 'session-two', signal())
  assert.equal(f.factories.length, 1)
  assert.equal(f.factories[0].workspaceRoot, f.root)
  assert.match(f.factories[0].ownerKey, /^[a-f0-9]{64}$/)
  const first = f.factories[0].ownerKey
  f.setIdentity({ agentId: '20000000-0000-4000-8000-000000000004' })
  await f.host.execute('video_project_list', {}, 'session-three', signal())
  assert.notEqual(first, f.factories[1].ownerKey)
  assert.notEqual(videoOwnerKey(f.identity()), videoOwnerKey({ ...f.identity(), userId: '20000000-0000-4000-8000-000000000009' }))
})

test('missing Agent authorization and cancelled calls cannot reach rendering or runtime preparation', async t => {
  const f = await fixture(t)
  f.workspace.authorize = async () => { throw Error('denied') }
  await assert.rejects(f.host.execute('video_project_render', { requestId: 'request-render', projectId, revisionId }, 'session', signal()), /denied/)
  assert.equal(f.factories.length, 0)
  const abort = new AbortController(); abort.abort()
  await assert.rejects(f.host.execute('video_project_create', createInput, 'session', abort.signal))
  assert.equal(f.calls.length, 0)
})

test('runtime preparation runs only for render and is configured before the render is submitted', async t => {
  const events = [], f = await fixture(t, { prepareRuntime: async () => { events.push('prepare'); return { runtimeRoot: 'C:/trusted/runtime' } } })
  f.engine.configureRuntime = runtime => { events.push('configure'); assert.equal(runtime.runtimeRoot, 'C:/trusted/runtime') }
  f.engine.render = async () => { events.push('render'); return { status: 'queued', projectId, revisionId, jobId } }
  await f.host.execute('video_project_create', createInput, 'session', signal())
  assert.deepEqual(events, [])
  await f.host.execute('video_project_render', { requestId: 'request-render', projectId, revisionId }, 'session', signal())
  assert.deepEqual(events, ['prepare', 'configure', 'render'])
})

test('production render accepts a job before preparing first-use components in the background', async t => {
  let provider, prepared=0
  const f=await fixture(t,{prepareRuntime:async()=>{prepared++;return {runtimeRoot:'C:/trusted/runtime'}}})
  f.engine.configureRuntimeProvider=value=>{provider=value}
  const receipt=await f.host.execute('video_project_render',{requestId:'request-background',projectId,revisionId},'session',signal())
  assert.equal(receipt.status,'queued');assert.equal(prepared,0)
  assert.equal((await provider(signal())).runtimeRoot,'C:/trusted/runtime');assert.equal(prepared,1)
  f.setIdentity({agentVersion:'b'.repeat(64)})
  await assert.rejects(provider(signal()),/VIDEO_IDENTITY_CHANGED/)
})

test('identity or Agent version changes during an operation prevent result delivery', async t => {
  const f = await fixture(t)
  f.engine.get = async () => { f.setIdentity({ agentVersion: 'b'.repeat(64) }); return { projectId } }
  await assert.rejects(f.host.execute('video_project_get', { projectId }, 'session', signal()), /VIDEO_IDENTITY_CHANGED/)
})

test('engine errors return only safe codes and never raw process output or credentials', async t => {
  const f = await fixture(t)
  f.engine.create = async () => { throw Error('Authorization Bearer private-do-not-show command secret') }
  await assert.rejects(f.host.execute('video_project_create', createInput, 'session', signal()), error => error.message === 'VIDEO_OPERATION_FAILED')
  f.engine.create = async () => { const e = Error('private-do-not-show'); e.code = 'VIDEO_VOICE_UNAVAILABLE'; throw e }
  await assert.rejects(f.host.execute('video_project_create', createInput, 'session', signal()), /VIDEO_VOICE_UNAVAILABLE/)
})

test('background jobs are cancelled on owner logout and plugin disposal', async t => {
  const f = await fixture(t)
  await f.host.execute('video_project_render', { requestId: 'request-render', projectId, revisionId }, 'session', signal())
  f.ownerAbort.abort()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(f.calls.filter(call => call.name === 'cancel').map(call => call.input), [{ projectId, jobId }])
  const another = await fixture(t)
  await another.host.execute('video_project_render', { requestId: 'request-render', projectId, revisionId }, 'session', signal())
  await another.host.dispose()
  assert.equal(another.calls.filter(call => call.name === 'cancel').length, 1)
})

test('only succeeded tasks get short-lived output grants, revoked when identity changes', async t => {
  let now = 1000
  const f = await fixture(t, { now: () => now }), file = path.join(f.root, 'movie.mp4')
  await writeFile(file, Buffer.from('real-video-bytes'))
  f.engine.status = async () => ({ status: 'running', projectId, jobId, result: { videoPath: file } })
  assert.equal((await f.host.execute('video_project_status', { projectId, jobId }, 'session', signal())).links, undefined)
  f.engine.status = async () => ({ status: 'succeeded', projectId, jobId, result: { videoPath: file } })
  const receipt = await f.host.execute('video_project_status', { projectId, jobId }, 'session', signal())
  const token = receipt.links.videoUrl.split('/').pop()
  assert.equal((await f.host.asset(token, signal())).bytes, 16)
  now += 600001
  await assert.rejects(f.host.asset(token, signal()), /VIDEO_ASSET_UNAVAILABLE/)
  now = 1000
  f.setIdentity({ userId: '20000000-0000-4000-8000-000000000009' })
  await assert.rejects(f.host.asset(token, signal()), /VIDEO_ASSET_UNAVAILABLE/)
})

test('output checks reject traversal, outside files and symlink descendants', async t => {
  const f = await fixture(t), outside = await mkdtemp(path.join(os.tmpdir(), 'futurestaff-video-other-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const outsideFile = path.join(outside, 'movie.mp4'); await writeFile(outsideFile, 'outside')
  await assert.rejects(safeVideoOutput(f.root, outsideFile), /VIDEO_OUTPUT_UNSAFE/)
  const link = path.join(f.root, 'linked')
  try { await symlink(outside, link, 'junction') } catch (error) { if (error.code === 'EPERM') return; throw error }
  await assert.rejects(safeVideoOutput(f.root, path.join(link, 'movie.mp4')), /VIDEO_OUTPUT_UNSAFE/)
  f.engine.status = async () => ({ status: 'succeeded', projectId, jobId, result: { videoPath: outsideFile } })
  await assert.rejects(f.host.execute('video_project_status', { projectId, jobId }, 'session', signal()), /VIDEO_OUTPUT_UNSAFE/)
})

test('native tool registration includes a real approval gate and authenticated HTTP Range playback', async t => {
  const f = await fixture(t), tools = new Map(), routes = [], gates = [], cleanups = []
  const ctx = { on: (_name, callback) => gates.push(callback), effect: callback => { const disposer = callback(); if (typeof disposer === 'function') cleanups.push(disposer) }, tools: { register: tool => { tools.set(tool.name, tool); return () => tools.delete(tool.name) } }, webServer: { register: route => { routes.push(route); return () => {} } } }
  const host = mountVideoTools(ctx, f.options)
  t.after(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); await host.dispose() })
  assert.equal(tools.size, 7)
  assert.equal((await gates[0]({ name: 'video_project_render' }, () => ({ kind: 'allow' }))).kind, 'ask')
  assert.equal(tools.get('video_project_render').metadata.deviceId, 'test-workstation')
  await assert.rejects(tools.get('video_project_list').execute({}, { signal: signal() }), /VIDEO_SESSION_REQUIRED/)
  const file = path.join(f.root, 'movie.mp4'); await writeFile(file, '0123456789')
  f.engine.status = async () => ({ status: 'succeeded', projectId, jobId, result: { videoPath: file } })
  const receipt = await host.execute('video_project_status', { projectId, jobId }, 'session', signal())
  const server = createServer((req, res) => { void routes[0].handler(req, res) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const url = 'http://127.0.0.1:' + server.address().port + receipt.links.videoUrl
  const partial = await fetch(url, { headers: { Range: 'bytes=2-5' } })
  assert.equal(partial.status, 206); assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(await partial.text(), '2345')
  const head = await fetch(url, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(head.headers.get('content-type'), 'video/mp4'); assert.equal(head.headers.get('content-length'), '10')
  const bad = await fetch(url, { headers: { Range: 'bytes=99-' } }); assert.equal(bad.status, 416)
  const crossOrigin = await fetch(url, { headers: { Origin: 'https://untrusted.example' } }); assert.equal(crossOrigin.status, 403)
  f.setIdentity({ agentVersion: 'b'.repeat(64) })
  assert.equal((await fetch(url)).status, 403)
})
