import { platformOrigin, type PlatformEnvironment } from './environment.js'
import { mountMarket } from './market-host.js'
import { roleRoot } from './market.js'
import { RememberedLogin } from './remembered-login.js'
import { DesktopLoginWorkspace, readWorkspaceIdentity, workspaceName, workspaceDirectory } from './workspace.js'
import { mountAgents } from './agent-host.js'
import { fetchAgentData, type AgentSnapshot } from './agents.js'
import { createVideoWorkspaceResolver, type VideoWorkspaceResolver } from './video-workspace.js'
import { mountErp } from './erp-host.js'
import { mountShop } from './shop-host.js'
import { mountAgentImages } from './agent-images-host.js'
import { mountWebsite } from './website-host.js'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { PlatformDevApi } from './api.js'
import { FutureStaffChatAdapter } from './chat.js'
import { createChatImageReader } from './chat-images.js'
import { createPlatformInferenceService, type PlatformInferenceService } from './inference.js'
import { apply as applyManagedModelDefault } from './model-default.js'
import { PLATFORM_CONTRACT_VERSION, PLATFORM_MOCK_BASE_URL } from './contracts.js'
import type { ApplicationTokenResult } from './contracts.js'
import { PlatformDevAccessController, type PlatformDevAccessSnapshot } from './dev-access.js'
import { PlatformDevLoginCoordinator } from './dev-login.js'
import { dispatchEmbeddedMock } from './embedded-mock.js'
import { InMemoryTenantResources } from './isolation.js'
import { PlatformPkceTransaction, platformPkceConstants } from './pkce.js'
import { PlatformSessionVault, type PlatformProtectedSecrets } from './session-vault.js'

const ROUTE_PREFIX = '/_futurestaff/platform-mock'
const MAX_REQUEST_BYTES = 64 * 1024
const routes = new Map<string, ReadonlySet<string>>([
  ['/desktop/v1/auth/callback', new Set(['POST'])],
  ['/desktop/v1/auth/refresh', new Set(['POST'])],
  ['/desktop/v1/auth/logout', new Set(['POST'])],
  ['/desktop/v1/tenants', new Set(['GET'])],
  ['/desktop/v1/profile', new Set(['GET'])],
  ['/desktop/v1/tenants/switch', new Set(['POST'])],
  ['/desktop/v1/apps', new Set(['GET'])],
])

