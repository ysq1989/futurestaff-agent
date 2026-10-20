import test from 'node:test'
import assert from 'node:assert/strict'
import { FutureStaffChatAdapter } from '../lib/chat.js'

const model={modelId:'10000000-0000-4000-8000-000000000001',displayName:'Vision',supportsVision:true,isDefault:true}
const credentials=()=>({userId:'u',tenantId:'t',modelId:model.modelId,accessToken:'test',signal:new AbortController().signal})
const image={type:'image',attachment:{attachmentId:'sha256:'+'a'.repeat(64)}}
const options=()=>({provider:'futurestaff',model:'default',sessionId:'s',messages:[{role:'user',source:{kind:'user'},content:[{type:'text',text:'inspect'},image]}]})
const collect=async stream=>{for await(const _ of stream){}}
const response=()=>new Response(JSON.stringify({type:'result',content:'ok',toolCalls:[],finishReason:'stop'})+'\n',{headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}})
function adapter(models=[model],read=async()=>({dataUrl:'data:image/png;base64,AA==',path:'fashion-input/a.png'}),fetcher=async()=>response()){
 const values=new Map()
 return new FutureStaffChatAdapter(async()=>credentials(),{read:async key=>values.get(key),write:async(key,value)=>values.set(key,value)},fetcher,'https://platform.fsstory.net',async()=>models,async()=>({agentId:'30000000-0000-4000-8000-000000000001',version:'a'.repeat(64),modelPolicy:{primaryModelId:model.modelId,fallbackModelId:null}}),read)
}
test('default and explicit models expose authoritative vision capability',async()=>{
 assert.deepEqual((await adapter().listModels()).map(x=>x.inputModalities),[['text','image'],['text','image']])
 assert.deepEqual((await adapter([{...model,supportsVision:false}]).listModels())[0].inputModalities,['text'])
})
test('image history includes verified bytes and an agent workspace path',async()=>{
 let reads=0
 await collect(adapter([model],async(ref,session,signal)=>{reads++;assert.equal(session,'s');assert.equal(ref,image.attachment);assert.equal(signal.aborted,false);return {dataUrl:'data:image/png;base64,AA==',path:'fashion-input/a.png'}},async(_url,init)=>{
  const body=JSON.parse(init.body)
  assert.deepEqual(body.messages[0].images,['data:image/png;base64,AA=='])
  assert.match(body.messages[0].content,/fashion-input\/a.png/)
  return response()
 }).stream(options()))
 assert.equal(reads,1)
})
test('non-vision and invalid attachments never call provider transport',async()=>{
 let calls=0
 const fetcher=async()=>{calls++;return response()}
 await assert.rejects(collect(adapter([{...model,supportsVision:false}],undefined,fetcher).stream(options())),/图片/)
 await assert.rejects(collect(adapter([model],async()=>{throw Error('private-path')},fetcher).stream(options())),error=>!error.message.includes('private-path'))
 assert.equal(calls,0)
})

test('read_image results retain tool correlation and verified picture bytes',async()=>{
 const chat=adapter([model],undefined,async(_url,init)=>{
  const messages=JSON.parse(init.body).messages
  if(messages.length>1){
   const result=messages[2]
   assert.equal(result.role,'tool');assert.equal(result.toolCallId,'read1')
   assert.deepEqual(result.images,['data:image/png;base64,AA=='])
  }
  return response()
 })
 const initial=options();initial.messages[0].content=[{type:'text',text:'read the file'}]
 await collect(chat.stream(initial))
 const request=options()
 request.messages[0].content=[{type:'text',text:'read the file'}]
 request.messages.push({role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id:'read1',name:'read_image',arguments:'{}'}]})
 request.messages.push({role:'user',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:'read1',content:[{type:'text',text:'read result'},image]}]})
 await collect(chat.stream(request))
})

test('repeated reviews reuse picture content while retaining correlated tool results',async()=>{
 const imageFor=id=>({type:'image',attachment:{attachmentId:id}})
 const request=options();request.messages[0].content=[{type:'text',text:'review'},imageFor('original')]
 const read=async ref=>({dataUrl:'data:image/png;base64,'+Buffer.from(ref.attachmentId).toString('base64'),path:'fashion-input/'+ref.attachmentId+'.png'})
 const chat=adapter([model],read,async(_url,init)=>{
  const messages=JSON.parse(init.body).messages
  if(messages.length>1){
   assert.equal(messages.flatMap(m=>m.images??[]).length,4)
   assert.equal(messages.filter(m=>m.role==='tool').length,6)
  }
  return response()
 })
 await collect(chat.stream({...request,messages:[request.messages[0]]}))
 for(const [i,id] of ['model','detail','cutout','model','detail','cutout'].entries()){
  request.messages.push({role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id:'read'+i,name:'read_image',arguments:'{}'}]})
  request.messages.push({role:'user',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:'read'+i,content:[imageFor(id)]}]})
 }
 await collect(chat.stream(request))
})

test('a long image conversation sends recent distinct pictures without losing history or tool correlation',async()=>{
 const request=options();request.messages[0].content=[{type:'text',text:'start'}]
 const chat=adapter([model],async ref=>({dataUrl:'data:image/png;base64,'+Buffer.from(ref.attachmentId).toString('base64'),path:'fashion-output/'+ref.attachmentId+'.png'}),async(_url,init)=>{
  const messages=JSON.parse(init.body).messages
  if(messages.length>1){
   const pictures=messages.flatMap(m=>m.images??[])
   assert.equal(pictures.length,4)
   assert.deepEqual(pictures.map(x=>Buffer.from(x.split(',')[1],'base64').toString()),['picture-4','picture-5','picture-6','picture-7'])
   assert.equal(messages.filter(m=>m.role==='tool').length,8)
   assert.match(messages.find(m=>m.toolCallId==='read0').content,/fashion-output\/picture-0.png/)
   assert.match(messages.find(m=>m.toolCallId==='read0').content,/read_image/)
  }
  return response()
 })
 await collect(chat.stream(request))
 for(let i=0;i<8;i++){
  request.messages.push({role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id:'read'+i,name:'read_image',arguments:'{}'}]})
  request.messages.push({role:'user',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:'read'+i,content:[{type:'image',attachment:{attachmentId:'picture-'+i}}]}]})
 }
 await collect(chat.stream(request))
})
