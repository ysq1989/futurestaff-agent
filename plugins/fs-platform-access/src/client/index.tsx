import {applyGovernanceCandidates} from './governance-candidates.js'
import { futureStaffLogoUrl, futureStaffAgentWordmarkPaths } from '../brand.js'
import { applyErpClient } from './erp.js'
import {applyShopOperationClient} from './shop-operations.js'
import {applyAgentMessageCardClient} from './agent-message-cards.js'
import {mountFashionPreviews} from './fashion-preview.js'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { createElement, useEffect, useRef, useSyncExternalStore } from 'react'
import type { ComponentType } from 'react'
import type { PasswordLoginInput } from '../contracts.js'
import type { PlatformAccessSnapshot } from '../controller.js'
import { decodePlatformDevAccessSnapshot } from '../dev-access.js'
import { mountPlatformAccessPanel } from '../view.js'
import { installAppearance } from './appearance.js'
import { LoginBackground, loginBackgroundCss } from './login-background.js'
import { createAccountSidebar } from './sidebar.js'
import { FutureStaffSettingsRoot, type SettingsPageProps } from './settings-page.js'
import { SystemPages, SystemMain } from './system-pages.js'
export { SystemPages, SystemMain } from './system-pages.js'
export { InteractionWindow, InteractionTable, interactionCss, type InteractionColumn } from './interaction.js'
import { watchSlotComponents } from './slot-components.js'
import { installMessageCardStyles } from './message-card.js'
export { MessageCard, MessageCardAction, MessageCardNotice, installMessageCardStyles, messageCardCss } from './message-card.js'
export type { MessageCardProps, MessageCardActionProps, MessageCardStatus } from './message-card.js'
import { LoginPreferences } from '../login-preferences.js'
import { createAgentCenter } from './agent-center.js'
import { createAgentBrowser, createAgentPicker, createAgentConversation, createAgentNavigation, type AgentConversationProps } from './agents.js'
import type { RememberedLoginHint } from '../remembered-login.js'

