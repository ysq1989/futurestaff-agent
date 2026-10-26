import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { platformOrigin, type PlatformEnvironment } from './environment.js'
import { workspaceDirectory, type WorkspaceIdentity } from './workspace.js'
import { atomicJson, ensureTree, existingTree } from './agents.js'
import { decodeRequiredApplications, type SystemApplicationId } from './system-policy.js'
import { decodeBusinessSystems, toolBusiness, toolSystem, type BusinessSystem } from './business-scope.js'
import { scopeApplications } from './system-policy.js'

export interface RecipeSkill { path: string; content: string; sha256: string }

export interface RoleRecipe {
  templateId: string; version: string; name: string; description: string; icon: string;
  category: string; capabilityBullets: string[]; instructions: string; skills: RecipeSkill[];
  compatible: boolean; unavailableReason: string | null;
  requiredApplications?: SystemApplicationId[];
  tools?: string[]; businessSystems?: BusinessSystem[];
}
const supportedTools = new Set(['call_erp_api', 'erp_query', 'erp_order_form', 'erp_prepare_action', 'website_tools', 'website_call', 'call_product_hub_api', 'visa_query', 'call_agent_admin_api', 'agent_message_card'])
export function recipeRuntimeSupported(recipe: RoleRecipe): boolean {
  return recipe.compatible && (!recipe.tools || recipe.tools.every(tool => supportedTools.has(tool)))
    && (!recipe.businessSystems || recipe.businessSystems.every(system => (['erp', 'web', 'product-hub', 'visa'] as string[]).includes(system)
      && recipe.tools?.some(tool => toolBusiness(tool) === system)))
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]))
  return value
}
function skillPath(value: unknown): value is string {
  return typeof value === 'string' && value.length < 240 && /^[a-z0-9][a-z0-9_-]*\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(md|txt|csv|json|ya?ml)$/.test(value)
    && value.split('/').every(part => !part.startsWith('.') && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))
}
export interface LocalRole { presetId: string; recipe: RoleRecipe; path: string }
const presetPattern = /^fs-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{64}$/
const installationManifest = 'futurestaff-installation.json'
export function isLocalRolePreset(value: unknown): value is string { return typeof value === 'string' && presetPattern.test(value) }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function decodeRecipe(raw: unknown): RoleRecipe {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('MARKET_CONTRACT')
  const r = raw as Record<string, unknown>
  const keys = ['templateId', 'version', 'name', 'description', 'icon', 'category', 'capabilityBullets', 'instructions', 'skills', 'compatible', 'unavailableReason']
  if ('requiredApplications' in r) { keys.push('requiredApplications'); decodeRequiredApplications(r.requiredApplications) }
  const modern = 'tools' in r || 'businessSystems' in r
  if (modern) {
    keys.push('tools', 'businessSystems')
    if (!('requiredApplications' in r)) throw new Error('MARKET_CONTRACT')
    const systems = decodeBusinessSystems(r.businessSystems)
    if (!Array.isArray(r.tools) || r.tools.length > 64 || new Set(r.tools).size !== r.tools.length
      || r.tools.some(tool => typeof tool !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(tool)
        || (toolBusiness(tool) && !systems.includes(toolBusiness(tool)!))
        || (toolSystem(tool) === 'agent' && !(r.requiredApplications as string[]).includes('agent')))
      || scopeApplications(systems).some(app => !(r.requiredApplications as string[]).includes(app))) throw new Error('MARKET_CONTRACT')
  }
  if (Object.keys(r).sort().join() !== keys.sort().join()) throw new Error('MARKET_CONTRACT')
  for (const key of ['templateId', 'version', 'name', 'description', 'icon', 'category', 'instructions']) {
    if (typeof r[key] !== 'string' || Buffer.byteLength(r[key]) > (key === 'instructions' ? 65536 : 8192)) throw new Error('MARKET_CONTRACT')
  }
  if (!uuid.test(r.templateId as string) || !/^[a-f0-9]{64}$/.test(r.version as string)
    || !(r.name as string).trim() || !Array.isArray(r.skills) || r.skills.length > (modern ? 128 : 0)
    || typeof r.compatible !== 'boolean' || !(r.unavailableReason === null || typeof r.unavailableReason === 'string')
    || (r.compatible && (!(r.instructions as string).trim() || r.unavailableReason !== null))
    || !Array.isArray(r.capabilityBullets) || r.capabilityBullets.length > 12
    || r.capabilityBullets.some(b => typeof b !== 'string' || b.length > 1024)) throw new Error('MARKET_CONTRACT')
  // Prompt interpolation is owned by DSH; remote text must not introduce variables.
  if ((r.instructions as string).includes('{{')) throw new Error('MARKET_CONTRACT')
  let bytes = 0; const names = new Set<string>()
  for (const rawSkill of r.skills as unknown[]) {
    if (!rawSkill || typeof rawSkill !== 'object' || Array.isArray(rawSkill)) throw new Error('MARKET_CONTRACT')
    const skill = rawSkill as Record<string, unknown>
    if (Object.keys(skill).sort().join() !== 'content,path,sha256' || !skillPath(skill.path) || typeof skill.content !== 'string'
      || Buffer.byteLength(skill.content) > 65536 || names.has(skill.path.toLowerCase())
      || createHash('sha256').update(skill.content).digest('hex') !== skill.sha256) throw new Error('MARKET_CONTRACT')
    names.add(skill.path.toLowerCase()); bytes += Buffer.byteLength(skill.content)
  }
  if (bytes > 1024 * 1024 || (r.skills as RecipeSkill[]).some(skill => !(r.skills as RecipeSkill[]).some(entry => entry.path === skill.path.split('/')[0] + '/SKILL.md'))) throw new Error('MARKET_CONTRACT')
  const content = Object.fromEntries(Object.keys(r).filter(k => k !== 'version').sort().map(k => [k, r[k]]))
  if (createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex') !== r.version) throw new Error('MARKET_CHECKSUM')
  return structuredClone(r) as unknown as RoleRecipe
}
export async function fetchRecipes(origin: string, credentials: { accessToken: string; tenantId: string; signal: AbortSignal }, fetcher = globalThis.fetch): Promise<RoleRecipe[]> {
  const environment: PlatformEnvironment = origin === platformOrigin('production') ? 'production' : 'dev'
  if (platformOrigin(environment) !== origin) throw new Error('MARKET_ORIGIN')
  const response = await fetcher(`${origin}/desktop/v1/agent-templates`, {
    headers: { authorization: `Bearer ${credentials.accessToken}`, 'x-futurestaff-template-contract': '0.3.0' }, redirect: 'error',
    signal: AbortSignal.any([credentials.signal, AbortSignal.timeout(15000)]),
  })
  if (!response.ok) throw new Error('MARKET_UNAVAILABLE')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('MARKET_CONTRACT')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break
      size += result.value.byteLength
      if (size > 2 * 1024 * 1024) throw new Error('MARKET_CONTRACT')
      chunks.push(result.value)
    }
  } finally { await reader.cancel() }
  credentials.signal.throwIfAborted()
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (Object.keys(body).sort().join() !== ['activeTenantId', 'contractVersion', 'items'].sort().join()
    || body.contractVersion !== '0.3.0' || body.activeTenantId !== credentials.tenantId
    || !Array.isArray(body.items) || body.items.length > 200) throw new Error('MARKET_CONTRACT')
  const items = body.items.map(decodeRecipe)
  if (items.some((item: RoleRecipe) => item.requiredApplications === undefined || item.tools === undefined || item.businessSystems === undefined)) throw new Error('MARKET_CONTRACT')
  if (new Set(items.map((r: RoleRecipe) => r.templateId)).size !== items.length) throw new Error('MARKET_CONTRACT')
  return items
}
export function roleRoot(identity: WorkspaceIdentity): string { return path.join(workspaceDirectory(identity), 'agent-presets') }
export function roleId(recipe: RoleRecipe): string { return `fs-${recipe.templateId}-${recipe.version}` }
async function fileInventory(root: string, current = root, result: Record<string, string> = {}): Promise<Record<string, string>> {
  await existingTree(current)
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const file = path.join(current, entry.name), name = path.relative(root, file).split(path.sep).join('/')
    const info = await lstat(file)
    if (info.isSymbolicLink()) throw new Error('MARKET_INSTALLATION_UNSAFE')
    if (info.isDirectory()) await fileInventory(root, file, result)
    else if (info.isFile()) {
      if (name === installationManifest) continue
      if (Object.keys(result).length >= 512 || info.size > 16 * 1024 * 1024) throw new Error('MARKET_INSTALLATION_TOO_LARGE')
      result[name] = createHash('sha256').update(await readFile(file)).digest('hex')
    } else throw new Error('MARKET_INSTALLATION_UNSAFE')
  }
  return result
}
async function boundedJson(file: string): Promise<unknown> {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) throw new Error('MARKET_INSTALLATION_UNSAFE')
  return JSON.parse(await readFile(file, 'utf8'))
}
function sameInventory(a: Record<string, string>, b: Record<string, string>): boolean {
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([name, hash]) => b[name] === hash)
}
/** Electron exposes ASAR reads, but its native recursive cp cannot copy archive directories. */
async function copyTrustedPreset(source: string, target: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const info = await lstat(source)
  if (info.isSymbolicLink()) throw new Error('MARKET_BASELINE_LINK')
  if (info.isDirectory()) {
    await mkdir(target)
    for (const name of await readdir(source)) await copyTrustedPreset(path.join(source, name), path.join(target, name), signal)
  } else if (info.isFile()) {
    await writeFile(target, await readFile(source), { mode: info.mode & 0o777 })
  } else throw new Error('MARKET_BASELINE_FILE')
}

