import { PlatformApiError } from './api.js'
import type { ChatCredentials } from './chat.js'
import {
  assertKeys,
  isRecord,
  PLATFORM_DEV_CONTRACT_VERSION,
  requireBoundedString,
  requireHttpUrl,
  requireString,
  requireUuid,
  type AuthorizedApplication,
  type ApplicationTokenResult,
  type DesktopSession,
  type ModelList,
  type PasswordLoginInput,
  type PlatformFailure,
  type PlatformModel,
  type RefreshResult,
  type Tenant,
  type TenantList,
  type TenantSwitchResult,
  type User,
} from './contracts.js'
import { clearTenantBoundary, type TenantIsolationBoundary } from './isolation.js'
import type { StoredPlatformSession } from './session-vault.js'
import type { LoginWorkspace } from './workspace.js'
import { systemApplicationIds, type SystemApplicationId } from './system-policy.js'

export type PlatformDevAccessPhase = 'signed_out' | 'loading' | 'selecting_tenant' | 'ready' | 'no_apps' | 'expired' | 'error'

export interface PlatformDevAccessSnapshot {
  readonly phase: PlatformDevAccessPhase
  readonly simulated: false
  readonly contractVersion: typeof PLATFORM_DEV_CONTRACT_VERSION
  readonly user?: User
  readonly activeTenantId?: string
  readonly tenants: readonly Tenant[]
  readonly applications: readonly AuthorizedApplication[]
  readonly models: readonly PlatformModel[]
  readonly activeModelId?: string | null
  readonly error?: PlatformFailure
}

interface PlatformDevAccessApi {
  currentUser?(accessToken: string, signal?: AbortSignal): Promise<{ readonly activeTenantId: string; readonly user: User }>
  authorizeGeoBrowser?(accessToken:string,input:import('./contracts.js').GeoBrowserAuthorization,signal?:AbortSignal):Promise<{redirectUrl:string}>
  authorizeModuleBrowser?(accessToken:string,appId:string,input:import('./contracts.js').GeoBrowserAuthorization,signal?:AbortSignal):Promise<{redirectUrl:string}>
  authorizeAiWeb?(accessToken:string,input:{codeChallenge:string;state:string},signal?:AbortSignal):Promise<{code:string;state:string}>
  loginWithPassword(input: PasswordLoginInput, signal?: AbortSignal): Promise<{
    readonly session: DesktopSession
    readonly user: User
  }>
  refresh(refreshToken: string, signal?: AbortSignal): Promise<RefreshResult>
  logout(refreshToken: string | undefined, signal?: AbortSignal): Promise<void>
  listTenants(accessToken: string, signal?: AbortSignal): Promise<TenantList>
  switchTenant(accessToken: string, tenantId: string, signal?: AbortSignal): Promise<TenantSwitchResult>
  listApplications(accessToken: string, activeTenantId: string, signal?: AbortSignal): Promise<{
    readonly activeTenantId: string
    readonly items: readonly AuthorizedApplication[]
  }>
  listModels(accessToken: string, activeTenantId: string, signal?: AbortSignal): Promise<ModelList>
  issueApplicationToken(
    accessToken: string,
    appId: string,
    activeTenantId: string,
    signal?: AbortSignal,
  ): Promise<ApplicationTokenResult>
}

interface PlatformDevAccessVault {
  load(): Promise<StoredPlatformSession | undefined>
  save(value: StoredPlatformSession): Promise<void>
  clear(): Promise<void>
}

const initialSnapshot: PlatformDevAccessSnapshot = Object.freeze({
  phase: 'signed_out', simulated: false, contractVersion: PLATFORM_DEV_CONTRACT_VERSION,
  tenants: Object.freeze([]), applications: Object.freeze([]), models: Object.freeze([]),
})

const phases: readonly PlatformDevAccessPhase[] = ['signed_out', 'loading', 'selecting_tenant', 'ready', 'no_apps', 'expired', 'error']
const roles = ['member', 'agent_admin', 'org_admin', 'platform_admin'] as const
const failureCodes: readonly PlatformFailure['code'][] = [
  'INVALID_REQUEST', 'AUTHENTICATION_REQUIRED', 'TENANT_MEMBERSHIP_REQUIRED', 'TENANT_ACCESS_DENIED',
  'APPLICATION_ACCESS_DENIED', 'TOKEN_AUDIENCE_INVALID', 'TOKEN_EXPIRED', 'NOT_FOUND',
  'PLATFORM_UNAVAILABLE', 'CONTRACT_MISMATCH',
]

function safeUser(value: unknown): User {
  if (!isRecord(value)) throw new Error('invalid DEV session snapshot')
  assertKeys(value, ['userId', 'displayName'], ['email'])
  const email = value.email
  if (email !== undefined && email !== null
    && (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+$/u.test(email))) {
    throw new Error('invalid DEV session snapshot')
  }
  return Object.freeze({
    userId: requireUuid(value, 'userId'),
    displayName: requireBoundedString(value, 'displayName', 1, 100),
    email: typeof email === 'string' || email === null ? email : null,
  })
}