const DEV_ROUTE_PREFIX = '/_futurestaff/platform-dev'
const DEV_LOGIN_ROUTE = `${DEV_ROUTE_PREFIX}/login`
const PRODUCT_HUB_TOKEN_ROUTE = `${DEV_ROUTE_PREFIX}/apps/product_hub/token`
export const platformAccessPanelCss = `
.futurestaff-access{--fs-accent:#5b6cff;--fs-accent-soft:color-mix(in srgb,var(--fs-accent) 12%,transparent);--fs-border:color-mix(in srgb,currentColor 13%,transparent);--fs-muted:color-mix(in srgb,currentColor 66%,transparent);box-sizing:border-box;max-width:880px;min-width:0;color:var(--color-text,#172033);font-size:14px;line-height:1.5}
.futurestaff-access *{box-sizing:border-box}.futurestaff-access h2,.futurestaff-access h3,.futurestaff-access p{margin:0}.futurestaff-access button,.futurestaff-access select{font:inherit;color:inherit}
.futurestaff-access .fs-panel{display:grid;gap:22px;min-width:0;padding:26px;border:1px solid var(--fs-border);border-radius:20px;background:linear-gradient(145deg,color-mix(in srgb,var(--fs-accent) 5%,transparent),transparent 38%),color-mix(in srgb,currentColor 2.5%,transparent);box-shadow:0 18px 48px color-mix(in srgb,#111827 8%,transparent)}
.futurestaff-access .fs-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.futurestaff-access .fs-identity{display:flex;align-items:center;gap:13px;min-width:0}.futurestaff-access .fs-identity>div:last-child{min-width:0}.futurestaff-access .fs-avatar,.futurestaff-access .fs-state-mark{display:grid;flex:0 0 auto;place-items:center;width:46px;height:46px;border-radius:14px;background:linear-gradient(145deg,var(--fs-accent),#7c4dff);color:#fff;font-weight:760;letter-spacing:.02em;box-shadow:0 8px 18px color-mix(in srgb,var(--fs-accent) 27%,transparent)}
.futurestaff-access .fs-kicker{margin-bottom:2px;color:var(--fs-accent);font-size:.72rem;font-weight:760;letter-spacing:.09em;text-transform:uppercase}.futurestaff-access h2{overflow-wrap:anywhere;font-size:1.28rem;line-height:1.3}.futurestaff-access h3{font-size:1rem}.futurestaff-access .fs-user-email,.futurestaff-access .fs-app-id{display:block;overflow:hidden;color:var(--fs-muted);font-size:.8rem;text-overflow:ellipsis;white-space:nowrap}
.futurestaff-access .fs-header-actions,.futurestaff-access .fs-actions{display:flex;flex-wrap:wrap;gap:8px}.futurestaff-access button{min-height:38px;padding:8px 13px;border:1px solid var(--fs-border);border-radius:10px;background:color-mix(in srgb,currentColor 3%,transparent);cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease}.futurestaff-access button:hover{border-color:color-mix(in srgb,var(--fs-accent) 55%,transparent);background:var(--fs-accent-soft)}.futurestaff-access button:active{transform:translateY(1px)}.futurestaff-access button[data-kind=primary]{border-color:transparent;background:var(--fs-accent);color:#fff;font-weight:680}
.futurestaff-access button:focus-visible,.futurestaff-access select:focus-visible{outline:3px solid color-mix(in srgb,var(--fs-accent) 35%,transparent);outline-offset:2px}
.futurestaff-access .fs-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}.futurestaff-access .fs-environment-badge{display:inline-flex;align-items:center;gap:7px;min-width:0;padding:5px 9px;border:1px solid var(--fs-border);border-radius:999px;background:var(--fs-accent-soft);font-size:.76rem;font-weight:620}.futurestaff-access .fs-environment-badge>span{width:7px;height:7px;border-radius:50%;background:var(--fs-accent);box-shadow:0 0 0 3px var(--fs-accent-soft)}.futurestaff-access .fs-mock-badge{color:var(--fs-muted)}.futurestaff-access .fs-dev-badge{color:var(--fs-accent)}.futurestaff-access .fs-count{color:var(--fs-muted);font-size:.8rem;white-space:nowrap}
.futurestaff-access .fs-tenant{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,310px);align-items:end;gap:18px;padding:17px;border:1px solid var(--fs-border);border-radius:14px;background:color-mix(in srgb,currentColor 2%,transparent)}.futurestaff-access .fs-tenant label{font-weight:680}.futurestaff-access .fs-tenant p,.futurestaff-access .fs-apps-heading p,.futurestaff-access .fs-empty p,.futurestaff-access .fs-lead{color:var(--fs-muted)}.futurestaff-access .fs-tenant p,.futurestaff-access .fs-apps-heading p{margin-top:2px;font-size:.8rem}.futurestaff-access .fs-select-wrap{display:flex;align-items:center;gap:8px;min-width:0}.futurestaff-access select{width:100%;min-width:0;min-height:40px;padding:8px 34px 8px 11px;border:1px solid var(--fs-border);border-radius:10px;background:color-mix(in srgb,currentColor 2.5%,transparent)}.futurestaff-access .fs-role{flex:0 0 auto;padding:4px 7px;border-radius:7px;background:var(--fs-accent-soft);color:var(--fs-accent);font-size:.7rem;font-weight:700}
.futurestaff-access .fs-apps-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.futurestaff-access .fs-apps-heading>span{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:var(--fs-accent-soft);color:var(--fs-accent);font-size:.78rem;font-weight:760}.futurestaff-access .fs-app-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}.futurestaff-access .fs-app-grid li{display:flex;align-items:flex-start;gap:11px;min-width:0;padding:15px;border:1px solid var(--fs-border);border-radius:14px;background:color-mix(in srgb,currentColor 1.5%,transparent)}.futurestaff-access .fs-app-icon{display:grid;flex:0 0 auto;place-items:center;width:38px;height:38px;border-radius:11px;background:var(--fs-accent-soft);color:var(--fs-accent);font-weight:780}.futurestaff-access .fs-app-copy{min-width:0}.futurestaff-access .fs-app-copy>strong{display:block;overflow-wrap:anywhere}.futurestaff-access .fs-capabilities{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.futurestaff-access [data-capability=true]{max-width:100%;padding:3px 7px;border:1px solid var(--fs-border);border-radius:999px;color:var(--fs-muted);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.68rem;overflow-wrap:anywhere}
.futurestaff-access .fs-empty{display:grid;justify-items:center;gap:5px;padding:30px 18px;border:1px dashed color-mix(in srgb,currentColor 20%,transparent);border-radius:14px;text-align:center}.futurestaff-access .fs-empty-mark{display:grid;place-items:center;width:42px;height:42px;margin-bottom:4px;border-radius:13px;background:var(--fs-accent-soft);color:var(--fs-accent);font-weight:780}
.futurestaff-access .fs-login-form{display:grid;gap:8px;max-width:420px;margin-top:4px}.futurestaff-access .fs-login-form label{margin-top:4px;font-size:.82rem;font-weight:680}.futurestaff-access .fs-login-form input{width:100%;min-height:42px;padding:9px 12px;border:1px solid var(--fs-border);border-radius:10px;background:color-mix(in srgb,currentColor 2.5%,transparent);color:inherit;font:inherit}.futurestaff-access .fs-login-form input:focus-visible{outline:3px solid color-mix(in srgb,var(--fs-accent) 35%,transparent);outline-offset:2px}.futurestaff-access .fs-login-form button{margin-top:8px}
.futurestaff-access .fs-model-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}.futurestaff-access .fs-model-list li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;border:1px solid var(--fs-border);border-radius:12px;background:color-mix(in srgb,currentColor 1.5%,transparent)}.futurestaff-access .fs-model-list li[data-active=true]{border-color:color-mix(in srgb,var(--fs-accent) 45%,transparent);background:var(--fs-accent-soft)}.futurestaff-access .fs-model-list strong,.futurestaff-access .fs-model-list span{display:block}.futurestaff-access .fs-model-list span{margin-top:2px;color:var(--fs-muted);font-size:.76rem}.futurestaff-access .fs-model-list em{flex:0 0 auto;padding:4px 8px;border-radius:999px;background:var(--fs-accent);color:#fff;font-size:.7rem;font-style:normal;font-weight:700}
.futurestaff-login-gate{position:fixed;inset:0;z-index:1400;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 12%,rgba(34,211,238,.18),transparent 38%),rgba(3,10,24,.82);backdrop-filter:blur(12px);pointer-events:auto}.futurestaff-login-gate .futurestaff-access{width:min(380px,100%);max-width:380px}.futurestaff-login-gate .fs-panel{background:color-mix(in srgb,#fff 96%,#e8f5ff);box-shadow:0 28px 90px rgba(0,0,0,.34)}
.futurestaff-access .fs-state{grid-template-columns:minmax(0,1fr);align-items:start}.futurestaff-access .fs-state-copy{display:grid;gap:11px;min-width:0}.futurestaff-access .fs-state .fs-state-mark{width:50px;height:50px}.futurestaff-access .fs-state .fs-actions{margin-top:4px}.futurestaff-access .fs-skeletons{display:grid;gap:8px;margin-top:4px}.futurestaff-access .fs-skeletons span{height:12px;border-radius:999px;background:linear-gradient(90deg,var(--fs-border),color-mix(in srgb,currentColor 7%,transparent),var(--fs-border));background-size:200% 100%;animation:fs-shimmer 1.25s ease-in-out infinite}.futurestaff-access .fs-skeletons span:nth-child(2){width:78%}.futurestaff-access .fs-skeletons span:nth-child(3){width:52%}
@keyframes fs-shimmer{to{background-position:-200% 0}}
@media (max-width: 640px){.futurestaff-access .fs-panel{gap:18px;padding:18px;border-radius:16px}.futurestaff-access .fs-header{display:grid}.futurestaff-access .fs-header-actions{width:100%}.futurestaff-access .fs-header-actions button{flex:1}.futurestaff-access .fs-tenant{grid-template-columns:1fr;gap:12px}.futurestaff-access .fs-app-grid{grid-template-columns:1fr}.futurestaff-access .fs-state{grid-template-columns:1fr}.futurestaff-access .fs-state-mark{display:none}.futurestaff-access .fs-actions button{flex:1}.futurestaff-access .fs-summary{align-items:flex-start;flex-direction:column}.futurestaff-access .fs-count{align-self:flex-end}}
@media (prefers-reduced-motion: reduce){.futurestaff-access *{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
.futurestaff-login-gate{overflow:auto}.futurestaff-login-gate .fs-state{grid-template-columns:minmax(0,1fr);justify-items:center;gap:16px}.futurestaff-login-gate .fs-state-copy{width:100%;text-align:center;gap:20px}.futurestaff-login-gate .fs-state .fs-state-mark{display:block}.futurestaff-login-gate .fs-login-form{width:100%;max-width:none;text-align:left;margin:0}.futurestaff-access .fs-login-buttons{display:flex;gap:12px;margin-top:8px}.futurestaff-access .fs-login-buttons button{flex:1;margin:0}.futurestaff-access .fs-remember{display:flex;align-items:center;gap:8px;cursor:pointer}.futurestaff-access .fs-remember input{width:16px;height:16px;min-height:0;padding:0;accent-color:var(--fs-accent)}.futurestaff-access .fs-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
`

