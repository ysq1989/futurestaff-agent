import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { assertPlatformOrigin } from './environment.js'
import type { LocalTemplatePrincipal } from './market-host.js'
import { boundedResponse, jsonRecord, MemberMcp, SystemAssistantEntitlementError, systemAssistantOperationError, systemAssistantResponseError, type JsonRecord } from './member-mcp.js'

export type AssistantSystem = 'product-hub'|'visa'|'agent'
export interface MemberAssistantIdentity extends LocalTemplatePrincipal {accessToken:string;tenantId:string;userId:string}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function fields(value:JsonRecord,keys:readonly string[]){if(Object.keys(value).some(key=>!keys.includes(key)))throw Error('SYSTEM_ASSISTANT_INPUT_INVALID')}
function identifier(value:unknown){if(typeof value!=='string'||!uuid.test(value))throw Error('SYSTEM_ASSISTANT_INPUT_INVALID');return value}
function text(value:unknown,max:number,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('SYSTEM_ASSISTANT_INPUT_INVALID');return value}
function page(value:unknown,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>max)throw Error('SYSTEM_ASSISTANT_INPUT_INVALID');return value as number}
const hubOperations=['products_search','pools_list','pool_get','selection_draft_create','selection_draft_get','templates_list'] as const
export function hubInput(raw:unknown){
 const input=jsonRecord(raw);fields(input,['operation','arguments'])
 if(!hubOperations.includes(input.operation as typeof hubOperations[number]))throw Error('SYSTEM_ASSISTANT_INPUT_INVALID')
 const args=jsonRecord(input.arguments),operation=input.operation as typeof hubOperations[number]
 const permitted:Record<typeof operation,readonly string[]>={products_search:['keyword','categoryId','priceMin','priceMax','page','pageSize'],pools_list:[],pool_get:['poolId'],selection_draft_create:['idempotencyKey','name','description','productIds'],selection_draft_get:['draftId'],templates_list:['page','pageSize']}
 fields(args,permitted[operation])
 for(const key of ['poolId','draftId','categoryId'])if(args[key]!==undefined)identifier(args[key])
 if(operation==='pool_get')identifier(args.poolId)
 if(operation==='selection_draft_get')identifier(args.draftId)
 if(args.keyword!==undefined)text(args.keyword,200)
 if(args.page!==undefined)page(args.page)
 if(args.pageSize!==undefined)page(args.pageSize,50)
 for(const key of ['priceMin','priceMax'])if(args[key]!==undefined&&(typeof args[key]!=='number'||!Number.isFinite(args[key])||args[key]<0))throw Error('SYSTEM_ASSISTANT_INPUT_INVALID')
 if(typeof args.priceMin==='number'&&typeof args.priceMax==='number'&&args.priceMax<args.priceMin)throw Error('SYSTEM_ASSISTANT_INPUT_INVALID')
 if(operation==='selection_draft_create'){
  if(!/^[A-Za-z0-9_-]{8,80}$/.test(text(args.idempotencyKey,80,true)))throw Error('SYSTEM_ASSISTANT_INPUT_INVALID')
  text(args.name,200,true);if(args.description!==undefined)text(args.description,2000)
  if(!Array.isArray(args.productIds)||args.productIds.length<1||args.productIds.length>50||new Set(args.productIds).size!==args.productIds.length)throw Error('SYSTEM_ASSISTANT_INPUT_INVALID')
  args.productIds.forEach(identifier)
 }
 return {operation,args}
}
export const visaResources=['permissions','cases','case','progress','events','material_options','material_defaults'] as const
export function visaInput(raw:unknown){
 const input=jsonRecord(raw);fields(input,['resource','caseId','params'])
 if(!visaResources.includes(input.resource as typeof visaResources[number]))throw Error('SYSTEM_ASSISTANT_INPUT_INVALID')
 const resource=input.resource as typeof visaResources[number],params=input.params===undefined?{}:jsonRecord(input.params)
 fields(params,resource==='cases'?['q','status','order_status','service_type','page','page_size']:[])
 for(const key of ['q','status','service_type'])if(params[key]!==undefined)text(params[key],key==='q'?200:100)
 if(params.order_status!==undefined&&!['in_progress','cancelled','completed'].includes(params.order_status as string))throw Error('SYSTEM_ASSISTANT_INPUT_INVALID')
 if(params.page!==undefined)page(params.page)
 if(params.page_size!==undefined)page(params.page_size,50)
 if(resource==='cases'&&params.page_size===undefined)params.page_size=20
 const needsCase=['case','progress','events'].includes(resource)
 if(needsCase)identifier(input.caseId);else if(input.caseId!==undefined)throw Error('SYSTEM_ASSISTANT_INPUT_INVALID')
 const paths={permissions:'/api/immigration/me/permissions',cases:'/api/immigration/cases',case:'/api/immigration/cases/'+input.caseId,progress:'/api/immigration/cases/'+input.caseId+'/processing',events:'/api/immigration/cases/'+input.caseId+'/events',material_options:'/api/immigration/material-library/options',material_defaults:'/api/immigration/material-library/defaults'}
 const query=new URLSearchParams(Object.entries(params).map(([key,value])=>[key,String(value)]))
 return {resource,path:paths[resource]+(query.size?'?'+query:'')}
}
function adminInput(raw:unknown){
 const input=jsonRecord(raw);fields(input,['method','path','search'])
 if(input.method!=='GET'||typeof input.path!=='string'||!/^\/(agents(?:\/[0-9a-f-]{36})?|templates)$/.test(input.path))throw Error('SYSTEM_ASSISTANT_INPUT_INVALID')
 const [resource,id]=input.path.slice(1).split('/')
 if(id)identifier(id)
 if(input.search!==undefined)text(input.search,200)
 return {resource:resource!,...(id?{id}:{}),...(input.search!==undefined?{search:input.search}:{})}
}
const systemTool={ 'product-hub':'call_product_hub_api',visa:'visa_query',agent:'call_agent_admin_api' } as const
interface AssistantGrantIdentity {accessToken:string;tenantId:string;userId:string;templateId:string;signal:AbortSignal}
function validateAssistantGrant(origin:string,system:'product-hub'|'visa',identity:AssistantGrantIdentity,grant:JsonRecord):{moduleOrigin:string;accessToken:string;permissions:string[]}{
 const prod=origin==='https://platform.fsstory.net',moduleOrigin=system==='product-hub'?(prod?'https://product.fsstory.net':'https://product-dev.fsstory.net'):(prod?'https://visa.fsstory.net':'https://visa-dev-new.fsstory.net')
 const audience=system==='product-hub'?(prod?'futurestaff-product-hub-prod':'futurestaff-product-hub-dev'):(prod?'futurestaff-visa-prod':'futurestaff-visa-dev-new')
 const permissions=system==='product-hub'?['product_hub.read','product_hub.operator','product_hub.admin']:['visa.read','visa.operator','visa.reviewer','visa.admin']
 if(grant.schema_version!==1||grant.tokenType!=='Bearer'||grant.expiresIn!==60||grant.audience!==audience||grant.tenantId!==identity.tenantId||grant.memberId!==identity.userId||grant.assistantTemplateId!==identity.templateId
  ||grant.apiBaseUrl!==moduleOrigin||typeof grant.accessToken!=='string'||!grant.accessToken||grant.accessToken.length>8192||!Array.isArray(grant.permissions)||!grant.permissions.length||new Set(grant.permissions).size!==grant.permissions.length||grant.permissions.some(value=>!permissions.includes(value as string)))throw Error('SYSTEM_ASSISTANT_IDENTITY_MISMATCH')
 return {moduleOrigin,accessToken:grant.accessToken,permissions:grant.permissions as string[]}
}
/** Permission-only discovery. Never resolves a session or executes a business tool. */
export async function visaAssistantPermissionAvailable(origin:string,identity:AssistantGrantIdentity,fetcher=globalThis.fetch):Promise<boolean>{
 assertPlatformOrigin(origin)
 const signal=AbortSignal.any([identity.signal,AbortSignal.timeout(15000)])
 const read=async(url:string,init:RequestInit):Promise<JsonRecord|undefined>=>{
  signal.throwIfAborted()
  const response=await fetcher(url,{...init,signal,redirect:'error'})
  signal.throwIfAborted()
  if(response.status===401||response.status===403){await response.body?.cancel();return undefined}
  if(response.status!==200){await response.body?.cancel();throw Error('SYSTEM_ASSISTANT_PREFLIGHT_UNAVAILABLE')}
  const value=jsonRecord(JSON.parse(await boundedResponse(response,64*1024)))
  signal.throwIfAborted();return value
 }
 const grant=await read(origin+'/desktop/v1/system-assistants/vietnam_immigration/token',{method:'POST',headers:{Authorization:'Bearer '+identity.accessToken,'content-type':'application/json'},body:JSON.stringify({templateId:identity.templateId})})
 if(!grant)return false
 const {moduleOrigin,accessToken}=validateAssistantGrant(origin,'visa',identity,grant)
 return (await read(moduleOrigin+'/api/immigration/me/permissions',{method:'GET',headers:{Authorization:'Bearer '+accessToken}}))!==undefined
}
export class SystemAssistantService{
 constructor(private origin:string,private authorize:(sessionId:string,system:AssistantSystem,tool:string)=>Promise<MemberAssistantIdentity>,private fetcher=globalThis.fetch){assertPlatformOrigin(origin)}
 async run(system:AssistantSystem,raw:unknown,sessionId:string):Promise<unknown>{
  const input=system==='product-hub'?hubInput(raw):system==='visa'?visaInput(raw):adminInput(raw)
  const tool=systemTool[system],identity=await this.authorize(sessionId,system,tool)
  if(!identity.tools?.includes(tool)||(system!=='agent'&&!identity.businessSystems.includes(system)))throw Error('AGENT_BUSINESS_SCOPE_DENIED')
  const check=async()=>{identity.signal.throwIfAborted();const current=await this.authorize(sessionId,system,tool);identity.signal.throwIfAborted();if(current.templateId!==identity.templateId||current.version!==identity.version||current.tenantId!==identity.tenantId||current.userId!==identity.userId)throw Error('SYSTEM_ASSISTANT_SESSION_CHANGED')}
  const signal=AbortSignal.any([identity.signal,AbortSignal.timeout(50000)])
  const request=async(url:string,init:RequestInit={})=>{await check();let response:Response;try{response=await this.fetcher(url,{...init,signal,redirect:'error'})}catch{signal.throwIfAborted();throw Error('SYSTEM_ASSISTANT_RESULT_UNCONFIRMED')}if(!response.ok){const error=await systemAssistantResponseError(response,system==='product-hub');signal.throwIfAborted();throw error}const body=JSON.parse(await boundedResponse(response));await check();return body}
  const headers={Authorization:'Bearer '+identity.accessToken,'content-type':'application/json'}
  try{
   if(system==='agent'){
    const result=jsonRecord(await request(this.origin+'/desktop/v1/system-assistants/agent/query',{method:'POST',headers,body:JSON.stringify({templateId:identity.templateId,...input})}))
    if(result.schema_version!==1||result.resource!==(input as ReturnType<typeof adminInput>).resource||!Array.isArray(result.items)||result.items.length>200)throw Error('SYSTEM_ASSISTANT_RESULT_INVALID')
    return result
   }
   const appId=system==='product-hub'?'product_hub':'vietnam_immigration'
   const grant=jsonRecord(await request(this.origin+'/desktop/v1/system-assistants/'+appId+'/token',{method:'POST',headers,body:JSON.stringify({templateId:identity.templateId})}))
   const {moduleOrigin,accessToken,permissions}=validateAssistantGrant(this.origin,system,identity,grant)
   if(system==='visa')return { resource: (input as ReturnType<typeof visaInput>).resource,
    data: await request(moduleOrigin+(input as ReturnType<typeof visaInput>).path,{method:'GET',headers:{Authorization:'Bearer '+accessToken}}) }
   if(grant.mcpUrl!==moduleOrigin+'/api/product-hub/mcp')throw Error('SYSTEM_ASSISTANT_IDENTITY_MISMATCH')
   const hub=input as ReturnType<typeof hubInput>
   if(hub.operation==='selection_draft_create'&&!permissions.some(value=>value==='product_hub.operator'||value==='product_hub.admin'))throw Error('SYSTEM_ASSISTANT_REQUEST_DENIED')
   const mcp=new MemberMcp(grant.mcpUrl as string,accessToken,signal,check,this.fetcher)
   await mcp.initialize();const catalog=await mcp.rpc('tools/list')
   if(!Array.isArray(catalog.tools)||catalog.tools.length>128||!catalog.tools.some(value=>jsonRecord(value).name==='product_hub_'+hub.operation))throw Error('SYSTEM_ASSISTANT_FEATURE_UNAVAILABLE')
   const result=await mcp.rpc('tools/call',{name:'product_hub_'+hub.operation,arguments:hub.args})
   if(result.isError)throw systemAssistantOperationError(result)
   return hub.operation==='selection_draft_create'?{state:'draft',published:false,result}:result
  }catch(error){signal.throwIfAborted();if(error instanceof SystemAssistantEntitlementError||(error instanceof Error&&/^(SYSTEM_ASSISTANT_[A-Z_]+|AGENT_BUSINESS_SCOPE_DENIED)$/.test(error.message)))throw error;throw Error('SYSTEM_ASSISTANT_CONNECTION_UNAVAILABLE')}
 }
}
export const systemAssistantDefinitions=[
 {system:'product-hub',name:'call_product_hub_api',description:'查询本人授权商品、货池和模板，读取或创建私有选品草稿。operation 必须使用受管Skill列明的本地操作；arguments按操作精确参数。创建仅草稿，未发布。禁止改货池、审核、正式发布或任意HTTP。失败查询原idempotencyKey，禁止换编号重试。',parameters:{type:'object',properties:{operation:{type:'string',enum:hubOperations},arguments:{type:'object',additionalProperties:true}},required:['operation','arguments'],additionalProperties:false}},
 {system:'visa',name:'visa_query',description:'按当前员工权限查询越南签证案件、进度、事件及材料配置。仅GET，caseId必须来自实际查询结果；创建、提交、订单和支付在签证工作台人工操作。resource=cases 时params仅q/status/order_status/service_type/page/page_size(≤50)。',parameters:{type:'object',properties:{resource:{type:'string',enum:visaResources},caseId:{type:'string',format:'uuid'},params:{type:'object',additionalProperties:false,properties:{q:{type:'string',maxLength:200},status:{type:'string',maxLength:100},order_status:{type:'string',enum:['in_progress','cancelled','completed']},service_type:{type:'string',maxLength:100},page:{type:'integer',minimum:1},page_size:{type:'integer',minimum:1,maximum:50}}}},required:['resource'],additionalProperties:false}},
 {system:'agent',name:'call_agent_admin_api',description:'只读核对本主体可见智能体及人才模板。仅GET /agents、/agents/实际UUID、/templates；可提供search。生成诊断和配置建议，所有实际管理变更在权威Agent管理台人工操作。需要当前agent.admin权限。',parameters:{type:'object',properties:{method:{type:'string',enum:['GET']},path:{type:'string',pattern:'^/(agents(/[0-9a-f-]{36})?|templates)$'},search:{type:'string',maxLength:200}},required:['method','path'],additionalProperties:false}},
] as const
export function mountSystemAssistantTools(ctx:Context,origin:string,authorize:ConstructorParameters<typeof SystemAssistantService>[1]){
 const service=new SystemAssistantService(origin,authorize)
 ctx.inject(['tools'],toolCtx=>{for(const definition of systemAssistantDefinitions)toolCtx.effect(()=>toolCtx.tools.register({name:definition.name,description:definition.description,parameters:definition.parameters,
  output:{schema:{type:'object',additionalProperties:true},render:(_input,value)=>[{type:'text',text:JSON.stringify(value)}]},execute:async(input,exec)=>{if(!exec.agent)throw Error('AGENT_SESSION_REQUIRED');return service.run(definition.system,input,exec.agent.id)}}))})
}