export class LocalRoleStore {
  constructor(readonly root: string) { if (!path.isAbsolute(root)) throw new Error('MARKET_ROOT') }
  private directory(presetId: string): string {
    if (!presetPattern.test(presetId)) throw new Error('MARKET_PRESET_INVALID')
    return path.join(this.root, presetId)
  }
  workspacePath(presetId: string): string {
    this.directory(presetId)
    return path.join(path.dirname(this.root), 'template-workspaces', presetId, 'workspace')
  }
  private statePath(presetId: string): string {
    this.directory(presetId)
    return path.join(this.root, '.futurestaff-installations', presetId.slice(3, 39) + '.json')
  }
  private async setEnabled(presetId: string, enabled: boolean, signal?: AbortSignal): Promise<void> {
    const file = this.statePath(presetId)
    await ensureTree(path.dirname(file))
    if (!enabled) {
      const current = await boundedJson(file) as { presetId?: unknown }
      if (current.presetId !== presetId) return // Uninstalling an old version cannot disable the newer active one.
    }
    signal?.throwIfAborted()
    await atomicJson(file, { presetId, enabled })
  }
  private async verifySkills(presetId: string, recipe: RoleRecipe, install = false): Promise<void> {
    for (const skill of recipe.skills) {
      const file = path.join(this.workspacePath(presetId), '.agents', 'skills', ...skill.path.split('/'))
      if (install) {
        await ensureTree(path.dirname(file))
        try { await writeFile(file, skill.content, { flag: 'wx', mode: 0o600 }) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
      }
      await existingTree(path.dirname(file))
      const info = await lstat(file)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 65536
        || createHash('sha256').update(await readFile(file)).digest('hex') !== skill.sha256) throw new Error('MARKET_SKILL_CHANGED')
    }
  }
  async read(presetId: string, includeDisabled = false): Promise<LocalRole> {
    const directory = this.directory(presetId)
    await existingTree(directory)
    const recipe = decodeRecipe(await boundedJson(path.join(directory, 'recipe.json')))
    if (roleId(recipe) !== presetId) throw new Error('MARKET_SNAPSHOT')
    const files = await boundedJson(path.join(directory, installationManifest)) as Record<string, string>
    if (!files || typeof files !== 'object' || Array.isArray(files)
      || !sameInventory(await fileInventory(directory), files)) throw new Error('MARKET_INSTALLATION_CHANGED')
    const stateFile = this.statePath(presetId)
    await existingTree(path.dirname(stateFile))
    const state = await boundedJson(stateFile) as { presetId?: unknown; enabled?: unknown }
    if (!state || Object.keys(state).sort().join() !== 'enabled,presetId'
      || !isLocalRolePreset(state.presetId) || state.presetId.slice(3, 39) !== recipe.templateId
      || typeof state.enabled !== 'boolean') throw new Error('MARKET_INSTALLATION_CHANGED')
    if (!includeDisabled && (!state.enabled || state.presetId !== presetId)) throw new Error('MARKET_NOT_INSTALLED')
    await this.verifySkills(presetId, recipe)
    return { presetId, recipe, path: this.workspacePath(presetId) }
  }
  async list(): Promise<LocalRole[]> {
    let entries
    try { await existingTree(this.root); entries = await readdir(this.root, { withFileTypes: true }) }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e }
    const roles: LocalRole[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !presetPattern.test(entry.name)) continue
      try { roles.push(await this.read(entry.name)) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as Error).message === 'MARKET_NOT_INSTALLED') continue
        throw error
      }
    }
    return roles
  }
  async install(raw: RoleRecipe, baselineDirectory: string, rolePlugin: string, signal: AbortSignal,
    beforeActivate?: (presetId: string) => Promise<void>): Promise<string> {
    const recipe = decodeRecipe(raw)
    if (!recipeRuntimeSupported(recipe)) throw new Error('MARKET_UNSUPPORTED')
    signal.throwIfAborted()
    await ensureTree(this.root)
    const id = roleId(recipe); const target = path.join(this.root, id)
    try { await this.read(id, true); await beforeActivate?.(id); await this.setEnabled(id, true, signal); return id }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const staging = path.join(this.root, `.creating-${randomUUID()}`)
    if (path.dirname(staging) !== path.resolve(this.root)) throw new Error('MARKET_ROOT')
    try {
      // Preserve all trusted standard composition, skills and assets; only add a data-only role.
      await copyTrustedPreset(baselineDirectory, staging, signal)
      const composition = await readFile(path.join(staging, 'agent.cordis.yml'), 'utf8')
      const row = { id: 'futurestaff-role', name: rolePlugin, config: { instructions: recipe.instructions } }
      await writeFile(path.join(staging, 'agent.cordis.yml'), `${composition}\n- ${JSON.stringify(row)}\n`)
      await writeFile(path.join(staging, 'preset.yml'), JSON.stringify({ name: `${recipe.name} · ${recipe.version.slice(0, 8)}`, description: recipe.description }))
      await writeFile(path.join(staging, 'recipe.json'), JSON.stringify(recipe))
      for (const skill of recipe.skills) {
        const file = path.join(staging, 'skills', ...skill.path.split('/'))
        await ensureTree(path.dirname(file)); await writeFile(file, skill.content, { flag: 'wx', mode: 0o600 })
      }
      const files = await fileInventory(staging)
      await writeFile(path.join(staging, installationManifest), JSON.stringify(files))
      signal.throwIfAborted()
      try { await rename(staging, target) }
      catch (e) {
        // Adopt only a byte-identical legacy role; custom old presets stay intact.
        if (!sameInventory(await fileInventory(target), files)) throw e
        await atomicJson(path.join(target, installationManifest), files)
      }
      await this.verifySkills(id, recipe, true)
      await beforeActivate?.(id)
      await this.setEnabled(id, true, signal)
      return id
    } finally { await rm(staging, { recursive: true, force: true }) }
  }
  async uninstall(presetId: string, signal?: AbortSignal): Promise<void> {
    await this.read(presetId, true)
    await this.setEnabled(presetId, false, signal)
  }
}
