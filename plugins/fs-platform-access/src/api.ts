import { assertPlatformOrigin } from './environment.js'
import type {DiagnosticInput} from './diagnostics.js'
import {
  assertMeta,
  assertSession,
  assertKeys,
  isRecord,
  PLATFORM_CLIENT_ID,
  PLATFORM_CONTRACT_VERSION,
  PLATFORM_DEV_BASE_URL,
  PLATFORM_DEV_CONTRACT_VERSION,
  PLATFORM_MOCK_BASE_URL,
  requireBoundedString,
  requireHttpUrl,
  requireString,
  requireUuid,
  type ApplicationList,
  type ApplicationTokenResult,
  type AuthCallbackInput,
  type AuthResult,
  type AuthorizedApplication,
  type ModelList,
  type PasswordLoginInput,
  type PlatformErrorCode,
  type PlatformModel,
  type RefreshResult,
  type Tenant,
  type TenantList,
  type TenantRole,
  type TenantSwitchResult,
  type User,
} from './contracts.js'

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const roles: readonly TenantRole[] = ['member', 'agent_admin', 'org_admin', 'platform_admin']
const serverErrorCodes: readonly PlatformErrorCode[] = [
  'INVALID_REQUEST', 'AUTHENTICATION_REQUIRED', 'TENANT_MEMBERSHIP_REQUIRED',
  'TENANT_ACCESS_DENIED', 'APPLICATION_ACCESS_DENIED', 'TOKEN_AUDIENCE_INVALID',
  'TOKEN_EXPIRED', 'NOT_FOUND',
]
const slugPattern = /^[a-z0-9][a-z0-9-]{1,62}$/
const appIdPattern = /^[a-z][a-z0-9_]{1,63}$/
const capabilityPattern = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

export class PlatformApiError extends Error {
  constructor(
    readonly code: PlatformErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'PlatformApiError'
  }
}

function assertLoopbackMockBaseUrl(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '43821' || url.pathname !== '/') {
    throw new Error('B01a accepts only http://127.0.0.1:43821')
  }
  return url.origin
}


function tenant(value: unknown, origin: string): Tenant {
  if (!isRecord(value)) throw new Error('invalid tenant')
  assertKeys(value, ['tenantId', 'displayName', 'slug', 'role'], ['logoUrl'])
  const role = requireString(value, 'role') as TenantRole
  if (!roles.includes(role)) throw new Error('invalid tenant role')
  const slug = requireBoundedString(value, 'slug', 2, 63)
  if (!slugPattern.test(slug)) throw new Error('invalid tenant slug')
  let logoUrl = value.logoUrl
  if (typeof logoUrl === 'string' && logoUrl.startsWith('/')) {
    if (logoUrl.startsWith('//') || logoUrl.includes('\\') || logoUrl.length > 2048) throw new Error('invalid tenant logo')
    const image = new URL(logoUrl, origin)
    if (image.origin !== origin || image.username || image.password) throw new Error('invalid tenant logo')
    logoUrl = image.href
  }
  if (logoUrl !== undefined && logoUrl !== null) requireHttpUrl({ logoUrl }, 'logoUrl')
  return Object.freeze({
    tenantId: requireUuid(value, 'tenantId'),
    displayName: requireBoundedString(value, 'displayName', 1, 120),
    slug,
    logoUrl: typeof logoUrl === 'string' || logoUrl === null ? logoUrl : null,
    role,
  })
}