export const inject = ['webServer']

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('x-futurestaff-mock', 'true')
  response.setHeader('x-futurestaff-contract-version', PLATFORM_CONTRACT_VERSION)
  response.setHeader('content-length', String(Buffer.byteLength(payload)))
  response.end(payload)
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    size += chunk.length
    if (size > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export interface PlatformAccessConfig { readonly embeddedMock?: boolean; readonly environment?: PlatformEnvironment }

export interface PlatformDevLoginService {
  resolveSystemApplication(appId: string): Promise<{ url: string; owner: string; signal: AbortSignal; prepare: (fetcher: import('./system-sso.js').SystemFetch) => Promise<boolean> }>
  authorizeLocal(): Promise<{ tenantId: string; userId: string; signal: AbortSignal; namespace?: string }>
  begin(): Promise<{ readonly authorizationUrl: string }>
  snapshot(): Promise<PlatformDevAccessSnapshot>
  loginWithPassword(loginIdentifier: string, password: string, tenantId?: string, rememberPassword?: boolean): Promise<PlatformDevAccessSnapshot>
  selectLoginTenant(tenantId: string): Promise<PlatformDevAccessSnapshot>
  refresh(): Promise<PlatformDevAccessSnapshot>
  switchTenant(tenantId: string): Promise<PlatformDevAccessSnapshot>
  logout(): Promise<PlatformDevAccessSnapshot>
  issueApplicationToken(appId: string): Promise<ApplicationTokenResult>
  authorizeGeoBrowser(input:import('./contracts.js').GeoBrowserAuthorization):Promise<{redirectUrl:string}>
  diagnostics(): Promise<{ readonly pending: boolean; readonly exchanging: boolean; readonly vault: 'stored' | 'empty' | 'unavailable' }>
  cancel(): void
}

function protectedSecrets(value: unknown): value is PlatformProtectedSecrets {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return ['available', 'has', 'read', 'write', 'delete'].every(key => typeof record[key] === 'function')
}

function callbackHtml(response: ServerResponse, status: number, success: boolean): void {
  const body = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FutureStaff</title><body><h1>${success ? 'Authorization complete' : 'Authorization failed'}</h1><p>${success ? 'You can return to FutureStaff Agent.' : 'Return to FutureStaff Agent and try again.'}</p></body></html>`
  response.statusCode = status
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-security-policy', "default-src 'none'; style-src 'none'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'no-referrer')
  response.setHeader('content-length', String(Buffer.byteLength(body)))
  response.end(body)
}

function loginJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('content-length', String(Buffer.byteLength(payload)))
  response.end(payload)
}

function mountDevLogin(ctx: Context, environment: PlatformEnvironment): void {
  if (typeof (ctx as unknown as { get?: unknown }).get !== 'function') return
  const secrets = ctx.get('desktopProtectedSecrets') as unknown
  if (!protectedSecrets(secrets)) return
  const origin = platformOrigin(environment)
  const remembered = new RememberedLogin(secrets, environment)
  const api = new PlatformDevApi(globalThis.fetch, origin)
  const profiles = ctx.get('desktopProfiles') as ConstructorParameters<typeof DesktopLoginWorkspace>[0] | undefined
  if (environment === 'production' && !profiles) throw new Error('TENANT_WORKSPACE_SERVICE_REQUIRED')
  const identity = profiles ? readWorkspaceIdentity(profiles.current.dir, environment) : undefined
  const scope = identity ? workspaceName(identity) : 'login'
  const vault = new PlatformSessionVault(secrets, environment, profiles ? scope : undefined)
  const workspace = profiles ? new DesktopLoginWorkspace(profiles, environment, secrets, identity) : undefined
  const access = new PlatformDevAccessController(api, vault, new InMemoryTenantResources(), workspace,
    environment === 'production' ? 'futurestaff-product-hub' : 'futurestaff-product-hub-dev')
  const coordinator = new PlatformDevLoginCoordinator({
    pkce: new PlatformPkceTransaction({ environment }), api, vault,
  })
  const initialized = access.restore()
  const agents = identity ? mountAgents(ctx, origin, identity, workspaceDirectory(identity), async () => {
    await initialized
    return access.authorizeTemplates()
  }) : undefined
  if (identity && agents) ctx.provide('futurestaffVideoWorkspace', createVideoWorkspaceResolver({
    identity,
    authorize: async () => { await initialized; return access.authorizeTemplates() },
    resolveBinding: agents.resolveBinding,
    snapshot: async agentId => fetchAgentData(origin, await access.authorizeTemplates(), agentId) as Promise<AgentSnapshot>,
    workspacePath: agentId => agents.store.workspacePath(agentId),
  }))
  if (identity && agents) mountErp(ctx, origin, async () => { await initialized; return access.authorizeTemplates() },sessionId=>agents.authorizeBusiness(sessionId,'erp'))
  if (identity) mountMarket(ctx, origin, identity, roleRoot(identity), async () => {
    await initialized
    return access.authorizeTemplates()
  })
  applyManagedModelDefault(ctx, { snapshot: () => access.getSnapshot(), authorize: async modelId => { await initialized; return access.authorizeChat(modelId) } })
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/_futurestaff/platform-dev/environment',
    handler: (request, response) => {
      if (request.method !== 'GET' || !isLoopback(request.socket.remoteAddress) || request.headers['x-futurestaff-login'] !== '1')
        return loginJson(response, 403, { error: 'LOCAL_REQUEST_REQUIRED' })
      loginJson(response, 200, { environment, origin })
    },
  }), 'futurestaff-platform-access: non-secret environment display')
  ctx.provide('platformInference', createPlatformInferenceService({
    models: async () => {
      await initialized
      const snapshot = access.getSnapshot()
      if (!['ready', 'no_apps'].includes(snapshot.phase)) throw new Error('PLATFORM_LOGIN_REQUIRED')
      return snapshot.models
    },
    authorize: async modelId => { await initialized; return access.authorizeChat(modelId) },
    secrets, origin,
  }))
  if (typeof ctx.inject === 'function') ctx.inject(['llm'], llmCtx => {
    const adapter = new FutureStaffChatAdapter(async modelId => { await initialized; return access.authorizeChat(modelId) }, secrets, globalThis.fetch, origin,
      async () => { await initialized; return access.getSnapshot().models },
      agents ? agents.resolvePolicyBinding : undefined,
      agents ? createChatImageReader(() => ctx.get('attachments'),async sessionId=>{
        await access.authorizeChat()
        const binding=await agents.resolveBinding(sessionId)
        if(!binding)throw Error('AGENT_BINDING_REQUIRED')
        return agents.store.workspacePath(binding.agentId)
      }) : undefined)
    llmCtx.effect(() => {
      const unregister = llmCtx.llm.registerAdapter(['futurestaff'], adapter)
      return () => { adapter.dispose(); unregister() }
    }, 'futurestaff-platform-access: managed platform inference')
  })
  let server: Server | undefined
  let expiry: NodeJS.Timeout | undefined
  const close = (): void => {
    if (expiry !== undefined) clearTimeout(expiry)
    expiry = undefined
    server?.close()
    server = undefined
    coordinator.cancel()
  }
  const service: PlatformDevLoginService = Object.freeze({
    resolveSystemApplication: async (appId: string) => {
      await initialized
      const identity = await access.authorizeLocal()
      const { authorizedSystemHome } = await import('./system-navigation.js')
      const url = authorizedSystemHome(access.getSnapshot(), appId)
      if (!url || identity.signal.aborted) throw new Error('SYSTEM_VIEW_DENIED')
      return { url, owner: JSON.stringify([origin, identity.tenantId, identity.userId]), signal: identity.signal,
        prepare: async (fetcher: import('./system-sso.js').SystemFetch) => {
          const current = await access.authorizeLocal()
          if (current.signal !== identity.signal || current.userId !== identity.userId || current.tenantId !== identity.tenantId
            || authorizedSystemHome(access.getSnapshot(), appId) !== url) throw new Error('SYSTEM_SSO_REVOKED')
          const { establishModuleSession } = await import('./system-sso.js')
          return establishModuleSession({appId,url,authority:origin,userId:identity.userId,tenantId:identity.tenantId,
            signal:identity.signal,fetch:fetcher,authorize:(moduleId,body)=>access.authorizeModuleBrowser(moduleId,body),
            authorizeAi:body=>access.authorizeAiWeb(body)})
        } }
    },
    authorizeLocal: async () => { await initialized; return { ...await access.authorizeLocal(), namespace: origin } },
    begin: async () => {
      if (workspace) throw new Error('TENANT_PASSWORD_LOGIN_REQUIRED')
      if (server !== undefined) throw new Error('fs-platform-access: callback listener is already active.')
      const authorization = coordinator.begin()
      const listener = createServer(async (request, response) => {
        if (request.method !== 'GET') return callbackHtml(response, 405, false)
        if (!isLoopback(request.socket.remoteAddress) || request.headers.host !== '127.0.0.1:43821'
          || request.url === undefined || request.url.length > 2048) return callbackHtml(response, 400, false)
        try {
          await coordinator.complete(`http://127.0.0.1:43821${request.url}`)
          await access.restore()
          callbackHtml(response, 200, true)
        } catch {
          callbackHtml(response, 400, false)
        } finally {
          close()
        }
      })
      server = listener
      try {
        await new Promise<void>((resolve, reject) => {
          listener.once('error', reject)
          listener.listen(43821, '127.0.0.1', () => {
            listener.off('error', reject)
            listener.on('error', close)
            resolve()
          })
        })
        expiry = setTimeout(close, platformPkceConstants.transactionTtlMs)
        expiry.unref()
        return authorization
      } catch {
        close()
        throw new Error('fs-platform-access: callback listener is unavailable.')
      }
    },
    snapshot: async () => { await initialized; return access.synchronizeProfile() },
    loginWithPassword: (loginIdentifier: string, password: string, tenantId?: string, rememberPassword?: boolean) =>
      remembered.login({ loginIdentifier, password, ...(tenantId ? { tenantId } : {}) }, rememberPassword, input => access.login(input)),
    selectLoginTenant: (tenantId: string) => access.selectLoginTenant(tenantId),
    refresh: () => access.refresh(),
    switchTenant: (tenantId: string) => access.switchTenant(tenantId),
    logout: () => access.logout(),
    issueApplicationToken: (appId: string) => access.issueApplicationToken(appId),
    authorizeGeoBrowser: (input:import('./contracts.js').GeoBrowserAuthorization) => access.authorizeGeoBrowser(input),
    diagnostics: () => coordinator.diagnostics(),
    cancel: close,
  })
  ctx.provide('platformDevLogin', service)
  if (identity && agents) {
    mountWebsite(ctx,origin,async sessionId=>{await initialized;await agents.authorizeBusiness(sessionId,'web');const credentials=await access.authorizeTemplates(),binding=await agents.resolveBinding(sessionId);if(!binding)throw Error('AGENT_SESSION_REQUIRED');return {...credentials,agentId:binding.agentId,version:binding.version,workspacePath:await agents.store.workspacePath(binding.agentId)}})
    const shop=mountShop(ctx, async () => { const target=await service.resolveSystemApplication('shop');return {owner:target.owner,signal:target.signal,origin:new URL(target.url).origin} },sessionId=>agents.authorizeBusiness(sessionId,'shop'))
    mountAgentImages(ctx,origin,async sessionId=>{await initialized;const credentials=await access.authorizeTemplates(),binding=await agents.resolveBinding(sessionId);if(!binding)throw Error('AGENT_SESSION_REQUIRED');return {...credentials,agentId:binding.agentId,version:binding.version,workspacePath:await agents.store.workspacePath(binding.agentId)}},shop,sessionId=>agents.authorizeBusiness(sessionId,'shop'),sessionId=>agents.authorizeBusiness(sessionId,'web'))
  }
  ctx.effect(() => () => { access.dispose(); close() }, 'futurestaff-platform-access: login and callback lifecycle')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/_futurestaff/platform-dev/login',
    handler: async (request, response) => {
      if (request.method !== 'POST' || !isLoopback(request.socket.remoteAddress)
        || request.headers['x-futurestaff-login'] !== '1') {
        return loginJson(response, request.method === 'POST' ? 403 : 405, { error: 'LOGIN_UNAVAILABLE' })
      }
      try { loginJson(response, 200, await service.begin()) } catch {
        loginJson(response, 409, { error: 'LOGIN_UNAVAILABLE' })
      }
    },
  }), 'futurestaff-platform-access: start Platform DEV login')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/_futurestaff/platform-dev/auth/password',
    handler: async (request, response) => {
      if (request.method !== 'POST' || !isLoopback(request.socket.remoteAddress)
        || request.headers['x-futurestaff-login'] !== '1') {
        return loginJson(response, request.method === 'POST' ? 403 : 405, { error: 'LOGIN_UNAVAILABLE' })
      }
      try {
        const body = JSON.parse((await readBody(request)).toString('utf8')) as unknown
        if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid login')
        const input = body as Record<string, unknown>
        const allowed = new Set(['loginIdentifier', 'password', 'tenantId', 'rememberPassword'])
        if (Object.keys(input).some(key => !allowed.has(key))
          || typeof input.loginIdentifier !== 'string' || typeof input.password !== 'string'
          || (input.tenantId !== undefined && typeof input.tenantId !== 'string')
          || (input.rememberPassword !== undefined && typeof input.rememberPassword !== 'boolean')) {
          throw new Error('invalid login')
        }
        loginJson(response, 200, await service.loginWithPassword(
          input.loginIdentifier,
          input.password,
          input.tenantId as string | undefined,
          input.rememberPassword as boolean | undefined,
        ))
      } catch {
        loginJson(response, 401, { error: 'LOGIN_UNAVAILABLE' })
      }
    },
  }), 'futurestaff-platform-access: password login with optional OS-protected remembering')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/_futurestaff/platform-dev/auth/remembered',
    handler: async (request, response) => {
      if (!['GET', 'DELETE'].includes(request.method ?? '') || !isLoopback(request.socket.remoteAddress)
        || request.headers['x-futurestaff-login'] !== '1') return loginJson(response, 403, { error: 'LOGIN_UNAVAILABLE' })
      try {
        if (request.method === 'DELETE') await remembered.forget()
        loginJson(response, 200, await remembered.hint())
      } catch { loginJson(response, 503, { error: 'LOGIN_UNAVAILABLE' }) }
    },
  }), 'futurestaff-platform-access: credential-free remembered-login metadata')
  const guarded = (request: IncomingMessage): boolean => request.headers['x-futurestaff-session'] === '1'
    && isLoopback(request.socket.remoteAddress)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/_futurestaff/platform-dev/auth/tenant',
    handler: async (request, response) => {
      if (request.method !== 'POST' || !guarded(request)) return loginJson(response, 403, { error: 'LOGIN_UNAVAILABLE' })
      try {
        const body = JSON.parse((await readBody(request)).toString('utf8'))
        if (!body || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).join(',') !== 'tenantId'
          || typeof body.tenantId !== 'string') throw new Error('invalid tenant login')
        loginJson(response, 200, await service.selectLoginTenant(body.tenantId))
      } catch { loginJson(response, 403, { error: 'LOGIN_UNAVAILABLE' }) }
    },
  }), 'futurestaff-platform-access: select authorized tenant before opening a workspace')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/_futurestaff/platform-dev/session',
    handler: async (request, response) => {
      if (request.method !== 'GET' || !guarded(request)) {
        return loginJson(response, request.method === 'GET' ? 403 : 405, { error: 'SESSION_UNAVAILABLE' })
      }
      try { loginJson(response, 200, await service.snapshot()) } catch {
        loginJson(response, 503, { error: 'SESSION_UNAVAILABLE' })
      }
    },
  }), 'futurestaff-platform-access: read safe Platform DEV session')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/_futurestaff/platform-dev/session/refresh',
    handler: async (request, response) => {
      if (request.method !== 'POST' || !guarded(request)) {
        return loginJson(response, request.method === 'POST' ? 403 : 405, { error: 'SESSION_UNAVAILABLE' })
      }
      try { loginJson(response, 200, await service.refresh()) } catch {
        loginJson(response, 409, { error: 'SESSION_UNAVAILABLE' })
      }
    },
  }), 'futurestaff-platform-access: refresh Platform DEV session')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/_futurestaff/platform-dev/session/switch',
    handler: async (request, response) => {
      if (request.method !== 'POST' || !guarded(request)) {
        return loginJson(response, request.method === 'POST' ? 403 : 405, { error: 'SESSION_UNAVAILABLE' })
      }
      try {
        const body = JSON.parse((await readBody(request)).toString('utf8')) as unknown
        if (body === null || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).join(',') !== 'tenantId'
          || typeof (body as { tenantId?: unknown }).tenantId !== 'string') throw new Error('invalid tenant')
        loginJson(response, 200, await service.switchTenant((body as { tenantId: string }).tenantId))
      } catch {
        loginJson(response, 403, { error: 'SESSION_UNAVAILABLE' })
      }
    },
  }), 'futurestaff-platform-access: switch Platform DEV tenant')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/_futurestaff/platform-dev/session/logout',
    handler: async (request, response) => {
      if (request.method !== 'POST' || !guarded(request)) {
        return loginJson(response, request.method === 'POST' ? 403 : 405, { error: 'SESSION_UNAVAILABLE' })
      }
      try { loginJson(response, 200, await service.logout()) } catch {
        loginJson(response, 409, { error: 'SESSION_UNAVAILABLE' })
      }
    },
  }), 'futurestaff-platform-access: clear Platform DEV session')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/_futurestaff/platform-dev/apps/product_hub/token',
    handler: async (request, response) => {
      if (request.method !== 'POST' || !isLoopback(request.socket.remoteAddress)
        || request.headers['x-futurestaff-application'] !== 'product_hub') {
        return loginJson(response, request.method === 'POST' ? 403 : 405, { error: 'APPLICATION_UNAVAILABLE' })
      }
      try {
        const token = await service.issueApplicationToken('product_hub')
        loginJson(response, 200, {
          accessToken: token.accessToken,
          tokenType: token.tokenType,
          expiresIn: token.expiresIn,
          audience: token.audience,
          tenantId: token.tenantId,
          permissions: token.permissions,
        })
      } catch {
        loginJson(response, 403, { error: 'APPLICATION_UNAVAILABLE' })
      }
    },
  }), 'futurestaff-platform-access: issue Product Hub application token')
}

