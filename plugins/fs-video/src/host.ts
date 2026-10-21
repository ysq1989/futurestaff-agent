import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { validateJsonSchemaValue, type ToolDefinition, type ToolExecution, type JsonSchemaNode } from '@deepseek-ai/dsh-tools'
import { defineToolMetadata } from '@futurestaff/fs-core'
import { parseCreate, parseRevise, parseRender, parseRef } from './contracts.js'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'

export interface VideoWorkspaceIdentity {
  environment: 'dev' | 'production'
  tenantId: string
  userId: string
  agentId: string
  agentVersion: string
  workspacePath: string
  signal: AbortSignal
}

/** Implemented by Platform access: identity and cwd never come from model arguments. */
export interface VideoWorkspaceResolver {
  authorize(sessionId: string, signal?: AbortSignal): Promise<VideoWorkspaceIdentity>
}

export interface VideoEnginePort {
  configureRuntime?(runtime: { runtimeRoot: string }): void
  configureRuntimeProvider?(provider: (signal: AbortSignal) => Promise<{runtimeRoot:string}>): void
  create(input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>
  revise(input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>
  get(input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>
  render(input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>
  status(input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>
  cancel(input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>
  list(signal?: AbortSignal): Promise<unknown>
}

export interface VideoHostOptions {
  workspace: VideoWorkspaceResolver
  deviceId: string
  engineFactory(input: { workspaceRoot: string; ownerKey: string }): VideoEnginePort
  prepareRuntime?(identity: VideoWorkspaceIdentity, signal: AbortSignal): Promise<{ runtimeRoot: string }>
  assetOrigin?: string
  now?: () => number
}

declare module '@deepseek-ai/cordis' {
  interface Context { futurestaffVideoWorkspace: VideoWorkspaceResolver }
}

const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })
// Keep the wire schema inside Harness's enforced subset. Contract parsers below
// additionally enforce lengths, UUIDs, control characters and total duration.
const identifier = { type: 'string', description: '1至80位字母、数字、下划线或短横线。' }
const referenceId = { type: 'string', description: '先前工具返回的真实UUID v4，不得猜测或填写路径。' }
const requestId = { type: 'string', description: '8至80位字母、数字、下划线或短横线；同一次操作重试保持相同编号。' }
const text = (minLength: number, maxLength: number) => ({ type: 'string', description: `长度${minLength}至${maxLength}字，不含控制字符。` })
const music = { type: 'string', enum: ['upbeat', 'gentle', 'none'] }
const voice = object({ provider: { type: 'string', enum: ['edge', 'none'] }, name: text(1, 100),
  rate: { type: 'string', description: '语速必须带正负号和百分号，范围-30%至+30%；例如-6%、+0%、+8%。' },
  pitch: { type: 'string', description: '音高必须带正负号和Hz，范围-20Hz至+20Hz；自然音高写+0Hz，不能写0Hz。' },
}, ['provider'])
const scene = object({ id: identifier, title: text(1, 90), narration: text(0, 1200), lines: { type: 'array', description: '0至4条画面短句，每条最多100字。', items: text(1, 100) }, visual: { type: 'string', enum: ['hero', 'benefits', 'steps', 'offer', 'cta'] }, durationSeconds: { type: 'number', description: '2至30秒，整个视频最多180秒。' }, assetId: referenceId }, ['id', 'title', 'narration', 'lines', 'visual'])
const scenes = { type: 'array', description: '1至12场，id不得重复，旁白合计不超过5000字。', items: scene }
const aspectRatio = { type: 'string', enum: ['9:16', '16:9'] }
const content = { title: text(1, 160), brief: text(1, 6000), scenes, music, voice, theme: { type: 'string', enum: ['warm', 'clean', 'bold'] }, aspectRatio }

export const videoToolSchemas = Object.freeze({
  video_project_create: object({ requestId, ...content }, ['requestId', 'title', 'brief', 'scenes']),
  video_project_revise: object({ requestId, projectId: referenceId, baseRevisionId: referenceId, changes: object(content) }, ['requestId', 'projectId', 'baseRevisionId', 'changes']),
  video_project_get: object({ projectId: referenceId, revisionId: referenceId }, ['projectId']),
  video_project_list: object({}),
  video_project_render: object({ requestId, projectId: referenceId, revisionId: referenceId, profile: { type: 'string', enum: ['preview', 'final'] } }, ['requestId', 'projectId', 'revisionId']),
  video_project_status: object({ projectId: referenceId, jobId: referenceId }, ['projectId', 'jobId']),
  video_project_cancel: object({ projectId: referenceId, jobId: referenceId }, ['projectId', 'jobId']),
})
export type VideoToolName = keyof typeof videoToolSchemas

const descriptions: Record<VideoToolName, string> = {
  video_project_create: '把已确定的通用视频脚本和分镜保存为可修改项目，适用于各行业。固定场景模板，不接受代码。旁白可用免费Edge在线语音或关闭；音乐仅使用内置授权配乐。成功后用返回的projectId/revisionId渲染。',
  video_project_revise: '按用户反馈创建视频新版本，保留原版本和成片。baseRevisionId必须来自真实项目。修改脚本、场景、配音或配乐后重新渲染新版本，禁止覆盖或捏造成片。',
  video_project_get: '读取当前智能体工作区已有视频项目和指定版本的真实脚本、分镜与设置。继续修改前先读取，不猜项目编号。',
  video_project_list: '列出当前智能体工作区实际保存的视频项目。其它主体、员工和智能体的文件不会读取。',
  video_project_render: '用固定安全模板渲染已保存的视频版本，首次运行会在当前工作区准备免费制作工具，立即返回真实jobId。耗时任务用status查询原jobId，不换requestId重复渲染。成片不代表已向任何渠道发布。',
  video_project_status: '查询原视频任务的真实进度及结果。仅succeeded且输出已验证时交付预览或下载链接；failed/cancelled/unavailable不能当作完成。',
  video_project_cancel: '停止当前智能体已有视频渲染任务，保留项目和历史版本。只能使用真实返回的projectId和jobId。',
}

function fail(code: string): never { throw new Error(code) }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function sameOwner(a: VideoWorkspaceIdentity, b: VideoWorkspaceIdentity): boolean {
  return ['environment', 'tenantId', 'userId', 'agentId', 'agentVersion', 'workspacePath'].every(key => a[key as keyof VideoWorkspaceIdentity] === b[key as keyof VideoWorkspaceIdentity])
}
export function videoOwnerKey(identity: VideoWorkspaceIdentity): string {
  if (!['dev', 'production'].includes(identity.environment) || !path.isAbsolute(identity.workspacePath)) fail('VIDEO_IDENTITY_INVALID')
  for (const value of [identity.tenantId, identity.userId, identity.agentId]) if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) fail('VIDEO_IDENTITY_INVALID')
  if (!/^[a-f0-9]{64}$/.test(identity.agentVersion)) fail('VIDEO_IDENTITY_INVALID')
  return createHash('sha256').update(JSON.stringify([identity.environment, identity.tenantId, identity.userId, identity.agentId])).digest('hex')
}

export function validateVideoToolInput(name: VideoToolName, raw: unknown): Record<string, unknown> {
  if (!Object.hasOwn(videoToolSchemas, name)) fail('VIDEO_TOOL_UNKNOWN')
  if (validateJsonSchemaValue(videoToolSchemas[name] as JsonSchemaNode, raw).length || !isRecord(raw)) fail('VIDEO_INPUT_INVALID')
  switch (name) {
    case 'video_project_create': return parseCreate(raw) as unknown as Record<string, unknown>
    case 'video_project_revise': return parseRevise(raw) as unknown as Record<string, unknown>
    case 'video_project_render': return parseRender(raw) as unknown as Record<string, unknown>
    case 'video_project_get': return parseRef(raw)
    case 'video_project_status': case 'video_project_cancel': return parseRef(raw, true)
    default: return raw
  }
}

/** Check every descendant component before serving pipeline-owned output bytes. */
export async function safeVideoOutput(workspace: string, file: string): Promise<{ file: string; bytes: number }> {
  if (!path.isAbsolute(file)) fail('VIDEO_OUTPUT_UNSAFE')
  const root = await realpath(workspace), relative = path.relative(root, path.resolve(file))
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('VIDEO_OUTPUT_UNSAFE')
  let current = root
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part)
    if ((await lstat(current)).isSymbolicLink()) fail('VIDEO_OUTPUT_UNSAFE')
  }
  const resolved = await realpath(file), info = await lstat(resolved)
  if (resolved !== path.resolve(file) || !info.isFile() || info.size > 300 * 1024 * 1024) fail('VIDEO_OUTPUT_UNSAFE')
  return { file: resolved, bytes: info.size }
}

interface AssetGrant { sessionId: string; identity: VideoWorkspaceIdentity; file: string; type: string; name: string; expires: number }
const outputFields: Record<string, { type: string; extension: string[]; download: string }> = {
  videoPath: { type: 'video/mp4', extension: ['.mp4'], download: '视频成片.mp4' },
  webmPath: { type: 'video/webm', extension: ['.webm'], download: '视频预览.webm' },
  posterPath: { type: 'image/jpeg', extension: ['.jpg', '.jpeg'], download: '视频封面.jpg' },
  subtitlesPath: { type: 'text/plain; charset=utf-8', extension: ['.srt'], download: '中文字幕.srt' },
  manifestPath: { type: 'application/json; charset=utf-8', extension: ['.json'], download: '制作清单.json' },
}

export class VideoHost {
  readonly metadata
  private readonly engines = new Map<string, VideoEnginePort>()
  private readonly grants = new Map<string, AssetGrant>()
  private readonly cancelListeners = new Map<string, { remove(): void; cancel(): Promise<unknown> }>()
  private readonly now: () => number
  constructor(readonly options: VideoHostOptions) {
    this.metadata = defineToolMetadata({ execution: 'local', requiresApproval: true, tenantScoped: true, deviceId: options.deviceId })
    if (options.assetOrigin && !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(options.assetOrigin)) fail('VIDEO_ASSET_ORIGIN_INVALID')
    this.now = options.now ?? Date.now
  }
  private async authorize(sessionId: string, signal: AbortSignal) {
    if (!sessionId || sessionId.length > 256) fail('VIDEO_SESSION_REQUIRED')
    signal.throwIfAborted()
    const identity = await this.options.workspace.authorize(sessionId, signal)
    videoOwnerKey(identity); identity.signal.throwIfAborted(); signal.throwIfAborted()
    return identity
  }
  async execute(name: VideoToolName, raw: unknown, sessionId: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    const input = validateVideoToolInput(name, raw), identity = await this.authorize(sessionId, signal)
    const ownerKey = videoOwnerKey(identity), key = ownerKey + ':' + identity.workspacePath
    let engine = this.engines.get(key)
    if (!engine) { engine = this.options.engineFactory({ workspaceRoot: identity.workspacePath, ownerKey }); this.engines.set(key, engine) }
    const combined = AbortSignal.any([signal, identity.signal])
    const operation = name.slice('video_project_'.length) as 'create' | 'revise' | 'get' | 'list' | 'render' | 'status' | 'cancel'
    let result: unknown
    if (operation === 'render' && this.options.prepareRuntime) {
      const prepare = async (jobSignal: AbortSignal) => {
        const lifecycle = AbortSignal.any([jobSignal, identity.signal])
        const runtime = await this.options.prepareRuntime!(identity, lifecycle)
        lifecycle.throwIfAborted()
        const current = await this.authorize(sessionId, lifecycle)
        if (!sameOwner(identity, current)) fail('VIDEO_IDENTITY_CHANGED')
        return runtime
      }
      if (engine.configureRuntimeProvider) engine.configureRuntimeProvider(prepare)
      else {
        const runtime = await prepare(combined)
        if (!engine.configureRuntime) fail('VIDEO_RUNTIME_UNAVAILABLE')
        engine.configureRuntime(runtime)
      }
    }
    try { result = operation === 'list' ? await engine.list(combined) : await engine[operation](input, combined) }
    catch (error) {
      combined.throwIfAborted()
      const code = isRecord(error) && typeof error.code === 'string' && /^[A-Z0-9_]{3,100}$/.test(error.code) ? error.code : 'VIDEO_OPERATION_FAILED'
      fail(code)
    }
    const current = await this.authorize(sessionId, combined)
    if (!sameOwner(identity, current)) fail('VIDEO_IDENTITY_CHANGED')
    const serialized = JSON.stringify(result)
    if (!serialized || Buffer.byteLength(serialized) > 2 * 1024 * 1024) fail('VIDEO_RESULT_INVALID')
    const receipt = JSON.parse(serialized) as unknown
    if (!isRecord(receipt)) fail('VIDEO_RESULT_INVALID')
    if (operation === 'render' && typeof receipt.projectId === 'string' && typeof receipt.jobId === 'string') {
      const task = { projectId: receipt.projectId, jobId: receipt.jobId }
      const jobKey = ownerKey + ':' + receipt.jobId
      // An accepted background render may outlive the tool, but never the signed-in owner.
      const cancel = () => { this.cancelListeners.delete(jobKey); void engine!.cancel(task).catch(() => {}) }
      this.cancelListeners.get(jobKey)?.remove()
      identity.signal.addEventListener('abort', cancel, { once: true })
      this.cancelListeners.set(jobKey, { remove: () => identity.signal.removeEventListener('abort', cancel), cancel: () => engine!.cancel(task) })
    }
    if (['succeeded', 'failed', 'cancelled'].includes(String(receipt.status)) && typeof receipt.jobId === 'string') {
      const jobKey = ownerKey + ':' + receipt.jobId
      this.cancelListeners.get(jobKey)?.remove(); this.cancelListeners.delete(jobKey)
    }
    if (receipt.status === 'succeeded' && isRecord(receipt.result)) {
      const links: Record<string, string> = {}
      for (const [field, spec] of Object.entries(outputFields)) {
        const value = receipt.result[field]
        if (value === undefined) continue
        if (typeof value !== 'string' || !spec.extension.includes(path.extname(value).toLowerCase())) fail('VIDEO_OUTPUT_UNSAFE')
        const safe = await safeVideoOutput(identity.workspacePath, value), token = randomBytes(24).toString('hex')
        this.grants.set(token, { sessionId, identity, file: safe.file, type: spec.type, name: spec.download, expires: this.now() + 10 * 60_000 })
        links[field.replace('Path', 'Url')] = (this.options.assetOrigin ?? '') + '/_futurestaff/video/asset/' + token
      }
      if (!sameOwner(identity, await this.authorize(sessionId, combined))) fail('VIDEO_IDENTITY_CHANGED')
      for (const [token, grant] of this.grants) if (grant.expires < this.now()) this.grants.delete(token)
      while (this.grants.size > 500) this.grants.delete(this.grants.keys().next().value!)
      return { ...receipt, links, linksExpireInSeconds: 600, targetDevice: this.metadata.deviceId }
    }
    return { ...receipt, targetDevice: this.metadata.deviceId }
  }
  async asset(token: string, signal: AbortSignal): Promise<AssetGrant & { bytes: number }> {
    const grant = this.grants.get(token)
    if (!grant || grant.expires < this.now()) fail('VIDEO_ASSET_UNAVAILABLE')
    const current = await this.authorize(grant.sessionId, signal)
    if (!sameOwner(grant.identity, current)) fail('VIDEO_ASSET_UNAVAILABLE')
    return { ...grant, ...(await safeVideoOutput(current.workspacePath, grant.file)) }
  }
  async dispose() {
    this.grants.clear(); this.engines.clear()
    const active = [...this.cancelListeners.values()]; this.cancelListeners.clear()
    for (const task of active) task.remove()
    await Promise.allSettled(active.map(task => task.cancel()))
  }
}

export function videoApprovalDecision(name: string, deviceId: string) {
  if (!Object.hasOwn(videoToolSchemas, name)) return undefined
  return { kind: 'ask' as const, reason: name === 'video_project_render'
    ? `将在本机 ${deviceId} 渲染当前视频版本；首次使用会准备已校验的免费制作组件，请确认。`
    : `将在本机 ${deviceId} 的当前智能体工作区执行视频操作，请确认。` }
}

/** Register real native tools and an authenticated, short-lived local playback endpoint. */
export function mountVideoTools(ctx: Context, options: VideoHostOptions): VideoHost {
  const host = new VideoHost({ ...options, ...(ctx.webServer.port ? { assetOrigin: `http://127.0.0.1:${ctx.webServer.port}` } : {}) })
  ctx.on('tools/pre-execute', async (exec: { name: string }, next) => videoApprovalDecision(exec.name, options.deviceId) ?? next())
  for (const name of Object.keys(videoToolSchemas) as VideoToolName[]) {
    const definition = {
      name, description: descriptions[name], parameters: videoToolSchemas[name], metadata: host.metadata,
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }] },
      execute: async (input: unknown, exec: ToolExecution) => {
        if (!exec.agent) fail('VIDEO_SESSION_REQUIRED')
        return host.execute(name, input, exec.agent.id, exec.signal)
      },
    }
    ctx.effect(() => ctx.tools.register(definition as ToolDefinition), `FutureStaff video ${name}`)
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/_futurestaff/video/asset', handler: async (request, response) => {
    const abort = new AbortController()
    request.once('aborted', () => abort.abort())
    try {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') || !['GET', 'HEAD'].includes(request.method ?? '')) fail('VIDEO_ASSET_UNAVAILABLE')
      if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) fail('VIDEO_ASSET_UNAVAILABLE')
      const url = new URL(request.url ?? '', 'http://127.0.0.1'), token = url.pathname.slice('/_futurestaff/video/asset/'.length)
      if (!/^[a-f0-9]{48}$/.test(token) || [...url.searchParams.keys()].some(key => key !== 'download')) fail('VIDEO_ASSET_UNAVAILABLE')
      const asset = await host.asset(token, abort.signal)
      const headers: Record<string, string> = { 'content-type': asset.type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'accept-ranges': 'bytes' }
      if (url.searchParams.get('download') === '1') headers['content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`
      let start = 0, end = asset.bytes - 1, status = 200
      if (request.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range)
        if (!range) { response.writeHead(416, { ...headers, 'content-range': `bytes */${asset.bytes}` }); response.end(); return }
        start = Number(range[1]); end = range[2] ? Number(range[2]) : end
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= asset.bytes) { response.writeHead(416, { ...headers, 'content-range': `bytes */${asset.bytes}` }); response.end(); return }
        end = Math.min(end, asset.bytes - 1); status = 206; headers['content-range'] = `bytes ${start}-${end}/${asset.bytes}`
      }
      response.writeHead(status, { ...headers, 'content-length': String(end - start + 1) })
      if (request.method === 'HEAD') response.end()
      else await pipeline(createReadStream(asset.file, { start, end }), response, { signal: AbortSignal.any([abort.signal, asset.identity.signal]) })
    } catch {
      if (!response.headersSent) response.writeHead(403, { 'cache-control': 'no-store' })
      response.end()
    }
  } }), 'FutureStaff private video output')
  // A raw MP4 navigation is not a reliable Electron document. This fixed,
  // script-free shell reuses the exact asset grant and its native request gate.
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/_futurestaff/video/preview', handler: async (request, response) => {
    const abort = new AbortController()
    request.once('aborted', () => abort.abort())
    try {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') || !['GET', 'HEAD'].includes(request.method ?? '')) fail('VIDEO_ASSET_UNAVAILABLE')
      if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) fail('VIDEO_ASSET_UNAVAILABLE')
      const url = new URL(request.url ?? '', 'http://127.0.0.1'), token = url.pathname.slice('/_futurestaff/video/preview/'.length)
      if (!/^[a-f0-9]{48}$/.test(token) || url.search) fail('VIDEO_ASSET_UNAVAILABLE')
      const asset = await host.asset(token, abort.signal), source = '/_futurestaff/video/asset/' + token
      asset.identity.signal.throwIfAborted()
      const content = asset.type.startsWith('video/')
        ? `<video controls playsinline preload="metadata" src="${source}"></video>`
        : asset.type.startsWith('image/') ? `<img src="${source}" alt="视频封面">` : '<p>此文件可下载后查看。</p>'
      // Only constant text and a validated 48-hex token enter HTML. Filenames,
      // model output, subtitle bytes and uploaded HTML are never interpolated.
      const html = Buffer.from(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>视频预览</title><style>html,body{margin:0;height:100%;background:#111827;color:#fff;font-family:system-ui,sans-serif}body{display:flex;flex-direction:column}main{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}video,img{display:block;width:100%;height:100%;max-height:100%;object-fit:contain}footer{flex:none;padding:12px 20px;text-align:center}a{color:#bde9ff}</style></head><body><main>${content}</main><footer><a href="${source}?download=1" download rel="noreferrer">下载文件</a></footer></body></html>`, 'utf8')
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8', 'content-length': String(html.length),
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'x-frame-options': 'DENY',
      })
      response.end(request.method === 'HEAD' ? undefined : html)
    } catch {
      if (!response.headersSent) response.writeHead(403, { 'cache-control': 'no-store' })
      response.end()
    }
  } }), 'FutureStaff private video preview')
  ctx.effect(() => () => host.dispose(), 'FutureStaff video grants lifecycle')
  return host
}
