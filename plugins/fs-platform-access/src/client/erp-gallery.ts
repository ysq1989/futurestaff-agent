import type {ConversationNodeDefinition} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {ErpCardMeta} from './erp-card-state.js'
export interface ErpGalleryItem {seq:number;meta:ErpCardMeta}
interface State {turn:number;calls:Set<string>;items:ErpGalleryItem[]}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
 interface ConversationTurnDataMap {'futurestaff-erp-cards':{items:ErpGalleryItem[]}}
}
export function erpCardMeta(value:unknown):ErpCardMeta|undefined {
 if(!value||typeof value!=='object')return
 const meta=value as Record<string,unknown>
 if(meta.kind!=='futurestaff.erp'||typeof meta.viewId!=='string'||!meta.viewId||meta.viewId.length>128||typeof meta.sessionId!=='string'||!meta.sessionId||meta.sessionId.length>128||typeof meta.title!=='string'||meta.title.length>300)return
 return {kind:'futurestaff.erp',viewId:meta.viewId,sessionId:meta.sessionId,title:meta.title}
}
const tools=new Set(['call_erp_api','erp_query','erp_order_form','erp_prepare_action'])
/** A persistent result remains available at the turn tail when its tool group folds. */
export const erpCardDefinition:ConversationNodeDefinition={
 kind:'futurestaff-erp-cards',
 match:event=>['turn/start','tool/call','tool/result'].includes(event.type)?{id:String((event.data as {turn:number}).turn),role:event.type==='turn/start'?'start':'update'}:null,
 start:(_context,match)=>({turn:(match.event.data as {turn:number}).turn,calls:new Set(),items:[]}),
 update:(context,match)=>{
  const state=context.state as State
  if(match.event.type==='tool/call')return tools.has(match.event.data.name)?{...state,calls:new Set([...state.calls,String(match.event.data.callId)])}:state
  if(match.event.type!=='tool/result')return state
  const message=match.event.data.message,block=message.content[0],callId=String((message.source as {callId?:string}).callId)
  if(!state.calls.has(callId)||block?.type!=='tool-result'||block.isError)return state
  let meta=erpCardMeta(match.event.data.meta)
  if(!meta)for(const item of block.content){if(item.type==='text')try{meta=erpCardMeta(JSON.parse(item.text));if(meta)break}catch{}}
  return meta?{...state,items:[...state.items,{seq:match.event.seq,meta}]}:state
 },
 buildLocationData:(context,scope,previous)=>{
  const state=context.state as State|undefined
  if(scope!=='turn'||!state)return null
  if(previous?.kind==='turn'&&previous.key==='futurestaff-erp-cards'&&previous.value.items===state.items)return previous
  return {kind:'turn',turn:state.turn,key:'futurestaff-erp-cards',value:{items:state.items}}
 },
}
export function latestErpCard(items:readonly ErpGalleryItem[],seq:number):ErpCardMeta|null{return items.filter(item=>item.seq<=seq).at(-1)?.meta??null}
