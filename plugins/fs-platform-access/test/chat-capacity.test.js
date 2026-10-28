import assert from 'node:assert/strict'
import test from 'node:test'
import {Context} from '@deepseek-ai/cordis'
import LlmRuntime, {CONTEXT_WINDOW_EXCEEDED_CODE} from '@deepseek-ai/dsh-llm'
import {FutureStaffChatAdapter} from '../lib/chat.js'

const modelId='10000000-0000-4000-8000-000000000001'
const credential={userId:'user-a',tenantId:'tenant-a',modelId,accessToken:'test-only',signal:new AbortController().signal}
const options=(text='hello')=>({provider:'futurestaff',model:'default',sessionId:'session-capacity',messages:[{role:'user',content:[{type:'text',text}],source:{kind:'user'}}]})
const collect=async stream=>{const chunks=[];for await(const chunk of stream)chunks.push(chunk);return chunks}
const success=()=>new Response(JSON.stringify({type:'result',content:'ok',toolCalls:[],finishReason:'stop'})+'\n',{headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}})
function setup(fetcher=async()=>success(),binding){
 const values=new Map(), reports=[]
 const adapter=new FutureStaffChatAdapter(async()=>credential,{read:async k=>values.get(k),write:async(k,v)=>{values.set(k,v)}},fetcher,'https://platform.fsstory.net',async()=>[{modelId,displayName:'FutureStaff',supportsVision:false}],binding,undefined,async()=>credential,input=>reports.push(input))
 return {adapter,reports}
}

test('runtime resolves an effective transport capacity for both the exact model and session default alias',async t=>{
 const ctx=new Context();t.after(()=>ctx.fiber.dispose());await ctx.plugin(LlmRuntime)
 const {adapter}=setup();ctx.llm.registerAdapter(['futurestaff'],adapter)
 for(const id of ['default',modelId]){
  const resolved=await ctx.llm.resolveModelInfo('futurestaff',id)
  assert.equal(resolved.context?.contextWindow,32768)
  const prepared=await adapter.prepareCall('futurestaff',id)
  assert.deepEqual(prepared.model.context,resolved.context)
 }
 assert.equal(adapter.providerRetryPolicy().maxRetries,0)
})

test('text bytes above the actual server limit fail before dispatch with the compaction recovery code',async()=>{
 let calls=0;const {adapter,reports}=setup(async()=>{calls++;return success()})
 await assert.rejects(collect(adapter.stream(options('汉'.repeat(179249)))),e=>e.code===CONTEXT_WINDOW_EXCEEDED_CODE&&/压缩|过长/.test(e.message))
 assert.equal(calls,0)
 assert.equal(reports.length,1);assert.ok(reports[0].requestBytes>524288)
 assert.equal(reports[0].code,'FUTURESTAFF_LIMIT')
})

test('the byte check includes serialized tool schemas and JSON escaping',async()=>{
 let calls=0;const {adapter}=setup(async()=>{calls++;return success()})
 await assert.rejects(collect(adapter.stream({...options(),tools:[{name:'read',description:'\u0000'.repeat(90000),parameters:{type:'object'}}]})),e=>e.code===CONTEXT_WINDOW_EXCEEDED_CODE)
 assert.equal(calls,0)
})

test('a rejected 413 routes to compaction and never becomes a login or generic outage error',async()=>{
 for(const binding of [undefined,async()=>({kind:'local-template',templateId:'20000000-0000-4000-8000-000000000001',version:'a'.repeat(64),businessSystems:[],identity:credential,signal:credential.signal})]){
  let calls=0;const {adapter}=setup(async()=>{calls++;return Response.json({contractVersion:'0.1.0',error:{code:'REQUEST_TOO_LARGE',private:'must-not-echo'}},{status:413})},binding)
  await assert.rejects(collect(adapter.stream(options())),e=>e.code===CONTEXT_WINDOW_EXCEEDED_CODE&&!/登录|暂时不可用|must-not-echo/.test(e.message))
  assert.equal(calls,1)
 }
})

