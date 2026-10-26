import type { AuthorizedApplication } from './contracts.js'
import { decodeBusinessSystems } from './business-scope.js'

export const systemApplicationIds = ['erp', 'web', 'product_hub', 'vietnam_immigration', 'geo', 'shop', 'agent'] as const
export type SystemApplicationId = typeof systemApplicationIds[number]
// Current Platform member permissions authorize local system assistants. Entry-only
// Website access and ordinary Agent reads do not grant their management tools.
const assistantCapabilities: Record<SystemApplicationId, readonly string[]> = {
  erp: ['erp.read', 'erp.operator', 'erp.admin'],
  web: ['web.manage'],
  product_hub: ['product_hub.read', 'product_hub.operator', 'product_hub.admin'],
  vietnam_immigration: ['visa.read', 'visa.operator', 'visa.reviewer', 'visa.admin'],
  geo: ['geo.read', 'geo.operator', 'geo.admin'],
  shop: ['shop.admin'],
  agent: ['agent.admin'],
}
export function applicationCapabilitiesAllowed(appId: SystemApplicationId, capabilities: readonly string[]): boolean {
  return Array.isArray(capabilities) && capabilities.length > 0
    && capabilities.every(capability => typeof capability === 'string' && capability.trim().length > 0)
    && capabilities.some(capability => assistantCapabilities[appId]?.includes(capability))
}
export interface ApplicationAuthority {
  tenantId: string
  applications?: readonly Pick<AuthorizedApplication, 'appId' | 'tenantId' | 'capabilities'>[]
  /** Host-only: pin this operation to the captured epochs for its exact dependencies. */
  restrictApplications?(required: readonly SystemApplicationId[]): void
}
export function decodeRequiredApplications(value: unknown): SystemApplicationId[] {
  if (!Array.isArray(value) || value.length > systemApplicationIds.length || new Set(value).size !== value.length
    || value.some(id => !systemApplicationIds.includes(id as SystemApplicationId))) throw Error('AGENT_APPLICATION_CONTRACT')
  return [...value] as SystemApplicationId[]
}
/** Scope restricts a current human grant. Missing legacy scope grants no new application access. */
export function scopeApplications(scope: unknown): SystemApplicationId[] {
  if (scope === undefined) return []
  return decodeBusinessSystems(scope).map(system => system === 'product-hub' ? 'product_hub' : system === 'visa' ? 'vietnam_immigration' : system)
}
export function applicationsAllowed(authority: ApplicationAuthority, required: readonly SystemApplicationId[]): boolean {
  const allowed = required.every(id => authority.applications?.some(app => app.appId === id && app.tenantId === authority.tenantId
    && applicationCapabilitiesAllowed(id, app.capabilities)))
  if (!allowed) return false
  try { authority.restrictApplications?.(required); return true } catch { return false }
}
export function requireApplications(authority: ApplicationAuthority, required: readonly SystemApplicationId[]): void {
  if (!applicationsAllowed(authority, required)) throw Error('AGENT_APPLICATION_REQUIRED')
}
