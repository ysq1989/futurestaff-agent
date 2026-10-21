import type {ImageIdentity} from './agent-images.js'
import {assertPlatformOrigin} from './environment.js'

export class WebsiteService {
 constructor(private origin:string,private authorize:(sessionId:string)=>Promise<ImageIdentity>,private fetcher=globalThis.fetch){assertPlatformOrigin(origin)}
 private async request(sessionId:string,suffix:string,body?:unknown){
  const identity=await this.authorize(sessionId)
  identity.signal.throwIfAborted()
  let response:Response
  try{response=await this.fetcher(new URL('/desktop/v1/agents/'+identity.agentId+'/'+suffix+(body===undefined&&identity.releaseVersion?'?agentReleaseVersion='+identity.releaseVersion:''),this.origin),{
   method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+identity.accessToken,'content-type':'application/json'},
   redirect:'error',signal:AbortSignal.any([identity.signal,AbortSignal.timeout(90000)]),
   ...(body===undefined?{}:{body:JSON.stringify({...body as object,agentVersion:identity.version,...(identity.releaseVersion?{agentReleaseVersion:identity.releaseVersion}:{})})})
  })}catch{identity.signal.throwIfAborted();throw Error('WEBSITE_RESULT_UNCONFIRMED: 查询原请求，禁止换 requestId 重复提交。')}
  if(!response.ok){await response.body?.cancel();throw Error('WEBSITE_REQUEST_DENIED: '+response.status)}
  const text=await response.text();if(text.length>1024*1024)throw Error('WEBSITE_RESULT_INVALID')
  const result=JSON.parse(text)
  const current=await this.authorize(sessionId);identity.signal.throwIfAborted()
  if(current.agentId!==identity.agentId||current.version!==identity.version)throw Error('WEBSITE_SESSION_CHANGED')
  if(body===undefined&&result.agentVersion!==identity.version)throw Error('WEBSITE_SESSION_CHANGED')
  return result
 }
 tools(sessionId:string){return this.request(sessionId,'website-tools')}
 call(sessionId:string,input:{name:string;arguments:Record<string,unknown>}){return this.request(sessionId,'website-call',input)}
 saveImage(sessionId:string,input:{requestId:string;imageRequestId:string;fileName?:string}){return this.request(sessionId,'website-image-save',input)}
}