async function proxy(request: IncomingMessage, response: ServerResponse, path: string, embeddedMock: boolean): Promise<void> {
  const methods = routes.get(path)
  if (methods === undefined || request.method === undefined || !methods.has(request.method)) {
    json(response, 405, {
      error: { code: 'INVALID_REQUEST', message: 'The request does not match the contract.', retryable: false },
      meta: { contractVersion: PLATFORM_CONTRACT_VERSION, simulated: true },
    })
    return
  }
  if (!isLoopback(request.socket.remoteAddress)) {
    json(response, 403, {
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'The local Mock bridge is loopback-only.', retryable: false },
      meta: { contractVersion: PLATFORM_CONTRACT_VERSION, simulated: true },
    })
    return
  }
  try {
    const body = await readBody(request)
    if (embeddedMock) {
      let parsed: unknown = null
      try { parsed = body.length === 0 ? null : JSON.parse(body.toString('utf8')) } catch { /* dispatched as invalid input */ }
      const result = dispatchEmbeddedMock(request.method, path, request.headers, parsed)
      json(response, result.status, result.body)
      return
    }
    const upstream = await fetch(`${PLATFORM_MOCK_BASE_URL}${path}`, {
      method: request.method,
      headers: {
        'content-type': 'application/json',
        ...(typeof request.headers.authorization === 'string' ? { authorization: request.headers.authorization } : {}),
      },
      body: body.length === 0 ? null : body.toString('utf8'),
    })
    const payload = Buffer.from(await upstream.arrayBuffer())
    response.statusCode = upstream.status
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    response.setHeader('x-futurestaff-mock', upstream.headers.get('x-futurestaff-mock') ?? '')
    response.setHeader('x-futurestaff-contract-version', upstream.headers.get('x-futurestaff-contract-version') ?? '')
    response.setHeader('content-length', String(payload.length))
    response.end(payload)
  } catch {
    json(response, 502, {
      error: { code: 'MOCK_UNAVAILABLE', message: 'The local FutureStaff Mock is unavailable.', retryable: true },
      meta: { contractVersion: PLATFORM_CONTRACT_VERSION, simulated: true },
    })
  }
}

/** Register six exact, loopback-only bridge routes for the pinned local Mock. */
export function apply(ctx: Context, config: PlatformAccessConfig = {}): void {
  platformOrigin(config.environment ?? 'dev')
  if (typeof ctx.provide === 'function' && !protectedSecrets(ctx.get('desktopProtectedSecrets'))) applyManagedModelDefault(ctx)
  for (const path of routes.keys()) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}${path}`,
      handler: (request, response) => proxy(request, response, path, config.embeddedMock === true),
    }), `futurestaff-platform-access: local Mock bridge ${path}`)
  }
  mountDevLogin(ctx, config.environment ?? 'dev')
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    platformInference: PlatformInferenceService
    platformDevLogin: PlatformDevLoginService
    futurestaffVideoWorkspace: VideoWorkspaceResolver
  }
}
