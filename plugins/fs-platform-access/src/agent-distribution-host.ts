import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { AgentInstallationStore, AgentCapabilityConfirmation, decodeRelease, distributionCatalog, downloadAgentRelease, type DistributionCard } from './agent-distribution.js'
import type { AgentCredentials } from './agents.js'
import type { BusinessSystem } from './business-scope.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { scopeApplications, type SystemApplicationId } from './system-policy.js'
import { systemScopeAllowed, requireSystemScope } from './system-assistant-access.js'

interface ClassifiedDistributionCard extends DistributionCard {
  installedVersion: string | null; versions: string[]; updateAvailable: boolean
  classificationKnown: boolean; businessSystems?: BusinessSystem[]
  requiredApplications?: SystemApplicationId[]
}

/** Host owns download/write authority. Renderer selects offered Agent/version pairs only. */
export function mountAgentDistribution(ctx:Context,origin:string,store:AgentInstallationStore,authorize:()=>Promise<AgentCredentials>,fetcher=globalThis.fetch){
  async function credentials(){const c=await authorize();if(c.tenantId!==store.identity.tenantId||c.userId!==store.identity.userId)throw Error('AGENT_IDENTITY_MISMATCH');c.signal.throwIfAborted();return c}
  // Classification is display metadata, never a permission grant. Cache only
  // immutable package metadata; current directory authorization is read anew.
  const metadataCache=new Map<string,{bytes:number;businessSystems:BusinessSystem[]}>()
  let metadataInFlight=0
  const metadataWaiting:(()=>void)[]=[]
  async function limited<T>(run:()=>Promise<T>):Promise<T>{
    if(metadataInFlight<4)metadataInFlight++;else await new Promise<void>(resolve=>metadataWaiting.push(resolve))
    try{return await run()}finally{const next=metadataWaiting.shift();if(next)next();else metadataInFlight--}
  }
  async function metadata(agentId:string,version:string,c:AgentCredentials,retained:boolean,expectedBytes?:number){
    const key=agentId+':'+version
    const checked=(value:{bytes:number;businessSystems:BusinessSystem[]})=>{
      c.signal.throwIfAborted()
      if(expectedBytes!==undefined&&expectedBytes!==value.bytes)throw Error('AGENT_PACKAGE_INTEGRITY')
      return [...value.businessSystems]
    }
    const cached=metadataCache.get(key);if(cached)return checked(cached)
    return limited(async()=>{
      c.signal.throwIfAborted()
      const settled=metadataCache.get(key);if(settled)return checked(settled)
      let raw:Uint8Array
      if(retained){
        // The store validates the owned path, bound size and immutable digest.
        await store.read(agentId,version)
        raw=await readFile(path.join(store.runtime(version).directory(agentId),'definition','release.json'))
      }else raw=await downloadAgentRelease(origin,c,agentId,version,fetcher)
      if(expectedBytes!==undefined&&raw.length!==expectedBytes)throw Error('AGENT_PACKAGE_INTEGRITY')
      const pkg=decodeRelease(raw,agentId,version)
      const value={bytes:raw.length,businessSystems:[...(pkg.snapshot.businessSystems??[])]}
      c.signal.throwIfAborted();metadataCache.set(key,value)
      return checked(value)
    })
  }
  const snapshot=async()=>{
    const c=await credentials(),cards=await distributionCatalog(origin,c,fetcher),states=await store.list()
    const projected=await Promise.all(cards.map(async(card):Promise<ClassifiedDistributionCard|undefined>=>{
      const state=states.find(item=>item.agentId===card.agentId)
      const local={installedVersion:state?.enabled?state.activeVersion:null,versions:state?.versions??[],updateAvailable:!!state?.enabled&&state.activeVersion!==card.version}
      try{
        const businessSystems=await metadata(card.agentId,card.version,c,state?.versions.includes(card.version)??false,card.bytes)
        const requiredApplications=scopeApplications(businessSystems)
        if(!await systemScopeAllowed(origin,c,businessSystems,fetcher))return undefined
        if(state?.enabled&&state.activeVersion!==card.version&&!await systemScopeAllowed(origin,c,await metadata(card.agentId,state.activeVersion,c,true),fetcher))return undefined
        return {...card,...local,classificationKnown:true,businessSystems,requiredApplications}
      }
      catch{c.signal.throwIfAborted();return {...card,...local,classificationKnown:false,available:false,unavailableReason:card.unavailableReason||'分类信息暂不可用，请刷新后重试。'}}
    }))
    const items=projected.filter((item):item is ClassifiedDistributionCard=>item!==undefined)
    // A retained installation is historical material, not current directory authority.
    // Revoked/retired entries stay on disk for history without re-entering choices.
    c.signal.throwIfAborted()
    return {items,dataDirectory:store.root}
  }
  for(const [suffix,method] of [['distribution','GET'],['install','POST'],['rollback','POST'],['uninstall','POST'],['open-installed','POST']] as const){
    ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/_futurestaff/agents/'+suffix,handler:async(request,response)=>{
      const send=(status:number,value:unknown)=>{response.statusCode=status;response.setHeader('content-type','application/json; charset=utf-8');response.setHeader('cache-control','no-store');response.end(JSON.stringify(value))}
      if(request.method!==method||request.headers['x-futurestaff-agent']!=='1'||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress??'')||(request.headers.origin&&request.headers.origin!=='http://'+request.headers.host))return send(403,{error:'LOCAL_REQUEST_REQUIRED'})
      try{
        if(suffix==='distribution')return send(200,await snapshot())
        const c=await credentials();let raw='';for await(const chunk of request){raw+=String(chunk);if(Buffer.byteLength(raw)>2048)throw Error('AGENT_REQUEST_INVALID')}
        const body=JSON.parse(raw)
        if(!body||Object.keys(body).some(key=>!['agentId','version','confirmCapabilities'].includes(key))||typeof body.agentId!=='string'||(body.confirmCapabilities!==undefined&&typeof body.confirmCapabilities!=='boolean'))throw Error('AGENT_REQUEST_INVALID')
        if(suffix==='uninstall'){await store.uninstall(body.agentId);return send(200,{ok:true})}
        if(suffix==='open-installed'){
          const state=await store.state(body.agentId);if(!state?.enabled)throw Error('AGENT_NOT_INSTALLED')
          const card=(await distributionCatalog(origin,c,fetcher)).find(item=>item.agentId===body.agentId)
          if(!card?.available)throw Error('AGENT_UNAVAILABLE')
          await requireSystemScope(origin,c,await metadata(card.agentId,card.version,c,state.versions.includes(card.version),card.bytes),fetcher)
          await downloadAgentRelease(origin,c,body.agentId,state.activeVersion,fetcher)
          const runtime=store.runtime(state.activeVersion),pkg=await store.read(body.agentId,state.activeVersion)
          await requireSystemScope(origin,c,pkg.snapshot.businessSystems,fetcher)
          const workspace=await runtime.workspacePath(body.agentId)
          const registry=ctx.get('workspaceRegistry') as unknown as {create(path:string,title?:string):Promise<unknown>}|undefined
          if(!registry)throw Error('AGENT_WORKSPACE_SERVICE_REQUIRED')
          await registry.create(workspace,pkg.snapshot.name);c.signal.throwIfAborted()
          return send(200,{agentId:body.agentId,name:pkg.snapshot.name,version:state.activeVersion,path:workspace})
        }
        if(typeof body.version!=='string')throw Error('AGENT_REQUEST_INVALID')
        const cards=await distributionCatalog(origin,c,fetcher),card=cards.find(v=>v.agentId===body.agentId)
        if(!card?.available)throw Error('AGENT_UNAVAILABLE')
        if(suffix==='install'&&card.version!==body.version)throw Error('AGENT_RELEASE_CHANGED')
        if(suffix==='rollback')await requireSystemScope(origin,c,await metadata(card.agentId,card.version,c,(await store.state(card.agentId))?.versions.includes(card.version)??false,card.bytes),fetcher)
        const bytes=await downloadAgentRelease(origin,c,body.agentId,body.version,fetcher)
        await requireSystemScope(origin,c,decodeRelease(bytes,body.agentId,body.version).snapshot.businessSystems,fetcher)
        if(suffix==='install'&&bytes.length!==card.bytes)throw Error('AGENT_PACKAGE_INTEGRITY')
        if(suffix==='rollback')await store.activate(body.agentId,body.version,c.signal,body.confirmCapabilities===true)
        else await store.install(body.agentId,body.version,bytes,c.signal,body.confirmCapabilities===true)
        return send(200,{ok:true})
      }catch(error){
        if(error instanceof AgentCapabilityConfirmation)return send(409,{error:error.message,capabilities:error.capabilities})
        const allowed=['AGENT_DISTRIBUTION_UPGRADE_REQUIRED','AGENT_PERMISSION_CONFIRMATION_REQUIRED','AGENT_NOT_INSTALLED','AGENT_RELEASE_CHANGED','AGENT_PACKAGE_INTEGRITY','AGENT_UNAVAILABLE']
        return send(409,{error:error instanceof Error&&allowed.includes(error.message)?error.message:'AGENT_DISTRIBUTION_UNAVAILABLE'})
      }
    }}),'futurestaff distribution '+suffix)
  }
  return {snapshot,credentials}
}