function application(value: unknown, allowWebsiteManagement = false): AuthorizedApplication {
  if (!isRecord(value) || !isRecord(value.deepLinks) || !Array.isArray(value.capabilities)) {
    throw new Error('invalid application')
  }
  const managementFields = ['canManage', 'applicationId', 'permissions', 'mcpUrl', 'tokenExchangePath']
  assertKeys(value, ['appId', 'tenantId', 'displayName', 'baseUrl', 'deepLinks', 'capabilities', 'contractRange'],
    allowWebsiteManagement ? managementFields : [])
  if (managementFields.some(key => key in value)) {
    const capabilities = value.capabilities
    // Validate the known Website discovery extension, then project only the
    // existing desktop fields. Management metadata never grants desktop access.
    if (managementFields.some(key => !(key in value)) || value.appId !== 'web'
      || value.applicationId !== 'futurestaff-web' || typeof value.canManage !== 'boolean'
      || !Array.isArray(value.permissions) || value.permissions.length < 1 || value.permissions.length > 100
      || value.permissions.some(permission => typeof permission !== 'string' || !capabilities.includes(permission))
      || new Set(value.permissions).size !== value.permissions.length
      || value.tokenExchangePath !== '/api/website-control/v1/agent-token') {
      throw new Error('invalid website management projection')
    }
    const mcpUrl = new URL(requireHttpUrl(value, 'mcpUrl'))
    const baseUrl = new URL(requireHttpUrl(value, 'baseUrl'))
    if (mcpUrl.protocol !== 'https:' || mcpUrl.origin !== baseUrl.origin
      || mcpUrl.pathname !== '/mcp' || mcpUrl.search || mcpUrl.hash) {
      throw new Error('invalid website MCP endpoint')
    }
  }
  const appId = requireBoundedString(value, 'appId', 2, 64)
  if (!appIdPattern.test(appId)) throw new Error('invalid application id')
  const tenantId = requireUuid(value, 'tenantId')
  const deepLinks = Object.fromEntries(Object.entries(value.deepLinks).map(([key, path]) => {
    if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('invalid application deep link')
    return [key, path]
  }))
  const capabilities = value.capabilities.map((item) => {
    if (typeof item !== 'string' || !capabilityPattern.test(item)) throw new Error('invalid application capability')
    return item
  })
  if (new Set(capabilities).size !== capabilities.length) throw new Error('duplicate application capability')
  return Object.freeze({
    appId, tenantId,
    displayName: requireBoundedString(value, 'displayName', 1, 120), baseUrl: requireHttpUrl(value, 'baseUrl'),
    deepLinks: Object.freeze(deepLinks), capabilities: Object.freeze(capabilities),
    contractRange: requireString(value, 'contractRange'),
  })
}

function user(value: unknown): User {
  if (!isRecord(value)) throw new Error('invalid user')
  assertKeys(value, ['userId', 'displayName'], ['email'])
  const email = value.email
  if (email !== undefined && email !== null
    && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email))) {
    throw new Error('invalid user email')
  }
  return Object.freeze({
    userId: requireUuid(value, 'userId'), displayName: requireBoundedString(value, 'displayName', 1, 100),
    email: typeof email === 'string' || email === null ? email : null,
  })
}

function platformModel(value: unknown): PlatformModel {
  if (!isRecord(value)) throw new Error('invalid platform model')
  assertKeys(value, ['modelId', 'displayName', 'provider', 'model', 'supportsVision', 'isDefault'])
  if (typeof value.supportsVision !== 'boolean' || typeof value.isDefault !== 'boolean') {
    throw new Error('invalid platform model capabilities')
  }
  return Object.freeze({
    modelId: requireUuid(value, 'modelId'),
    displayName: requireBoundedString(value, 'displayName', 1, 200),
    provider: requireBoundedString(value, 'provider', 1, 50),
    model: requireBoundedString(value, 'model', 1, 100),
    supportsVision: value.supportsVision,
    isDefault: value.isDefault,
  })
}

interface ResponseContract {
  readonly version: '0.1.0' | '0.1.1'
  readonly simulated: boolean
  readonly requireMockProof: boolean
  readonly unavailableCode: 'MOCK_UNAVAILABLE' | 'PLATFORM_UNAVAILABLE'
  readonly unavailableMessage: string
}

abstract class PlatformApiClient {
  readonly baseUrl: string

  protected constructor(
    private readonly fetcher: Fetch,
    baseUrl: string,
    private readonly responseContract: ResponseContract,
    private readonly reportDiagnostic?: (input:DiagnosticInput)=>void,
  ) { this.baseUrl = baseUrl }

  async login(input: AuthCallbackInput, signal?: AbortSignal): Promise<AuthResult> {
    const body = await this.request('/desktop/v1/auth/callback', {
      method: 'POST', signal: signal ?? null,
      body: JSON.stringify({ clientId: PLATFORM_CLIENT_ID, ...input }),
    })
    return this.decode(() => {
      if (!isRecord(body)) throw new Error('invalid login response')
      assertKeys(body, ['session', 'user', 'meta'])
      return Object.freeze({ session: assertSession(body.session), user: user(body.user), meta: this.meta(body.meta) })
    })
  }

