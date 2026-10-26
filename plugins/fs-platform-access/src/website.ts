import type {ImageIdentity} from './agent-images.js'
import {assertPlatformOrigin} from './environment.js'
import {localWebsiteRequest, type WebsiteLocalIdentity} from './website-member.js'
export type WebsiteIdentity=ImageIdentity|WebsiteLocalIdentity

/** Recognize only the bounded Platform conflict code, never backend error text. */
async function agentVersionChanged(response:Response,signal:AbortSignal):Promise<boolean>{
 const reader=response.body?.getReader();if(!reader)return false
 const cancel=()=>{void reader.cancel().catch(()=>{})}
 signal.addEventListener('abort',cancel,{once:true})
 try{
  const chunks:Uint8Array[]=[];let bytes=0
  for(;;){
   signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted()
   if(part.done)break
   bytes+=part.value.byteLength;if(bytes>4096)return false
   chunks.push(part.value)
  }
  const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&'detail' in value&&value.detail==='AGENT_VERSION_CHANGED'
 }catch{return false}
 finally{signal.removeEventListener('abort',cancel);cancel()}
}

export class WebsiteService {
 constructor(private origin:string,private authorize:(sessionId:string,tool:string)=>Promise<WebsiteIdentity>,private fetcher=globalThis.fetch){assertPlatformOrigin(origin)}
 private async request(sessionId:string,suffix:string,body?:unknown){
  const tool=suffix==='website-tools'?'website_tools':suffix==='website-call'?'website_call':'website_image_save'
  const identity=await this.authorize(sessionId,tool)
  identity.signal.throwIfAborted()
  if('kind' in identity){
   if(!identity.tools?.includes(tool)||!identity.businessSystems.includes('web')||suffix==='website-image-save')throw Error('WEBSITE_OPERATION_NOT_SUPPORTED')
   const current=async()=>{const value=await this.authorize(sessionId,tool);if(!('kind' in value))throw Error('WEBSITE_SESSION_CHANGED');return value}
   try{return await localWebsiteRequest(this.origin,identity,current,this.fetcher,body as {name:string;arguments:Record<string,unknown>}|undefined)}
   catch(error){identity.signal.throwIfAborted();if(error instanceof Error&&/^WEBSITE_[A-Z_]+(?:: [0-9]{3}|: 查询原请求，禁止换 requestId 重复提交。)?$/.test(error.message))throw error;throw Error('WEBSITE_CONNECTION_UNAVAILABLE')}
  }
  let response:Response
  const signal=AbortSignal.any([identity.signal,AbortSignal.timeout(90000)])
  try{response=await this.fetcher(new URL('/desktop/v1/agents/'+identity.agentId+'/'+suffix+(body===undefined&&identity.releaseVersion?'?agentReleaseVersion='+identity.releaseVersion:''),this.origin),{
   method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+identity.accessToken,'content-type':'application/json'},
   redirect:'error',signal,
   ...(body===undefined?{}:{body:JSON.stringify({...body as object,agentVersion:identity.version,...(identity.releaseVersion?{agentReleaseVersion:identity.releaseVersion}:{})})})
  })}catch{identity.signal.throwIfAborted();throw Error('WEBSITE_RESULT_UNCONFIRMED: 查询原请求，禁止换 requestId 重复提交。')}
  if(!response.ok){
   if(response.status===409){
    const changed=await agentVersionChanged(response,signal);identity.signal.throwIfAborted()
    if(changed)throw Error('AGENT_VERSION_CHANGED')
   }else await response.body?.cancel()
   throw Error('WEBSITE_REQUEST_DENIED: '+response.status)
  }
  const text=await response.text();if(text.length>1024*1024)throw Error('WEBSITE_RESULT_INVALID')
  const result=JSON.parse(text)
  const current=await this.authorize(sessionId,tool);identity.signal.throwIfAborted()
  if('kind' in current||current.agentId!==identity.agentId||current.version!==identity.version)throw Error('WEBSITE_SESSION_CHANGED')
  if(body===undefined&&result.agentVersion!==identity.version)throw Error('WEBSITE_SESSION_CHANGED')
  return result
 }
 tools(sessionId:string){return this.request(sessionId,'website-tools')}
 call(sessionId:string,input:{name:string;arguments:Record<string,unknown>}){return this.request(sessionId,'website-call',input)}
 saveImage(sessionId:string,input:{requestId:string;imageRequestId:string;fileName?:string}){return this.request(sessionId,'website-image-save',input)}
}