function safeTenant(value: unknown): Tenant {
  if (!isRecord(value)) throw new Error('invalid DEV session snapshot')
  assertKeys(value, ['tenantId', 'displayName', 'slug', 'role'], ['logoUrl'])
  const role = requireString(value, 'role')
  if (!roles.includes(role as typeof roles[number])) throw new Error('invalid DEV session snapshot')
  const logoUrl = value.logoUrl
  if (logoUrl !== undefined && logoUrl !== null) requireHttpUrl(value, 'logoUrl')
  return Object.freeze({
    tenantId: requireUuid(value, 'tenantId'),
    displayName: requireBoundedString(value, 'displayName', 1, 120),
    slug: (() => {
      const slug = requireBoundedString(value, 'slug', 2, 63)
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/u.test(slug)) throw new Error('invalid DEV session snapshot')
      return slug
    })(),
    logoUrl: typeof logoUrl === 'string' || logoUrl === null ? logoUrl : null,
    role: role as Tenant['role'],
  })
}

function safeApplication(value: unknown): AuthorizedApplication {
  if (!isRecord(value) || !isRecord(value.deepLinks) || !Array.isArray(value.capabilities)) {
    throw new Error('invalid DEV session snapshot')
  }
  assertKeys(value, ['appId', 'tenantId', 'displayName', 'baseUrl', 'deepLinks', 'capabilities', 'contractRange'])
  const deepLinks = Object.fromEntries(Object.entries(value.deepLinks).map(([key, path]) => {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(key) || typeof path !== 'string' || !path.startsWith('/') || path.length > 2048) {
      throw new Error('invalid DEV session snapshot')
    }
    return [key, path]
  }))
  const capabilities = value.capabilities.map(item => {
    if (typeof item !== 'string' || !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/u.test(item)) {
      throw new Error('invalid DEV session snapshot')
    }
    return item
  })
  if (new Set(capabilities).size !== capabilities.length) throw new Error('invalid DEV session snapshot')
  return Object.freeze({
    appId: (() => {
      const appId = requireBoundedString(value, 'appId', 2, 64)
      if (!/^[a-z][a-z0-9_]{1,63}$/u.test(appId)) throw new Error('invalid DEV session snapshot')
      return appId
    })(),
    tenantId: requireUuid(value, 'tenantId'),
    displayName: requireBoundedString(value, 'displayName', 1, 120),
    baseUrl: requireHttpUrl(value, 'baseUrl'),
    deepLinks: Object.freeze(deepLinks),
    capabilities: Object.freeze(capabilities),
    contractRange: requireBoundedString(value, 'contractRange', 1, 100),
  })
}

