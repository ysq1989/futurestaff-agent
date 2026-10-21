import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { AgentInstallationStore, AgentCapabilityConfirmation, distributionCatalog, downloadAgentRelease } from './agent-distribution.js'
import type { AgentCredentials } from './agents.js'

/** Host owns download/write authority. Renderer selects offered Agent/version pairs only. */
export function mountAgentDistribution(ctx:Context,origin:string,store:AgentInstallationStore,authorize:()=>Promise<AgentCredentials>,fetcher=globalThis.fetch){
  async function credentials(){const c=await authorize();if(c.tenantId!==store.identity.tenantId||c.userId!==store.identity.userId)throw Error('AGENT_IDENTITY_MISMATCH');c.signal.throwIfAborted();return c}
  const snapshot=async()=>{
    const c=await credentials(),cards=await distributionCatalog(origin,c,fetcher),states=await store.list()
    const items=cards.map(card=>{const state=states.find(s=>s.agentId===card.agentId);return {...card,installedVersion:state?.enabled?state.activeVersion:null,versions:state?.versions??[],updateAvailable:!!state?.enabled&&state.activeVersion!==card.version}})
    for(const state of states){if(cards.some(c=>c.agentId===state.agentId)||!state.enabled)continue;const pkg=await store.read(state.agentId,state.activeVersion);items.push({agentId:state.agentId,name:pkg.snapshot.name,description:pkg.snapshot.description,version:state.activeVersion,sha256:state.activeVersion,bytes:0,notes:'',publishedAt:null,requirements:pkg.requirements,available:false,unavailableReason:'平台授权已撤销或此智能体暂不可用',installedVersion:state.activeVersion,versions:state.versions,updateAvailable:false})}
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
          await downloadAgentRelease(origin,c,body.agentId,state.activeVersion,fetcher)
          const runtime=store.runtime(state.activeVersion),pkg=await store.read(body.agentId,state.activeVersion),workspace=await runtime.workspacePath(body.agentId)
          const registry=ctx.get('workspaceRegistry') as unknown as {create(path:string,title?:string):Promise<unknown>}|undefined
          if(!registry)throw Error('AGENT_WORKSPACE_SERVICE_REQUIRED')
          await registry.create(workspace,pkg.snapshot.name);c.signal.throwIfAborted()
          return send(200,{agentId:body.agentId,name:pkg.snapshot.name,version:state.activeVersion,path:workspace})
        }
        if(typeof body.version!=='string')throw Error('AGENT_REQUEST_INVALID')
        const cards=await distributionCatalog(origin,c,fetcher),card=cards.find(v=>v.agentId===body.agentId)
        if(!card?.available)throw Error('AGENT_UNAVAILABLE')
        if(suffix==='install'&&card.version!==body.version)throw Error('AGENT_RELEASE_CHANGED')
        const bytes=await downloadAgentRelease(origin,c,body.agentId,body.version,fetcher)
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
