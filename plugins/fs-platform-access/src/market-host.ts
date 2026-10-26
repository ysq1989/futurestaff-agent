import path from 'node:path'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { fetchRecipes, isLocalRolePreset, LocalRoleStore, recipeRuntimeSupported, type LocalRole } from './market.js'
import { ensureTree, existingTree } from './agents.js'
import type { WorkspaceIdentity } from './workspace.js'
import { applicationsAllowed, requireApplications, type ApplicationAuthority } from './system-policy.js'
import type { BusinessSystem } from './business-scope.js'
import { toolSystem } from './business-scope.js'
import type { RoleRecipe } from './market.js'
import { visaAssistantPermissionAvailable } from './system-assistant-tools.js'

interface Presets { list(): Promise<{ id: string; path: string; broken?: string }[]> }
interface Credentials extends ApplicationAuthority { accessToken: string; tenantId: string; userId: string; signal: AbortSignal }
interface NativeSession { header: { cwd?: string; agentPreset?: string } }
interface Sessions { get(id: string): NativeSession | undefined; flush(session: NativeSession): Promise<boolean> }
interface Projections { stateOf(session: NativeSession, projection: 'agentPreset'): string | undefined }
interface Registry { create(path: string, title?: string): Promise<{ id: string; path: string }> }
interface SessionController { create(request: { workspaceId: string; agentPreset: string }): Promise<{ sessionId: string; agentPreset?: string }> }
export interface LocalTemplateBinding {
  kind: 'local-template'; templateId: string; version: string; businessSystems: BusinessSystem[]; tools?: string[]
  identity: { tenantId: string; userId: string }; signal: AbortSignal
}
export interface LocalTemplatePrincipal extends LocalTemplateBinding { workspacePath: string }
export function mountMarket(ctx: Context, origin: string, identity: WorkspaceIdentity, root: string,
  authorize: () => Promise<Credentials>) {
  const store = new LocalRoleStore(root)
  let queue: Promise<unknown> = Promise.resolve()
  const serialize = <T>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run, run); queue = result.catch(() => {}); return result
  }
  async function credentials() {
    const result = await authorize()
    if (result.tenantId !== identity.tenantId || result.userId !== identity.userId) throw new Error('MARKET_IDENTITY')
    result.signal.throwIfAborted(); return result
  }
  function roleAuthorityAllowed(auth: Credentials, recipe: Pick<RoleRecipe, 'requiredApplications' | 'tools'>): boolean {
    return applicationsAllowed(auth, recipe.requiredApplications ?? [])
      && (!recipe.tools?.some(tool => toolSystem(tool) === 'agent') || !!auth.applications?.some(app => app.appId === 'agent'
        && app.tenantId === identity.tenantId && app.capabilities.includes('agent.admin')))
  }
  function requireRoleAuthority(auth: Credentials, recipe: RoleRecipe): void {
    requireApplications(auth, recipe.requiredApplications ?? [])
    if (!roleAuthorityAllowed(auth, recipe)) throw new Error('AGENT_BUSINESS_SCOPE_DENIED')
  }
  async function currentRecipes(auth: Credentials, templateIds?: readonly string[], requireAvailable = false): Promise<RoleRecipe[]> {
    const recipes = await fetchRecipes(origin, auth), available: RoleRecipe[] = []
    for (const recipe of recipes) {
      if (templateIds && !templateIds.includes(recipe.templateId)) continue
      if (!roleAuthorityAllowed(auth, recipe)) {
        if (requireAvailable) requireRoleAuthority(auth, recipe)
        continue
      }
      if (recipe.requiredApplications?.includes('vietnam_immigration')) {
        try {
          if (!await visaAssistantPermissionAvailable(origin, { ...auth, templateId: recipe.templateId })) continue
        } catch (error) {
          auth.signal.throwIfAborted()
          if (requireAvailable) throw error
          // A Visa outage cannot remove unrelated installed/general assistants.
          available.push({ ...recipe, compatible: false, unavailableReason: '签证岗位权限暂时无法核验，请稍后重试。' })
          continue
        }
      }
      auth.signal.throwIfAborted(); available.push(recipe)
    }
    return available
  }
  async function currentRole(role: LocalRole, auth: Credentials) {
    const current = (await currentRecipes(auth, [role.recipe.templateId], true)).find(item => item.templateId === role.recipe.templateId)
    if (!current || !recipeRuntimeSupported(current) || !recipeRuntimeSupported(role.recipe)) throw new Error('MARKET_UNSUPPORTED')
    requireRoleAuthority(auth, current)
    requireRoleAuthority(auth, role.recipe)
    // Keep pinned historical material usable, but never retain a removed tool/scope.
    if (role.recipe.tools?.some(tool => !current.tools?.includes(tool))
      || role.recipe.businessSystems?.some(system => !current.businessSystems?.includes(system))) throw new Error('MARKET_STALE')
    auth.signal.throwIfAborted()
  }
  function admissionPath(sessionId: string) {
    if (!sessionId || sessionId.length > 256) throw new Error('MARKET_SESSION_MISMATCH')
    return path.join(path.dirname(root), 'template-session-bindings', createHash('sha256').update(sessionId).digest('hex') + '.json')
  }
  async function verifySession(session: NativeSession, presetId: string, workspace: string) {
    const projections = ctx.get('sessionProjections') as unknown as Projections | undefined
    if (!projections || session.header.agentPreset !== presetId || projections.stateOf(session, 'agentPreset') !== presetId || !session.header.cwd) throw new Error('MARKET_SESSION_MISMATCH')
    await existingTree(session.header.cwd); await existingTree(workspace)
    if (path.resolve(await realpath(session.header.cwd)) !== path.resolve(await realpath(workspace))) throw new Error('MARKET_SESSION_MISMATCH')
  }
  async function resolveLocal(sessionId: string) {
    const sessions = ctx.get('sessions') as unknown as Sessions | undefined
    const session = sessions?.get(sessionId), presetId = session?.header.agentPreset
    if (!session || !isLocalRolePreset(presetId)) return undefined
    const file = admissionPath(sessionId)
    await existingTree(path.dirname(file))
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) throw new Error('MARKET_SESSION_MISMATCH')
    const admitted = JSON.parse(await readFile(file, 'utf8'))
    if (!admitted || Object.keys(admitted).sort().join() !== 'identity,path,presetId,sessionId,templateId,version'
      || admitted.sessionId !== sessionId || admitted.presetId !== presetId || JSON.stringify(admitted.identity) !== JSON.stringify(identity)) throw new Error('MARKET_SESSION_MISMATCH')
    const role = await store.read(presetId, true)
    if (admitted.templateId !== role.recipe.templateId || admitted.version !== role.recipe.version || admitted.path !== role.path) throw new Error('MARKET_SESSION_MISMATCH')
    await verifySession(session, presetId, role.path)
    const auth = await credentials(); await currentRole(role, auth)
    return { role, auth, session }
  }
  for (const [suffix, method] of [['catalog', 'GET'], ['mine', 'GET'], ['install', 'POST'], ['open', 'POST'], ['uninstall', 'POST']] as const) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `/_futurestaff/agent-market/${suffix}`,
      handler: async (request, response) => {
        const send = (status: number, body: unknown) => {
          response.statusCode = status
          response.setHeader('content-type', 'application/json; charset=utf-8')
          response.setHeader('cache-control', 'no-store')
          response.setHeader('x-content-type-options', 'nosniff')
          response.end(JSON.stringify(body))
        }
        if (request.method !== method || request.headers['x-futurestaff-market'] !== '1'
          || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
          || (request.headers.origin && request.headers.origin !== 'http://' + request.headers.host)) return send(403, { error: 'LOCAL_REQUEST_REQUIRED' })
        try {
          const auth = await credentials()
          if (suffix === 'mine') {
            const roles = await store.list(), recipes = await currentRecipes(auth, roles.map(role => role.recipe.templateId))
            auth.signal.throwIfAborted()
            return send(200, { items: roles.flatMap(({ presetId, path: workspace, recipe: { instructions: _instructions, skills: _skills, ...card } }) => {
              const current = recipes.find(item => item.templateId === card.templateId)
              if (!current || !roleAuthorityAllowed(auth, current) || !roleAuthorityAllowed(auth, card)) return []
              const compatible = recipeRuntimeSupported(current)
              return [{ presetId, ...card, requiredApplications: current.requiredApplications, path: workspace, compatible,
                unavailableReason: compatible ? null : current.unavailableReason || '当前客户端尚未适配此助手的系统工具。' }]
            }) })
          }
          if (suffix === 'catalog') {
            const recipes = await currentRecipes(auth)
            return send(200, { items: recipes.filter(recipe => roleAuthorityAllowed(auth, recipe)).map(recipe => {
              const { instructions: _instructions, skills: _skills, ...card } = recipe
              const compatible = recipeRuntimeSupported(recipe)
              return { ...card, compatible, unavailableReason: compatible ? null : recipe.unavailableReason || '当前客户端尚未适配此助手的系统工具。' }
            }) })
          }
          let raw = ''; for await (const chunk of request) {
            raw += chunk.toString(); if (Buffer.byteLength(raw) > 1024) throw new Error('MARKET_REQUEST')
          }
          const body = JSON.parse(raw)
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('MARKET_REQUEST')
          if (suffix === 'install') {
            if (Object.keys(body).sort().join() !== 'templateId,version') throw new Error('MARKET_REQUEST')
            const recipes = await currentRecipes(auth, [body.templateId], true)
            const recipe = recipes.find(item => item.templateId === body.templateId && item.version === body.version)
            if (!recipe) throw new Error('MARKET_STALE')
            requireRoleAuthority(auth, recipe)
            const presets = ctx.get('agentPresets') as Presets | undefined
            const baseline = (await presets?.list())?.find(item => item.id === 'standard' && !item.broken)
            if (!baseline) throw new Error('MARKET_RUNTIME_UNAVAILABLE')
            const presetId = await serialize(() => store.install(recipe, path.dirname(baseline.path),
              fileURLToPath(new URL('./role.js', import.meta.url)), auth.signal, async id => {
                if (!(await presets?.list())?.some(item => item.id === id && !item.broken)) throw new Error('MARKET_RUNTIME_UNAVAILABLE')
              }))
            auth.signal.throwIfAborted()
            return send(200, { presetId })
          }
          if (Object.keys(body).join() !== 'presetId' || typeof body.presetId !== 'string') throw new Error('MARKET_REQUEST')
          const result = await serialize(async () => {
            auth.signal.throwIfAborted()
            if (suffix === 'uninstall') { await store.uninstall(body.presetId, auth.signal); return { ok: true } }
            const role = await store.read(body.presetId)
            await currentRole(role, auth)
            const presets = ctx.get('agentPresets') as Presets | undefined
            if (!(await presets?.list())?.some(item => item.id === role.presetId && !item.broken)) throw new Error('MARKET_RUNTIME_UNAVAILABLE')
            const registry = ctx.get('workspaceRegistry') as unknown as Registry | undefined
            const controller = ctx.get('sessionController') as unknown as SessionController | undefined
            const sessions = ctx.get('sessions') as unknown as Sessions | undefined
            if (!registry || !controller || !sessions) throw new Error('MARKET_RUNTIME_UNAVAILABLE')
            await ensureTree(role.path); auth.signal.throwIfAborted()
            const workspace = await registry.create(role.path, role.recipe.name)
            const created = await controller.create({ workspaceId: workspace.id, agentPreset: role.presetId })
            auth.signal.throwIfAborted()
            if (!created.sessionId || created.agentPreset !== role.presetId) throw new Error('MARKET_SESSION_MISMATCH')
            const session = sessions.get(created.sessionId)
            if (!session) throw new Error('MARKET_SESSION_MISMATCH')
            await verifySession(session, role.presetId, role.path)
            if (!await sessions.flush(session)) throw new Error('MARKET_RUNTIME_UNAVAILABLE')
            auth.signal.throwIfAborted()
            const file = admissionPath(created.sessionId)
            await ensureTree(path.dirname(file)); auth.signal.throwIfAborted()
            await writeFile(file, JSON.stringify({ sessionId: created.sessionId, presetId: role.presetId,
              templateId: role.recipe.templateId, version: role.recipe.version, path: role.path, identity }), { flag: 'wx', mode: 0o600 })
            return { presetId: role.presetId, templateId: role.recipe.templateId, version: role.recipe.version,
              name: role.recipe.name, path: workspace.path, sessionId: created.sessionId }
          })
          send(200, result)
        } catch (error) {
          const allowed = ['MARKET_NOT_INSTALLED', 'MARKET_UNSUPPORTED', 'MARKET_STALE', 'MARKET_RUNTIME_UNAVAILABLE']
          send(409, { error: error instanceof Error && allowed.includes(error.message) ? error.message : 'MARKET_UNAVAILABLE' })
        }
      },
    }), `futurestaff agent market ${suffix}`)
  }
  return {
    async resolveBinding(sessionId: string): Promise<LocalTemplateBinding | undefined> {
      const local = await resolveLocal(sessionId)
      if (!local) return undefined
      return { kind: 'local-template', templateId: local.role.recipe.templateId, version: local.role.recipe.version,
        businessSystems: local.role.recipe.businessSystems ?? [], ...(local.role.recipe.tools ? { tools: local.role.recipe.tools } : {}),
        identity: { tenantId: identity.tenantId, userId: identity.userId }, signal: local.auth.signal }
    },
    async resolveBusiness(sessionId: string, system: BusinessSystem | 'agent', tool?: string): Promise<LocalTemplatePrincipal | undefined> {
      const local = await resolveLocal(sessionId)
      if (!local) return undefined
      const recipe = local.role.recipe
      const allowedSystem = system === 'agent'
        ? recipe.requiredApplications?.includes('agent') && local.auth.applications?.some(app => app.appId === 'agent' && app.tenantId === identity.tenantId && app.capabilities.includes('agent.admin'))
        : recipe.businessSystems?.includes(system)
      if (!allowedSystem || !recipe.tools?.length || (tool && !recipe.tools.includes(tool))) throw new Error('AGENT_BUSINESS_SCOPE_DENIED')
      return { kind: 'local-template', templateId: recipe.templateId, version: recipe.version,
        businessSystems: recipe.businessSystems ?? [], tools: recipe.tools,
        identity: { tenantId: identity.tenantId, userId: identity.userId }, signal: local.auth.signal, workspacePath: await realpath(local.role.path) }
    },
    async resolveWorkspace(sessionId: string): Promise<string | undefined> {
      const local = await resolveLocal(sessionId)
      return local ? await realpath(local.role.path) : undefined
    },
  }
}
