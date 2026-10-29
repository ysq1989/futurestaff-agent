import {createHash} from 'node:crypto'
import {open, lstat, readFile, realpath} from 'node:fs/promises'
import {constants} from 'node:fs'
import path from 'node:path'
import {ensureTree, existingTree, atomicBytes} from './agents.js'
import type {ImageIdentity} from './agent-images.js'
import type {ShopSelectionMessage} from './shop-selection.js'
import {assertPlatformOrigin} from './environment.js'

export type CreativeIdentity = ImageIdentity & {tenantId:string;userId:string;workspacePath:string}
type FileRole = 'source'|'output'|'editable'|'copy'|'storyboard'|'subtitle'|'review'|'reference'
export interface CreativeArchive {
 requestId:string;projectId:string;baseVersion?:string;title:string;kind:'product-images'|'detail-images'|'banner'|'video'|'brand-reference'
 sku?:string;channel?:string;locale?:string;brief:string;files:{path:string;role:FileRole;description:string}[]
}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const roles=new Set<FileRole>(['source','output','editable','copy','storyboard','subtitle','review','reference'])
const extensions=new Set(['.png','.jpg','.jpeg','.webp','.mp4','.webm','.mp3','.wav','.md','.txt','.srt','.csv','.json','.html','.css'])
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex')
const id=(value:string)=>{if(!uuid.test(value))throw Error('CREATIVE_ID_INVALID');return value}

export function assertCreativeMetadata(value:Record<string,unknown>):void{
 id(String(value.projectId));id(String(value.requestId));if(value.baseVersion!==undefined)id(String(value.baseVersion))
 if(!['product-images','detail-images','banner','video','brand-reference'].includes(String(value.kind)))throw Error('CREATIVE_METADATA_INVALID')
 for(const [key,maximum,required] of [['title',200,true],['brief',20000,true],['sku',160,false],['channel',80,false],['locale',40,false]] as const){
  const field=value[key]
  if(field===undefined&&!required)continue
  if(typeof field!=='string'||field.length>maximum||required&&!field.trim())throw Error('CREATIVE_METADATA_INVALID')
 }
}

