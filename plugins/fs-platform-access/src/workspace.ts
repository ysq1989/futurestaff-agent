import { createHash, randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { requireUuid, type DesktopSession, type User } from './contracts.js'
import { platformOrigin, type PlatformEnvironment } from './environment.js'
import { PlatformSessionVault, type PlatformProtectedSecrets } from './session-vault.js'
import { compatibleMemberDirectory } from './data-root.js'

export interface WorkspaceIdentity { environment: PlatformEnvironment; tenantId: string; userId: string }
export interface LoginWorkspace {
  accepts(session: DesktopSession, user: User): boolean
  enter(session: DesktopSession, user: User): Promise<boolean>
}
interface Profiles {
  current: { name: string; dir: string }
  list(): readonly { name: string; dir: string; webCapable: boolean; problem?: string }[]
  select(name: string): Promise<void>
  restartCurrent?(): Promise<void>
}
const uuid = (value: string) => requireUuid({ id: value }, 'id')
export function workspaceIdentity(environment: PlatformEnvironment, tenantId: string, userId: string): WorkspaceIdentity {
  platformOrigin(environment)
  return { environment, tenantId: uuid(tenantId), userId: uuid(userId) }
}
export function workspaceName(identity: WorkspaceIdentity): string {
  const value = workspaceIdentity(identity.environment, identity.tenantId, identity.userId)
  return `fs-${value.environment}-${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
export function workspaceDirectory(identity: WorkspaceIdentity, root?: string): string {
  const value = workspaceIdentity(identity.environment, identity.tenantId, identity.userId)
  if (root === undefined) return compatibleMemberDirectory(value)
  if (!path.isAbsolute(root)) throw new Error('WORKSPACE_ROOT_INVALID')
  return path.join(root, value.environment, value.tenantId, 'users', value.userId)
}
export function workspaceStoragePatch(directory: string): string {
  if (!path.isAbsolute(directory)) throw new Error('WORKSPACE_ROOT_INVALID')
  const quoted = (suffix: string) => JSON.stringify(path.join(directory, suffix))
  return `\n- id: session-persistence-jsonl\n  config:\n    root: ${quoted('sessions')}\n- id: storage-json\n  config:\n    root: ${quoted('storages')}\n- id: attachment-local\n  config:\n    dshHome: ${JSON.stringify(directory)}\n- id: settings\n  name: '@futurestaff/fs-platform-access/managed-settings'\n  config:\n    dshHome: ${JSON.stringify(directory)}\n- id: session-query-sqlite\n  config:\n    path: ${quoted('session-search.sqlite')}\n    openAt: never\n- id: futurestaff-douyin-ui\n  config:\n    database: ${quoted('douyin/leads.sqlite')}\n`
}
export function workspaceProfilePatch(identity: WorkspaceIdentity, root?: string): string {
  const value = workspaceIdentity(identity.environment, identity.tenantId, identity.userId)
  return workspaceStoragePatch(workspaceDirectory(value, root)) + `\n- id: agent-presets\n  config:\n    default: standard\n    includeUserRoot: false\n    roots:\n      - path: ${JSON.stringify(path.join(workspaceDirectory(value, root), 'agent-presets'))}\n        trust: system\n- id: futurestaff-core\n  config:\n    identityMode: single-subject\n    tenantId: ${JSON.stringify(value.tenantId)}\n    userId: ${JSON.stringify(value.userId)}\n    visaAccessRole: collector\n`
}
const marketPatchMarker = '# FutureStaff role market workspace v2'
export function workspaceMarketPatch(identity: WorkspaceIdentity, root?: string): string {
  return `\n${marketPatchMarker}\n- id: ui-agent-preset\n  disabled: false\n- id: agent-presets\n  config:\n    default: standard\n    includeUserRoot: false\n    roots:\n      - path: ${JSON.stringify(path.join(workspaceDirectory(identity, root), 'agent-presets'))}\n        trust: system\n`
}
async function realDirectory(directory: string) {
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('WORKSPACE_DIRECTORY_INVALID')
}
const marker = 'futurestaff-workspace.json'
export function readWorkspaceIdentity(directory: string, environment: PlatformEnvironment): WorkspaceIdentity | undefined {
  let raw: string
  try { raw = readFileSync(path.join(directory, marker), 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  const value = JSON.parse(raw) as WorkspaceIdentity
  if (Object.keys(value).sort().join(',') !== 'environment,tenantId,userId' || value.environment !== environment)
    throw new Error('WORKSPACE_IDENTITY_INVALID')
  return workspaceIdentity(value.environment, value.tenantId, value.userId)
}
export async function loadWorkspaceIdentity(directory: string, environment: PlatformEnvironment): Promise<WorkspaceIdentity | undefined> {
  let raw: string
  try { raw = await readFile(path.join(directory, marker), 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  const value = JSON.parse(raw) as WorkspaceIdentity
  if (Object.keys(value).sort().join(',') !== 'environment,tenantId,userId' || value.environment !== environment)
    throw new Error('WORKSPACE_IDENTITY_INVALID')
  return workspaceIdentity(value.environment, value.tenantId, value.userId)
}
/** Publishes configuration and immutable plugin code only. Never copies shared history or browser data. */
export class DesktopLoginWorkspace implements LoginWorkspace {
  private geoRestartPending = false
  constructor(private readonly profiles: Profiles, private readonly environment: PlatformEnvironment,
    private readonly secrets: PlatformProtectedSecrets, private readonly identity?: WorkspaceIdentity,
    private readonly dataRoot?: string) {}
  accepts(session: DesktopSession, user: User) {
    return !!this.identity && this.identity.tenantId === session.activeTenantId && this.identity.userId === user.userId
      && this.identity.environment === this.environment && this.profiles.current.name === workspaceName(this.identity)
  }
  async enter(session: DesktopSession, user: User): Promise<boolean> {
    const identity = workspaceIdentity(this.environment, session.activeTenantId, user.userId)
    const name = workspaceName(identity)
    const profilesRoot = path.dirname(this.profiles.current.dir)
    const target = path.join(profilesRoot, name)
    const source = path.join(profilesRoot, 'futurestaff-alpha')
    await realDirectory(source)
    let exists = false
    try { await realDirectory(target); exists = true } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (!exists) {
      const staging = path.join(profilesRoot, `.${name}.creating-${process.pid}-${randomUUID()}`)
      await mkdir(staging, { mode: 0o700 })
      const manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
      manifest.name = `@futurestaff/${name}`
      await writeFile(path.join(staging, 'package.json'), JSON.stringify(manifest, null, 2))
      const patch = await readFile(path.join(source, 'cordis.patch.yml'), 'utf8')
      await writeFile(path.join(staging, 'cordis.patch.yml'), patch + workspaceProfilePatch(identity, this.dataRoot) + workspaceMarketPatch(identity, this.dataRoot))
      const modules = ['fs-core', 'fs-platform-access', 'fs-product-hub-ui', 'fs-douyin-ui']
      if (manifest.dependencies?.['@futurestaff/fs-geo']) modules.push('fs-geo')
      if (manifest.dependencies?.['@futurestaff/fs-video']) modules.push('fs-video')
      for (const module of modules) {
        const from = path.join(source, 'node_modules', '@futurestaff', module)
        await realDirectory(from)
        const to = path.join(staging, 'node_modules', '@futurestaff', module)
        await mkdir(to, { recursive: true })
        await cp(path.join(from, 'lib'), path.join(to, 'lib'), { recursive: true, dereference: false })
        await cp(path.join(from, 'package.json'), path.join(to, 'package.json'))
        // Older Product Hub packages serve their built local UI beside lib.
        // Copy this code asset when present, never workspace data.
        try {
          await realDirectory(path.join(from, 'ui'))
          await cp(path.join(from, 'ui'), path.join(to, 'ui'), { recursive: true })
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      // Preserve the release's hoisted linker metadata; a new profile must not
      // try to download private FutureStaff packages from a public registry.
      for (const file of ['pnpm-workspace.yaml', 'pnpm-lock.yaml', 'node_modules/.modules.yaml']) {
        const info = await lstat(path.join(source, file))
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('WORKSPACE_RELEASE_METADATA_INVALID')
        await cp(path.join(source, file), path.join(staging, file))
      }
      await writeFile(path.join(staging, marker), JSON.stringify(identity))
      await rename(staging, target)
    }
    const storedIdentity = await loadWorkspaceIdentity(target, this.environment)
    if (JSON.stringify(storedIdentity) !== JSON.stringify(identity)) throw new Error('WORKSPACE_IDENTITY_MISMATCH')
    const patchPath = path.join(target, 'cordis.patch.yml')
    const existingPatch = await readFile(patchPath, 'utf8')
    const needsMarket = !existingPatch.includes(marketPatchMarker)
    if (needsMarket) {
      const temporary = `${patchPath}.${randomUUID()}.tmp`
      await writeFile(temporary, existingPatch + workspaceMarketPatch(identity, this.dataRoot))
      await rename(temporary, patchPath)
    }
    // An installed member workspace may predate the local GEO plugin. Copy only
    // immutable package code; its database lives outside managed Profile files.
    const sourceManifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
    const targetManifestPath = path.join(target, 'package.json')
    const targetManifest = JSON.parse(await readFile(targetManifestPath, 'utf8'))
    const geoMarker = '# FutureStaff GEO local workspace v1'
    const needsGeo = !!sourceManifest.dependencies?.['@futurestaff/fs-geo']
      && (!targetManifest.dependencies?.['@futurestaff/fs-geo'] || !existingPatch.includes(geoMarker))
    if (needsGeo) {
      const from = path.join(source, 'node_modules', '@futurestaff', 'fs-geo')
      await realDirectory(from)
      const to = path.join(target, 'node_modules', '@futurestaff', 'fs-geo')
      await mkdir(to, { recursive: true })
      await realDirectory(to)
      await cp(path.join(from, 'lib'), path.join(to, 'lib'), { recursive: true, dereference: false })
      await cp(path.join(from, 'package.json'), path.join(to, 'package.json'))
      targetManifest.dependencies = { ...targetManifest.dependencies, '@futurestaff/fs-geo': sourceManifest.dependencies['@futurestaff/fs-geo'] }
      const temporaryManifest = `${targetManifestPath}.${randomUUID()}.tmp`
      await writeFile(temporaryManifest, JSON.stringify(targetManifest, null, 2))
      await rename(temporaryManifest, targetManifestPath)
      const currentPatch = await readFile(patchPath, 'utf8')
      if (!currentPatch.includes(geoMarker)) {
        const temporaryPatch = `${patchPath}.${randomUUID()}.tmp`
        await writeFile(temporaryPatch, currentPatch + `\n${geoMarker}\n- insert:\n    - id: futurestaff-geo\n      name: '@futurestaff/fs-geo'\n`)
        await rename(temporaryPatch, patchPath)
      }
      if (this.accepts(session, user)) this.geoRestartPending = true
    }
    const videoMarker = '# FutureStaff video production local workspace v1'
    const needsVideo = !!sourceManifest.dependencies?.['@futurestaff/fs-video']
      && (!targetManifest.dependencies?.['@futurestaff/fs-video'] || !existingPatch.includes(videoMarker))
    if (needsVideo) {
      const from = path.join(source, 'node_modules', '@futurestaff', 'fs-video')
      await realDirectory(from)
      const to = path.join(target, 'node_modules', '@futurestaff', 'fs-video')
      await mkdir(to, { recursive: true }); await realDirectory(to)
      await cp(path.join(from, 'lib'), path.join(to, 'lib'), { recursive: true, dereference: false })
      await cp(path.join(from, 'package.json'), path.join(to, 'package.json'))
      targetManifest.dependencies = { ...targetManifest.dependencies, '@futurestaff/fs-video': sourceManifest.dependencies['@futurestaff/fs-video'] }
      const temporaryManifest = `${targetManifestPath}.${randomUUID()}.tmp`
      await writeFile(temporaryManifest, JSON.stringify(targetManifest, null, 2)); await rename(temporaryManifest, targetManifestPath)
      const currentPatch = await readFile(patchPath, 'utf8')
      if (!currentPatch.includes(videoMarker)) {
        const temporaryPatch = `${patchPath}.${randomUUID()}.tmp`
        await writeFile(temporaryPatch, currentPatch + `\n${videoMarker}\n- insert:\n    - id: futurestaff-video\n      name: '@futurestaff/fs-video'\n`)
        await rename(temporaryPatch, patchPath)
      }
      if (this.accepts(session, user)) this.geoRestartPending = true
    }
    if (this.accepts(session, user) && !needsMarket && !needsGeo && !needsVideo && !this.geoRestartPending) return true
    if (!this.profiles.list().some(item => item.name === name && item.webCapable && !item.problem)) throw new Error('WORKSPACE_PROFILE_UNAVAILABLE')
    await new PlatformSessionVault(this.secrets, this.environment, name).save({ session, user })
    if (this.geoRestartPending && this.profiles.current.name === name) {
      if (!this.profiles.restartCurrent) throw new Error('WORKSPACE_RESTART_REQUIRED')
      await this.profiles.restartCurrent()
    } else {
      await this.profiles.select(name)
    }
    return false // This generation must remain locked until the launcher boots the selected Profile.
  }
}
