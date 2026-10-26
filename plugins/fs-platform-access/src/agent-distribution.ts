import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { AgentWorkspaceStore, atomicJson, atomicBytes, decodeAgentSnapshot, ensureTree, existingTree, type AgentCredentials, type AgentSnapshot } from './agents.js'
import { requireUuid } from './contracts.js'
import { assertPlatformOrigin } from './environment.js'
import type { WorkspaceIdentity } from './workspace.js'

export interface AgentReleasePackage {
  contractVersion: '2.0.0'; snapshot: AgentSnapshot; notes: string
  requirements: { minClientVersion: string; capabilities: string[] }
}
export interface DistributionCard {
  agentId:string; name:string; description:string; version:string; sha256:string; bytes:number; notes:string
  available:boolean; unavailableReason:string|null; publishedAt:string|null
  requirements:AgentReleasePackage['requirements']
}
export interface AgentInstallation { agentId:string; enabled:boolean; activeVersion:string; versions:string[] }
export class AgentCapabilityConfirmation extends Error {
  constructor(readonly capabilities:string[]){super('AGENT_PERMISSION_CONFIRMATION_REQUIRED')}
}
const hash = (raw:Uint8Array) => createHash('sha256').update(raw).digest('hex')
const validVersion = (value:unknown):value is string => typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const uuid = (value:string) => requireUuid({id:value},'id').toLowerCase()
const invalid = () => Error('AGENT_DISTRIBUTION_INVALID')
const object = (v:unknown):v is Record<string,unknown> => !!v&&typeof v==='object'&&!Array.isArray(v)
export const desktopCapabilities = ['core.chat','local.files','video.production','geo.collection'] as const
export function compatibleRequirements(value:unknown,clientVersion='3.3.1'): value is AgentReleasePackage['requirements'] {
  if(!object(value)||Object.keys(value).sort().join()!=='capabilities,minClientVersion'||typeof value.minClientVersion!=='string'
    ||!/^\d+\.\d+\.\d+$/.test(value.minClientVersion)||!Array.isArray(value.capabilities)||value.capabilities.length>20
    ||new Set(value.capabilities).size!==value.capabilities.length||!value.capabilities.every(v=>typeof v==='string'&&desktopCapabilities.includes(v as typeof desktopCapabilities[number])))return false
  const wanted=value.minClientVersion.split('.').map(Number),actual=clientVersion.split('.').map(Number)
  for(let index=0;index<3;index++){if(actual[index]!==wanted[index])return actual[index]!>wanted[index]!}
  return true
}
export function decodeRelease(raw:Uint8Array,agentId:string,version:string):AgentReleasePackage {
  if(raw.length>2*1024*1024||!validVersion(version)||hash(raw)!==version)throw Error('AGENT_PACKAGE_INTEGRITY')
  const value:unknown=JSON.parse(Buffer.from(raw).toString('utf8'))
  if(!object(value)||Object.keys(value).sort().join()!=='contractVersion,notes,requirements,snapshot'||value.contractVersion!=='2.0.0'
    ||typeof value.notes!=='string'||value.notes.length>2000||!compatibleRequirements(value.requirements))throw invalid()
  const snapshot=decodeAgentSnapshot(value.snapshot)
  if(snapshot.agentId.toLowerCase()!==uuid(agentId)||!snapshot.modelPolicy)throw invalid()
  return {...value,snapshot} as unknown as AgentReleasePackage
}
async function bounded(response:Response,signal:AbortSignal):Promise<Uint8Array> {
  if(!response.ok){await response.body?.cancel();throw Error(response.status===404?'AGENT_DISTRIBUTION_UPGRADE_REQUIRED':'AGENT_DISTRIBUTION_UNAVAILABLE')}
  const reader=response.body?.getReader();if(!reader)throw invalid()
  const chunks:Uint8Array[]=[];let size=0
  try{for(;;){signal.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024)throw invalid();chunks.push(part.value)}}finally{await reader.cancel()}
  signal.throwIfAborted();return Buffer.concat(chunks)
}
export async function distributionCatalog(origin:string,credentials:AgentCredentials,fetcher=globalThis.fetch):Promise<DistributionCard[]> {
  assertPlatformOrigin(origin)
  const response=await fetcher(origin+'/desktop/v1/agent-distribution',{headers:{Authorization:'Bearer '+credentials.accessToken},redirect:'error',cache:'no-store',signal:AbortSignal.any([credentials.signal,AbortSignal.timeout(15000)])})
  const value:unknown=JSON.parse(Buffer.from(await bounded(response,credentials.signal)).toString('utf8'))
  if(!object(value)||value.contractVersion!=='2.0.0'||value.activeTenantId!==credentials.tenantId||!Array.isArray(value.items)||value.items.length>200)throw invalid()
  const ids=new Set<string>()
  return value.items.map(item=>{
    if(!object(item)||typeof item.agentId!=='string'||typeof item.name!=='string'||!item.name.trim()||item.name.length>200||typeof item.description!=='string'||item.description.length>2000
      ||!validVersion(item.version)||item.sha256!==item.version||!Number.isInteger(item.bytes)||Number(item.bytes)<1||Number(item.bytes)>2*1024*1024
      ||typeof item.available!=='boolean'||!(item.unavailableReason===null||typeof item.unavailableReason==='string')||typeof item.notes!=='string'||item.notes.length>2000
      ||!object(item.requirements)||!(item.publishedAt===null||typeof item.publishedAt==='string'))throw invalid()
    const id=uuid(item.agentId);if(ids.has(id))throw invalid();ids.add(id)
    const supported=compatibleRequirements(item.requirements)
    return {...item,agentId:id,available:item.available&&supported,unavailableReason:supported?item.unavailableReason:'请升级客户端或等待所需能力适配'} as unknown as DistributionCard
  })
}
export async function downloadAgentRelease(origin:string,credentials:AgentCredentials,agentId:string,version:string,fetcher=globalThis.fetch):Promise<Uint8Array>{
  assertPlatformOrigin(origin);if(!validVersion(version))throw invalid()
  const response=await fetcher(`${origin}/desktop/v1/agents/${uuid(agentId)}/releases/${version}`,{headers:{Authorization:'Bearer '+credentials.accessToken},redirect:'error',cache:'no-store',signal:AbortSignal.any([credentials.signal,AbortSignal.timeout(30000)])})
  const raw=await bounded(response,credentials.signal);decodeRelease(raw,agentId,version);return raw
}

