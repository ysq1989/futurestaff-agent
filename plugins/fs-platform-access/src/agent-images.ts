import sharp from 'sharp'
import {createHash} from 'node:crypto'
import type {ShopThemeService} from './shop.js'
import {garmentReference,saveFashionImage,inspectGarmentFile} from './fashion-files.js'
import {garmentPreservationPrompt,modelGarmentReference,createSourceDetail,readSourceDetail,type DetailRegion} from './fashion-fidelity.js'
export type ImageIdentity={accessToken:string;signal:AbortSignal;agentId:string;version:string;releaseVersion?:string;workspacePath?:string}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
export function imageRequestUuid(sessionId:string,agentId:string,input:string):string{
 if(uuid.test(input))return input.toLowerCase()
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(input))throw Error('AGENT_IMAGE_REQUEST_INVALID: 使用8至80位字母数字编号或UUID。')
 const hash=createHash('sha256').update(JSON.stringify([sessionId,agentId,input])).digest('hex').slice(0,32)
 return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20)}`
}
export class AgentImageService {
 constructor(private origin:string,private authorize:(sessionId:string)=>Promise<ImageIdentity>,private shop:ShopThemeService,private fetcher=globalThis.fetch){}
 private async request(sessionId:string,suffix:string,init:RequestInit={},signal?:AbortSignal,expected?:ImageIdentity){
  const identity=await this.authorize(sessionId);identity.signal.throwIfAborted()
  if(expected&&(identity.agentId!==expected.agentId||identity.version!==expected.version||identity.releaseVersion!==expected.releaseVersion||identity.workspacePath!==expected.workspacePath))throw Error('AGENT_IMAGE_SESSION_CHANGED')
  const combined=AbortSignal.any([identity.signal,...expected?[expected.signal]:[],...signal?[signal]:[]])
  combined.throwIfAborted()
  const response=await this.fetcher(new URL('/desktop/v1/agents/'+identity.agentId+suffix+(suffix==='/image-tools'&&identity.releaseVersion?'?agentReleaseVersion='+identity.releaseVersion:''),this.origin),{...init,redirect:'error',headers:{'content-type':'application/json',Authorization:'Bearer '+identity.accessToken},signal:combined})
  if(!response.ok){
   const reasons:Record<string,string>={'Image tool not enabled for this Agent':'IMAGE_TOOL_UNAVAILABLE','Image tool unavailable':'IMAGE_TOOL_UNAVAILABLE','Agent unavailable':'AGENT_UNAVAILABLE','Agent version changed':'AGENT_VERSION_CHANGED','Image request not found':'IMAGE_REQUEST_NOT_FOUND','Fashion images require the current subject free model':'FREE_MODEL_REQUIRED'}
   let reason='';try{reason=reasons[(await response.json()).detail]||''}catch{}
   throw Error('AGENT_IMAGE_REQUEST_DENIED: '+response.status+(reason?' ('+reason+')':''))
  }
  combined.throwIfAborted();return {response,identity}
 }
 async list(sessionId:string,signal?:AbortSignal,expected?:ImageIdentity){return (await this.request(sessionId,'/image-tools',{},signal,expected)).response.json()}
 async generate(sessionId:string,input:{requestId:string;tool:string;prompt:string;size:string;references?:string[];freeOnly?:boolean},signal?:AbortSignal,expected?:ImageIdentity){
  const identity=expected||await this.authorize(sessionId)
  const requestId=imageRequestUuid(sessionId,identity.agentId,input.requestId)
  try{return await (await this.request(sessionId,'/image-requests',{method:'POST',body:JSON.stringify({...input,requestId,agentVersion:identity.version,...(identity.releaseVersion?{agentReleaseVersion:identity.releaseVersion}:{})})},signal,identity)).response.json()}
  catch(error){const message=error instanceof Error?error.message:'';if(message.startsWith('AGENT_IMAGE_REQUEST_DENIED')&&!/DENIED: 5\d\d/.test(message))throw error;throw Error('AGENT_IMAGE_RESULT_UNCONFIRMED: requestId='+requestId+'，查询原请求，禁止重新生图。')}
 }
 async status(sessionId:string,requestId:string,signal?:AbortSignal){
  requestId=imageRequestUuid(sessionId,(await this.authorize(sessionId)).agentId,requestId)
  return (await this.request(sessionId,'/image-requests/'+requestId,{},signal)).response.json()
 }
 async fashionGenerate(sessionId:string,input:{requestId:string;tool:string;prompt:string;size:string;imagePaths:string[]},signal?:AbortSignal){
  const identity=await this.authorize(sessionId)
  const catalog=await this.list(sessionId,signal,identity)
  if(catalog.agentVersion!==identity.version||!Array.isArray(catalog.tools))throw Error('AGENT_IMAGE_SESSION_CHANGED')
  const eligible=catalog.tools.filter((tool:{name?:string;model?:string;sourceType?:string;referenceImages?:number})=>tool.model==='futurestaff-image'&&tool.sourceType==='futurestaff_ai'&&(tool.referenceImages??0)>=1&&/^image_model:[a-f0-9-]{36}$/i.test(tool.name??''))
  if(eligible.length!==1)throw Error('FASHION_FREE_MODEL_UNAVAILABLE: 当前主体需唯一可用的免费参考图模型。')
  if(!Array.isArray(input.imagePaths)||input.imagePaths.length<1||input.imagePaths.length>2)throw Error('FASHION_REFERENCE_REQUIRED')
  const references=[]
  for(const file of input.imagePaths)references.push(await modelGarmentReference(identity.workspacePath,file))
  identity.signal.throwIfAborted();signal?.throwIfAborted()
  const receipt=await this.generate(sessionId,{requestId:input.requestId,tool:eligible[0].name,prompt:garmentPreservationPrompt(input.prompt),size:input.size,references,freeOnly:true},signal,identity)
  return {...await this.deliver(sessionId,receipt,signal,identity),sourceImagePath:input.imagePaths[0],imageRole:'on-model',fidelityMode:'reference-generation',reviewStatus:'needs-review'}
 }
 async websiteGenerate(sessionId:string,input:{requestId:string;prompt:string;size:string;imagePaths?:string[]},signal?:AbortSignal){
  const identity=await this.authorize(sessionId),catalog=await this.list(sessionId,signal,identity)
  if(catalog.agentVersion!==identity.version||!Array.isArray(catalog.tools))throw Error('AGENT_IMAGE_SESSION_CHANGED')
  const eligible=catalog.tools.filter((tool:{name?:string;model?:string;sourceType?:string})=>tool.model==='futurestaff-image'&&tool.sourceType==='futurestaff_ai'&&/^image_model:[a-f0-9-]{36}$/i.test(tool.name??''))
  if(eligible.length!==1)throw Error('WEBSITE_FREE_MODEL_UNAVAILABLE')
  if((input.imagePaths?.length??0)>2)throw Error('WEBSITE_REFERENCE_LIMIT')
  const references=[];for(const file of input.imagePaths??[])references.push(await garmentReference(identity.workspacePath,file))
  const receipt=await this.generate(sessionId,{requestId:input.requestId,tool:eligible[0].name,prompt:input.prompt,size:input.size,references,freeOnly:true},signal,identity)
  return {...await this.deliver(sessionId,receipt,signal,identity,'website-output'),imageRole:'website-design',reviewStatus:'needs-review'}
 }
 async fashionDetail(sessionId:string,input:{requestId:string;imagePath:string;region:DetailRegion;label:string},signal?:AbortSignal){
  const identity=await this.authorize(sessionId)
  const id=imageRequestUuid(sessionId,identity.agentId,input.requestId)
  identity.signal.throwIfAborted();signal?.throwIfAborted()
  const receipt=await createSourceDetail(identity.workspacePath,id,input.imagePath,input.region,input.label)
  const current=await this.authorize(sessionId)
  identity.signal.throwIfAborted();signal?.throwIfAborted()
  if(current.agentId!==identity.agentId||current.version!==identity.version||current.workspacePath!==identity.workspacePath)throw Error('AGENT_IMAGE_SESSION_CHANGED')
  return receipt
 }
 private async deliver(sessionId:string,receipt:Record<string,unknown>,signal:AbortSignal|undefined,identity:ImageIdentity,folder?:'website-output'){
  if(receipt.status!=='succeeded'||typeof receipt.requestId!=='string')return receipt
  try{
   const downloaded=await this.fashionDownload(sessionId,{requestId:receipt.requestId,...folder?{folder}:{}},signal,identity)
   return {...receipt,...downloaded,downloadStatus:'succeeded'}
  }catch{
   identity.signal.throwIfAborted();signal?.throwIfAborted()
   // Generation is already committed. A failed download never authorizes another image call.
   return {...receipt,downloadStatus:'unconfirmed',downloadErrorCode:'FASHION_DOWNLOAD_UNCONFIRMED'}
  }
 }
 async fashionProcess(sessionId:string,input:{requestId:string;imagePath:string;action:'inspect'|'remove_background'},signal?:AbortSignal){
  const identity=await this.authorize(sessionId)
  if(!['inspect','remove_background'].includes(input.action))throw Error('FASHION_ACTION_INVALID')
  if(input.action==='inspect'){
   const inspection=await inspectGarmentFile(identity.workspacePath,input.imagePath)
   identity.signal.throwIfAborted();signal?.throwIfAborted()
   const current=await this.authorize(sessionId)
   if(current.agentId!==identity.agentId||current.version!==identity.version||current.workspacePath!==identity.workspacePath)throw Error('AGENT_IMAGE_SESSION_CHANGED')
   return {inspectionId:imageRequestUuid(sessionId,identity.agentId,input.requestId),status:'succeeded',tool:'fashion_image_process',inspection,inspectionSource:'bound-agent-local-file',persistedRemoteRequest:false}
  }
  const reference=await garmentReference(identity.workspacePath,input.imagePath)
  const requestId=imageRequestUuid(sessionId,identity.agentId,input.requestId)
  let receipt
  try{receipt=await (await this.request(sessionId,'/fashion-image-requests',{method:'POST',body:JSON.stringify({requestId,agentVersion:identity.version,...(identity.releaseVersion?{agentReleaseVersion:identity.releaseVersion}:{}),action:input.action,reference})},signal,identity)).response.json()}
  catch(error){identity.signal.throwIfAborted();signal?.throwIfAborted();const message=error instanceof Error?error.message:'';if(message.startsWith('AGENT_IMAGE_REQUEST_DENIED')&&!/DENIED: 5\d\d/.test(message))throw error;throw Error('AGENT_IMAGE_RESULT_UNCONFIRMED: requestId='+requestId+'，查询原请求，禁止重新抠图。')}
  return input.action==='remove_background'?this.deliver(sessionId,receipt,signal,identity):receipt
 }
 async fashionDownload(sessionId:string,input:{requestId:string;folder?:'website-output'},signal?:AbortSignal,expected?:ImageIdentity){
  const identity=await this.authorize(sessionId),requestId=imageRequestUuid(sessionId,identity.agentId,input.requestId)
  if(expected&&(identity.agentId!==expected.agentId||identity.version!==expected.version||identity.releaseVersion!==expected.releaseVersion||identity.workspacePath!==expected.workspacePath))throw Error('AGENT_IMAGE_SESSION_CHANGED')
  expected?.signal.throwIfAborted()
  const local=await readSourceDetail(identity.workspacePath,requestId)
  if(local){identity.signal.throwIfAborted();signal?.throwIfAborted();const current=await this.authorize(sessionId);if(current.agentId!==identity.agentId||current.version!==identity.version||current.workspacePath!==identity.workspacePath||(expected&&expected.agentId!==identity.agentId))throw Error('AGENT_IMAGE_SESSION_CHANGED');return local}
  const {response}=await this.request(sessionId,'/image-requests/'+requestId+'/content',{},signal,expected??identity)
  const reader=response.body?.getReader();if(!reader)throw Error('FASHION_IMAGE_INVALID')
  const chunks:Uint8Array[]=[];let total=0
  try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>12000000)throw Error('FASHION_IMAGE_TOO_LARGE');chunks.push(part.value)}}finally{await reader.cancel()}
  identity.signal.throwIfAborted();signal?.throwIfAborted()
  const folder=input.folder??'fashion-output'
  return {requestId,path:await saveFashionImage(identity.workspacePath,requestId,Buffer.concat(chunks),folder),imagePath:folder+'/'+requestId+'.png',bytes:total}
 }
 async upload(sessionId:string,input:{imageRequestId:string;requestId:string;role:'banner'|'category'|'navigation'},signal?:AbortSignal){
  if(!['banner','category','navigation'].includes(input.role))throw Error('AGENT_IMAGE_REQUEST_INVALID')
  const imageId=imageRequestUuid(sessionId,(await this.authorize(sessionId)).agentId,input.imageRequestId)
  const {response,identity}=await this.request(sessionId,'/image-requests/'+imageId+'/content',{},signal)
  const reader=response.body?.getReader();if(!reader)throw Error('AGENT_IMAGE_RESULT_INVALID')
  const chunks:Uint8Array[]=[];let total=0
  try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>12000000)throw Error('AGENT_IMAGE_TOO_LARGE');chunks.push(part.value)}}finally{await reader.cancel()}
  const width={banner:750,category:192,navigation:81}[input.role]
  const image=sharp(Buffer.concat(chunks),{limitInputPixels:4000000}).rotate()
  const resized=input.role==='banner'?image.resize({width,withoutEnlargement:true}):image.resize(width,width,{fit:'contain',background:{r:247,g:244,b:236,alpha:input.role==='navigation'?0:1}})
  const bytes=await (input.role==='navigation'?resized.png({palette:true,compressionLevel:9}):resized.jpeg({quality:72,mozjpeg:true})).toBuffer()
  if(bytes.length>1048576)throw Error('AGENT_IMAGE_BUDGET_EXCEEDED')
  identity.signal.throwIfAborted();signal?.throwIfAborted()
  const result=await this.shop.call('shop_theme_asset_upload',{requestId:imageRequestUuid(sessionId,identity.agentId,input.requestId),role:input.role,data:bytes.toString('base64')}) as {isError?:boolean;content?:Array<{type:string;text?:string}>;structuredContent?:unknown}
  if(result.isError){
   const code=result.content?.find(block=>block.type==='text')?.text
   throw Error(typeof code==='string'&&/^(?:THEME_[A-Z_]+|DSH_INVALID_ARGUMENTS|DSH_FORBIDDEN)$/.test(code)?code:'SHOP_THEME_UPLOAD_FAILED: 保留原图片请求，请勿读取base64或重新生图。')
  }
  return result.structuredContent??result
 }
}
