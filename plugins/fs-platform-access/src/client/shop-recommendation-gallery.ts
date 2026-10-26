import type {ConversationNodeDefinition} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {shopProductImage,type ShopRecommendationData} from '../shop-products.js'
export interface ShopRecommendationMeta {kind:'futurestaff.shop';viewId:string;sessionId:string;title:string;snapshot?:ShopRecommendationData}
export interface ShopGalleryItem {seq:number;meta:ShopRecommendationMeta}
interface State {turn:number;calls:Set<string>;items:ShopGalleryItem[]}
/** Narrow only the recorded SHOP projection; a historical snapshot never grants a current action. */
export function shopRecommendationSnapshot(value:unknown):ShopRecommendationData|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value))return
 const data=value as Record<string,unknown>
 if(data.kind!=='shop.products.recommendations'||data.source!=='shop'||data.readOnly!==true||data.selectionOnly!==true||!Array.isArray(data.products)||data.products.length>6)return
 const products:ShopRecommendationData['products']=[],ids=new Set<number>()
 for(const item of data.products){
  if(!item||typeof item!=='object'||Array.isArray(item))return
  const product=item as Record<string,unknown>
  if(!Number.isSafeInteger(product.id)||Number(product.id)<1||ids.has(Number(product.id))||typeof product.name!=='string'||product.name.length>300
   ||typeof product.reason!=='string'||product.reason.length>500
   ||product.price!==null&&(typeof product.price!=='string'||!/^\d{1,12}(?:\.\d{1,4})?$/.test(product.price))
   ||product.stock!==null&&(!Number.isSafeInteger(product.stock)||Number(product.stock)<0)
   ||![null,true,false].includes(product.onSale as null|boolean))return
  ids.add(Number(product.id));const image=shopProductImage(product.image)
  products.push({id:Number(product.id),name:product.name,reason:product.reason,price:product.price as string|null,stock:product.stock as number|null,onSale:product.onSale as boolean|null,...(image?{image}:{})})
 }
 if(data.selectedProductId!==undefined&&(!Number.isSafeInteger(data.selectedProductId)||!ids.has(Number(data.selectedProductId))))return
 return {kind:'shop.products.recommendations',source:'shop',readOnly:true,selectionOnly:true,products,...(data.selectedProductId===undefined?{}:{selectedProductId:Number(data.selectedProductId)})}
}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
 interface ConversationTurnDataMap {'futurestaff-shop-recommendations':{items:ShopGalleryItem[]}}
}
/** Recommendations remain visible after the normal tool group collapses. */
export const shopRecommendationDefinition:ConversationNodeDefinition={
 kind:'futurestaff-shop-recommendations',
 match:event=>['turn/start','tool/call','tool/result'].includes(event.type)?{id:String((event.data as {turn:number}).turn),role:event.type==='turn/start'?'start':'update'}:null,
 start:(_context,match)=>({turn:(match.event.data as {turn:number}).turn,calls:new Set(),items:[]}),
 update:(context,match)=>{
  const state=context.state as State
  if(match.event.type==='tool/call'){
   if(match.event.data.name!=='shop_recommend_products')return state
   return {...state,calls:new Set([...state.calls,String(match.event.data.callId)])}
  }
  if(match.event.type!=='tool/result')return state
  const message=match.event.data.message,block=message.content[0],callId=String((message.source as {callId?:string}).callId)
  if(!state.calls.has(callId)||block?.type!=='tool-result'||block.isError)return state
  for(const item of block.content){
   if(item.type!=='text')continue
   try{
    const value=JSON.parse(item.text)
    if(value.module!=='shop'||value.kind!=='recommendations'||value.data?.kind!=='shop.products.recommendations'||typeof value.viewId!=='string'||typeof value.sessionId!=='string')continue
    const snapshot=shopRecommendationSnapshot(value.data)
    const meta:ShopRecommendationMeta={kind:'futurestaff.shop',viewId:value.viewId,sessionId:value.sessionId,title:'为你推荐的商品',...(snapshot?{snapshot}:{})}
    return {...state,items:[...state.items,{seq:match.event.seq,meta}]}
   }catch{}
  }
  return state
 },
 buildLocationData:(context,scope,previous)=>{
  const state=context.state as State|undefined
  if(scope!=='turn'||!state)return null
  if(previous?.kind==='turn'&&previous.key==='futurestaff-shop-recommendations'&&previous.value.items===state.items)return previous
  return {kind:'turn',turn:state.turn,key:'futurestaff-shop-recommendations',value:{items:state.items}}
 }
}
export function latestShopRecommendation(items:readonly ShopGalleryItem[],seq:number):ShopRecommendationMeta|null{
 return items.filter(item=>item.seq<=seq).at(-1)?.meta??null
}