export async function beginPlatformDevLogin(
  fetcher: typeof fetch = fetch,
  opener: (url: string, target: string, features: string) => unknown = window.open.bind(window),
): Promise<void> {
  const response = await fetcher(DEV_LOGIN_ROUTE, {
    method: 'POST', headers: { accept: 'application/json', 'x-futurestaff-login': '1' },
  })
  let body: unknown
  try { body = await response.json() } catch { throw new Error('FutureStaff login is unavailable.') }
  if (!response.ok || body === null || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).join(',') !== 'authorizationUrl') throw new Error('FutureStaff login is unavailable.')
  const value = (body as { authorizationUrl?: unknown }).authorizationUrl
  if (typeof value !== 'string') throw new Error('FutureStaff login is unavailable.')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('FutureStaff login is unavailable.') }
  const keys = [...url.searchParams.keys()].sort().join(',')
  if (!['https://dev.fsstory.net/login', 'https://platform.fsstory.net/login'].includes(url.origin + url.pathname)
    || url.username !== '' || url.password !== '' || url.hash !== ''
    || keys !== 'client_id,code_challenge,code_challenge_method,redirect_uri,state'
    || url.searchParams.get('client_id') !== 'futurestaff-agent-pc-dev'
    || url.searchParams.get('redirect_uri') !== 'http://127.0.0.1:43821/callback'
    || url.searchParams.get('code_challenge_method') !== 'S256'
    || !/^[A-Za-z0-9_-]{43}$/u.test(url.searchParams.get('state') ?? '')
    || !/^[A-Za-z0-9_-]{43}$/u.test(url.searchParams.get('code_challenge') ?? '')) {
    throw new Error('FutureStaff login is unavailable.')
  }
  opener(url.href, '_blank', 'noopener,noreferrer')
}

