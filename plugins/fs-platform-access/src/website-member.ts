import { randomUUID } from 'node:crypto'
import type { LocalTemplatePrincipal } from './market-host.js'

export interface WebsiteLocalIdentity extends LocalTemplatePrincipal { accessToken: string; tenantId: string; userId: string }
const readTools = new Set(['website_capabilities','website_sites_list','website_pages_list','website_page_get','website_versions_list','website_dashboard','website_snapshot_get','website_source_get','website_demo_link','website_release_history','website_columns_list','website_references_list','website_reference_get','website_brief_get','website_requirements_list','website_requirement_get','website_media_list','website_media_get','website_media_upload_get','website_reference_observations_list','website_requirement_brief_get','website_requirement_decisions_list','website_requirement_conflicts_list','website_requirement_baselines_list','website_requirement_baseline_get','website_requirement_operation_get'])
const draftTools = new Set(['website_draft_create','website_draft_update','website_demo_build','website_source_patch','website_column_save','website_entry_save','website_reference_save','website_reference_capture_record','website_observations_save','website_requirement_save','website_requirement_confirm','website_brief_save','website_media_upload_begin','website_media_upload_complete','website_reference_analysis_save','website_requirement_decide','website_requirement_conflict_save','website_requirement_baseline_freeze'])
type Data = Record<string, unknown>
function object(value: unknown): Data { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('WEBSITE_RESULT_INVALID'); return value as Data }
async function boundedText(response: Response): Promise<string> {
 const reader=response.body?.getReader();if(!reader)throw Error('WEBSITE_RESULT_INVALID')
 const parts:Uint8Array[]=[];let bytes=0
 try { while(true){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>1024*1024)throw Error('WEBSITE_RESULT_INVALID');parts.push(item.value)} }
 finally{await reader.cancel()}
 return Buffer.concat(parts).toString('utf8')
}
function argumentsAllowed(value: unknown, depth=0): void {
 if(depth>20)throw Error('WEBSITE_ARGUMENTS_TOO_LARGE')
 if(Array.isArray(value)){for(const item of value)argumentsAllowed(item,depth+1)}
 else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){
  if(['tenantid','actorid','role','token','authorization'].includes(key.toLowerCase().replaceAll('_','')))throw Error('WEBSITE_AUTHORITY_ARGUMENT_DENIED')
  argumentsAllowed(item,depth+1)
 }
}
/** Stateless member delegation. Tokens, MCP sessions and URLs never reach the model. */
export async function localWebsiteRequest(origin:string,identity:WebsiteLocalIdentity,authorize:()=>Promise<WebsiteLocalIdentity>,fetcher:typeof fetch,input?:{name:string;arguments:Record<string,unknown>}) {
 if(input){
  if(!readTools.has(input.name)&&!draftTools.has(input.name))throw Error('WEBSITE_OPERATION_NOT_SUPPORTED')
  object(input.arguments);argumentsAllowed(input.arguments)
  if(Buffer.byteLength(JSON.stringify(input.arguments))>131072)throw Error('WEBSITE_ARGUMENTS_TOO_LARGE')
  if(draftTools.has(input.name)&&(typeof input.arguments.requestId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.arguments.requestId)))throw Error('WEBSITE_REQUEST_ID_REQUIRED')
 }
 const check=async()=>{
  identity.signal.throwIfAborted();const current=await authorize();identity.signal.throwIfAborted()
  if(current.templateId!==identity.templateId||current.version!==identity.version||current.tenantId!==identity.tenantId||current.userId!==identity.userId)throw Error('WEBSITE_SESSION_CHANGED')
 }
 await check()
 const signal=AbortSignal.any([identity.signal,AbortSignal.timeout(90000)])
 const response=await fetcher(origin+'/api/website-control/v1/agent-token',{method:'POST',headers:{Authorization:'Bearer '+identity.accessToken,'content-type':'application/json'},redirect:'error',signal})
 if(!response.ok){await response.body?.cancel();throw Error('WEBSITE_REQUEST_DENIED: '+response.status)}
 const grant=object(JSON.parse(await boundedText(response))),access=object(grant.application_access)
 const endpoint=origin==='https://platform.fsstory.net'?'https://web.fsstory.net/mcp':'https://web-dev.fsstory.net/mcp'
 if(grant.schema_version!==1||grant.expires_in!==120||grant.mcp_url!==endpoint||typeof grant.token!=='string'||!grant.token||grant.token.length>8192
  ||access.schema_version!==1||access.application_id!=='futurestaff-web'||access.tenant_id!==identity.tenantId||access.member_id!==identity.userId||access.enabled!==true||access.can_manage!==true)throw Error('WEBSITE_IDENTITY_MISMATCH')
 let session:string|undefined
 const rpc=async(method:string,params:Data={},notification=false):Promise<Data>=>{
  await check();const id=randomUUID()
  let result:Response
  try{result=await fetcher(endpoint,{method:'POST',redirect:'error',signal,headers:{Authorization:'Bearer '+grant.token,'content-type':'application/json',Accept:'application/json, text/event-stream',...(session?{'Mcp-Session-Id':session}:{})},body:JSON.stringify({jsonrpc:'2.0',...(!notification?{id}:{}),method,params})})}
  catch{identity.signal.throwIfAborted();throw Error('WEBSITE_RESULT_UNCONFIRMED: 查询原请求，禁止换 requestId 重复提交。')}
  if(!result.ok){await result.body?.cancel();throw Error('WEBSITE_REQUEST_DENIED: '+result.status)}
  const next=result.headers.get('mcp-session-id')
  if(next){if(next.length>256||!/^[\x21-\x7e]+$/.test(next))throw Error('WEBSITE_RESULT_INVALID');session=next}
  if(notification){await result.body?.cancel();return {}}
  const text=await boundedText(result)
  const rows=result.headers.get('content-type')?.includes('text/event-stream')?text.split(/\r?\n\r?\n/).flatMap(block=>{
   const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n')
   if(!data||data==='[DONE]')return [];return [object(JSON.parse(data))]
  }):[object(JSON.parse(text))]
  const row=rows.find(item=>item.id===id)
  if(!row||row.jsonrpc!=='2.0'||row.error||!row.result)throw Error('WEBSITE_RESULT_INVALID')
  await check();return object(row.result)
 }
 await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'futurestaff-agent-desktop',version:'0.3.0'}})
 await rpc('notifications/initialized',{},true)
 const catalog=await rpc('tools/list')
 if(!Array.isArray(catalog.tools)||catalog.tools.length>128)throw Error('WEBSITE_RESULT_INVALID')
 const tools=catalog.tools.map(object).filter(tool=>typeof tool.name==='string'&&(readTools.has(tool.name)||draftTools.has(tool.name)))
 if(!input)return {mode:'connected',templateVersion:identity.version,tools}
 if(!tools.some(tool=>tool.name===input.name))throw Error('WEBSITE_FEATURE_UNAVAILABLE')
 const result=await rpc('tools/call',{name:input.name,arguments:input.arguments})
 if(result.isError)throw Error('WEBSITE_OPERATION_REJECTED')
 return result
}
