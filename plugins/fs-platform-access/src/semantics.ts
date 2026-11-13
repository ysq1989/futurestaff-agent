/** Dedicated read tools. Host supplies current asker and immutable Agent version. */
import {assertPlatformOrigin} from './environment.js'
import {semanticToolNames,semanticWireNames} from './semantic-contract.generated.js'
export {semanticToolNames,semanticWireNames} from './semantic-contract.generated.js'
type Data=Record<string,unknown>
export interface SemanticIdentity {accessToken:string;userId:string;tenantId:string;agentId:string;snapshotVersion:string;signal:AbortSignal}
export class SemanticError extends Error {constructor(readonly code:string,readonly status=502){super(code)}}
const obj=(v:unknown):Data=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new SemanticError('SEMANTIC_CONTRACT_INVALID');return v as Data}
const text=(v:unknown,n=200):string=>{if(typeof v!=='string'||!v.length||v.length>n)throw new SemanticError('SEMANTIC_CONTRACT_INVALID');return v}
const id=(v:unknown)=>{const s=text(v,36);if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(s))throw new SemanticError('SEMANTIC_ID_INVALID');return s}
const hash=(v:unknown)=>{const s=text(v,64);if(!/^[a-f\d]{64}$/.test(s))throw new SemanticError('SEMANTIC_HASH_INVALID');return s}
const integer=(v:unknown)=>{if(typeof v!=='number'||!Number.isSafeInteger(v))throw new SemanticError('SEMANTIC_NUMBER_INVALID');return v}
const closed=(v:Data,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))throw new SemanticError('SEMANTIC_INPUT_INVALID',400)}
export interface SemanticMetric {raw:number|null;unit:'fen'|'count'|'ratio'|'records';numerator?:number;denominator?:number}
export interface SemanticReceipt extends Data {contract_version:'1.0.0';query_id:string;metric_key:string;definition:{id:string;version_id:string;content_hash:string;title:string};binding:{id:string;version:number;validation_hash:string};dataset_hash:string;period:string;as_of:string;timezone:string;coverage:string;coverage_note:string;total:SemanticMetric;groups:(SemanticMetric&{channel:string})[];rows:Data[];next_offset:number|null}
function metric(v:unknown):SemanticMetric {const r=obj(v);if(!['fen','count','ratio','records'].includes(String(r.unit)))throw new SemanticError('SEMANTIC_UNIT_INVALID');if(r.unit==='ratio'){if(r.raw!==null)throw new SemanticError('SEMANTIC_RATIO_INVALID');const n=integer(r.numerator),d=integer(r.denominator);if(n<0||d<n)throw new SemanticError('SEMANTIC_RATIO_INVALID');return{raw:null,unit:'ratio',numerator:n,denominator:d}}return{raw:integer(r.raw),unit:r.unit as 'fen'|'count'|'records'}}
export function parseSemanticReceipt(value:unknown):SemanticReceipt {
 const v=obj(value),d=obj(v.definition),b=obj(v.binding)
 if(v.contract_version!=='1.0.0'||v.capability!=='ecommerce-demo.query.v1'||!Array.isArray(v.rows)||v.rows.length>50||!Array.isArray(v.groups)||v.groups.length>4||v.timezone!=='Asia/Shanghai'||!['sample_slice','incomplete_sample'].includes(String(v.coverage)))throw new SemanticError('SEMANTIC_RECEIPT_INVALID')
 return{...v,contract_version:'1.0.0',query_id:id(v.query_id),metric_key:text(v.metric_key),definition:{id:id(d.id),version_id:id(d.version_id),content_hash:hash(d.content_hash),title:text(d.title,300)},binding:{id:id(b.id),version:integer(b.version),validation_hash:hash(b.validation_hash)},dataset_hash:hash(v.dataset_hash),period:text(v.period,7),as_of:text(v.as_of,40),timezone:'Asia/Shanghai',coverage:text(v.coverage),coverage_note:text(v.coverage_note,500),total:metric(v.total),groups:v.groups.map(x=>({...metric(x),channel:text(obj(x).channel,30)})),rows:v.rows.map(obj),next_offset:v.next_offset===null?null:integer(v.next_offset)}
}
export function semanticValue(v:SemanticMetric){return v.unit==='fen'?new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(v.raw!/100):v.unit==='count'?String(v.raw)+' 人':v.unit==='records'?String(v.raw)+' 条':v.denominator===0?'暂无比例':`${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(v.numerator!/v.denominator!*100)}%（${v.numerator}/${v.denominator}）`}
export function renderSemanticResult(value:unknown){const v=parseSemanticReceipt(value);return `${v.definition.title}：${semanticValue(v.total)}\n${v.period} · ${v.timezone} · 截至 ${v.as_of}\n${v.coverage_note}\n查询 ${v.query_id}\n定义版本 ${v.definition.version_id}\n数据快照 ${v.dataset_hash}\n${v.groups.map(g=>g.channel+'：'+semanticValue(g)).join('\n')}\n证据：${JSON.stringify(v.rows)}${v.next_offset===null?'':'\n下一页 offset='+v.next_offset}`}
export class SemanticService {
 private origin:string
 constructor(origin:string,private credentials:()=>Promise<SemanticIdentity>,private fetcher:typeof fetch=fetch){this.origin=assertPlatformOrigin(origin)}
 async knowledge(query:string,signal:AbortSignal):Promise<Data>{
  const identity=await this.credentials();signal.throwIfAborted()
  const response=await this.fetcher(this.origin+'/desktop/v1/semantics/knowledge-search',{method:'POST',headers:{Authorization:'Bearer '+identity.accessToken,'Content-Type':'application/json'},body:JSON.stringify({agent_id:id(identity.agentId),snapshot_version:hash(identity.snapshotVersion),query:text(query,200)}),signal,credentials:'omit',redirect:'error',cache:'no-store'})
  const raw=await response.text();if(raw.length>256*1024)throw new SemanticError('DOCUMENT_RESPONSE_TOO_LARGE')
  let value:unknown;try{value=JSON.parse(raw)}catch{throw new SemanticError('DOCUMENT_RESPONSE_INVALID')}
  const result=obj(value)
  if(!response.ok)throw new SemanticError(typeof result.detail==='string'?result.detail:'DOCUMENT_REQUEST_FAILED',response.status)
  if(result.contract_version!=='1.0.0'||result.mode!=='bounded-text-v1'||result.synthetic!==true||!Array.isArray(result.items)||result.items.length>8)throw new SemanticError('DOCUMENT_RESPONSE_INVALID')
  for(const item of result.items){const row=obj(item);id(row.entry_id);id(row.version_id);id(row.category_id);hash(row.content_hash);if(!text(row.knowledge_key,80).startsWith('ecommerce-demo.'))throw new SemanticError('DOCUMENT_SCOPE_INVALID');text(row.title,200);text(row.body,6000);text(row.source_note,1000);text(row.valid_until,40)}
  const current=await this.credentials();if(current.userId!==identity.userId||current.tenantId!==identity.tenantId||current.agentId!==identity.agentId||current.snapshotVersion!==identity.snapshotVersion)throw new SemanticError('SEMANTIC_IDENTITY_CHANGED',403)
  return result
 }
 async call(name:typeof semanticToolNames[number],input:unknown,signal:AbortSignal):Promise<Data|SemanticReceipt>{
  const index=semanticToolNames.indexOf(name);if(index<0)throw new SemanticError('SEMANTIC_TOOL_DENIED',403)
  const value=obj(input),identity=await this.credentials();signal.throwIfAborted()
  const body:Data={agent_id:id(identity.agentId),snapshot_version:hash(identity.snapshotVersion)}
  if(index===0){closed(value,['query']);body.query=text(value.query)}
  if(index===1){closed(value,['binding_id','period','group_by','channel','rows','offset','limit']);body.binding_id=id(value.binding_id);if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(text(value.period,7)))throw new SemanticError('SEMANTIC_PERIOD_REQUIRED',400);body.parameters={period:value.period,...Object.fromEntries(['group_by','channel','rows','offset','limit'].filter(k=>value[k]!==undefined).map(k=>[k,value[k]]))}}
  if(index===2){closed(value,['query_id']);body.query_id=id(value.query_id)}
  const response=await this.fetcher(this.origin+'/desktop/v1/semantics/'+['resolve','prepare','execute'][index],{method:'POST',headers:{Authorization:'Bearer '+identity.accessToken,'Content-Type':'application/json'},body:JSON.stringify(body),signal,credentials:'omit',redirect:'error',cache:'no-store'})
  const raw=await response.text();if(raw.length>256*1024)throw new SemanticError('SEMANTIC_RECEIPT_TOO_LARGE')
  let result:unknown;try{result=JSON.parse(raw)}catch{throw new SemanticError('SEMANTIC_RESPONSE_INVALID')}
  if(!response.ok)throw new SemanticError(typeof obj(result).detail==='string'?obj(result).detail as string:'SEMANTIC_REQUEST_FAILED',response.status)
  const current=await this.credentials();if(current.userId!==identity.userId||current.tenantId!==identity.tenantId||current.agentId!==identity.agentId||current.snapshotVersion!==identity.snapshotVersion)throw new SemanticError('SEMANTIC_IDENTITY_CHANGED',403)
  if(index===2)return parseSemanticReceipt(result)
  const r=obj(result)
  if(index===0){if(r.contract_version!=='1.0.0'||!Array.isArray(r.candidates)||r.candidates.length>100||typeof r.clarification_required!=='boolean')throw new SemanticError('SEMANTIC_RESPONSE_INVALID');for(const row of r.candidates){const c=obj(row);id(c.binding_id);id(c.definition_id);id(c.version_id);hash(c.content_hash);text(c.title,300)}}
  if(index===1){id(r.query_id);integer(r.expires_at);text(r.definition_title,300)}
  return r
 }
}
