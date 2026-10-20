import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, writeFile, unlink, link } from 'node:fs/promises'
import path from 'node:path'
import { requireUuid } from './contracts.js'
import { assertPlatformOrigin } from './environment.js'
import type { WorkspaceIdentity } from './workspace.js'
import {decodeBusinessSystems,type BusinessSystem} from './business-scope.js'

export interface AgentCard { agentId: string; name: string; description: string; available: boolean; unavailableReason: string | null }
export interface AgentModelPolicy { primaryModelId: string | null; fallbackModelId: string | null }
export interface AgentSnapshot { agentId: string; name: string; description: string; version: string; files: { path: string; content: string }[]; businessSystems?:BusinessSystem[]; modelPolicy?:AgentModelPolicy; legacyVersion?:string }
export interface AgentCredentials { accessToken: string; tenantId: string; userId: string; signal: AbortSignal }
const id = (value: string) => requireUuid({id:value},'id').toLowerCase()
const error = () => new Error('AGENT_CONTRACT_INVALID')
const record = (value: unknown): value is Record<string,unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
export function agentFileAllowed(value: string): boolean {
  if(value.includes('\\')||value.startsWith('/')||value.split('/').some(p=>!p||p.startsWith('.')
    ||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p)))return false
  return ['soul.md','memory/memory.md','memory.md'].includes(value)
    || /^(skills\/|workspace\/knowledge_base\/).+\.(md|txt|csv)$/i.test(value)
}
export function decodeAgentSnapshot(value: unknown): AgentSnapshot {
  if(!record(value)||Object.keys(value).some(key=>!['agentId','description','files','name','version','businessSystems','modelPolicy','legacyVersion'].includes(key))
    ||typeof value.agentId!=='string'||typeof value.name!=='string'||!value.name.trim()||value.name.length>200
    ||typeof value.description!=='string'||value.description.length>2000
    ||typeof value.version!=='string'||!(/^[a-f0-9]{64}$/).test(value.version)
    ||!Array.isArray(value.files)||value.files.length>128)throw error()
  id(value.agentId)
  if('businessSystems' in value)decodeBusinessSystems(value.businessSystems)
  if(('modelPolicy' in value)!==('legacyVersion' in value))throw error()
  if('modelPolicy' in value){
    if(!record(value.modelPolicy)||Object.keys(value.modelPolicy).sort().join()!=='fallbackModelId,primaryModelId'
      ||typeof value.legacyVersion!=='string'||!/^[a-f0-9]{64}$/.test(value.legacyVersion))throw error()
    for(const field of ['primaryModelId','fallbackModelId']){const model=value.modelPolicy[field];if(model!==null){if(typeof model!=='string')throw error();id(model)}}
  }
  let size=0;const seen=new Set<string>()
  for(const file of value.files){
    if(!record(file)||Object.keys(file).sort().join()!=='content,path'||typeof file.path!=='string'
      ||!agentFileAllowed(file.path)||typeof file.content!=='string'||Buffer.byteLength(file.content)>65536
      ||seen.has(file.path.toLowerCase()))throw error()
    seen.add(file.path.toLowerCase());size+=Buffer.byteLength(file.content)
  }
  if(size>1024*1024)throw error()
  return structuredClone(value) as unknown as AgentSnapshot
}

export async function fetchAgentData(origin: string, credentials: AgentCredentials, agentId?: string, fetcher=globalThis.fetch, contractVersion:'1.0.0'|'1.1.0'='1.0.0'): Promise<unknown> {
  assertPlatformOrigin(origin)
  const response=await fetcher(`${origin}/desktop/v1/agents${agentId?`/${id(agentId)}/snapshot${contractVersion==='1.1.0'?'?contractVersion=1.1.0':''}`:''}`,{
    headers:{authorization:`Bearer ${credentials.accessToken}`},redirect:'error',cache:'no-store',
    signal:AbortSignal.any([credentials.signal,AbortSignal.timeout(15000)]),
  })
  if(!response.ok){await response.body?.cancel();throw new Error('AGENT_UNAVAILABLE')}
  const reader=response.body?.getReader();if(!reader)throw error()
  const chunks:Uint8Array[]=[];let size=0
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2*1024*1024)throw error();chunks.push(part.value)}}finally{await reader.cancel()}
  credentials.signal.throwIfAborted()
  const body:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if(!record(body)||body.contractVersion!==(agentId?contractVersion:'1.0.0')||body.activeTenantId!==credentials.tenantId)throw error()
  if(agentId){const result=decodeAgentSnapshot(body.snapshot);if(result.agentId!==id(agentId)||(contractVersion==='1.1.0'&&!result.modelPolicy))throw error();return result}
  if(!Array.isArray(body.items)||body.items.length>200)throw error()
  const seen=new Set<string>()
  return body.items.map(item=>{
    if(!record(item)||Object.keys(item).sort().join()!=='agentId,available,description,name,unavailableReason'
      ||typeof item.agentId!=='string'||typeof item.name!=='string'||!item.name.trim()||item.name.length>200
      ||typeof item.description!=='string'||item.description.length>2000||typeof item.available!=='boolean'
      ||!(item.unavailableReason===null||typeof item.unavailableReason==='string'))throw error()
    const agent=id(item.agentId);if(seen.has(agent))throw error();seen.add(agent)
    return {...item,agentId:agent} as unknown as AgentCard
  })
}

