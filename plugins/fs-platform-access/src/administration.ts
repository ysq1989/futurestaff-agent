import {assertPlatformOrigin} from './environment.js'
import {administrationToolNames} from './business-scope.js'
export {administrationToolNames} from './business-scope.js'

export type AdministrationToolName=typeof administrationToolNames[number]
export interface AdministrationIdentity {accessToken:string;tenantId:string;userId:string;signal:AbortSignal}
type Data=Record<string,unknown>
export type AdministrationResult=Data|Data[]
export class AdministrationError extends Error {
 constructor(readonly code:string,readonly status=502,readonly unknownOutcome=false){super(code);this.name='AdministrationError'}
}
const invalid=()=>new AdministrationError('ADMINISTRATION_RECEIPT_INVALID')
const object=(v:unknown):Data=>{if(!v||typeof v!=='object'||Array.isArray(v))throw invalid();return v as Data}
const text=(v:unknown,max:number):string=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw invalid();return v}
const integer=(v:unknown,min=Number.MIN_SAFE_INTEGER):number=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min)throw invalid();return v}
const uuid=(v:unknown):string=>{if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))throw invalid();return v.toLowerCase()}
const nullableId=(v:unknown)=>v===null?null:uuid(v)
const date=(v:unknown):string=>{const s=text(v,64);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:\d\d)$/.test(s)||!Number.isFinite(Date.parse(s)))throw invalid();return s}
const kind=(v:unknown)=>{if(v!=='annual'&&v!=='compensatory')throw invalid();return v}
const list=(v:unknown):unknown[]=>{if(!Array.isArray(v)||v.length>100)throw invalid();return v}
const nullText=(v:unknown,max:number)=>v===null?null:text(v,max)
function hr(v:Data):Data {
 const result:Data={}
 for(const label of ['job','grade']){const id=nullableId(v[label+'_id']),name=nullText(v[label+'_name'],200);if(id===null&&name!==null)throw invalid();result[label+'_id']=id;result[label+'_name']=name}
 return result
}
function requestRow(value:unknown,identity:AdministrationIdentity):Data {
 const v=object(value),tenant=uuid(v.tenant_id),employee=uuid(v.employee_id)
 if(tenant!==identity.tenantId.toLowerCase()||employee!==identity.userId.toLowerCase())throw invalid()
 if(!['dispatch_pending','pending_supervisor','withdrawal_pending','approved','rejected','withdrawn'].includes(String(v.state)))throw invalid()
 if(typeof v.decision_reason!=='string'||v.decision_reason.length>2000)throw invalid()
 return{tenant_id:tenant,employee_id:employee,request_id:uuid(v.request_id),manager_id:uuid(v.manager_id),organization_revision:text(v.organization_revision,100),kind:kind(v.kind),start:date(v.start),end:date(v.end),minutes:integer(v.minutes,1),reason:text(v.reason,1000),policy_ref:text(v.policy_ref,500),state:v.state,revision:integer(v.revision,1),approval_id:nullableId(v.approval_id),decision_reason:v.decision_reason,resolved_by:nullableId(v.resolved_by),resolved_at:v.resolved_at===null?null:date(v.resolved_at)}
}
function previewRow(value:unknown):Data {
 const v=object(value)
 return{...hr(v),preview_id:uuid(v.preview_id),expires_at:integer(v.expires_at,1),kind:kind(v.kind),start:date(v.start),end:date(v.end),reason:text(v.reason,1000),minutes:integer(v.minutes,1),year:integer(v.year),account_revision:integer(v.account_revision,1),policy_id:uuid(v.policy_id),policy_ref:text(v.policy_ref,500),policy_title:text(v.policy_title,300),min_minutes:integer(v.min_minutes,1),available_before_minutes:integer(v.available_before_minutes,0),available_after_minutes:integer(v.available_after_minutes,0),manager_id:uuid(v.manager_id),organization_revision:text(v.organization_revision,100)}
}
function confirmation(raw:unknown,id:string,origin:string):string {
 const value=text(raw,2048)
 try{const u=new URL(value);if(u.origin!==origin||u.pathname!=='/administration'||u.username||u.password||u.hash||[...u.searchParams.keys()].join()!=='intent'||u.searchParams.get('intent')!==id)throw invalid();return u.href}catch{throw invalid()}
}
function input(name:AdministrationToolName,value:unknown):Data {
 try{
  const v=object(value),allowed=name===administrationToolNames[1]?['after','size']:name===administrationToolNames[4]?['operation_id']:name===administrationToolNames[5]?['kind','start','end','reason']:[]
  if(Object.keys(v).some(k=>!allowed.includes(k)))throw invalid()
  if(name===administrationToolNames[1])return{...(v.after!==undefined?{after:uuid(v.after)}:{}),...(v.size!==undefined?{size:integer(v.size,1)}:{})}
  if(name===administrationToolNames[4])return{operation_id:uuid(v.operation_id)}
  if(name===administrationToolNames[5]){const start=date(v.start),end=date(v.end);if(Date.parse(end)<=Date.parse(start))throw invalid();return{kind:kind(v.kind),start,end,reason:text(v.reason,1000).trim()}}
  return{}
 }catch{throw new AdministrationError('ADMINISTRATION_INPUT_INVALID',400)}
}
async function json(response:Response,signal:AbortSignal):Promise<unknown> {
 if(!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')||!response.body)throw invalid()
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0
 try{while(true){signal.throwIfAborted();const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>1048576)throw invalid();chunks.push(next.value)}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}
 catch(error){await reader.cancel().catch(()=>{});throw error instanceof AdministrationError?error:invalid()}
 finally{reader.releaseLock()}
}

