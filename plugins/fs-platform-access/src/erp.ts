import { createHash, randomUUID } from 'node:crypto'
import { InteractionRegistry, type InteractionView, type OwnedView } from './interaction.js'
import { normalizeOrderDraft } from './erp-order-draft.js'

type Identity={accessToken:string;tenantId:string;userId:string;signal:AbortSignal}
type Data=Record<string,unknown>
export type ErpView=InteractionView & {module:'erp';kind:'table'|'entity'|'form'|'preview';resource:string;summary:string}
type Grant=Identity & {token:string;policy:Data}
export type ErpSessionPrincipal={agentId:string;version:string;releaseVersion?:string}|{kind:'local-template';signal:AbortSignal}
type Saved=OwnedView<ErpView> & {operation?:string;body?:Data;id?:string;key?:string;references?:Map<string,string>;committed?:{data:unknown};result?:ErpView;running?:Promise<ErpView>}
const resources=['customers','suppliers','products','materials','warehouses','sales-orders','purchase-orders','production-orders','boms','stock','stock/records','payments','financials','reports/sales','reports/purchase','reports/inventory','reports/customers','reports/profit-loss','dashboard']
const titles:Record<string,string>={'customers':'客户','suppliers':'供应商','products':'产品','materials':'物料','warehouses':'仓库','sales-orders':'销售订单','purchase-orders':'采购订单','production-orders':'生产工单','boms':'物料清单','stock':'库存','stock/records':'出入库记录','payments':'收付款','financials':'财务记录','dashboard':'经营驾驶舱'}
const operations:Record<string,{resource:string;method:string;status?:boolean}>={
 'sales.create':{resource:'sales-orders',method:'POST'},'sales.edit':{resource:'sales-orders',method:'PATCH'},'sales.status':{resource:'sales-orders',method:'POST',status:true},
 'sales.delete':{resource:'sales-orders',method:'DELETE'},
 'purchase.create':{resource:'purchase-orders',method:'POST'},'purchase.edit':{resource:'purchase-orders',method:'PATCH'},'purchase.status':{resource:'purchase-orders',method:'POST',status:true},
 'purchase.delete':{resource:'purchase-orders',method:'DELETE'},
 'production.create':{resource:'production-orders',method:'POST'},'production.status':{resource:'production-orders',method:'POST',status:true},
 'stock.inbound':{resource:'stock/inbound',method:'POST'},'stock.outbound':{resource:'stock/outbound',method:'POST'},'stock.transfer':{resource:'stock/transfer',method:'POST'},'payments.create':{resource:'payments',method:'POST'},
}
function object(value:unknown):Data{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('ERP_INPUT_INVALID');return value as Data}
function keys(value:Data,allowed:string[]){if(Object.keys(value).some(k=>!allowed.includes(k)))throw Error('ERP_INPUT_INVALID')}
function identifier(value:unknown){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw Error('ERP_REFERENCE_INVALID');return value}
function hash(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
function owner(g:Identity){return g.tenantId+':'+g.userId}
function signature(p:Data){const {revision, ...effective}=p;return hash(effective)}
function allow(g:Grant,action:string){if(g.policy.enabled!==true||!Array.isArray(g.policy.actions)||!g.policy.actions.includes(action))throw Error('ERP_PERMISSION_DENIED')}

/** Host-only ERP facade. Models can query and prepare; only native UI confirms writes. */
export class ErpService {
 private views:InteractionRegistry<ErpView,Saved>
 readonly erpOrigin:string
 constructor(private origin:string,private authorize:()=>Promise<Identity>,private fetcher:typeof fetch=fetch,private now=()=>Date.now(),private authorizeSession?:(sessionId:string,tool?:string)=>Promise<void|ErpSessionPrincipal>){
  this.views=new InteractionRegistry('erp',{now,invalidError:'ERP_VIEW_EXPIRED'})
  if(!['https://platform.fsstory.net','https://platform-dev.fsstory.net','https://dev.fsstory.net'].includes(origin))throw Error('ERP_ORIGIN_INVALID')
  this.erpOrigin=origin==='https://platform.fsstory.net'?'https://erp.fsstory.net':'https://erp-dev.fsstory.net'
 }
 private async grant(signal?:AbortSignal,sessionId?:string):Promise<Grant>{
  let binding:void|ErpSessionPrincipal=undefined
  if(this.authorizeSession){if(!sessionId)throw Error('ERP_SESSION_REQUIRED');binding=await this.authorizeSession(sessionId)}
  const original=await this.authorize();const signals=[original.signal,...(signal?[signal]:[]),...(binding&&'kind'in binding?[binding.signal]:[])];const identity={...original,signal:signals.length===1?original.signal:AbortSignal.any(signals)};identity.signal.throwIfAborted()
  const response=await this.fetcher(this.origin+'/api/application-settings/v1/futurestaff-erp/agent/token',{method:'POST',headers:{Authorization:'Bearer '+identity.accessToken,'Content-Type':'application/json'},...(binding&&'agentId'in binding?{body:JSON.stringify({agentId:binding.agentId,agentVersion:binding.version,...(binding.releaseVersion?{agentReleaseVersion:binding.releaseVersion}:{})})}:{}),signal:identity.signal})
  if(!response.ok)throw Error(response.status===403?'ERP_PERMISSION_DENIED':'ERP_AUTH_REQUIRED')
  const t=object(await response.json())
  if(t.tenantId!==identity.tenantId||t.memberId!==identity.userId||t.tokenType!=='Bearer'||t.expiresIn!==60||t.audience!==(this.erpOrigin==='https://erp.fsstory.net'?'futurestaff-erp-prod':'futurestaff-erp-dev')||typeof t.accessToken!=='string')throw Error('ERP_IDENTITY_MISMATCH')
  const g={...identity,token:t.accessToken,policy:{}} as Grant
  const ctx=object(await this.request(g,'GET','context'))
  if(ctx.tenant_id!==identity.tenantId||ctx.member_id!==identity.userId)throw Error('ERP_IDENTITY_MISMATCH')
  g.policy=object(ctx.authorization);identity.signal.throwIfAborted();return g
 }
 private async request(g:Grant,method:string,path:string,body?:Data,key?:string):Promise<unknown>{
  const response=await this.fetcher(this.erpOrigin+'/api/erp/'+path,{method,headers:{Authorization:'Bearer '+g.token,Origin:this.erpOrigin,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:g.signal,redirect:'error'})
  g.signal.throwIfAborted()
  if(!response.ok){const detail=await response.json().catch(()=>null) as {detail?:unknown}|null;const e=Error(response.status===403?'ERP_PERMISSION_DENIED':response.status===404?'ERP_RECORD_UNAVAILABLE':response.status===401?'ERP_AUTH_REQUIRED':response.status===409?'ERP_STATE_CHANGED':'ERP_REQUEST_REJECTED');Object.assign(e,{status:response.status,safeDetail:typeof detail?.detail==='string'?detail.detail:undefined});throw e}
  const data=await response.json();if(JSON.stringify(data).length>400000)throw Error('ERP_RESULT_LIMIT');return data
 }
 private save(g:Grant,sessionId:string,kind:ErpView['kind'],resource:string,data:unknown,extra:Partial<Saved>={}):ErpView{
  if(!sessionId||sessionId.length>128)throw Error('ERP_SESSION_REQUIRED')
  const view:ErpView={schemaVersion:1,module:'erp',viewId:randomUUID(),kind,title:titles[resource]??'业务报表',resource,data,sessionId,summary:kind==='preview'?'请在业务窗口核对并确认，尚未执行。':kind==='form'?'订单草稿已打开，请补全缺项并核对；预览不保存，确认后才创建草稿订单。':JSON.stringify(data)}
  return this.views.put({view,owner:owner(g),policy:signature(g.policy),signal:g.signal,...extra})
 }
 subscribe(listener:(view:ErpView,owner:string)=>void){return this.views.subscribe(listener)}
 dispose(){this.views.clear()}
 async query(input:unknown,sessionId:string,signal?:AbortSignal):Promise<ErpView>{
  const value=object(input);keys(value,['resource','id','search','page','status']);const resource=String(value.resource)
  if(!resources.includes(resource))throw Error('ERP_INPUT_INVALID')
  if(value.id!==undefined&&(resource.includes('/')||['stock','dashboard'].includes(resource)))throw Error('ERP_INPUT_INVALID')
  const params=new URLSearchParams()
  if(value.search!==undefined){if(typeof value.search!=='string'||value.search.length>100)throw Error('ERP_INPUT_INVALID');params.set('search',value.search)}
  if(value.page!==undefined){if(!Number.isInteger(value.page)||Number(value.page)<1)throw Error('ERP_INPUT_INVALID');params.set('page',String(value.page));params.set('page_size','50')}
  if(value.status!==undefined){if(typeof value.status!=='string'||value.status.length>30)throw Error('ERP_INPUT_INVALID');params.set('status',value.status)}
  const g=await this.grant(signal,sessionId);const path=resource+(value.id?'/'+identifier(value.id):'')+(params.size?'?'+params:'')
  return this.save(g,sessionId,value.id?'entity':'table',resource,await this.request(g,'GET',path))
 }
 async form(kind:'sales'|'purchase',sessionId:string,signal?:AbortSignal,input?:unknown):Promise<ErpView>{
  if(!['sales','purchase'].includes(kind))throw Error('ERP_INPUT_INVALID')
  const draft=normalizeOrderDraft(kind,input)
  const g=await this.grant(signal,sessionId);allow(g,kind+'.create')
  if(kind==='purchase'&&!(g.policy.sensitive as string[])?.includes('purchase_price'))throw Error('ERP_PERMISSION_DENIED')
  const list=(value:unknown):Data[]=>Array.isArray(value)?value as Data[]:Array.isArray((value as Data)?.items)?(value as Data).items as Data[]:[]
  const partners=list(await this.request(g,'GET',kind==='sales'?'customers?page=1&page_size=100':'suppliers?page=1&page_size=100'))
  const items=list(await this.request(g,'GET',kind==='sales'?'products':'materials'))
  // Reread every suggested ID under the same grant, including records outside the first page.
  const verified=new Set<string>()
  const include=async(resource:string,id:string,list:Data[])=>{const key=resource+'/'+id;if(verified.has(key))return;verified.add(key);const row=object(await this.request(g,'GET',key));if(row.id!==id||['inactive','disabled','停用'].includes(String(row.status)))throw Error('ERP_RECORD_UNAVAILABLE');const index=list.findIndex(item=>item.id===id);if(index<0)list.push(row);else list[index]=row}
  const partner=draft[kind==='sales'?'customer_id':'supplier_id']
  if(partner)await include(kind==='sales'?'customers':'suppliers',partner,partners)
  for(const item of draft.items??[]){const id=item[kind==='sales'?'product_id':'material_id'];if(id)await include(kind==='sales'?'products':'materials',id,items)}
  return this.save(g,sessionId,'form',kind==='sales'?'sales-orders':'purchase-orders',{operation:kind+'.create',partners,items,draft})
 }
 private async references(g:Grant,body:Data,id:string|undefined,op:string,labels?:Data[]):Promise<Map<string,string>>{
  const refs=new Map<string,string>();const paths:Record<string,string>={customer_id:'customers',supplier_id:'suppliers',product_id:'products',material_id:'materials',warehouse_id:'warehouses',from_warehouse_id:'warehouses',to_warehouse_id:'warehouses'}
  const read=async(path:string)=>{if(!refs.has(path)){const result=await this.request(g,'GET',path);refs.set(path,hash(result));const row=object(result);labels?.push({resource:path.split('/')[0],id:row.id,name:row.name??row.order_no??row.id})}}
  for(const [key,path] of Object.entries(paths))if(body[key])await read(path+'/'+identifier(body[key]))
  if(Array.isArray(body.items))for(const item of body.items){const row=object(item);for(const key of ['product_id','material_id'])if(row[key])await read(paths[key]!+'/'+identifier(row[key]))}
  if(id)await read(operations[op]!.resource+'/'+id)
  if(body.related_order_id)await read((body.payment_type==='receipt'?'sales-orders':'purchase-orders')+'/'+identifier(body.related_order_id))
  return refs
 }
 async prepare(input:unknown,sessionId:string,signal?:AbortSignal):Promise<ErpView>{
  const value=object(input);keys(value,['operation','body','id']);const op=String(value.operation),spec=operations[op]
  if(!spec)throw Error('ERP_INPUT_INVALID');const body=object(value.body);const id=value.id===undefined?undefined:identifier(value.id)
  if((spec.method==='PATCH'||spec.method==='DELETE'||spec.status)&&!id)throw Error('ERP_REFERENCE_INVALID')
  if(id&&spec.method==='POST'&&!spec.status)throw Error('ERP_INPUT_INVALID')
  if(JSON.stringify(body).length>32000)throw Error('ERP_INPUT_INVALID')
  keys(body,['customer_id','supplier_id','product_id','material_id','warehouse_id','from_warehouse_id','to_warehouse_id','order_date','due_date','notes','items','quantity','new_status','record_source','reason','category_id','payment_type','related_order_id','amount','payment_date','payment_method','discount','tax_amount'])
  if(Array.isArray(body.items))for(const item of body.items)keys(object(item),['product_id','material_id','quantity','unit_price','notes'])
  const g=await this.grant(signal,sessionId);allow(g,op)
  if(op.startsWith('purchase.')&&!(g.policy.sensitive as string[])?.includes('purchase_price'))throw Error('ERP_PERMISSION_DENIED')
  const labels:Data[]=[];const references=await this.references(g,body,id,op,labels)
  return this.save(g,sessionId,'preview',spec.resource,{operation:op,body,...(id?{id}:{}),references:labels},{operation:op,body:JSON.parse(JSON.stringify(body)),...(id?{id}:{}),key:randomUUID(),references})
 }
 async legacy(input:unknown,sessionId:string,signal?:AbortSignal):Promise<ErpView>{
  const value=object(input);keys(value,['method','path','body','data'])
  if(typeof value.path!=='string'||!value.path.startsWith('/')||value.path.length>500||value.path.includes('://')||/[\\#]/.test(value.path)||value.body!==undefined&&value.data!==undefined)throw Error('ERP_INPUT_INVALID')
  const url=new URL(value.path,'https://erp.invalid');if(url.origin!=='https://erp.invalid')throw Error('ERP_INPUT_INVALID')
  const path=url.pathname.replace(/\/$/,'').slice(1),method=String(value.method)
  if(method==='GET'){
   const resource=[...resources].sort((a,b)=>b.length-a.length).find(v=>path===v||path.startsWith(v+'/'))
   if(!resource||[...url.searchParams.keys()].some(k=>!['search','page','page_size','status'].includes(k)))throw Error('ERP_INPUT_INVALID')
   const id=path===resource?undefined:path.slice(resource.length+1);if(id)identifier(id)
   return this.query({resource,...(id?{id}:{}),...(url.searchParams.has('search')?{search:url.searchParams.get('search')}:{}),...(url.searchParams.has('status')?{status:url.searchParams.get('status')}:{}),...(url.searchParams.has('page')?{page:Number(url.searchParams.get('page'))}:{})},sessionId,signal)
  }
  if(url.search)throw Error('ERP_INPUT_INVALID')
  const match=Object.entries(operations).find(([,op])=>op.method===method&&(path===op.resource||path.startsWith(op.resource+'/')))
  if(!match)throw Error('ERP_INPUT_INVALID')
  let [op,spec]=match;let suffix=path===spec.resource?'':path.slice(spec.resource.length+1)
  if(suffix.endsWith('/status')){op=op.split('.')[0]+'.status';spec=operations[op]!;suffix=suffix.slice(0,-7)}
  if(!spec||spec.method!==method)throw Error('ERP_INPUT_INVALID')
  return this.prepare({operation:op,...(suffix?{id:identifier(suffix)}:{}),body:value.body??value.data??{}},sessionId,signal)
 }
 async view(viewId:string,sessionId:string):Promise<ErpView>{
  const g=await this.grant(undefined,sessionId);const saved=this.checked(g,viewId,sessionId);return saved.result??saved.view
 }
 private checked(g:Grant,id:string,session:string){
  return this.views.checked(id,session,owner(g),signature(g.policy))
 }
 async confirm(viewId:string,sessionId:string):Promise<ErpView>{
  const g=await this.grant(undefined,sessionId),v=this.checked(g,viewId,sessionId)
  if(!v.operation||!v.body||!v.key)throw Error('ERP_CONFIRMATION_REQUIRED')
  allow(g,v.operation)
  if(v.result)return v.result
  if(v.running)return v.running
  const run=async()=>{
   const spec=operations[v.operation!]!;const path=spec.resource+(v.id?'/'+v.id:'')+(spec.status?'/status':'')
   if(!v.committed){
    const current=await this.references(g,v.body!,v.id,v.operation!)
    if(hash([...current])!==hash([...v.references!]))throw Error('ERP_STATE_CHANGED')
    v.committed={data:await this.request(g,spec.method,path,v.body,v.key)}
   }
   let result=v.committed.data
   // Write responses may omit relationships. Reopen the saved order with the same authorization.
   // Retain the committed marker so a failed readback retries only GET, never another write.
   if(['sales-orders','purchase-orders','production-orders'].includes(spec.resource)&&spec.method!=='DELETE'){
    const resultId=v.id??identifier(object(result).id)
    try{result=await this.request(g,'GET',spec.resource+'/'+resultId)}catch(error){if((error as Error).message==='ERP_PERMISSION_DENIED'||(error as Error).message==='ERP_AUTH_REQUIRED')throw error;throw Error('ERP_READBACK_PENDING')}
   }
   g.signal.throwIfAborted();v.result=this.save(g,sessionId,'entity',spec.resource,result);return v.result
  }
  v.running=run();try{return await v.running}finally{delete v.running}
 }
}