test('server-owned Agent references cannot be repaired by replaying chat history',async()=>{
 const binding=async()=>({agentId:'30000000-0000-4000-8000-000000000001',version:'a'.repeat(64),modelPolicy:{primaryModelId:modelId,fallbackModelId:null}})
 const {adapter}=setup(async()=>Response.json({contractVersion:'0.1.0',error:{code:'AGENT_CONTEXT_TOO_LARGE'}},{status:413}),binding)
 await assert.rejects(collect(adapter.stream(options())),e=>e.code==='FUTURESTAFF_AGENT_LIMIT'&&/知识/.test(e.message))
})

test('a rejected Agent request body is recoverable independently of Agent reference size',async()=>{
 const binding=async()=>({agentId:'30000000-0000-4000-8000-000000000001',version:'a'.repeat(64),modelPolicy:{primaryModelId:modelId,fallbackModelId:null}})
 const {adapter}=setup(async()=>Response.json({contractVersion:'0.1.0',error:{code:'REQUEST_TOO_LARGE'}},{status:413}),binding)
 await assert.rejects(collect(adapter.stream(options())),e=>e.code===CONTEXT_WINDOW_EXCEEDED_CODE)
})

test('unknown 413 responses stay explicit and cannot echo or trigger unsafe automatic replay',async()=>{
 const {adapter}=setup(async()=>new Response('private oversized proxy response',{status:413}))
 await assert.rejects(collect(adapter.stream(options())),e=>e.code==='FUTURESTAFF_LIMIT'&&/过长/.test(e.message)&&!/private|登录|暂时不可用/.test(e.message))
})

test('normal bounded requests preserve their complete content',async()=>{
 const text='重要的原始内容'.repeat(10000),before=options(text)
 const {adapter}=setup(async(_url,init)=>{assert.ok(Buffer.byteLength(init.body)<=524288);assert.equal(JSON.parse(init.body).messages[0].content,text);return success()})
 await collect(adapter.stream(before));assert.equal(before.messages[0].content[0].text,text)
})

test('the exact text-byte limit is accepted while the next byte is rejected',async()=>{
 let size=0,calls=0;const {adapter}=setup(async(_url,init)=>{size=Buffer.byteLength(init.body);calls++;return success()})
 await collect(adapter.stream(options('')));const overhead=size
 await collect(adapter.stream(options('x'.repeat(524288-overhead))));assert.equal(size,524288)
 await assert.rejects(collect(adapter.stream(options('x'.repeat(524289-overhead)))),e=>e.code===CONTEXT_WINDOW_EXCEEDED_CODE)
 assert.equal(calls,2)
})

test('oversized or unrecognized rejection bodies cannot authorize recovery or echo details',async()=>{
 for(const body of [JSON.stringify({contractVersion:'0.1.0',error:{code:'REQUEST_TOO_LARGE'},padding:'private'.repeat(400)}),JSON.stringify({contractVersion:'future',error:{code:'REQUEST_TOO_LARGE'}})]){
  const {adapter}=setup(async()=>new Response(body,{status:413,headers:{'content-type':'application/json'}}))
  await assert.rejects(collect(adapter.stream(options())),e=>e.code==='FUTURESTAFF_LIMIT'&&!/private/.test(e.message))
 }
})

test('stalled rejection metadata has a bounded read deadline',async()=>{
 let cancelled=false
 const {adapter}=setup(async()=>new Response(new ReadableStream({start(){},cancel(){cancelled=true}}),{status:413,headers:{'content-type':'application/json'}}))
 const start=Date.now()
 await assert.rejects(collect(adapter.stream(options())),e=>e.code==='FUTURESTAFF_LIMIT')
 assert.ok(Date.now()-start<2500);assert.equal(cancelled,true)
})