export async function getProductHubApplicationToken(
  activeTenantId: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const unavailable = (): Error => new Error('Product Hub authorization is unavailable.')
  let response: Response
  try {
    response = await fetcher(PRODUCT_HUB_TOKEN_ROUTE, {
      method: 'POST',
      headers: { accept: 'application/json', 'x-futurestaff-application': 'product_hub' },
      cache: 'no-store',
    })
  } catch { throw unavailable() }
  let value: unknown
  try { value = await response.json() } catch { throw unavailable() }
  if (!response.ok || value === null || typeof value !== 'object' || Array.isArray(value)) throw unavailable()
  const token = value as Record<string, unknown>
  const permissions = token.permissions
  if (Object.keys(token).sort().join(',') !== 'accessToken,audience,expiresIn,permissions,tenantId,tokenType'
    || typeof token.accessToken !== 'string' || !/^[\x21-\x7e]{20,8192}$/u.test(token.accessToken)
    || token.tokenType !== 'Bearer' || token.expiresIn !== 60
    || !['futurestaff-product-hub-dev','futurestaff-product-hub'].includes(String(token.audience)) || token.tenantId !== activeTenantId
    || !Array.isArray(permissions) || permissions.length === 0
    || permissions.some(permission => typeof permission !== 'string'
      || !/^product_hub\.[a-z][a-z0-9_]*$/u.test(permission))
    || new Set(permissions).size !== permissions.length) throw unavailable()
  return token.accessToken
}

export class PlatformDevClientUnavailableError extends Error {
  constructor() {
    super('FutureStaff desktop session service is unavailable.')
    this.name = 'PlatformDevClientUnavailableError'
  }
}

export async function getPlatformDevAccessSnapshot(
  fetcher: typeof fetch = fetch,
): Promise<PlatformAccessSnapshot> {
  let response: Response
  try {
    response = await fetcher(`${DEV_ROUTE_PREFIX}/session`, {
      method: 'GET', headers: { accept: 'application/json', 'x-futurestaff-session': '1' },
      cache: 'no-store',
    })
  } catch { throw new Error('session request failed') }
  if (response.status === 404) throw new PlatformDevClientUnavailableError()
  let value: unknown
  try { value = await response.json() } catch { throw new Error('session response invalid') }
  if (!response.ok) throw new Error('session request rejected')
  try { return decodePlatformDevAccessSnapshot(value) } catch { throw new Error('session response invalid') }
}

type Listener = () => void
type Opener = (url: string, target: string, features: string) => unknown

const initialDevSnapshot: PlatformAccessSnapshot = Object.freeze({
  phase: 'signed_out', simulated: false, contractVersion: '0.1.1',
  tenants: Object.freeze([]), applications: Object.freeze([]), models: Object.freeze([]),
})

export class PlatformDevClientController {
  #snapshot: PlatformAccessSnapshot = initialDevSnapshot
  #generation = 0
  #pendingActions = 0
  readonly #listeners = new Set<Listener>()

  constructor(
    // Native browser fetch is receiver-sensitive; do not invoke it as this.fetcher.
    private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
    private readonly opener: Opener = (url, target, features) => window.open(url, target, features),
    private readonly preferences = new LoginPreferences(),
  ) {}