  async refresh(refreshToken: string, signal?: AbortSignal): Promise<RefreshResult> {
    const body = await this.request('/desktop/v1/auth/refresh', {
      method: 'POST', signal: signal ?? null,
      body: JSON.stringify({ clientId: PLATFORM_CLIENT_ID, refreshToken }),
    })
    return this.decode(() => {
      if (!isRecord(body)) throw new Error('invalid refresh response')
      assertKeys(body, ['session', 'meta'])
      return Object.freeze({ session: assertSession(body.session), meta: this.meta(body.meta) })
    })
  }

  async currentUser(accessToken: string, signal?: AbortSignal): Promise<{ readonly activeTenantId: string; readonly user: User }> {
    const body = await this.request('/desktop/v1/profile', {
      signal: signal ?? null, headers: this.authorization(accessToken), cache: 'no-store',
    })
    return this.decode(() => {
      if (!isRecord(body)) throw new Error('invalid profile response')
      assertKeys(body, ['activeTenantId', 'user', 'meta'])
      this.meta(body.meta)
      return Object.freeze({ activeTenantId: requireUuid(body, 'activeTenantId'), user: user(body.user) })
    })
  }

  async logout(refreshToken: string | undefined, signal?: AbortSignal): Promise<void> {
    const body = await this.request('/desktop/v1/auth/logout', {
      method: 'POST', signal: signal ?? null,
      body: JSON.stringify(refreshToken === undefined ? {} : { refreshToken }),
    })
    this.decode(() => {
      if (!isRecord(body)) throw new Error('invalid logout response')
      assertKeys(body, ['ok', 'revocationEffectiveWithinSeconds', 'meta'])
      if (body.ok !== true
        || !Number.isInteger(body.revocationEffectiveWithinSeconds)
        || Number(body.revocationEffectiveWithinSeconds) < 0
        || Number(body.revocationEffectiveWithinSeconds) > 60) {
        throw new Error('invalid logout result')
      }
      this.meta(body.meta)
    })
  }

  async listTenants(accessToken: string, signal?: AbortSignal): Promise<TenantList> {
    const body = await this.request('/desktop/v1/tenants', { signal: signal ?? null, headers: this.authorization(accessToken) })
    return this.decode(() => {
      if (!isRecord(body) || !Array.isArray(body.items)) throw new Error('invalid tenant list')
      assertKeys(body, ['activeTenantId', 'items', 'meta'])
      return Object.freeze({
        activeTenantId: requireUuid(body, 'activeTenantId'), items: Object.freeze(body.items.map(item => tenant(item, this.baseUrl))), meta: this.meta(body.meta),
      })
    })
  }

  async switchTenant(accessToken: string, tenantId: string, signal?: AbortSignal): Promise<TenantSwitchResult> {
    const body = await this.request('/desktop/v1/tenants/switch', {
      method: 'POST', signal: signal ?? null, headers: this.authorization(accessToken), body: JSON.stringify({ tenantId }),
    })
    return this.decode(() => {
      if (!isRecord(body)) throw new Error('invalid tenant switch response')
      assertKeys(body, ['tenant', 'session', 'meta'])
      const session = assertSession(body.session)
      const selectedTenant = tenant(body.tenant, this.baseUrl)
      if (session.activeTenantId !== selectedTenant.tenantId) throw new Error('tenant switch identity mismatch')
      return Object.freeze({ tenant: selectedTenant, session, meta: this.meta(body.meta) })
    })
  }

  async listApplications(accessToken: string, activeTenantId: string, signal?: AbortSignal): Promise<ApplicationList> {
    const body = await this.request('/desktop/v1/apps', { signal: signal ?? null, headers: this.authorization(accessToken) })
    return this.decode(() => {
      if (!isRecord(body) || !Array.isArray(body.items)) throw new Error('invalid application list')
      assertKeys(body, ['activeTenantId', 'items', 'meta'])
      const responseTenantId = requireUuid(body, 'activeTenantId')
      const items = body.items.map(item => application(item, this.responseContract.version === PLATFORM_DEV_CONTRACT_VERSION))
      if (responseTenantId !== activeTenantId || items.some(item => item.tenantId !== activeTenantId)) {
        throw new Error('application response crossed the active tenant boundary')
      }
      return Object.freeze({ activeTenantId, items: Object.freeze(items), meta: this.meta(body.meta) })
    })
  }

