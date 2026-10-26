import { randomUUID } from 'node:crypto'
export type JsonRecord=Record<string,unknown>
export function jsonRecord(value:unknown):JsonRecord{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('SYSTEM_ASSISTANT_RESULT_INVALID');return value as JsonRecord}
export async function boundedResponse(response:Response,limit=1024*1024):Promise<string>{
 const reader=response.body?.getReader();if(!reader)throw Error('SYSTEM_ASSISTANT_RESULT_INVALID')
 let bytes=0;const chunks:Uint8Array[]=[]
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw Error('SYSTEM_ASSISTANT_RESULT_INVALID');chunks.push(part.value)}}finally{await reader.cancel()}
 return Buffer.concat(chunks).toString('utf8')
}
const failureLimit=16*1024
export class SystemAssistantEntitlementError extends Error {
 readonly code='MEMBERSHIP_TIER_REQUIRED'
 readonly requiredTier='team'
 constructor(){super('当前主体的货源集市套餐尚未开通智能体 API（需团队套餐），请在货源集市检查套餐。 [MEMBERSHIP_TIER_REQUIRED]');this.name='SystemAssistantEntitlementError'}
}
function entitlementFailure(value:unknown,status:unknown):SystemAssistantEntitlementError|undefined {
 const detail=value&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:undefined
 return status===403&&detail?.code==='MEMBERSHIP_TIER_REQUIRED'&&detail.requiredTier==='team'?new SystemAssistantEntitlementError():undefined
}
/** Error bodies are untrusted: only this exact code/tier pair gets a local message. */
export async function systemAssistantResponseError(response:Response,allowHubEntitlement=true):Promise<Error>{
 try{
  if(allowHubEntitlement&&response.status===403){const body=jsonRecord(JSON.parse(await boundedResponse(response,failureLimit)));return entitlementFailure(body.detail,response.status)??Error('SYSTEM_ASSISTANT_REQUEST_DENIED')}
  await response.body?.cancel()
 }catch{}
 return Error('SYSTEM_ASSISTANT_REQUEST_DENIED')
}
export function systemAssistantOperationError(result:JsonRecord):Error{
 try{
  let detail:JsonRecord|undefined
  if(result.structuredContent)detail=jsonRecord(jsonRecord(result.structuredContent).error)
  else if(Array.isArray(result.content)&&result.content.length===1){
   const content=jsonRecord(result.content[0])
   if(content.type==='text'&&typeof content.text==='string'&&Buffer.byteLength(content.text,'utf8')<=failureLimit)detail=jsonRecord(jsonRecord(JSON.parse(content.text)).error)
  }
  return entitlementFailure(detail,detail?.status)??Error('SYSTEM_ASSISTANT_OPERATION_REJECTED')
 }catch{return Error('SYSTEM_ASSISTANT_OPERATION_REJECTED')}
}
/** One short member grant, one MCP session, no transport fallback or write retry. */
export class MemberMcp {
 private session:string|undefined
 constructor(private endpoint:string,private token:string,private signal:AbortSignal,private check:()=>Promise<void>,private fetcher:typeof fetch){}
 async rpc(method:string,params:JsonRecord={},notification=false):Promise<JsonRecord>{
  await this.check();this.signal.throwIfAborted();const id=randomUUID()
  let response:Response
  try{response=await this.fetcher(this.endpoint,{method:'POST',headers:{Authorization:'Bearer '+this.token,'content-type':'application/json',Accept:'application/json, text/event-stream',...(this.session?{'Mcp-Session-Id':this.session}:{})},body:JSON.stringify({jsonrpc:'2.0',...(!notification?{id}:{}),method,params}),signal:this.signal,redirect:'error'})}
  catch{this.signal.throwIfAborted();throw Error('SYSTEM_ASSISTANT_RESULT_UNCONFIRMED')}
  if(!response.ok){const error=await systemAssistantResponseError(response);this.signal.throwIfAborted();throw error}
  const session=response.headers.get('mcp-session-id');if(session){if(session.length>256||!/^[\x21-\x7e]+$/.test(session))throw Error('SYSTEM_ASSISTANT_RESULT_INVALID');this.session=session}
  if(notification){await response.body?.cancel();return {}}
  const text=await boundedResponse(response)
  const rows=response.headers.get('content-type')?.includes('text/event-stream')?text.split(/\r?\n\r?\n/).flatMap(block=>{
   const value=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n')
   return !value||value==='[DONE]'?[]:[jsonRecord(JSON.parse(value))]
  }):[jsonRecord(JSON.parse(text))]
  const row=rows.find(value=>value.id===id)
  if(!row||row.jsonrpc!=='2.0'||row.error||!row.result)throw Error('SYSTEM_ASSISTANT_RESULT_INVALID')
  await this.check();this.signal.throwIfAborted();return jsonRecord(row.result)
 }
 async initialize(){await this.rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'futurestaff-agent-desktop',version:'0.3.0'}});await this.rpc('notifications/initialized',{},true)}
}
