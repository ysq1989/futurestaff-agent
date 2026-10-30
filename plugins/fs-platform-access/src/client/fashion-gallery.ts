import type {ConversationNodeDefinition,ToolResultNode} from '@deepseek-ai/dsh-client-ui-conversation/client'
export interface FashionGalleryItem {seq:number;callId:string;toolName?:string;content:ToolResultNode['content']}
export const previewImageTools=['fashion_image_generate','fashion_image_process','fashion_image_download','fashion_detail_material',
 'commerce_image_generate','commerce_image_compose','commerce_image_download','commerce_image_preview','creative_asset_download']
interface State {turn:number;calls:Map<string,{name:string;imagePath?:string}>;items:FashionGalleryItem[]}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
 interface ConversationTurnDataMap {'futurestaff-fashion-gallery':{items:FashionGalleryItem[]}}
}
export const fashionGalleryDefinition:ConversationNodeDefinition={
 kind:'futurestaff-fashion-gallery',
 match:event=>['turn/start','tool/call','tool/result'].includes(event.type)?{id:String((event.data as {turn:number}).turn),role:event.type==='turn/start'?'start':'update'}:null,
 start:(_context,match)=>({turn:(match.event.data as {turn:number}).turn,calls:new Map(),items:[]}),
 update:(context,match)=>{
  const state=context.state as State
  if(match.event.type==='tool/call'){
   const calls=new Map(state.calls),name=match.event.data.name
   let imagePath:string|undefined
   if(name==='read_image')try{
    const value=JSON.parse(match.event.data.arguments).file_path
    if(typeof value==='string'&&value.startsWith('commerce-output/')&&!/[\\:\x00]/.test(value)
      &&value.split('/').every(part=>part&&part!=='.'&&part!=='..'))imagePath=value
   }catch{}
   calls.set(String(match.event.data.callId),{name,...imagePath?{imagePath}:{}});return {...state,calls}
  }
  if(match.event.type!=='tool/result')return state
  const message=match.event.data.message,block=message.content[0],callId=String((message.source as {callId?:string}).callId)
  const call=state.calls.get(callId),restored=call?.name==='read_image'&&call.imagePath
  if(block?.type!=='tool-result'||block.isError||!call||!previewImageTools.includes(call.name)&&!restored||!block.content.some((item:ToolResultNode['content'][number])=>item.type==='image'))return state
  const content:ToolResultNode['content']=restored?[{type:'text',text:JSON.stringify({status:'succeeded',previewKind:'commerce',imagePath:call.imagePath,reviewStatus:'needs-review'})},...block.content.filter((item:ToolResultNode['content'][number])=>item.type==='image')]:block.content
  return {...state,items:[...state.items,{seq:match.event.seq,callId,toolName:call.name,content}]}
 },
 buildLocationData:(context,scope,previous)=>{
  const state=context.state as State|undefined
  if(scope!=='turn'||!state)return null
  if(previous?.kind==='turn'&&previous.key==='futurestaff-fashion-gallery'&&previous.value.items===state.items)return previous
  return {kind:'turn',turn:state.turn,key:'futurestaff-fashion-gallery',value:{items:state.items}}
 }
}
export function uniqueFashionGallery(items:readonly FashionGalleryItem[],seq:number):FashionGalleryItem[]{
 const seen=new Set<string>()
 return items.filter(item=>{
  const image=item.content.find(block=>block.type==='image')
  if(item.seq>seq||image?.type!=='image'||seen.has(image.attachment.attachmentId))return false
  seen.add(image.attachment.attachmentId);return true
 })
}
export function galleryToolResult(item:FashionGalleryItem):ToolResultNode{
 return {kind:'tool-result',seq:item.seq,time:0,callId:item.callId,call:null,callTime:null,content:item.content,isError:false,subCalls:[]}
}