  async listModels(accessToken: string, activeTenantId: string, signal?: AbortSignal): Promise<ModelList> {
    const body = await this.request('/desktop/v1/models', {
      signal: signal ?? null,
      headers: this.authorization(accessToken),
    })
    return this.decode(() => {
      if (!isRecord(body) || !Array.isArray(body.items)) throw new Error('invalid model list')
      assertKeys(body, ['activeTenantId', 'activeModelId', 'items', 'meta'])
      const responseTenantId = requireUuid(body, 'activeTenantId')
      const items = body.items.map(platformModel)
      const activeModelId = body.activeModelId === null ? null : requireUuid(body, 'activeModelId')
      if (responseTenantId !== activeTenantId
        || (activeModelId !== null && !items.some(item => item.modelId === activeModelId))
        || items.filter(item => item.isDefault).length > 1) {
        throw new Error('model response crossed the active tenant boundary')
      }
      return Object.freeze({
        activeTenantId,
        activeModelId,
        items: Object.freeze(items),
        meta: this.meta(body.meta),
      })
    })
  }

  protected authorization(accessToken: string): HeadersInit {
    return { Authorization: `Bearer ${accessToken}` }
  }

  protected async request(path: string, init: RequestInit): Promise<unknown> {
    const started=Date.now()
    try{return await this.performRequest(path,init)}catch(error){
      if(!init.signal?.aborted&&!(error instanceof Error&&error.name==='AbortError')){
        const operation=path.includes('/auth/password')||path.includes('/auth/callback')?'login':path.includes('/auth/refresh')?'refresh':'discovery'
        try{this.reportDiagnostic?.({category:operation==='discovery'?'network':'auth',operation,
          code:error instanceof PlatformApiError?error.code:'NETWORK_ERROR',durationMs:Math.min(Date.now()-started,3600000),
          ...(error instanceof PlatformApiError&&error.status?{httpStatus:error.status}:{})})}catch{/* Reporting never changes the API outcome. */}
      }
      throw error
    }
  }

  private async performRequest(path:string,init:RequestInit):Promise<unknown>{
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init, redirect: 'error',
        headers: { 'Content-Type': 'application/json', ...init.headers },
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new PlatformApiError(this.responseContract.unavailableCode, this.responseContract.unavailableMessage, true)
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw this.mismatch('platform returned non-JSON data', response.status)
    }
    if (this.responseContract.requireMockProof && (response.headers.get('x-futurestaff-mock') !== 'true'
      || response.headers.get('x-futurestaff-contract-version') !== this.responseContract.version)) {
      throw this.mismatch('response is not from the pinned local mock', response.status)
    }
    try {
      if (!isRecord(body)) throw new Error('invalid response body')
      this.meta(body.meta)
    } catch {
      throw this.mismatch('response metadata does not match the pinned contract', response.status)
    }
    if (!response.ok) {
      let code: PlatformErrorCode
      let message: string
      let retryable: boolean
      try {
        assertKeys(body, ['error', 'meta'])
        if (!isRecord(body.error)) throw new Error('invalid error')
        const error = body.error
        assertKeys(error, ['code', 'message', 'retryable'], ['details'])
        if (typeof error.code !== 'string' || !serverErrorCodes.includes(error.code as PlatformErrorCode)) {
          throw new Error('invalid error code')
        }
        if (typeof error.retryable !== 'boolean') throw new Error('invalid retryable')
        if (error.details !== undefined && !isRecord(error.details)) throw new Error('invalid error details')
        code = error.code as PlatformErrorCode
        message = requireString(error, 'message')
        retryable = error.retryable
      } catch {
        throw this.mismatch('platform error response does not match the pinned contract', response.status)
      }
      throw new PlatformApiError(
        code,
        message,
        retryable,
        response.status,
      )
    }
    return body
  }

  protected meta(value: unknown) {
    return assertMeta(value, this.responseContract.version, this.responseContract.simulated)
  }

  protected mismatch(message: string, status?: number): PlatformApiError {
    return new PlatformApiError('CONTRACT_MISMATCH', message, false, status)
  }

  protected decode<T>(decoder: () => T): T {
    try { return decoder() } catch {
      // HTTP success is not contract success; callers often turn this into UI state.
      try{this.reportDiagnostic?.({category:'network',operation:'discovery',code:'CONTRACT_MISMATCH'})}catch{/* Nonthrowing observation. */}
      throw this.mismatch('platform response does not match the pinned contract')
    }
  }
}