async function realDirectory(directory:string):Promise<void>{
  const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('AGENT_DIRECTORY_UNSAFE')
}
async function ensureTree(directory:string):Promise<void>{
  const parent=path.dirname(directory)
  if(parent!==directory)await ensureTree(parent)
  try{await realDirectory(directory)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await mkdir(directory);await realDirectory(directory)}
}
async function existingTree(directory:string):Promise<void>{
  const parent=path.dirname(directory)
  if(parent!==directory)await existingTree(parent)
  await realDirectory(directory)
}
async function atomicJson(file:string,value:unknown):Promise<void>{
  try{if((await lstat(file)).isSymbolicLink())throw new Error('AGENT_FILE_UNSAFE')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
  const temporary=`${file}.${randomUUID()}.tmp`
  await writeFile(temporary,JSON.stringify(value),{flag:'wx',mode:0o600});await rename(temporary,file)
}
export class AgentWorkspaceStore {
  constructor(readonly root:string,readonly identity:WorkspaceIdentity){if(!path.isAbsolute(root))throw error();id(identity.tenantId);id(identity.userId)}
  directory(agentId:string):string{return path.join(this.root,'agents',id(agentId))}
  /** Match the native registry's canonical paths, including Windows app virtualization. */
  async workspacePath(agentId:string):Promise<string>{
    const directory=path.join(this.directory(agentId),'workspace')
    try{await existingTree(directory);return await realpath(directory)}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return directory;throw e}
  }
  async materialize(raw:AgentSnapshot,signal:AbortSignal):Promise<string>{
    const snapshot=decodeAgentSnapshot(raw);signal.throwIfAborted()
    const directory=this.directory(snapshot.agentId)
    let previous:AgentSnapshot|undefined
    try{previous=await this.snapshot(snapshot.agentId)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
    for(const suffix of ['definition','memory','workspace','sessions'])await ensureTree(path.join(directory,suffix))
    for(const file of snapshot.files){
      signal.throwIfAborted()
      const target=path.join(directory,'workspace','.futurestaff-agent','definition',...file.path.split('/'))
      await ensureTree(path.dirname(target))
      try{if((await lstat(target)).isSymbolicLink())throw new Error('AGENT_FILE_UNSAFE')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
      const temporary=`${target}.${randomUUID()}.tmp`;await writeFile(temporary,file.content,{flag:'wx',mode:0o600});await rename(temporary,target)
    }
    // Native skill discovery uses the session's project .agents/skills root.
    // Only platform-projected files are reconciled; never overwrite human edits.
    for(const file of [...snapshot.files.filter(f=>f.path.startsWith('skills/')),...(previous?.files??[]).filter(f=>f.path.startsWith('skills/')&&!snapshot.files.some(current=>current.path===f.path))]){
      signal.throwIfAborted()
      const target=path.join(directory,'workspace','.agents',...file.path.split('/'))
      await ensureTree(path.dirname(target))
      let existing:string|undefined
      try{if((await lstat(target)).isSymbolicLink())throw new Error('AGENT_FILE_UNSAFE');existing=await readFile(target,'utf8')}
      catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
      const old=previous?.files.find(f=>f.path===file.path)
      if(existing!==undefined&&existing!==file.content&&existing!==old?.content)throw new Error('AGENT_SKILL_LOCAL_CONFLICT')
      if(!snapshot.files.some(current=>current.path===file.path)){if(existing!==undefined)await unlink(target);continue}
      const temporary=`${target}.${randomUUID()}.tmp`;await writeFile(temporary,file.content,{flag:'wx',mode:0o600});await rename(temporary,target)
    }
    signal.throwIfAborted()
    await atomicJson(path.join(directory,'definition','snapshot.json'),snapshot)
    return directory
  }
  async snapshot(agentId:string):Promise<AgentSnapshot>{
    const directory=this.directory(agentId);await existingTree(path.join(directory,'definition'))
    const target=path.join(directory,'definition','snapshot.json')
    if((await lstat(target)).isSymbolicLink())throw error()
    return decodeAgentSnapshot(JSON.parse(await readFile(target,'utf8')))
  }
  private bindingFile(sessionId:string):string{
    if(!sessionId||sessionId.length>256)throw error()
    return path.join(this.root,'agent-session-bindings',`${createHash('sha256').update(sessionId).digest('hex')}.json`)
  }
  private modelPinFile(sessionId:string):string{return this.bindingFile(sessionId).slice(0,-5)+'.model.json'}
  async binding(sessionId:string):Promise<{agentId:string;version:string;modelVersion?:string}|undefined>{
    const file=this.bindingFile(sessionId)
    try{
      await existingTree(path.dirname(file));if((await lstat(file)).isSymbolicLink())throw error()
      const value=JSON.parse(await readFile(file,'utf8'))
      if(value.sessionId!==sessionId||JSON.stringify(value.identity)!==JSON.stringify(this.identity)
        ||typeof value.version!=='string'||! /^[a-f0-9]{64}$/.test(value.version)
        ||(value.modelVersion!==undefined&&(typeof value.modelVersion!=='string'||!/^[a-f0-9]{64}$/.test(value.modelVersion))))throw error()
      let modelVersion=value.modelVersion
      try{
        const pinFile=this.modelPinFile(sessionId)
        if((await lstat(pinFile)).isSymbolicLink())throw error()
        const pin=JSON.parse(await readFile(pinFile,'utf8'))
        if(pin.sessionId!==sessionId||JSON.stringify(pin.identity)!==JSON.stringify(this.identity)||pin.agentId!==value.agentId
          ||pin.version!==value.version||typeof pin.modelVersion!=='string'||!/^[a-f0-9]{64}$/.test(pin.modelVersion)
          ||(modelVersion!==undefined&&modelVersion!==pin.modelVersion))throw error()
        modelVersion=pin.modelVersion
      }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
      return {agentId:id(value.agentId),version:value.version,...(modelVersion?{modelVersion}:{})}
    }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e}
  }
  /** Upgrade only matching legacy content; an immutable first-writer claim never replaces an existing policy. */
  async pinModelVersion(sessionId:string,agentId:string,version:string,modelVersion:string){
    if(!/^[a-f0-9]{64}$/.test(version)||!/^[a-f0-9]{64}$/.test(modelVersion))throw error()
    const current=await this.binding(sessionId)
    if(!current||current.agentId!==id(agentId)||current.version!==version)throw new Error('AGENT_MODEL_VERSION_CHANGED')
    if(current.modelVersion){if(current.modelVersion!==modelVersion)throw new Error('AGENT_MODEL_VERSION_CHANGED');return current}
    const file=this.modelPinFile(sessionId),temporary=`${file}.${randomUUID()}.tmp`
    await writeFile(temporary,JSON.stringify({sessionId,identity:this.identity,agentId:id(agentId),version,modelVersion}),{flag:'wx',mode:0o600})
    try{
      // Linking a fully written private file is an atomic create-if-absent, including across Host processes.
      try{await link(temporary,file)}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}
    }finally{await unlink(temporary)}
    const pinned=await this.binding(sessionId)
    if(!pinned||pinned.agentId!==id(agentId)||pinned.version!==version||pinned.modelVersion!==modelVersion)throw new Error('AGENT_MODEL_VERSION_CHANGED')
    return pinned
  }
  async bind(sessionId:string,agentId:string):Promise<void>{
    const snapshot=await this.snapshot(agentId);const existing=await this.binding(sessionId)
    if(existing){if(existing.agentId!==id(agentId))throw new Error('AGENT_SESSION_MISMATCH');return}
    const file=this.bindingFile(sessionId);await ensureTree(path.dirname(file))
    // Exclusive creation protects against simultaneous attempts to bind different Agents.
    await writeFile(file,JSON.stringify({sessionId,identity:this.identity,agentId:id(agentId),version:snapshot.legacyVersion??snapshot.version,
      ...(snapshot.modelPolicy?{modelVersion:snapshot.version}:{})}),{flag:'wx',mode:0o600})
    const directory=path.join(this.directory(agentId),'sessions',path.basename(file,'.json'))
    for(const suffix of ['attachments','drafts','outputs'])await ensureTree(path.join(directory,suffix))
  }
}
