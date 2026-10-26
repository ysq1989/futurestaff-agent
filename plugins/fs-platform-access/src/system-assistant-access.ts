import type { AgentCredentials } from './agents.js'
import type { BusinessSystem } from './business-scope.js'
import { fetchRecipes } from './market.js'
import { visaAssistantPermissionAvailable } from './system-assistant-tools.js'
import { applicationsAllowed, scopeApplications } from './system-policy.js'

/** Fresh human authority for published and historical system roles; never changes local state. */
export async function systemScopeAllowed(origin: string, credentials: AgentCredentials,
  scope: readonly BusinessSystem[] | undefined, fetcher = globalThis.fetch): Promise<boolean> {
  const required = scopeApplications(scope)
  if (!applicationsAllowed(credentials, required)) return false
  if (!required.includes('vietnam_immigration')) return true
  try {
    // A published Agent ID is not a builtin template ID. Resolve the canonical
    // role from the current member's authoritative directory rather than guessing.
    const candidates = (await fetchRecipes(origin, credentials, fetcher)).filter(recipe =>
      recipe.name === 'Vietnam Visa Agent' && recipe.category === 'vietnam-visa-system'
      && recipe.requiredApplications?.includes('vietnam_immigration')
      && recipe.businessSystems?.includes('visa') && recipe.tools?.includes('visa_query'))
    if (candidates.length !== 1) return false
    return await visaAssistantPermissionAvailable(origin, { ...credentials, templateId: candidates[0]!.templateId }, fetcher)
  } catch {
    credentials.signal.throwIfAborted()
    return false
  }
}
export async function requireSystemScope(origin: string, credentials: AgentCredentials,
  scope: readonly BusinessSystem[] | undefined, fetcher = globalThis.fetch): Promise<void> {
  if (!await systemScopeAllowed(origin, credentials, scope, fetcher)) throw Error('AGENT_APPLICATION_REQUIRED')
}