export class PlatformMockApi extends PlatformApiClient {
  constructor(fetcher: Fetch = globalThis.fetch, baseUrl = PLATFORM_MOCK_BASE_URL) {
    super(fetcher, assertLoopbackMockBaseUrl(baseUrl), {
      version: PLATFORM_CONTRACT_VERSION,
      simulated: true,
      requireMockProof: true,
      unavailableCode: 'MOCK_UNAVAILABLE',
      unavailableMessage: '本地 FutureStaff Mock 不可用。',
    })
  }

}

export class PlatformDevApi extends PlatformApiClient {
  constructor(fetcher: Fetch = globalThis.fetch, baseUrl: string = PLATFORM_DEV_BASE_URL,reportDiagnostic?:(input:DiagnosticInput)=>void) {
    super(fetcher, assertPlatformOrigin(baseUrl), {
      version: PLATFORM_DEV_CONTRACT_VERSION,
      simulated: false,
      requireMockProof: false,
      unavailableCode: 'PLATFORM_UNAVAILABLE',
      unavailableMessage: 'FutureStaff 平台暂时不可用。',
    },reportDiagnostic)
  }

  async loginWithPassword(input: PasswordLoginInput, signal?: AbortSignal): Promise<AuthResult> {
    const loginIdentifier = input.loginIdentifier.trim()
    if (loginIdentifier.length < 1 || loginIdentifier.length > 254
      || input.password.length < 1 || input.password.length > 128) {
      throw this.mismatch('password login input is invalid')
    }
    if (input.tenantId !== undefined) requireUuid({ tenantId: input.tenantId }, 'tenantId')
    const body = await this.request('/desktop/v1/auth/password', {
      method: 'POST', signal: signal ?? null,
      body: JSON.stringify({
        loginIdentifier,
        password: input.password,
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      }),
    })
    return this.decode(() => {
      if (!isRecord(body)) throw new Error('invalid password login response')
      assertKeys(body, ['session', 'user', 'meta'])
      return Object.freeze({
        session: assertSession(body.session),
        user: user(body.user),
        meta: this.meta(body.meta),
      })
    })
  }

