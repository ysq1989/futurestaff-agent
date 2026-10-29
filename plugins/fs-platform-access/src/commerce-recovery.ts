import type {GenerateOptions} from '@deepseek-ai/dsh-llm'

/** Unconfirmed generation survives a new user turn and Host restart. Archiving is separate. */
export function commerceImageRecovery(messages:GenerateOptions['messages']):string|undefined{
 const calls=new Map<string,{name:string;requestId:string}>(),pending=new Set<string>()
 for(const message of messages){
  if(message.role==='assistant')for(const block of message.content){
   if(block.type!=='tool-call'||!['commerce_image_generate','agent_image_status'].includes(block.name))continue
   try{const args=JSON.parse(block.arguments);if(typeof args.requestId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(args.requestId))continue
    calls.set(block.id,{name:block.name,requestId:args.requestId});if(block.name==='commerce_image_generate')pending.add(args.requestId)
   }catch{}
  }
  if(message.source?.kind!=='tool')continue
  for(const block of message.content){
   if(block.type!=='tool-result')continue
   const call=calls.get(block.toolCallId);if(!call)continue;calls.delete(block.toolCallId)
   const text=block.content.filter(content=>content.type==='text').map(content=>content.text).join('\n')
   let value:Record<string,unknown>|undefined;try{value=JSON.parse(text)}catch{}
   if(value?.requestId!==undefined&&value.requestId!==call.requestId)continue
   if(value&&['succeeded','failed'].includes(String(value.status)))pending.delete(call.requestId)
   else if(call.name==='commerce_image_generate'&&!value&&!text.includes('AGENT_IMAGE_RESULT_UNCONFIRMED'))pending.delete(call.requestId)
  }
 }
 if(!pending.size)return undefined
 return '电商图片生成结果待确认。先用agent_image_status查询原requestId：'+[...pending].join('、')+'。结果未确认前禁止重新生图；生成成功后恢复下载和企业归档，下载或归档失败不授权再次生成。'
}
