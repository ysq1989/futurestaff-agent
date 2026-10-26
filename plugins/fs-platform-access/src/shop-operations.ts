import {randomUUID,createHash} from 'node:crypto'
import {InteractionRegistry,type InteractionView,type OwnedView} from './interaction.js'
import type {ShopThemeService} from './shop.js'
import {assertShopImportRequest,shopProductImportTool,type ShopSelectionMessage} from './shop-selection.js'
import {shopProductCandidate,type ShopRecommendationData} from './shop-products.js'
type Row=Record<string,unknown>
type Identity={owner:string;origin:string;signal:AbortSignal}
export type ShopOperationView=InteractionView&{module:'shop';kind:'preview'|'entity'|'recommendations';conversationUpdated?:boolean;confirmationViewId?:string;selectionEventId?:string}
type Saved=OwnedView<ShopOperationView>&{name:string;args:Row;operationId?:string;running?:Promise<ShopOperationView>;result?:ShopOperationView;recommendations?:{productId:number;reason:string}[];selectedProductId?:number;selectionEventId?:string}
const record=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value)
// SHOP's release-owned registry derives operation names from method + '\n' +
// route (tools/build_shop_admin_catalog.mjs). Only these GET master lists qualify;
// details, recycled lists, orders and writes have different fingerprints.
const productListRoutes=new Map(['product/product','product/product/list'].map(route=>[
 'shop_api_product_'+createHash('sha256').update('GET\n'+route).digest('hex').slice(0,12),route,
]))
function products(value:Row,name:string):Row[]{
 let rows:unknown
 if(name==='shop_products_list'){
  const raw=value.source==='shop'?value:(value.data as Row|undefined)
  if(raw?.source!=='shop'||!Array.isArray(raw.list))throw Error('SHOP_RECOMMENDATION_SOURCE_REQUIRED')
  rows=raw.list
 }else{
  const result=value.data,page=record(result)?result.data:undefined
  if(!productListRoutes.has(name)||value.operation!==name||value.readOnly!==true||!record(result)||result.status!==200||!record(page)
   ||!Array.isArray(page.list)||page.list.length>100||!Number.isSafeInteger(page.count)||Number(page.count)<page.list.length)throw Error('SHOP_RECOMMENDATION_SOURCE_REQUIRED')
  rows=page.list
 }
 return (rows as unknown[]).filter((row):row is Row=>record(row)&&Number.isSafeInteger(Number(row.id))&&Number(row.id)>0
  &&(name==='shop_products_list'||typeof row.store_name==='string'&&!!row.store_name.trim()))
}
function data(value:unknown):Row{
 if(!value||typeof value!=='object')throw Error('SHOP_RESULT_INVALID')
 const result=value as Row
 if(result.isError===true){
  const content=result.content as Array<{text?:string}>|undefined,details=result.structuredContent as Row|undefined,code=details?.errorCode??content?.[0]?.text
  if(details?.argumentHint&&typeof code==='string'&&code==='DSH_INVALID_ARGUMENTS')throw Error(code+'；'+String(details.instruction??'请按原接口参数分组。')+' '+JSON.stringify(details.argumentHint))
  if(details?.readOnly===true&&typeof code==='string'&&/^DSH_[A-Z_]+$/.test(code)){
   const reasons:Record<string,string>={DSH_DEPENDENCY_NOT_CONFIGURED:'商城尚未配置此接口所需的外部服务。',DSH_TRACKING_NOT_AVAILABLE:'订单尚无可查询的快递单号。',DSH_READ_UNAVAILABLE:'读取原业务接口失败。',DSH_BUSINESS_LIMIT_REACHED:'当前业务数量已达到上限。',DSH_API_REJECTED:'原业务接口拒绝读取，请核对参数和业务前提。'}
   throw Error(code+'；'+(reasons[code]??'读取未完成。')+'没有待确认操作，请停止自动重试和操作状态查询。')
  }
  throw Error(typeof code==='string'&&/^DSH_[A-Z_]+$/.test(code)?code:'SHOP_MCP_REJECTED')
 }
 if(!result.structuredContent||typeof result.structuredContent!=='object'||Array.isArray(result.structuredContent))throw Error('SHOP_RESULT_INVALID')
 return result.structuredContent as Row
}
/** Owner/session-bound UI previews. Model tools cannot reach confirmOperation. */
export class ShopOperationViews{
 private registry=new InteractionRegistry<ShopOperationView,Saved>('shop',{invalidError:'SHOP_VIEW_EXPIRED'})
 constructor(private service:ShopThemeService,private authorize:()=>Promise<Identity>,private authorizeSession?:(sessionId:string)=>Promise<unknown>){}
 dispose(){this.registry.clear()}
 private async identity(sessionId:string){if(!sessionId||sessionId.length>128)throw Error('SHOP_SESSION_REQUIRED');await this.authorizeSession?.(sessionId);const identity=await this.authorize();identity.signal.throwIfAborted();return identity}
 private async recommendationSource(name:string):Promise<void>{
  if(name==='shop_products_list')return
  const route=productListRoutes.get(name)
  if(!route)throw Error('SHOP_RECOMMENDATION_SOURCE_REQUIRED')
  const catalog=await this.service.catalog({category:'product',search:name,limit:1})
  const tool=catalog.tools.find(item=>item.name===name) as Row|undefined,annotations=tool?.annotations
  // Model-facing tools/list intentionally omits method/permission. The immutable
  // route fingerprint supplies that identity; fresh authenticated catalog hints
  // establish current availability. If route metadata is present it must agree.
  if(!tool||tool.category!=='product'||!record(annotations)||annotations.readOnlyHint!==true||annotations.destructiveHint!==false||annotations.openWorldHint!==false
   ||tool.method!==undefined&&tool.method!=='GET'||tool.path!==undefined&&tool.path!==route||tool.permission!==undefined&&tool.permission!==route)throw Error('SHOP_RECOMMENDATION_SOURCE_REQUIRED')
 }
 private async recommendationAuthority(viewId:string,sessionId:string,name:string):Promise<Identity>{
  await this.recommendationSource(name)
  const fresh=await this.identity(sessionId)
  this.registry.checked(viewId,sessionId,fresh.owner,fresh.origin)
  return fresh
 }
 private save(identity:Identity,sessionId:string,name:string,args:Row,value:Row,operationId?:string):ShopOperationView{
  const preview=value.kind==='shop.operation.preview'
  const view:ShopOperationView={schemaVersion:1,module:'shop',viewId:randomUUID(),sessionId,kind:preview?'preview':'entity',title:typeof value.title==='string'?value.title:'商城操作',data:value}
  return this.registry.put({view,owner:identity.owner,policy:identity.origin,signal:identity.signal,name,args,...(operationId?{operationId}:{})})
 }
 async call(name:string,args:Row,sessionId:string,history:readonly ShopSelectionMessage[]=[]):Promise<ShopOperationView>{
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('SHOP_ARGUMENTS_OBJECT_REQUIRED: arguments必须是JSON对象，不是JSON字符串。')
  const identity=await this.identity(sessionId)
  if(name===shopProductImportTool)assertShopImportRequest(args,history)
  let value=data(await this.service.admin(name,args));identity.signal.throwIfAborted()
  if(['shop_products_list','shop_orders_list'].includes(name))value={operation:name,title:name==='shop_orders_list'?'订单列表':'商品列表',readOnly:true,data:value}
  const operationId=value.operationId
  if(value.kind==='shop.operation.preview'&&(typeof operationId!=='string'||!/^[a-f0-9]{32}$/.test(operationId)))throw Error('SHOP_RESULT_INVALID')
  return this.save(identity,sessionId,name,args,value,typeof operationId==='string'?operationId:undefined)
 }
 async view(viewId:string,sessionId:string):Promise<ShopOperationView>{
  const identity=await this.identity(sessionId),saved=this.registry.checked(viewId,sessionId,identity.owner,identity.origin)
  if(saved.result){data(await this.service.operation(saved.operationId!));identity.signal.throwIfAborted();return saved.result}
  if(saved.recommendations)await this.recommendationAuthority(viewId,sessionId,saved.name)
  const value=data(saved.operationId?await this.service.operation(saved.operationId):await this.service.admin(saved.name,saved.args));identity.signal.throwIfAborted()
  if(saved.recommendations){
   const fresh=await this.recommendationAuthority(viewId,sessionId,saved.name)
   return this.recommendationView(saved,value,fresh.origin)
  }
  return {...saved.view,data:value,kind:value.kind==='shop.operation.preview'?'preview':'entity'}
 }
 private recommendationView(saved:Saved,value:Row,origin:string):ShopOperationView{
  const rows=products(value,saved.name),items=saved.recommendations!
  const selected=items.map(item=>{
   const row=rows.find(row=>Number(row.id)===item.productId)
   if(!row)throw Error('SHOP_RECOMMENDATION_STALE')
   return shopProductCandidate(row,item.reason,origin)
  })
  const result:ShopRecommendationData={kind:'shop.products.recommendations',source:'shop',readOnly:true,selectionOnly:true,products:selected,...(saved.selectedProductId?{selectedProductId:saved.selectedProductId}:{})}
  return {...saved.view,kind:'recommendations',data:result,...(saved.selectionEventId?{selectionEventId:saved.selectionEventId}:{})}
 }
 async recommend(viewId:string,items:{productId:number;reason:string}[],sessionId:string):Promise<ShopOperationView>{
  const identity=await this.identity(sessionId),read=this.registry.checked(viewId,sessionId,identity.owner,identity.origin)
  if(read.recommendations)throw Error('SHOP_RECOMMENDATION_SOURCE_REQUIRED')
  if(!Array.isArray(items)||items.length<1||items.length>6||items.some(item=>!item||Object.keys(item).some(key=>!['productId','reason'].includes(key))||!Number.isSafeInteger(item.productId)||item.productId<1||typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>500)||new Set(items.map(item=>item.productId)).size!==items.length)throw Error('SHOP_RECOMMENDATION_ITEMS_INVALID')
  await this.recommendationAuthority(viewId,sessionId,read.name)
  const original=products(read.view.data as Row,read.name)
  if(items.some(item=>!original.some(row=>Number(row.id)===item.productId)))throw Error('SHOP_RECOMMENDATION_PRODUCT_REQUIRED')
  const value=data(await this.service.admin(read.name,read.args));identity.signal.throwIfAborted()
  const fresh=await this.recommendationAuthority(viewId,sessionId,read.name)
  const saved={view:{schemaVersion:1,module:'shop',kind:'recommendations',viewId:randomUUID(),sessionId,title:'为你推荐的商品',data:{}},owner:fresh.owner,policy:fresh.origin,signal:fresh.signal,name:read.name,args:read.args,recommendations:items.map(item=>({...item,reason:item.reason.trim()}))} as Saved
  saved.view=this.recommendationView(saved,value,fresh.origin)
  return this.registry.put(saved)
 }
 async select(viewId:string,productId:number,sessionId:string):Promise<ShopOperationView>{
  const identity=await this.identity(sessionId),saved=this.registry.checked(viewId,sessionId,identity.owner,identity.origin)
  if(!Number.isSafeInteger(productId)||!saved.recommendations?.some(item=>item.productId===productId))throw Error('SHOP_RECOMMENDATION_PRODUCT_REQUIRED')
  await this.recommendationAuthority(viewId,sessionId,saved.name)
  const value=data(await this.service.admin(saved.name,saved.args));identity.signal.throwIfAborted()
  const fresh=await this.recommendationAuthority(viewId,sessionId,saved.name)
  this.recommendationView(saved,value,fresh.origin)
  if(saved.selectedProductId!==productId){saved.selectedProductId=productId;saved.selectionEventId=randomUUID()}
  return this.recommendationView(saved,value,fresh.origin)
 }
 async confirm(viewId:string,sessionId:string):Promise<ShopOperationView>{
  const identity=await this.identity(sessionId),saved=this.registry.checked(viewId,sessionId,identity.owner,identity.origin)
  if(!saved.operationId||saved.view.kind!=='preview')throw Error('SHOP_CONFIRMATION_REQUIRED')
  if(saved.result){data(await this.service.operation(saved.operationId));identity.signal.throwIfAborted();return saved.result}
  if(saved.running)return saved.running
  saved.running=(async()=>{const value=data(await this.service.confirmOperation(saved.operationId!));identity.signal.throwIfAborted();if(value.state!=='completed')throw Error('DSH_RESULT_UNCONFIRMED');const result=this.save(identity,sessionId,saved.name,saved.args,value,saved.operationId);saved.result=result;return result})()
  try{return await saved.running}finally{delete saved.running}
 }
}