function safeModel(value: unknown): PlatformModel {
  if (!isRecord(value)) throw new Error('invalid DEV session snapshot')
  assertKeys(value, ['modelId', 'displayName', 'provider', 'model', 'supportsVision', 'isDefault'])
  if (typeof value.supportsVision !== 'boolean' || typeof value.isDefault !== 'boolean') {
    throw new Error('invalid DEV session snapshot')
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

function safeFailure(value: unknown): PlatformFailure {
  if (!isRecord(value)) throw new Error('invalid DEV session snapshot')
  assertKeys(value, ['code', 'message', 'retryable'])
  const code = requireString(value, 'code') as PlatformFailure['code']
  if (!failureCodes.includes(code) || typeof value.retryable !== 'boolean') {
    throw new Error('invalid DEV session snapshot')
  }
  return Object.freeze({ code, message: requireBoundedString(value, 'message', 1, 200), retryable: value.retryable })
}

export function decodePlatformDevAccessSnapshot(value: unknown): PlatformDevAccessSnapshot {
  if (!isRecord(value) || !Array.isArray(value.tenants)
    || !Array.isArray(value.applications) || !Array.isArray(value.models)) {
    throw new Error('invalid DEV session snapshot')
  }
  assertKeys(value, ['phase', 'simulated', 'contractVersion', 'tenants', 'applications', 'models'], ['user', 'activeTenantId', 'activeModelId', 'error'])
  if (typeof value.phase !== 'string' || !phases.includes(value.phase as PlatformDevAccessPhase)
    || value.simulated !== false || value.contractVersion !== PLATFORM_DEV_CONTRACT_VERSION
    || value.tenants.length > 100 || value.applications.length > 200 || value.models.length > 200) {
    throw new Error('invalid DEV session snapshot')
  }
  const phase = value.phase as PlatformDevAccessPhase
  const tenants = Object.freeze(value.tenants.map(safeTenant))
  const applications = Object.freeze(value.applications.map(safeApplication))
  const models = Object.freeze(value.models.map(safeModel))
  const parsed: PlatformDevAccessSnapshot = Object.freeze({
    phase,
    simulated: false,
    contractVersion: PLATFORM_DEV_CONTRACT_VERSION,
    tenants,
    applications,
    models,
    ...(value.user === undefined ? {} : { user: safeUser(value.user) }),
    ...(value.activeTenantId === undefined ? {} : { activeTenantId: requireUuid(value, 'activeTenantId') }),
    ...(value.activeModelId === undefined || value.activeModelId === null
      ? { activeModelId: null }
      : { activeModelId: requireUuid(value, 'activeModelId') }),
    ...(value.error === undefined ? {} : { error: safeFailure(value.error) }),
  })
  if (phase === 'signed_out' && (parsed.user !== undefined || parsed.activeTenantId !== undefined
    || tenants.length !== 0 || applications.length !== 0 || models.length !== 0
    || parsed.activeModelId !== null || parsed.error !== undefined)) {
    throw new Error('invalid DEV session snapshot')
  }
  if ((phase === 'ready' || phase === 'no_apps')
    && (parsed.user === undefined || parsed.activeTenantId === undefined
      || !tenants.some(tenant => tenant.tenantId === parsed.activeTenantId)
      || applications.some(application => application.tenantId !== parsed.activeTenantId)
      || (parsed.activeModelId !== null && !models.some(model => model.modelId === parsed.activeModelId))
      || (phase === 'ready' && applications.length === 0)
      || (phase === 'no_apps' && applications.length !== 0))) {
    throw new Error('invalid DEV session snapshot')
  }
  if (phase === 'selecting_tenant' && (!parsed.user || parsed.activeTenantId !== undefined || tenants.length === 0
    || new Set(tenants.map(item => item.tenantId)).size !== tenants.length
    || applications.length !== 0 || models.length !== 0 || parsed.activeModelId !== null || parsed.error)) {
    throw new Error('invalid tenant login snapshot')
  }
  if ((phase === 'expired' || phase === 'error') !== (parsed.error !== undefined)) {
    throw new Error('invalid DEV session snapshot')
  }
  return parsed
}

function failure(error: unknown, context: 'login' | 'session' = 'session'): PlatformFailure {
  if (error instanceof PlatformApiError) {
    if (context === 'login') {
      if (error.code === 'AUTHENTICATION_REQUIRED') {
        return Object.freeze({
          code: error.code,
          message: error.status === 403
            ? '账号尚未完成邮箱验证，请先在 FutureStaff 平台网页完成验证后重试。'
            : '账号或密码错误，请重新输入。',
          retryable: error.retryable,
        })
      }
      if (error.code === 'CONTRACT_MISMATCH' && error.status === 404) {
        return Object.freeze({
          code: error.code,
          message: 'FutureStaff Platform DEV 登录服务尚未发布，请联系管理员更新平台。',
          retryable: false,
        })
      }
      if (error.code === 'TENANT_MEMBERSHIP_REQUIRED') {
        return Object.freeze({
          code: error.code,
          message: '当前账号没有可用的组织成员身份，请联系管理员开通。',
          retryable: false,
        })
      }
      if (error.code === 'APPLICATION_ACCESS_DENIED') {
        return Object.freeze({
          code: error.code,
          message: '当前账号尚未获授权使用 FutureStaff Agent，请联系管理员开通。',
          retryable: false,
        })
      }
    }
    const messages: Partial<Record<PlatformFailure['code'], string>> = {
      PLATFORM_UNAVAILABLE: 'FutureStaff Platform DEV 暂时不可用。',
      APPLICATION_ACCESS_DENIED: '当前租户没有已授权应用。',
      TENANT_ACCESS_DENIED: '当前账号无权访问该租户。',
      TENANT_MEMBERSHIP_REQUIRED: '当前账号不属于该租户。',
      TOKEN_EXPIRED: '登录已过期，请重新登录。',
      TOKEN_AUDIENCE_INVALID: '登录会话不适用于当前客户端。',
      AUTHENTICATION_REQUIRED: '请重新登录。',
    }
    return Object.freeze({
      code: error.code,
      message: messages[error.code] ?? '平台响应不符合固定契约。',
      retryable: error.retryable,
    })
  }
  return Object.freeze({ code: 'CONTRACT_MISMATCH', message: '无法读取受保护的平台会话。', retryable: false })
}

export class PlatformDevAccessController {
  #profileTimer: ReturnType<typeof setInterval> | undefined
  #snapshot = initialSnapshot
  #session: DesktopSession | undefined
  #user: User | undefined
  #generation = 0
  #request = new AbortController()
  #applicationEpochs = new Map<SystemApplicationId, AbortController>(systemApplicationIds.map(id => [id, new AbortController()]))
  #applicationSignals = new Map<string, { identity: AbortSignal; epochs: AbortSignal[]; signal: AbortSignal }>()
  #queue: Promise<void> = Promise.resolve()
  #pendingLogin: { session: DesktopSession; user: User; loginIdentifier: string; password: string; expiresAt: number } | undefined
  #pendingExpiry: NodeJS.Timeout | undefined
  #disposed = false
  #accessExpiresAt = 0

  constructor(
    private readonly api: PlatformDevAccessApi,
    private readonly vault: PlatformDevAccessVault,
    private readonly boundary: TenantIsolationBoundary,
    private readonly workspace?: LoginWorkspace,
    private readonly productHubAudience = 'futurestaff-product-hub-dev',
  ) {
    if (api.currentUser) {
      this.#profileTimer = setInterval(() => {
        void this.#enqueue(() => this.#refreshProfile()).catch(() => { /* disposed controllers cannot publish */ })
      }, 30000)
      this.#profileTimer.unref?.()
    }
  }

  getSnapshot(): PlatformDevAccessSnapshot { return this.#snapshot }
  dispose(): void {
    if (this.#profileTimer !== undefined) clearInterval(this.#profileTimer)
    this.#disposed = true
    this.#request.abort(); this.#generation++
    this.#clearPendingLogin(); this.#session = undefined; this.#user = undefined
    this.#publish(initialSnapshot)
  }

  login(input: PasswordLoginInput): Promise<PlatformDevAccessSnapshot> {
    return this.#enqueue(() => this.#login(input))
  }
  restore(): Promise<PlatformDevAccessSnapshot> { return this.#enqueue(() => this.#restore()) }
  refresh(): Promise<PlatformDevAccessSnapshot> { return this.#enqueue(() => this.#refresh()) }
  synchronizeProfile(): Promise<PlatformDevAccessSnapshot> {
    return this.#enqueue(async () => { await this.#refreshProfile(); return this.#snapshot })
  }
  switchTenant(tenantId: string): Promise<PlatformDevAccessSnapshot> {
    if (this.workspace) return Promise.reject(new Error('TENANT_RELOGIN_REQUIRED'))
    return this.#enqueue(() => this.#switchTenant(tenantId))
  }
  selectLoginTenant(tenantId: string): Promise<PlatformDevAccessSnapshot> {
    return this.#enqueue(() => this.#selectLoginTenant(tenantId))
  }
  logout(): Promise<PlatformDevAccessSnapshot> { return this.#enqueue(() => this.#logout()) }
  issueApplicationToken(appId: string): Promise<ApplicationTokenResult> {
    return this.#enqueue(() => this.#issueApplicationToken(appId))
  }
  authorizeGeoBrowser(input:import('./contracts.js').GeoBrowserAuthorization):Promise<{redirectUrl:string}> {
    return this.#enqueue(async()=>{
      await this.#renewIfNeeded()
      if(!this.#session||this.#snapshot.phase!=='ready'||this.#snapshot.activeTenantId!==this.#session.activeTenantId||!this.#snapshot.applications.some(a=>a.appId==='geo'&&a.tenantId===this.#session?.activeTenantId))throw Error('GEO_PERMISSION_REQUIRED');
      if(!this.api.authorizeGeoBrowser)throw Error('GEO_BROWSER_AUTH_UNAVAILABLE');
      return this.api.authorizeGeoBrowser(this.#session.accessToken,input,this.#request.signal);
    });
  }
  authorizeModuleBrowser(appId: string, input: import('./contracts.js').GeoBrowserAuthorization): Promise<{redirectUrl:string}> {
    return this.#enqueue(async () => {
      await this.#renewIfNeeded()
      if (!this.#session || this.#snapshot.phase !== 'ready' || !this.#snapshot.applications.some(app => app.appId === appId && app.tenantId === this.#session?.activeTenantId)) throw Error('APPLICATION_ACCESS_DENIED')
      if (!this.api.authorizeModuleBrowser) throw Error('SYSTEM_SSO_UNAVAILABLE')
      return this.api.authorizeModuleBrowser(this.#session.accessToken, appId, input, this.#request.signal)
    })
  }
  authorizeAiWeb(input:{codeChallenge:string;state:string}):Promise<{code:string;state:string}> {
    return this.#enqueue(async()=>{
      await this.#renewIfNeeded()
      if(!this.#session||this.#snapshot.phase!=='ready'||!this.#snapshot.applications.some(app=>app.appId==='futurestaff_ai'&&app.tenantId===this.#session?.activeTenantId))throw Error('APPLICATION_ACCESS_DENIED')
      if(!this.api.authorizeAiWeb)throw Error('SYSTEM_SSO_UNAVAILABLE')
      return this.api.authorizeAiWeb(this.#session.accessToken,input,this.#request.signal)
    })
  }

  /** Host-only access; intentionally absent from all renderer HTTP routes. */
  authorizeTemplates(): Promise<{ accessToken: string; tenantId: string; userId: string; signal: AbortSignal; applications: readonly AuthorizedApplication[]; restrictApplications(required: readonly SystemApplicationId[]): void }> {
    return this.#enqueue(async () => {
      await this.#renewIfNeeded()
      if (!this.#session || !this.#user || !['ready', 'no_apps'].includes(this.#snapshot.phase)
        || this.#snapshot.activeTenantId !== this.#session.activeTenantId) throw new Error('PLATFORM_LOGIN_REQUIRED')
      const session = this.#session, user = this.#user, signal = this.#request.signal
      let result: { readonly activeTenantId: string; readonly items: readonly AuthorizedApplication[] }
      try { result = await this.api.listApplications(session.accessToken, session.activeTenantId, signal) }
      catch (error) {
        if (!(error instanceof PlatformApiError) || error.code !== 'APPLICATION_ACCESS_DENIED') throw error
        result = { activeTenantId: session.activeTenantId, items: [] }
      }
      signal.throwIfAborted()
      if (this.#session !== session || this.#user !== user || result.activeTenantId !== session.activeTenantId || !Array.isArray(result.items) || result.items.length > 200) throw Error('PLATFORM_IDENTITY_MISMATCH')
      const applications = Object.freeze(result.items.map(safeApplication))
      if (applications.some(app => app.tenantId !== session.activeTenantId) || new Set(applications.map(app => app.appId)).size !== applications.length) throw Error('PLATFORM_IDENTITY_MISMATCH')
      const phase = applications.length ? 'ready' : 'no_apps'
      if (this.#snapshot.phase !== phase || JSON.stringify(this.#snapshot.applications) !== JSON.stringify(applications)) this.#publish({ ...this.#snapshot, phase, applications })
      // The renderer cannot control this hook. A queued operation captures the
      // epochs now, then claims only its actual systems once their recipe is known.
      const epochs = new Map([...this.#applicationEpochs].map(([id, controller]) => [id, controller.signal]))
      const required = new Set<SystemApplicationId>()
      let operationSignal = signal
      return { accessToken: this.#session.accessToken, tenantId: this.#session.activeTenantId,
        userId: this.#user.userId, get signal() { return operationSignal }, applications: this.#snapshot.applications,
        restrictApplications: dependencies => {
          let changed = false
          for (const id of dependencies) { if (!epochs.has(id)) throw Error('AGENT_APPLICATION_REQUIRED'); if (!required.has(id)) { required.add(id); changed = true } }
          if (changed) {
            const ids = [...required].sort(), captured = ids.map(id => epochs.get(id)!), key = ids.join(',')
            let scoped = this.#applicationSignals.get(key)
            if (!scoped || scoped.identity !== signal || scoped.epochs.some((epoch, index) => epoch !== captured[index])) {
              scoped = { identity: signal, epochs: captured, signal: AbortSignal.any([signal, ...captured]) }
              this.#applicationSignals.set(key, scoped)
            }
            operationSignal = scoped.signal
          }
          operationSignal.throwIfAborted()
        } }
    })
  }

  authorizeLocal(): Promise<{ tenantId: string; userId: string; signal: AbortSignal }> {
    return this.#enqueue(async () => {
      await this.#renewIfNeeded()
      if (!this.#session || !this.#user || !['ready', 'no_apps'].includes(this.#snapshot.phase)
        || this.#snapshot.activeTenantId !== this.#session.activeTenantId) throw new Error('PLATFORM_LOGIN_REQUIRED')
      return { tenantId: this.#session.activeTenantId, userId: this.#user.userId, signal: this.#request.signal }
    })
  }

  /** Host-only diagnostics authority, independent of app and model entitlements. */
  async authorizeDiagnostics(): Promise<{accessToken:string;tenantId:string;userId:string;signal:AbortSignal}> {
    // Telemetry never initiates refresh I/O or occupies the business operation queue.
    // Foreground/profile refresh owns renewal; a later readiness probe resumes us.
    if(this.#disposed||!this.#session||!this.#user||!['ready','no_apps'].includes(this.#snapshot.phase)
      ||this.#request.signal.aborted||this.#accessExpiresAt<=Date.now()+5000
      ||this.#snapshot.activeTenantId!==this.#session.activeTenantId)throw Error('PLATFORM_LOGIN_REQUIRED')
    return {accessToken:this.#session.accessToken,tenantId:this.#session.activeTenantId,userId:this.#user.userId,signal:this.#request.signal}
  }

  authorizeChat(selectedModelId?: string): Promise<ChatCredentials> {
    return this.#enqueue(async () => {
      await this.#renewIfNeeded()
      const modelId = selectedModelId ?? this.#snapshot.activeModelId
      if (this.#session === undefined || this.#user === undefined
        || !['ready', 'no_apps'].includes(this.#snapshot.phase) || !modelId
        || this.#snapshot.activeTenantId !== this.#session.activeTenantId
        || !this.#snapshot.models.some(model => model.modelId === modelId)) {
        throw new Error('请登录 FutureStaff 并确认平台已配置可用模型。')
      }
      return { accessToken: this.#session.accessToken, userId: this.#user.userId,
        tenantId: this.#session.activeTenantId, modelId, signal: this.#request.signal }
    })
  }

  async #login(input: PasswordLoginInput): Promise<PlatformDevAccessSnapshot> {
    const operation = await this.#beginIsolatedOperation()
    this.#session = undefined
    this.#user = undefined
    this.#clearPendingLogin()
    this.#publish({ ...initialSnapshot, phase: 'loading' })
    try {
      const result = await this.api.loginWithPassword(input, operation.signal)
      if (!this.#isCurrent(operation.generation)) return this.#snapshot
      if (input.tenantId && result.session.activeTenantId !== input.tenantId) throw new Error('LOGIN_TENANT_MISMATCH')
      if (this.workspace) {
        const tenants = await this.api.listTenants(result.session.accessToken, operation.signal)
        if (tenants.activeTenantId !== result.session.activeTenantId || tenants.items.length === 0
          || !tenants.items.some(item => item.tenantId === result.session.activeTenantId)) throw new Error('LOGIN_TENANT_MISMATCH')
        const pending = { session: result.session, user: result.user, loginIdentifier: input.loginIdentifier.trim(), password: input.password, expiresAt: Date.now() + 300_000 }
        this.#pendingLogin = pending
        this.#pendingExpiry = setTimeout(() => {
          if (this.#pendingLogin === pending) void this.logout().catch(() => { this.#clearPendingLogin() })
        }, 300_000)
        this.#pendingExpiry.unref()
        this.#publish({ ...initialSnapshot, phase: 'selecting_tenant', user: result.user, tenants: tenants.items })
        return this.#snapshot
      }
      await this.vault.save({ session: result.session, user: result.user })
      if (!this.#isCurrent(operation.generation)) return this.#snapshot
      this.#session = result.session
      this.#accessExpiresAt = Date.now() + result.session.expiresIn * 1000
      this.#user = result.user
      await this.#loadContext(operation.generation)
    } catch (error) {
      if (this.#isCurrent(operation.generation)) {
        try { await this.vault.clear() } catch { /* failed login stores nothing */ }
        this.#publish({ ...initialSnapshot, phase: 'error', error: failure(error, 'login') })
      }
    }
    return this.#snapshot
  }

  async #restore(): Promise<PlatformDevAccessSnapshot> {
    const operation = this.#beginOperation()
    this.#publish({ ...initialSnapshot, phase: 'loading' })
    try {
      const stored = await this.vault.load()
      if (!this.#isCurrent(operation.generation)) return this.#snapshot
      if (stored === undefined) {
        this.#session = undefined
        this.#user = undefined
        this.#publish(initialSnapshot)
        return this.#snapshot
      }
      if (this.workspace && !this.workspace.accepts(stored.session, stored.user)) {
        this.#session = undefined; this.#user = undefined
        this.#publish(initialSnapshot)
        return this.#snapshot
      }
      if (this.workspace && !await this.workspace.enter(stored.session, stored.user)) return this.#snapshot
      if (!this.#isCurrent(operation.generation)) return this.#snapshot
      this.#session = stored.session
      // Persisted expiresIn is a duration, not the remaining lifetime after restart.
      this.#accessExpiresAt = 0
      this.#user = stored.user
      this.#publish({
        ...initialSnapshot, phase: 'loading', user: stored.user,
        activeTenantId: stored.session.activeTenantId,
      })
      await this.#renewIfNeeded(true)
      await this.#loadContext(operation.generation)
    } catch (error) {
      await this.#handleFailure(error, operation.generation)
    }
    return this.#snapshot
  }

  async #refresh(): Promise<PlatformDevAccessSnapshot> {
    if (this.#snapshot.phase === 'selecting_tenant') return this.#snapshot
    if (this.#session === undefined || this.#user === undefined) return this.#restore()
    const generation = this.#generation
    try {
      await this.#renewIfNeeded(true)
      await this.#loadContext(generation)
    } catch (error) {
      await this.#handleFailure(error, generation)
    }
    return this.#snapshot
  }

  async #renewIfNeeded(force = false): Promise<void> {
    const previous = this.#session, user = this.#user, generation = this.#generation
    if (!previous || !user || (!force && Date.now() < this.#accessExpiresAt - 60_000)) return
    try {
      const result = await this.api.refresh(previous.refreshToken, this.#request.signal)
      if (!this.#isCurrent(generation) || this.#disposed) throw new Error('PLATFORM_ACCESS_DISPOSED')
      if (result.session.activeTenantId !== previous.activeTenantId || result.session.audience !== previous.audience) {
        throw new PlatformApiError('TOKEN_AUDIENCE_INVALID', 'refresh identity mismatch', false)
      }
      await this.vault.save({ session: result.session, user })
      if (!this.#isCurrent(generation) || this.#disposed) throw new Error('PLATFORM_ACCESS_DISPOSED')
      this.#session = result.session
      this.#accessExpiresAt = Date.now() + result.session.expiresIn * 1000
    } catch (error) {
      // Transport errors must not discard a usable refresh token or revoke open views.
      if (error instanceof PlatformApiError && ['TOKEN_EXPIRED','TOKEN_AUDIENCE_INVALID','AUTHENTICATION_REQUIRED'].includes(error.code)) {
        await this.#handleFailure(error, generation)
      }
      throw error
    }
  }

  async #switchTenant(tenantId: string): Promise<PlatformDevAccessSnapshot> {
    const previous = this.#session
    if (previous === undefined || this.#user === undefined
      || !this.#snapshot.tenants.some(tenant => tenant.tenantId === tenantId)) {
      throw new Error('fs-platform-access: requested tenant is not authorized.')
    }
    if (tenantId === previous.activeTenantId) return this.#snapshot
    const operation = await this.#beginIsolatedOperation()
    this.#publish({
      ...initialSnapshot, phase: 'loading', user: this.#user,
      tenants: this.#snapshot.tenants,
    })
    try {
      const result = await this.api.switchTenant(previous.accessToken, tenantId, operation.signal)
      if (!this.#isCurrent(operation.generation)) return this.#snapshot
      await this.vault.save({ session: result.session, user: this.#user })
      if (!this.#isCurrent(operation.generation)) return this.#snapshot
      this.#session = result.session
      this.#accessExpiresAt = Date.now() + result.session.expiresIn * 1000
      await this.#loadContext(operation.generation, true)
    } catch (error) {
      await this.#handleFailure(error, operation.generation)
    }
    return this.#snapshot
  }

  async #logout(): Promise<PlatformDevAccessSnapshot> {
    const refreshToken = this.#session?.refreshToken ?? this.#pendingLogin?.session.refreshToken
    const operation = await this.#beginIsolatedOperation()
    this.#session = undefined
    this.#user = undefined
    this.#clearPendingLogin()
    try {
      await this.vault.clear()
      if (this.#isCurrent(operation.generation)) this.#publish(initialSnapshot)
    } catch (error) {
      if (this.#isCurrent(operation.generation)) {
        this.#publish({ ...initialSnapshot, phase: 'error', error: failure(error) })
      }
    }
    try { await this.api.logout(refreshToken, operation.signal) } catch { /* local-first logout */ }
    return this.#snapshot
  }

  async #selectLoginTenant(tenantId: string): Promise<PlatformDevAccessSnapshot> {
    const pending = this.#pendingLogin
    if (!this.workspace || !pending || this.#snapshot.phase !== 'selecting_tenant'
      || !this.#snapshot.tenants.some(item => item.tenantId === tenantId)) throw new Error('LOGIN_TENANT_NOT_OFFERED')
    if (Date.now() >= pending.expiresAt) {
      await this.#logout()
      return this.#snapshot
    }
    const operation = await this.#beginIsolatedOperation()
    if (this.#pendingExpiry) clearTimeout(this.#pendingExpiry)
    this.#pendingExpiry = undefined
    this.#pendingLogin = undefined
    this.#publish({ ...initialSnapshot, phase: 'loading' })
    try {
      // Password login with an explicit tenant returns that membership's real user ID.
      // The legacy switch response has no user payload and cannot establish this boundary.
      const result = await this.api.loginWithPassword({ loginIdentifier: pending.loginIdentifier, password: pending.password, tenantId }, operation.signal)
      pending.password = ''
      const { session, user } = result
      if (session.activeTenantId !== tenantId) throw new Error('LOGIN_TENANT_MISMATCH')
      try { await this.api.logout(pending.session.refreshToken, operation.signal) } catch { /* provisional login is never usable locally */ }
      if (!await this.workspace.enter(session, user)) return this.#snapshot
      await this.vault.save({ session, user })
      this.#session = session; this.#user = user
      this.#accessExpiresAt = Date.now() + session.expiresIn * 1000
      await this.#loadContext(operation.generation)
    } catch (error) {
      this.#session = undefined; this.#user = undefined
      this.#publish({ ...initialSnapshot, phase: 'error', error: failure(error, 'login') })
    } finally {
      pending.password = ''
    }
    return this.#snapshot
  }

  #clearPendingLogin(): void {
    if (this.#pendingExpiry) clearTimeout(this.#pendingExpiry)
    this.#pendingExpiry = undefined
    if (this.#pendingLogin) this.#pendingLogin.password = ''
    this.#pendingLogin = undefined
  }

  async #issueApplicationToken(appId: string): Promise<ApplicationTokenResult> {
    await this.#renewIfNeeded()
    const session = this.#session
    if (session === undefined || this.#snapshot.activeTenantId !== session.activeTenantId
      || !this.#snapshot.applications.some(application => application.appId === appId)) {
      throw new Error('fs-platform-access: requested application is not authorized.')
    }
    const result = await this.api.issueApplicationToken(
      session.accessToken, appId, session.activeTenantId, this.#request.signal,
    )
    if (appId === 'product_hub' && (result.audience !== this.productHubAudience
      || result.permissions.length === 0
      || result.permissions.some(permission => !permission.startsWith('product_hub.')))) {
      throw new Error('fs-platform-access: application token contract mismatch.')
    }
    return result
  }

  async #loadContext(generation: number, allowUserChange = false): Promise<void> {
    if (!await this.#readProfile(generation, allowUserChange)) return
    const session = this.#session
    const user = this.#user
    if (session === undefined || user === undefined) return
    const tenants = await this.api.listTenants(session.accessToken, this.#request.signal)
    if (!this.#isCurrent(generation)) return
    if (tenants.activeTenantId !== session.activeTenantId
      || !tenants.items.some(tenant => tenant.tenantId === session.activeTenantId)) {
      throw new PlatformApiError('CONTRACT_MISMATCH', 'tenant identity mismatch', false)
    }
    const models = await this.api.listModels(session.accessToken, session.activeTenantId, this.#request.signal)
    if (!this.#isCurrent(generation)) return
    let applications: { readonly activeTenantId: string; readonly items: readonly AuthorizedApplication[] }
    try {
      applications = await this.api.listApplications(session.accessToken, session.activeTenantId, this.#request.signal)
    } catch (error) {
      if (error instanceof PlatformApiError && error.code === 'APPLICATION_ACCESS_DENIED') {
        if (this.#isCurrent(generation)) this.#publish({
          phase: 'no_apps', simulated: false, contractVersion: PLATFORM_DEV_CONTRACT_VERSION,
          user, activeTenantId: session.activeTenantId, tenants: tenants.items, applications: Object.freeze([]),
          models: models.items, activeModelId: models.activeModelId,
        })
        return
      }
      throw error
    }
    if (!this.#isCurrent(generation)) return
    this.#publish({
      phase: applications.items.length === 0 ? 'no_apps' : 'ready',
      simulated: false,
      contractVersion: PLATFORM_DEV_CONTRACT_VERSION,
      user,
      activeTenantId: session.activeTenantId,
      tenants: tenants.items,
      applications: applications.items,
      models: models.items,
      activeModelId: models.activeModelId,
    })
  }

  async #readProfile(generation: number, allowUserChange = false): Promise<boolean> {
    const session = this.#session, previous = this.#user
    if (!session || !previous || !this.api.currentUser) return true
    const signal = AbortSignal.any([this.#request.signal, AbortSignal.timeout(5000)])
    const profile = await this.api.currentUser(session.accessToken, signal)
    if (!this.#isCurrent(generation) || this.#disposed) return false
    if (profile.activeTenantId !== session.activeTenantId || (!allowUserChange && profile.user.userId !== previous.userId)) {
      throw new PlatformApiError('CONTRACT_MISMATCH', 'profile identity mismatch', false)
    }
    if (previous.displayName !== profile.user.displayName || previous.email !== profile.user.email || previous.userId !== profile.user.userId) {
      this.#user = profile.user
      await this.vault.save({ session, user: profile.user })
    }
    return this.#isCurrent(generation) && !this.#disposed
  }

  async #refreshProfile(): Promise<void> {
    if (!['ready', 'no_apps'].includes(this.#snapshot.phase) || !this.#session || !this.#user) return
    const generation = this.#generation
    try {
      await this.#renewIfNeeded()
      if (await this.#readProfile(generation)) this.#publish({ ...this.#snapshot, user: this.#user })
    } catch (error) {
      if (error instanceof PlatformApiError && ['AUTHENTICATION_REQUIRED', 'TOKEN_EXPIRED', 'TOKEN_AUDIENCE_INVALID', 'CONTRACT_MISMATCH'].includes(error.code)) {
        await this.#handleFailure(error, generation)
      }
    }
  }

  #beginOperation(): { readonly generation: number; readonly signal: AbortSignal } {
    this.#request.abort()
    this.#request = new AbortController()
    this.#generation += 1
    return Object.freeze({ generation: this.#generation, signal: this.#request.signal })
  }

  async #beginIsolatedOperation(): Promise<{ readonly generation: number; readonly signal: AbortSignal }> {
    const operation = this.#beginOperation()
    await clearTenantBoundary(this.boundary)
    return operation
  }

  #isCurrent(generation: number): boolean { return generation === this.#generation }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = () => {
      if (this.#disposed) throw new Error('PLATFORM_ACCESS_DISPOSED')
      return operation()
    }
    const result = this.#queue.then(run, run)
    this.#queue = result.then(() => undefined, () => undefined)
    return result
  }

  async #handleFailure(error: unknown, generation: number): Promise<void> {
    if (!this.#isCurrent(generation) || (error instanceof Error && error.name === 'AbortError')) return
    const problem = failure(error)
    if (problem.code === 'TOKEN_EXPIRED' || problem.code === 'TOKEN_AUDIENCE_INVALID'
      || problem.code === 'AUTHENTICATION_REQUIRED') {
      this.#request.abort()
      await clearTenantBoundary(this.boundary)
      try { await this.vault.clear() } catch { /* expired credentials remain unusable */ }
      this.#session = undefined
      this.#user = undefined
      this.#publish({ ...initialSnapshot, phase: 'expired', error: problem })
      return
    }
    this.#publish({
      ...initialSnapshot,
      phase: 'error',
      ...(this.#user === undefined ? {} : { user: this.#user }),
      ...(this.#session === undefined ? {} : { activeTenantId: this.#session.activeTenantId }),
      error: problem,
    })
  }

  #publish(snapshot: PlatformDevAccessSnapshot): void {
    const grant = (state: PlatformDevAccessSnapshot, id: SystemApplicationId) => {
      const app = state.applications.find(item => item.appId === id && item.tenantId === state.activeTenantId && item.capabilities.length)
      return app ? JSON.stringify([app.tenantId, [...app.capabilities].sort()]) : ''
    }
    for (const id of systemApplicationIds) if (grant(this.#snapshot, id) !== grant(snapshot, id)) {
      this.#applicationEpochs.get(id)!.abort()
      this.#applicationEpochs.set(id, new AbortController())
    }
    this.#snapshot = Object.freeze(snapshot)
  }
}