/** Host-only six-method bridge. No human proof, HMAC, arbitrary path or final write. */
export class AdministrationService {
 readonly origin:string
 private owner:string|undefined
 private previewAttempted=false
 constructor(origin:string,private authorize:(tool:AdministrationToolName)=>Promise<AdministrationIdentity>,private fetcher:typeof fetch=fetch,private now=Date.now){this.origin=assertPlatformOrigin(origin)}
 private async identity(tool:AdministrationToolName):Promise<AdministrationIdentity> {
  let identity:AdministrationIdentity
  try{identity=await this.authorize(tool)}catch{throw new AdministrationError('ADMINISTRATION_AUTHORIZATION_CHANGED',403)}
  const owner=uuid(identity.tenantId)+':'+uuid(identity.userId)
  if(this.owner!==undefined&&owner!==this.owner)throw new AdministrationError('ADMINISTRATION_OWNER_CHANGED',403)
  if(!identity.accessToken||!identity.signal)throw new AdministrationError('ADMINISTRATION_AUTH_REQUIRED',401)
  identity.signal.throwIfAborted();this.owner=owner;return identity
 }
 async call(name:unknown,value:unknown,signal?:AbortSignal):Promise<AdministrationResult> {
  if(typeof name!=='string'||!administrationToolNames.includes(name as AdministrationToolName))throw new AdministrationError('ADMINISTRATION_TOOL_NOT_ALLOWED',403)
  const tool=name as AdministrationToolName,args=input(tool,value)
  if(typeof args.size==='number'&&args.size>100)throw new AdministrationError('ADMINISTRATION_INPUT_INVALID',400)
  const post=tool===administrationToolNames[5]
  // One mounted conversation turn owns one preview attempt, including lost
  // responses. A new explicit user turn gets a new scoped service instance.
  if(post){if(this.previewAttempted)throw new AdministrationError('ADMINISTRATION_PREVIEW_ALREADY_ATTEMPTED',409,true);this.previewAttempted=true}
  const identity=await this.identity(tool),combined=AbortSignal.any([identity.signal,...(signal?[signal]:[]),AbortSignal.timeout(15000)])
  combined.throwIfAborted()
  const paths=['context','requests','ledger','policies','operations/'+String(args.operation_id),'previews'],position=administrationToolNames.indexOf(tool)
  const query=position===1?new URLSearchParams({...('size'in args?{size:String(args.size)}:{}),...('after'in args?{after:String(args.after)}:{})}).toString():''
  let response:Response
  try{response=await this.fetcher(this.origin+'/desktop/v1/administration/'+paths[position]+(query?'?'+query:''),{method:post?'POST':'GET',headers:{Authorization:'Bearer '+identity.accessToken,Accept:'application/json',...(post?{'Content-Type':'application/json'}:{})},...(post?{body:JSON.stringify(args)}:{}),redirect:'error',cache:'no-store',signal:combined})}
  catch{if(combined.aborted)combined.throwIfAborted();throw new AdministrationError(post?'ADMINISTRATION_PREVIEW_OUTCOME_UNKNOWN':'ADMINISTRATION_UNAVAILABLE',503,post)}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw new AdministrationError(response.status===401?'ADMINISTRATION_AUTH_REQUIRED':response.status===403?'ADMINISTRATION_PERMISSION_DENIED':response.status===404?'ADMINISTRATION_RECORD_UNCONFIRMED':response.status===409?'ADMINISTRATION_STATE_CHANGED':post&&response.status>=500?'ADMINISTRATION_PREVIEW_OUTCOME_UNKNOWN':'ADMINISTRATION_REQUEST_REJECTED',response.status,post&&response.status>=500)}
  let result:AdministrationResult
  try{const raw=await json(response,combined);result=this.project(tool,raw,args,identity)}
  catch{if(combined.aborted)combined.throwIfAborted();throw post?new AdministrationError('ADMINISTRATION_PREVIEW_OUTCOME_UNKNOWN',502,true):invalid()}
  combined.throwIfAborted();await this.identity(tool);combined.throwIfAborted();return result
 }
 private project(tool:AdministrationToolName,value:unknown,args:Data,identity:AdministrationIdentity):AdministrationResult {
  if(tool===administrationToolNames[3])return list(value).map(item=>{const v=object(item);if(v.active!==true)throw invalid();return{policy_id:uuid(v.policy_id),title:text(v.title,300),kind:kind(v.kind),year:integer(v.year),min_minutes:integer(v.min_minutes,1),knowledge_ref:text(v.knowledge_ref,500),active:true}})
  const v=object(value)
  if(tool===administrationToolNames[0]){
   if(uuid(v.employee_id)!==identity.userId.toLowerCase()||v.can_manage!==false)throw invalid()
   return{...hr(v),employee_id:uuid(v.employee_id),manager_id:nullableId(v.manager_id),organization_revision:text(v.organization_revision,100),...(v.employee_name!==undefined?{employee_name:text(v.employee_name,200)}:{}),...(v.manager_name!==undefined?{manager_name:nullText(v.manager_name,200)}:{}),can_manage:false,balances:list(v.balances).map(item=>{const b=object(item);return{kind:kind(b.kind),year:integer(b.year),granted_minutes:integer(b.granted_minutes,0),used_minutes:integer(b.used_minutes,0),reserved_minutes:integer(b.reserved_minutes,0),available_minutes:integer(b.available_minutes,0),revision:integer(b.revision,1)}})}
  }
  if(tool===administrationToolNames[1])return{items:list(v.items).map(row=>requestRow(row,identity)),next_cursor:nullableId(v.next_cursor)}
  if(tool===administrationToolNames[2])return{items:list(v.items).map(item=>{const row=object(item);return{id:uuid(row.id),action:text(row.action,100),minutes:integer(row.minutes),at:date(row.at)}})}
  const id=uuid(v.intent_id),operation=nullableId(v.operation_id),expires=date(v.expires_at)
  if(!['prepared','submitting','accepted','not_accepted','unknown','stale'].includes(String(v.submission_state)))throw invalid()
  const result:Data={intent_id:id,submission_state:v.submission_state,operation_id:operation,expires_at:expires,preview:v.preview===null?null:previewRow(v.preview),result:v.result===null?null:requestRow(v.result,identity),error_code:v.error_code===null?null:text(v.error_code,100)}
  if(tool===administrationToolNames[4]){if(operation!==args.operation_id)throw invalid();return result}
  if(v.submission_state!=='prepared'||operation!==null||v.result!==null||v.error_code!==null||Date.parse(expires)<=this.now()||Date.parse(expires)>this.now()+610000)throw invalid()
  const preview=object(result.preview)
  if(preview.kind!==args.kind||Date.parse(String(preview.start))!==Date.parse(String(args.start))||Date.parse(String(preview.end))!==Date.parse(String(args.end))||preview.reason!==args.reason||Number(preview.expires_at)*1000<=this.now()||Math.abs(Number(preview.expires_at)*1000-Date.parse(expires))>1000)throw invalid()
  result.human_confirmation_url=confirmation(v.human_confirmation_url,id,this.origin);return result
 }
}

/** Only the validated, projected value reaches durable/model/user tool text. */
export function renderAdministrationResult(name:AdministrationToolName,value:AdministrationResult,origin='https://platform.fsstory.net'):string {
 if(name===administrationToolNames[5]){const v=object(value),url=confirmation(v.human_confirmation_url,uuid(v.intent_id),assertPlatformOrigin(origin));return '预览已准备，尚未提交；请在Platform核对明确时间、额度、制度与主管后由本人确认。\n'+JSON.stringify(v.preview)+'\n[前往Platform核对并本人确认]('+url+')'}
 return JSON.stringify(value)
}