  #remembered: RememberedLoginHint = { available: false, remembered: false }
  #rememberGeneration = 0
  #rememberSupported = false
  #rememberChecked = false
  #rememberError: string | undefined
  getLoginHints = () => ({ ...this.preferences.hints(this.#snapshot.user?.userId),
    ...(this.#remembered.remembered ? { loginIdentifier: this.#remembered.loginIdentifier } : {}),
    rememberPassword: this.#remembered.remembered,
    ...(this.#rememberChecked ? { rememberPasswordAvailable: this.#remembered.available } : {}),
    ...(this.#rememberError ? { rememberPasswordStatus: this.#rememberError } : {}) })

  async restoreRememberedLogin(): Promise<void> {
    const generation = ++this.#rememberGeneration
    try {
      const hint = await this.#rememberedRequest('GET')
      if (generation === this.#rememberGeneration) {
        this.#rememberChecked = true
        this.#rememberError = hint.available ? undefined : '系统加密服务暂不可用，无法保存密码。'
        this.#remembered = hint
        for (const listener of this.#listeners) listener()
      }
    } catch {
      if (generation === this.#rememberGeneration) {
        this.#rememberError = '密码保存服务未就绪，请重试或重新启动客户端。'
        for (const listener of this.#listeners) listener()
      }
    }
  }
  async forgetRememberedPassword(): Promise<void> {
    const generation = ++this.#rememberGeneration
    try {
      const hint = await this.#rememberedRequest('DELETE')
      if (generation === this.#rememberGeneration) {
        this.#remembered = hint
        for (const listener of this.#listeners) listener()
      }
    } catch { if (generation === this.#rememberGeneration) this.#publishFailure() }
  }
  async #rememberedRequest(method: 'GET' | 'DELETE'): Promise<RememberedLoginHint> {
    const response = await this.fetcher(`${DEV_ROUTE_PREFIX}/auth/remembered`, {
      method, cache: 'no-store', headers: { accept: 'application/json', 'x-futurestaff-login': '1', 'x-futurestaff-session': '1' },
    })
    if (!response.ok) throw new Error('REMEMBERED_LOGIN_UNAVAILABLE')
    const value = await response.json() as RememberedLoginHint
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !['available', 'remembered', 'loginIdentifier'].includes(key))
      || typeof value.available !== 'boolean' || typeof value.remembered !== 'boolean'
      || (value.remembered && (!value.available || typeof value.loginIdentifier !== 'string' || !value.loginIdentifier.trim() || value.loginIdentifier.length > 254))
      || (!value.remembered && value.loginIdentifier !== undefined)) throw new Error('REMEMBERED_LOGIN_INVALID')
    this.#rememberSupported = true
    return value
  }

  getSnapshot = (): PlatformAccessSnapshot => this.#snapshot

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async restore(): Promise<void> {
    if (this.#pendingActions > 0) return
    await this.#readSession(true)
  }

  /** Reconcile browser-login callbacks and Host state without flashing the login gate. */
  async synchronize(): Promise<void> {
    if (this.#pendingActions > 0) return
    await this.#readSession(false)
  }

  async #readSession(showLoading: boolean): Promise<void> {
    const generation = ++this.#generation
    if (showLoading) this.#publish({ ...initialDevSnapshot, phase: 'loading' })
    try {
      const snapshot = await this.#request('/session', { method: 'GET' })
      if (generation === this.#generation && JSON.stringify(snapshot) !== JSON.stringify(this.#snapshot)) {
        this.#publish(snapshot)
      }
    } catch (error) {
      if (error instanceof PlatformDevClientUnavailableError) {
        if (generation === this.#generation) this.#publishFailure()
        throw error
      }
      if (generation === this.#generation) this.#publishFailure()
    }
  }

  async startLogin(): Promise<void> {
    this.#pendingActions += 1
    const generation = ++this.#generation
    this.#publish({ ...initialDevSnapshot, phase: 'loading' })
    try { await beginPlatformDevLogin(this.fetcher, this.opener) } catch {
      if (generation === this.#generation) this.#publishFailure()
    } finally { this.#pendingActions -= 1 }
  }

  async loginWithPassword(input: PasswordLoginInput & { rememberPassword?: boolean }): Promise<void> {
    if (input.rememberPassword === true) {
      await this.restoreRememberedLogin()
      if (!this.#rememberSupported || !this.#remembered.available) {
        this.#publish({ ...initialDevSnapshot, phase: 'error', error: {
          code: 'PLATFORM_UNAVAILABLE', message: '记住密码服务暂不可用，请重试或取消勾选。', retryable: true,
        } })
        return
      }
    }
    this.#pendingActions += 1
    const generation = ++this.#generation
    this.#publish({ ...initialDevSnapshot, phase: 'loading' })
    try {
      const snapshot = await this.#request('/auth/password', {
        method: 'POST',
        body: JSON.stringify(this.#rememberSupported ? input : { loginIdentifier: input.loginIdentifier, password: input.password,
          ...(input.tenantId ? { tenantId: input.tenantId } : {}) }),
        headers: { 'x-futurestaff-login': '1' },
      })
      if (generation === this.#generation) {
        if (snapshot.user && ['ready', 'no_apps', 'selecting_tenant'].includes(snapshot.phase)) {
          this.preferences.rememberIdentifier(input.loginIdentifier)
        }
        this.#publish(snapshot)
      }
      if (input.rememberPassword !== undefined) await this.restoreRememberedLogin()
    } catch {
      // Authentication rejections arrive as validated Host snapshots. Transport,
      // missing-route and malformed-response failures must never blame a password.
      if (generation === this.#generation) this.#publishFailure()
    } finally { this.#pendingActions -= 1 }
  }

  async refresh(): Promise<void> { await this.#action('/session/refresh') }
  async selectLoginTenant(tenantId: string): Promise<void> {
    if (this.#snapshot.phase !== 'selecting_tenant' || !this.#snapshot.tenants.some(tenant => tenant.tenantId === tenantId)) return this.#publishFailure()
    // Keep the offered choice before the Host restarts into its fixed workspace.
    // This is only a form preference; the Host must still authenticate membership.
    if (this.#snapshot.user) this.preferences.rememberTenant(this.#snapshot.user.userId, tenantId)
    await this.#action('/auth/tenant', { tenantId })
  }
  async logout(): Promise<void> { await this.#action('/session/logout') }

  async switchTenant(tenantId: string): Promise<void> {
    if (!this.#snapshot.tenants.some(tenant => tenant.tenantId === tenantId)) return this.#publishFailure()
    await this.#action('/session/switch', { tenantId })
  }

  async #action(path: string, body?: unknown): Promise<void> {
    this.#pendingActions += 1
    const generation = ++this.#generation
    this.#publish({ ...this.#snapshot, phase: 'loading', applications: Object.freeze([]) })
    try {
      const snapshot = await this.#request(path, {
        method: 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (generation === this.#generation) this.#publish(snapshot)
    } catch { if (generation === this.#generation) this.#publishFailure() }
    finally { this.#pendingActions -= 1 }
  }

  async #request(path: string, init: RequestInit): Promise<PlatformAccessSnapshot> {
    if (path === '/session' && init.method === 'GET') return getPlatformDevAccessSnapshot(this.fetcher)
    let response: Response
    try {
      response = await this.fetcher(`${DEV_ROUTE_PREFIX}${path}`, {
        ...init,
        headers: {
          accept: 'application/json', 'x-futurestaff-session': '1',
          ...init.headers,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
      })
    } catch {
      throw new Error('session request failed')
    }
    if (response.status === 404) throw new PlatformDevClientUnavailableError()
    let value: unknown
    try { value = await response.json() } catch { throw new Error('session response invalid') }
    if (!response.ok) throw new Error('session request rejected')
    try { return decodePlatformDevAccessSnapshot(value) } catch { throw new Error('session response invalid') }
  }

  #publishFailure(): void {
    this.#publish({
      ...initialDevSnapshot,
      phase: 'error',
      error: { code: 'PLATFORM_UNAVAILABLE', message: '无法连接 FutureStaff 桌面会话服务。', retryable: true },
    })
  }

  #publish(snapshot: PlatformAccessSnapshot): void {
    if (snapshot.user && snapshot.activeTenantId && ['ready', 'no_apps'].includes(snapshot.phase)
      && snapshot.tenants.some(tenant => tenant.tenantId === snapshot.activeTenantId)) {
      if (!this.preferences.hints().loginIdentifier && snapshot.user.email) {
        this.preferences.rememberIdentifier(snapshot.user.email)
      }
      this.preferences.rememberTenant(snapshot.user.userId, snapshot.activeTenantId)
    }
    this.#snapshot = Object.freeze(snapshot)
    for (const listener of this.#listeners) listener()
  }
}

interface PlatformAccessViewProps { readonly controller: PlatformDevClientController }

export function FutureStaffPlatformAccessSection({ controller }: PlatformAccessViewProps) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (root.current === null) return
    return mountPlatformAccessPanel(root.current, controller)
  }, [controller])
  return createElement('div', { className: 'futurestaff-access' },
    createElement('style', null, platformAccessPanelCss),
    createElement('div', { ref: root }),
  )
}

export function shouldShowPlatformLoginGate(snapshot: PlatformAccessSnapshot): boolean {
  return snapshot.phase !== 'ready' && snapshot.phase !== 'no_apps'
}

/** Release the settings surface whenever the mandatory account gate takes over. */
export function createPlatformSettingsRoot(controller: Pick<PlatformDevClientController, 'subscribe' | 'getSnapshot'>) {
  return function PlatformSettingsRoot(props: SettingsPageProps) {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
    return createElement(FutureStaffSettingsRoot, { ...props, loginRequired: shouldShowPlatformLoginGate(snapshot) })
  }
}

function FutureStaffPlatformLoginGate({ controller }: PlatformAccessViewProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void controller.restore().catch(() => {})
    const synchronize = (): void => {
      void controller.synchronize().catch(() => {})
      void controller.restoreRememberedLogin()
    }
    window.addEventListener('focus', synchronize)
    const foreground = (): void => { if (document.visibilityState !== 'hidden') void controller.synchronize().catch(() => {}) }
    const timer = window.setInterval(foreground, 30000)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', synchronize)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [controller])

  useEffect(() => {
    if (root.current === null || !shouldShowPlatformLoginGate(snapshot)) return
    return mountPlatformAccessPanel(root.current, controller)
  }, [controller, snapshot.phase])

  if (!shouldShowPlatformLoginGate(snapshot)) return null
  return createElement('section', {
    className: 'futurestaff-login-gate', role: 'dialog', 'aria-modal': true,
    'aria-label': 'FutureStaff Agent',
  }, createElement(LoginBackground), createElement('div', { className: 'futurestaff-access' },
    createElement('style', null, platformAccessPanelCss + loginBackgroundCss),
    createElement('div', { ref: root }),
  ))
}

export const inject = ['slots']

function FutureStaffBrandMark({ size, className }: { readonly size: number; readonly className?: string }) {
  return createElement('img', { src: futureStaffLogoUrl, alt: 'FutureStaff',
    className,
    style: { width: size, height: size, objectFit: 'contain', flexShrink: 0 } })
}

function FutureStaffHeroMark(props: { size: number; className?: string }) {
  return createElement('img', { src: futureStaffLogoUrl, alt: 'FutureStaff Agent',
    className: props.className, 'data-futurestaff-hero': 'true', style: { width: props.size, height: props.size, objectFit: 'contain' } })
}

type BrandedConversationProps = Record<string, unknown> & { t: (key: string, ...args: unknown[]) => unknown }
export function brandConversation(original: ComponentType<BrandedConversationProps>) {
  return function FutureStaffConversation(props: BrandedConversationProps) {
    return createElement(original, { ...props, t: (key: string, ...args: unknown[]) =>
      key === 'hero.headline' ? 'FutureStaff Agent' : key === 'hero.preview' ? '' : key === 'hero.chooseWorkspace' ? '选择智能体' : key === 'chat.deepDiving' ? 'FutureStaff Agent thinking.....' : props.t(key, ...args) })
  }
}

function FutureStaffBrandName() {
  return createElement('svg', { viewBox: '65 0 292 68', role: 'img', 'aria-label': 'FutureStaff.Agent', style: { width: 168, height: 32, color: 'inherit' }, dangerouslySetInnerHTML: { __html: futureStaffAgentWordmarkPaths } })
}

function contextRenderer(original: ComponentType<ChatNodeViewProps<'context'>>) {
  return function FutureStaffContextNode(props: ChatNodeViewProps<'context'>) {
    const data = props.node.data
    if (data.provenance.label !== '@deepseek-ai/dsh-system-prompt') return createElement(original, props)
    return createElement(original, { ...props, node: {
      ...props.node, data: { ...data, provenance: { ...data.provenance, label: 'FutureStaff 系统提示词' },
        source: data.source.kind === 'plugin'
          ? { ...data.source, plugin: 'FutureStaff 系统提示词' }
          : data.source },
    } })
  }
}

/** Preserve the pinned registry entry's declaration and all composed prop faces.
 * Shadow registration cannot borrow children: the native registry rejects duplicate declarations.
 * Restore only our component on disposal, leaving subsequent product customizations intact.
 */
export function decorateSlotEntry(entry: { component: unknown }, replacement: unknown): () => void {
  const original = entry.component
  entry.component = replacement
  return () => { if (entry.component === replacement) entry.component = original }
}

/** Mount account access in Settings and require it before the desktop workspace is usable. */
export function apply(ctx: ClientContext): void {
  installMessageCardStyles(ctx)
  if (typeof document !== 'undefined') ctx.effect(() => {
    const title = document.title
    document.title = 'FutureStaff Agent'
    const existing = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
    const saved = existing.map(link => ({ link, href: link.getAttribute('href'), type: link.getAttribute('type') }))
    const icon = document.createElement('link')
    icon.rel = 'icon'; icon.type = 'image/svg+xml'; icon.href = futureStaffLogoUrl
    for (const link of existing) link.remove()
    document.head.append(icon)
    const style = document.createElement('style')
    style.textContent = 'div:has(>span>[data-futurestaff-hero]){grid-template-columns:34px auto}div:has(>span>[data-futurestaff-hero])>span:last-child{display:none}'
    document.head.append(style)
    return () => { icon.remove(); style.remove(); for (const { link } of saved) document.head.append(link); if (document.title === 'FutureStaff Agent') document.title = title }
  }, 'futurestaff: product browser identity')
  installAppearance(ctx)
  // One store per plugin instance: settings actions must immediately relock the
  // workspace on logout/tenant changes, including while the gate renders null.
  const controller = new PlatformDevClientController()
  const PlatformSettingsRoot = createPlatformSettingsRoot(controller)
  ctx.slots.inject('sidebar.settings', () => watchSlotComponents(ctx.slots, 'sidebar.settings',
    entry => entry.locale === 'settings' && (entry.options.priority ?? 0) === 0,
    () => PlatformSettingsRoot))
  const pages = new SystemPages()
  const agentNavigation=createAgentNavigation()
  const newAgentSession=()=>{pages.select('sessions');agentNavigation.begin();(ctx.get('sessions') as unknown as {clear():void}).clear()}
  const openAgentCenter=()=>pages.open('agents')
  const openAgentSession=async(sessionId:string)=>{
    const sessions=ctx.get('sessions') as unknown as {open(id:string):void|Promise<void>}
    await sessions.open(sessionId)
    agentNavigation.finish()
    pages.select('sessions')
  }
  const AgentCenter=createAgentCenter(controller,newAgentSession,openAgentSession)
  ctx.inject([],local=>local.effect(()=>pages.register({id:'agents',title:'智能体中心',component:AgentCenter}),'futurestaff agent center'))
  const createWorkspace=(input:{path:string})=>{
    const service=ctx.get('workspaces') as unknown as {create(value:{path:string}):Promise<{workspaceId:string;path:string;sessionIds:readonly string[]}>}
    return service.create(input)
  }
  ctx.slots.inject('sidebar.workspaces', () => watchSlotComponents(ctx.slots, 'sidebar.workspaces',
    entry => (entry.options.priority ?? 0) === 0,
    component => createAgentBrowser(controller, component as Parameters<typeof createAgentBrowser>[1],agentNavigation)))
  ctx.slots.inject('conversation.hero.workspace', () => watchSlotComponents(ctx.slots, 'conversation.hero.workspace',
    entry => (entry.options.priority ?? 0) === 0,
    () => createAgentPicker(controller,openAgentCenter,openAgentSession)))
  if (typeof ctx.provide === 'function') ctx.provide('platformClientSession', controller)
  if (typeof ctx.provide === 'function') ctx.provide('platformSystemPages', pages)
  ctx.slots.inject('sidebar', () => watchSlotComponents(ctx.slots, 'sidebar',
    entry => entry.locale === 'sidebar' && (entry.options.priority ?? 0) === 0,
    () => createAccountSidebar(controller,pages,()=>{
      agentNavigation.begin()
      const sessions=ctx.get('sessions') as unknown as {clear():void}
      sessions.clear()
    })))
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
    name: 'sidebar.brand.mark', priority: -100,
  }, FutureStaffBrandMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name', priority: -100,
  }, FutureStaffBrandName))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark', priority: -100,
  }, FutureStaffHeroMark))
  ctx.slots.inject('conversation', () => watchSlotComponents(ctx.slots, 'conversation',
    entry => (entry.options.priority ?? 0) === 0,
    component => {
      const Original=brandConversation(component as ComponentType<BrandedConversationProps>)
      const Conversation=createAgentConversation(controller,agentNavigation,createWorkspace,Original as unknown as ComponentType<Record<string,unknown>>,openAgentCenter,openAgentSession)
      return function FutureStaffMain(props:BrandedConversationProps){return createElement(SystemMain,{pages,chat:createElement(Conversation,props as unknown as AgentConversationProps)})}
    }))
  ctx.slots.inject('conversation.view', () => watchSlotComponents(ctx.slots, 'conversation.view',
    entry => entry.options.id === 'chat' && (entry.options.priority ?? 0) === 0,
    component => brandConversation(component as ComponentType<BrandedConversationProps>)))
  for (const name of ['conversation.hero.agentPreset', 'conversation.session.header.actions', 'settings.section'] as const) {
    ctx.slots.inject(name, () => watchSlotComponents(ctx.slots, name,
      entry => entry.locale === 'settings.agentPreset' && (entry.options.priority ?? 0) === 0,
      () => () => null))
  }
  ctx.slots.inject('conversation.chat.node', () => {
    const original = ctx.slots.entries('conversation.chat.node')
      .find(entry => entry.options.key === 'context' && (entry.options.priority ?? 0) === 0)?.component
    if (original === undefined) return () => {}
    return ctx.slots.register({ name: 'conversation.chat.node', key: 'context', priority: -100 },
      contextRenderer(original as ComponentType<ChatNodeViewProps<'context'>>))
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'futurestaff-access', order: -10, label: 'FutureStaff',
  }, () => createElement(FutureStaffPlatformAccessSection, { controller })))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'futurestaff-agent-market', order: -9, label: 'Agent 市场',
  }, ({ close }: { close(): void }) => createElement(AgentCenter, { embedded: true, beforeNewSession: close })))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'futurestaff-login-gate', order: -100,
  }, () => createElement(FutureStaffPlatformLoginGate, { controller })))
  applyErpClient(ctx)
  applyShopOperationClient(ctx)
  applyAgentMessageCardClient(ctx)
  mountFashionPreviews(ctx)
  applyGovernanceCandidates(ctx, controller)
}

declare module '@deepseek-ai/cordis' { interface Context { platformClientSession: PlatformDevClientController;platformSystemPages:SystemPages } }
