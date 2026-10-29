import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {AgentCredentials} from './agents.js'
import {AgentInstallationStore,distributionCatalog,downloadAgentRelease} from './agent-distribution.js'
import {assertPlatformOrigin} from './environment.js'

export interface PlatformAssistant {
 templateId:string;name:string;description:string;icon:string;category:string;skills:string[];requiredApplications:string[]
 state:'available'|'preparing'|'ready'|'error';agentId:string|null;version:string|null;unavailableReason:string|null;installed:boolean;installedVersion:string|null;updateAvailable:boolean
}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const version=/^[a-f0-9]{64}$/

/** A definition is selected on Platform before a real immutable Agent is installed. */
export function mountPlatformAssistants(ctx:Context,origin:string,store:AgentInstallationStore,authorize:()=>Promise<AgentCredentials>,fetcher=globalThis.fetch){
 assertPlatformOrigin(origin)
 async function credentials(){const value=await authorize();value.signal.throwIfAborted();if(value.tenantId!==store.identity.tenantId||value.userId!==store.identity.userId)throw Error('PLATFORM_ASSISTANT_IDENTITY_CHANGED');return value}
 async function request(suffix='',method='GET',expected?:AgentCredentials){
  const auth=await credentials();expected?.signal.throwIfAborted()
  const response=await fetcher(origin+'/desktop/v1/platform-assistants'+suffix,{method,headers:{Authorization:'Bearer '+auth.accessToken,...method==='POST'?{'content-type':'application/json'}:{}},...method==='POST'?{body:'{}'}:{},redirect:'error',cache:'no-store',signal:AbortSignal.any([auth.signal,AbortSignal.timeout(45000)])})
  if(!response.ok){await response.body?.cancel();throw Error('PLATFORM_ASSISTANT_UNAVAILABLE')}
  const reader=response.body?.getReader();if(!reader)throw Error('PLATFORM_ASSISTANT_RECEIPT_INVALID')
  const chunks:Uint8Array[]=[];let size=0
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>256000)throw Error('PLATFORM_ASSISTANT_RECEIPT_INVALID');chunks.push(part.value)}}finally{await reader.cancel()}
  await credentials();auth.signal.throwIfAborted();expected?.signal.throwIfAborted()
  return JSON.parse(Buffer.concat(chunks).toString())
 }
 async function list():Promise<PlatformAssistant[]>{
  const auth=await credentials(),data=await request('', 'GET',auth)
  if(data.contractVersion!=='1.0.0'||data.activeTenantId!==auth.tenantId||!Array.isArray(data.items)||data.items.length>50)throw Error('PLATFORM_ASSISTANT_RECEIPT_INVALID')
  const seen=new Set<string>(),items:PlatformAssistant[]=[]
  for(const raw of data.items){
   if(!raw||Object.keys(raw).some(key=>!['templateId','name','description','icon','category','skills','requiredApplications','state','agentId','version','unavailableReason'].includes(key))||typeof raw.templateId!=='string'||!uuid.test(raw.templateId)||seen.has(raw.templateId)
    ||['name','description','icon','category'].some(key=>typeof raw[key]!=='string'||raw[key].length>2000)
    ||!['available','preparing','ready','error'].includes(raw.state)
    ||!(raw.agentId===null||typeof raw.agentId==='string'&&uuid.test(raw.agentId))
    ||!(raw.version===null||typeof raw.version==='string'&&version.test(raw.version))
    ||!(raw.unavailableReason===null||typeof raw.unavailableReason==='string'&&raw.unavailableReason.length<=2000)
    ||!Array.isArray(raw.skills)||raw.skills.length>20||raw.skills.some((name:unknown)=>typeof name!=='string'||!/^[a-z][a-z0-9-]{0,79}$/.test(name))
    ||!Array.isArray(raw.requiredApplications)||raw.requiredApplications.length>8||new Set(raw.requiredApplications).size!==raw.requiredApplications.length||raw.requiredApplications.some((name:unknown)=>!['agent','erp','shop','product_hub','geo','web','vietnam_immigration'].includes(String(name)))
    ||raw.state==='ready'&&(!raw.agentId||!raw.version))throw Error('PLATFORM_ASSISTANT_RECEIPT_INVALID')
   seen.add(raw.templateId)
   const local=raw.agentId?await store.state(raw.agentId):undefined
   items.push({...raw,installed:!!local?.enabled,installedVersion:local?.enabled?local.activeVersion:null,updateAvailable:!!local?.enabled&&raw.version!==local.activeVersion})
  }
  auth.signal.throwIfAborted();await credentials();return items
 }
 async function use(templateId:string){
  if(!uuid.test(templateId))throw Error('PLATFORM_ASSISTANT_REQUIRED')
  const auth=await credentials(),offered=(await list()).find(item=>item.templateId===templateId)
  if(!offered)throw Error('PLATFORM_ASSISTANT_UNAVAILABLE')
  if(offered.state!=='ready'){
   const result=await request('/'+templateId+'/use','POST',auth)
   if(typeof result.agentId!=='string'||!uuid.test(result.agentId)||result.state!=='preparing')throw Error('PLATFORM_ASSISTANT_RECEIPT_INVALID')
   return {state:'preparing',agentId:result.agentId}
  }
  const card=(await distributionCatalog(origin,auth,fetcher)).find(item=>item.agentId===offered.agentId&&item.version===offered.version)
  if(!card?.available)throw Error('PLATFORM_ASSISTANT_UNAVAILABLE')
  const raw=await downloadAgentRelease(origin,auth,card.agentId,card.version,fetcher)
  await credentials();auth.signal.throwIfAborted()
  await store.install(card.agentId,card.version,raw,auth.signal)
  return {state:'installed',agentId:card.agentId,version:card.version}
 }
 for(const [suffix,method]of [['platform-assistants','GET'],['platform-assistant-use','POST']] as const){
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/_futurestaff/agents/'+suffix,handler:async(request,response)=>{
   const send=(code:number,value:unknown)=>{response.statusCode=code;response.setHeader('content-type','application/json; charset=utf-8');response.setHeader('cache-control','no-store');response.end(JSON.stringify(value))}
   if(request.method!==method||request.headers['x-futurestaff-agent']!=='1'||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress??'')||(request.headers.origin&&request.headers.origin!=='http://'+request.headers.host))return send(403,{error:'LOCAL_REQUEST_REQUIRED'})
   try{
    if(method==='GET')return send(200,{items:await list()})
    let raw='';for await(const chunk of request){raw+=String(chunk);if(Buffer.byteLength(raw)>256)throw Error('PLATFORM_ASSISTANT_REQUIRED')}
    const body=JSON.parse(raw);if(!body||Object.keys(body).join()!=='templateId'||typeof body.templateId!=='string')throw Error('PLATFORM_ASSISTANT_REQUIRED')
    return send(200,await use(body.templateId))
   }catch{return send(409,{error:'PLATFORM_ASSISTANT_UNAVAILABLE'})}
  }}),'Platform assistant '+suffix)
 }
 return {list,use}
}