/** Only activation pointers are mutable. Releases, projects and session bindings are retained. */
export class AgentInstallationStore {
  private queue:Promise<unknown>=Promise.resolve()
  constructor(readonly root:string,readonly identity:WorkspaceIdentity){if(!path.isAbsolute(root))throw invalid();uuid(identity.tenantId);uuid(identity.userId)}
  private directory(agentId:string){return path.join(this.root,'agents',uuid(agentId),'installation')}
  runtime(version:string){if(!validVersion(version))throw invalid();return new AgentWorkspaceStore(this.root,this.identity,version)}
  private async serialize<T>(run:()=>Promise<T>):Promise<T>{const pending=this.queue.then(run,run);this.queue=pending.catch(()=>{});return pending}
  async state(agentId:string):Promise<AgentInstallation|undefined>{
    const directory=this.directory(agentId),file=path.join(directory,'state.json')
    try{await existingTree(directory);const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw invalid();const s=JSON.parse(await readFile(file,'utf8'))
      if(Object.keys(s).sort().join()!=='activeVersion,agentId,enabled,versions'||s.agentId!==uuid(agentId)||typeof s.enabled!=='boolean'||!validVersion(s.activeVersion)||!Array.isArray(s.versions)||s.versions.length>1000||!s.versions.every(validVersion)||!s.versions.includes(s.activeVersion)||new Set(s.versions).size!==s.versions.length)throw invalid();return s
    }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e}
  }
  async list():Promise<AgentInstallation[]>{
    const directory=path.join(this.root,'agents');let entries
    try{await existingTree(directory);entries=await readdir(directory,{withFileTypes:true})}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e}
    const states:AgentInstallation[]=[]
    for(const item of entries){if(!item.isDirectory()||!/^[a-f0-9-]{36}$/.test(item.name))continue;const state=await this.state(item.name);if(state)states.push(state)}
    return states
  }
  async read(agentId:string,version:string):Promise<AgentReleasePackage>{
    const directory=path.join(this.runtime(version).directory(agentId),'definition');await existingTree(directory)
    const file=path.join(directory,'release.json'),info=await lstat(file)
    if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024)throw invalid()
    return decodeRelease(await readFile(file),agentId,version)
  }
  async install(agentId:string,version:string,raw:Uint8Array,signal:AbortSignal,confirmCapabilities=false):Promise<AgentInstallation>{
    return this.serialize(async()=>{
      const pkg=decodeRelease(raw,agentId,version),previous=await this.state(agentId)
      if(previous?.enabled){const old=await this.read(agentId,previous.activeVersion);if(pkg.requirements.capabilities.some(cap=>!old.requirements.capabilities.includes(cap))&&!confirmCapabilities)throw new AgentCapabilityConfirmation(pkg.requirements.capabilities)}
      signal.throwIfAborted()
      const runtime=this.runtime(version),directory=path.join(runtime.directory(agentId),'definition')
      await ensureTree(directory)
      const file=path.join(directory,'release.json')
      try{await this.read(agentId,version)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await atomicBytes(file,raw)}
      // A partially prepared new release is never activated; retry prepares it again.
      await runtime.materialize(pkg.snapshot,signal)
      await this.read(agentId,version);signal.throwIfAborted()
      const state:AgentInstallation={agentId:uuid(agentId),enabled:true,activeVersion:version,versions:[...new Set([...(previous?.versions??[]),version])]}
      await ensureTree(this.directory(agentId));await atomicJson(path.join(this.directory(agentId),'state.json'),state)
      return state
    })
  }
  async activate(agentId:string,version:string,signal:AbortSignal,confirmCapabilities=false){
    const previous=await this.state(agentId);if(!previous?.versions.includes(version))throw Error('AGENT_RELEASE_NOT_INSTALLED')
    const directory=path.join(this.runtime(version).directory(agentId),'definition','release.json')
    await this.read(agentId,version);return this.install(agentId,version,await readFile(directory),signal,confirmCapabilities)
  }
  async uninstall(agentId:string){return this.serialize(async()=>{const state=await this.state(agentId);if(!state)return;await atomicJson(path.join(this.directory(agentId),'state.json'),{...state,enabled:false})})}
}