/** Selection is a recorded human choice, never a model-supplied confirmation flag. */
export function assertCreativeSelection(projectId:string,history:readonly ShopSelectionMessage[],versionId:string,expectedHash:string):void{
 id(projectId);id(versionId)
 let userIndex=-1
 for(let index=0;index<history.length;index++)if(history[index]?.role==='user'&&history[index]?.source?.kind==='user')userIndex=index
 const user=history[userIndex]
 const text=user?.content.filter(block=>block.type==='text').map(block=>block.text??'').join('\n').replace(/```[\s\S]*?```|`[^`]*`|“[^”]*”|「[^」]*」|"[^"\n]*"/g,'')??''
 if(!/(?:选用|采用|定稿|就用|\bselect\b|\bapprove\b)/i.test(text)
  ||/(?:不要|不选|不采用|别|取消|暂停|先等|是否|能否|[?？]|\b(?:not|cancel|whether)\b)/i.test(text))throw Error('CREATIVE_USER_SELECTION_REQUIRED')
 const calls=new Set<string>(),receipts=new Map<string,string>()
 let previousUser=-1
 for(let index=0;index<userIndex;index++)if(history[index]?.role==='user'&&history[index]?.source?.kind==='user')previousUser=index
 for(let index=previousUser+1;index<userIndex;index++)for(const block of history[index]!.content){
  if(history[index]!.role==='assistant'&&block.type==='tool-call'&&['creative_asset_get','creative_asset_archive','commerce_image_generate'].includes(block.name??'')&&block.id)calls.add(block.id)
  if(history[index]!.source?.kind!=='tool'||block.type!=='tool-result'||!calls.has(block.toolCallId??''))continue
  for(const content of block.content??[]){
   if(content.type!=='text'||!content.text||content.text.length>256000)continue
   try{const parsed=JSON.parse(content.text),value=parsed.archive??parsed
    if(value.contractVersion==='1.0.0'&&uuid.test(value.projectId)&&uuid.test(value.versionId)&&/^[a-f0-9]{64}$/.test(value.manifestHash))receipts.set(value.projectId+'/'+value.versionId,value.manifestHash)
   }catch{}
  }
 }
 const explicit=text.includes(projectId)&&text.includes(versionId)
 const current=/^(?:我)?(?:就)?(?:选用|采用|定稿|就用)(?:这(?:个|一)?(?:版(?:本)?|套|组|张)|当前(?:版(?:本)?|方案)|该版本)[。！!\s]*$/.test(text.trim())
 if(receipts.get(projectId+'/'+versionId)!==expectedHash||!explicit&&!(current&&receipts.size===1))throw Error('CREATIVE_USER_SELECTION_REQUIRED')
}

async function localFile(root:string,input:string):Promise<Buffer>{
 if(!input||path.isAbsolute(input)||input.includes('\\')||input.includes(':')||input.split('/').some(part=>!part||part==='..'||part.startsWith('.')))throw Error('CREATIVE_PATH_INVALID')
 const base=await realpath(root),target=path.join(base,...input.split('/'))
 let current=base
 for(const part of input.split('/')){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw Error('CREATIVE_PATH_INVALID')}
 const relative=path.relative(base,await realpath(target))
 if(relative.startsWith('..')||path.isAbsolute(relative)||!extensions.has(path.extname(target).toLowerCase()))throw Error('CREATIVE_PATH_INVALID')
 const file=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW||0))
 try{const stat=await file.stat();if(!stat.isFile()||stat.size>64*1024*1024)throw Error('CREATIVE_FILE_TOO_LARGE');const bytes=await file.readFile();if(bytes.length>64*1024*1024)throw Error('CREATIVE_FILE_TOO_LARGE');return bytes}finally{await file.close()}
}

export class CommerceAssets {
 constructor(private origin:string,private authorize:(sessionId:string)=>Promise<CreativeIdentity>,private fetcher=globalThis.fetch){
  this.origin=assertPlatformOrigin(origin)
 }
 private async current(sessionId:string,expected?:CreativeIdentity){
  expected?.signal.throwIfAborted()
  const identity=await this.authorize(sessionId);identity.signal.throwIfAborted()
  if(expected&&(identity.tenantId!==expected.tenantId||identity.userId!==expected.userId||identity.agentId!==expected.agentId||identity.version!==expected.version||identity.releaseVersion!==expected.releaseVersion||identity.workspacePath!==expected.workspacePath))throw Error('CREATIVE_IDENTITY_CHANGED')
  return identity
 }
 private async request(sessionId:string,suffix:string,init:RequestInit={},signal?:AbortSignal,expected?:CreativeIdentity){
  const identity=await this.current(sessionId,expected)
  const response=await this.fetcher(new URL('/desktop/v1/agents/'+id(identity.agentId)+'/creative-projects'+suffix,this.origin),{...init,redirect:'error',
   headers:{'content-type':'application/json',Authorization:'Bearer '+identity.accessToken},signal:AbortSignal.any([identity.signal,...expected?[expected.signal]:[],...signal?[signal]:[]])})
  if(!response.ok)throw Error('CREATIVE_REQUEST_DENIED:'+response.status)
  await this.current(sessionId,identity);signal?.throwIfAborted()
  return {response,identity}
 }
 private async json(sessionId:string,suffix:string,init:RequestInit={},signal?:AbortSignal,expected?:CreativeIdentity){
  const {response,identity}=await this.request(sessionId,suffix,init,signal,expected)
  const reader=response.body?.getReader();if(!reader)throw Error('CREATIVE_RECEIPT_INVALID')
  let length=0;const chunks:Uint8Array[]=[]
  try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>256000)throw Error('CREATIVE_RECEIPT_INVALID');chunks.push(part.value)}}finally{await reader.cancel()}
  const value=JSON.parse(Buffer.concat(chunks).toString())
  if(value.contractVersion!=='1.0.0'||value.tenantId!==identity.tenantId)throw Error('CREATIVE_RECEIPT_INVALID')
  await this.current(sessionId,identity);signal?.throwIfAborted();return value
 }
 async archive(sessionId:string,input:CreativeArchive,signal?:AbortSignal){
  assertCreativeMetadata({...input})
  if(!Array.isArray(input.files)||input.files.length<1||input.files.length>24)throw Error('CREATIVE_FILES_INVALID')
  const identity=await this.current(sessionId),artifacts:{name:string;role:FileRole;description:string;data:string;sha256:string}[]=[];let total=0
  for(const [index,file] of input.files.entries()){
   if(!roles.has(file.role))throw Error('CREATIVE_FILES_INVALID')
   const bytes=await localFile(identity.workspacePath,file.path);total+=bytes.length
   if(total>96*1024*1024)throw Error('CREATIVE_TOO_LARGE')
   artifacts.push({name:index+'-'+path.basename(file.path),role:file.role,description:file.description,data:bytes.toString('base64'),sha256:hash(bytes)})
  }
  const {files,...metadata}=input
  const body={...metadata,sku:input.sku??'',channel:input.channel??'',locale:input.locale??'zh-CN',artifacts}
  const fingerprint=hash(JSON.stringify(body)),ledger=path.join(identity.workspacePath,'.commerce-archive',id(input.requestId)+'.json')
  await ensureTree(path.dirname(ledger));await existingTree(path.dirname(ledger))
  try{
   const file=await open(ledger,'wx',0o600)
   try{await file.writeFile(JSON.stringify({fingerprint,projectId:input.projectId,versionId:input.requestId}))}finally{await file.close()}
  }catch(error){
   if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error
   if((await lstat(ledger)).isSymbolicLink())throw Error('CREATIVE_PATH_INVALID')
   const pending=JSON.parse(await readFile(ledger,'utf8'));if(pending.fingerprint!==fingerprint)throw Error('CREATIVE_REQUEST_CONFLICT')
  }
  await this.current(sessionId,identity)
  try{
   const value=await this.json(sessionId,'',{method:'POST',body:JSON.stringify(body)},signal,identity)
   if(value.projectId!==input.projectId||value.versionId!==input.requestId||!['draft','selected'].includes(value.state)
    ||value.knowledgeStatus!=='unverified-material'||!Array.isArray(value.artifacts)||value.artifacts.length!==artifacts.length
    ||value.artifacts.some((file:{sha256:string;name:string},i:number)=>file.sha256!==artifacts[i]!.sha256||file.name!==artifacts[i]!.name))throw Error('CREATIVE_RECEIPT_INVALID')
   return {...value,archiveStatus:'saved'}
  }catch(error){
   if(error instanceof Error&&/^CREATIVE_REQUEST_DENIED:4/.test(error.message))throw error
   throw Error('CREATIVE_ARCHIVE_UNCONFIRMED: projectId='+input.projectId+' versionId='+input.requestId+'；用原编号查询归档，保留本机文件。')
  }
 }
 async search(sessionId:string,input:{query?:string;projectId?:string;cursor?:string;limit?:number},signal?:AbortSignal){
  if(input.projectId)id(input.projectId)
  const params=new URLSearchParams({q:input.query??'',limit:String(input.limit??20),...(input.projectId?{projectId:input.projectId}:{}),...(input.cursor?{cursor:input.cursor}:{})})
  return this.json(sessionId,'?'+params,{},signal)
 }
 async get(sessionId:string,input:{projectId:string;versionId:string},signal?:AbortSignal){return this.json(sessionId,'/'+id(input.projectId)+'/versions/'+id(input.versionId),{},signal)}
 async download(sessionId:string,input:{projectId:string;versionId:string;index:number},signal?:AbortSignal){
  const identity=await this.current(sessionId),manifest=await this.json(sessionId,'/'+id(input.projectId)+'/versions/'+id(input.versionId),{},signal,identity)
  if(!Number.isSafeInteger(input.index)||input.index<0||!manifest.artifacts?.[input.index])throw Error('CREATIVE_ARTIFACT_INVALID')
  const file=manifest.artifacts[input.index]
  if(typeof file.name!=='string'||file.name!==path.basename(file.name)||/[\\/:\x00]/.test(file.name)||file.name.startsWith('.')||!extensions.has(path.extname(file.name).toLowerCase())||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('CREATIVE_RECEIPT_INVALID')
  const {response}=await this.request(sessionId,'/'+input.projectId+'/versions/'+input.versionId+'/content/'+input.index,{},signal,identity)
  const reader=response.body?.getReader();if(!reader)throw Error('CREATIVE_CONTENT_INVALID')
  const chunks:Uint8Array[]=[];let length=0
  try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>64*1024*1024)throw Error('CREATIVE_CONTENT_INVALID');chunks.push(part.value)}}finally{await reader.cancel()}
  const bytes=Buffer.concat(chunks)
  if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error('CREATIVE_CONTENT_INVALID')
  const relative='commerce-output/library/'+input.projectId+'/'+input.versionId+'/'+input.index+path.extname(file.name).toLowerCase(),target=path.join(identity.workspacePath,...relative.split('/'))
  await this.current(sessionId,identity);await ensureTree(path.dirname(target));await atomicBytes(target,bytes)
  await this.current(sessionId,identity)
  return {projectId:input.projectId,versionId:input.versionId,imagePath:relative,path:target,sha256:file.sha256,bytes:file.bytes,archiveStatus:'downloaded',knowledgeStatus:'unverified-material'}
 }
 async select(sessionId:string,input:{projectId:string;versionId:string;requestId:string;expectedHash:string;note:string},history:readonly ShopSelectionMessage[],signal?:AbortSignal){
  assertCreativeSelection(input.projectId,history,input.versionId,input.expectedHash);id(input.requestId)
  const {projectId,...body}=input
  return this.json(sessionId,'/'+projectId+'/selection',{method:'POST',body:JSON.stringify(body)},signal)
 }
}