  async issueApplicationToken(
    accessToken: string,
    appId: string,
    activeTenantId: string,
    signal?: AbortSignal,
  ): Promise<ApplicationTokenResult> {
    if (!appIdPattern.test(appId)) throw this.mismatch('application ID is not safe for the contract route')
    try { requireUuid({ tenantId: activeTenantId }, 'tenantId') } catch {
      throw this.mismatch('active tenant ID is not valid for the contract route')
    }
    const body = await this.request(`/desktop/v1/apps/${appId}/token`, {
      method: 'POST', signal: appId==='geo'?AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(5000)]):signal??null, headers: this.authorization(accessToken),
    })
    return this.decode(() => {
      if (!isRecord(body) || !Array.isArray(body.permissions)) throw new Error('invalid application token')
      assertKeys(body, ['accessToken', 'tokenType', 'expiresIn', 'audience', 'tenantId', 'permissions', 'meta'])
      const tenantId = requireUuid(body, 'tenantId')
      const permissions = body.permissions.map((permission) => {
        if (typeof permission !== 'string' || !capabilityPattern.test(permission)) {
          throw new Error('invalid application permission')
        }
        return permission
      })
      if (permissions.length === 0 || new Set(permissions).size !== permissions.length) {
        throw new Error('invalid application permissions')
      }
      if (tenantId !== activeTenantId) throw new Error('application token crossed the active tenant boundary')
      const accessToken = requireBoundedString(body, 'accessToken', 20, 8192)
      if (!/^[\x21-\x7e]+$/u.test(accessToken)) throw new Error('invalid application access token')
      return Object.freeze({
        accessToken,
        tokenType: body.tokenType === 'Bearer' ? 'Bearer' as const : (() => { throw new Error('invalid tokenType') })(),
        expiresIn: body.expiresIn === 60 ? 60 as const : (() => { throw new Error('invalid expiresIn') })(),
        audience: requireBoundedString(body, 'audience', 3, 100), tenantId,
        permissions: Object.freeze(permissions), meta: this.meta(body.meta),
      })
    })
  }
  async authorizeGeoBrowser(accessToken:string,input:import('./contracts.js').GeoBrowserAuthorization,signal?:AbortSignal):Promise<{redirectUrl:string}> {
    const production=this.baseUrl==='https://platform.fsstory.net';
    const origin=production?'https://geo.fsstory.net':'https://geo-dev.fsstory.net';
    if(input.clientId!==(production?'futurestaff-geo-prod':'futurestaff-geo-dev')||input.redirectUri!==origin+'/oauth/callback/futurestaff'
      ||!/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge)||!/^[A-Za-z0-9_-]{16,128}$/.test(input.state))throw this.mismatch('invalid GEO browser request');
    const body=await this.request('/desktop/v1/apps/geo/browser-authorize',{method:'POST',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(10000)]),headers:{...this.authorization(accessToken),'Content-Type':'application/json'},body:JSON.stringify(input)});
    return this.decode(()=>{
      if(!isRecord(body)||typeof body.redirectUrl!=='string')throw Error('invalid GEO handoff');
      assertKeys(body,['redirectUrl','meta']);this.meta(body.meta);
      const target=new URL(body.redirectUrl);
      if(target.origin+target.pathname!==input.redirectUri||target.username||target.password||target.hash
        ||[...target.searchParams.keys()].sort().join(',')!=='code,state'||target.searchParams.get('state')!==input.state
        ||!/^[A-Za-z0-9_-]{20,256}$/.test(target.searchParams.get('code')||''))throw Error('invalid GEO callback');
      return {redirectUrl:target.href};
    });
  }
  async authorizeModuleBrowser(accessToken: string, appId: string, input: import('./contracts.js').GeoBrowserAuthorization, signal?: AbortSignal): Promise<{redirectUrl:string}> {
    if (!['erp','product_hub','vietnam_immigration','geo','web'].includes(appId)) throw this.mismatch('unsupported browser application')
    const body = await this.request(`/desktop/v1/apps/${appId}/browser-authorize`, { method: 'POST', ...(signal?{signal}:{}),
      headers: {...this.authorization(accessToken), 'Content-Type':'application/json'}, body: JSON.stringify(input) })
    return this.decode(() => {
      if (!isRecord(body) || typeof body.redirectUrl !== 'string') throw Error('invalid module handoff')
      assertKeys(body, ['redirectUrl','meta']); this.meta(body.meta)
      const target = new URL(body.redirectUrl)
      if (target.origin + target.pathname !== input.redirectUri || target.username || target.password || target.hash
        || [...target.searchParams.keys()].sort().join(',') !== 'code,state' || target.searchParams.get('state') !== input.state
        || !/^[A-Za-z0-9_-]{20,256}$/.test(target.searchParams.get('code') ?? '')) throw Error('invalid module callback')
      return {redirectUrl:target.href}
    })
  }
  async authorizeAiWeb(accessToken: string, input: {codeChallenge:string;state:string}, signal?:AbortSignal):Promise<{code:string;state:string}> {
    const body=await this.request('/desktop/v1/apps/futurestaff_ai/web-authorize',{method:'POST',...(signal?{signal}:{}),
      headers:{...this.authorization(accessToken),'Content-Type':'application/json'},body:JSON.stringify(input)})
    return this.decode(()=>{
      if(!isRecord(body))throw Error('invalid AI handoff')
      assertKeys(body,['code','state','meta']);this.meta(body.meta)
      if(typeof body.code!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(body.code)||body.state!==input.state)throw Error('invalid AI proof')
      return {code:body.code,state:input.state}
    })
  }
}
