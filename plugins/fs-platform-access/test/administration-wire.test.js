import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {FutureStaffChatAdapter,chatOwnerKey} from '../lib/chat.js'
import {administrationContracts,administrationAliases} from '../lib/administration-contract.generated.js'
import {businessToolAllowed,templateToolAllowed} from '../lib/business-scope.js'

const origin='https://platform.fsstory.net',modelId='10000000-0000-4000-8000-000000000001'
const signal=new AbortController().signal,identity={userId:'member',tenantId:'tenant',signal}
const canonical=administrationAliases.map(x=>x.canonical),wire=administrationAliases.map(x=>x.wire)
const options={provider:'futurestaff',model:'default',sessionId:'administration-test',messages:[{role:'user',content:[{type:'text',text:'查询本人资料'}],source:{kind:'user'}}]}
const collect=async stream=>{const result=[];for await(const chunk of stream)result.push(chunk);return result}
const response=toolCalls=>new Response(JSON.stringify({type:'result',content:'',toolCalls,finishReason:toolCalls.length?'tool-calls':'stop'})+'\n',{headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}})
function adapter(fetcher,scope=['administration']){const data=new Map([[chatOwnerKey(origin,options.sessionId),JSON.stringify({userId:identity.userId,tenantId:identity.tenantId})]]);return new FutureStaffChatAdapter(async()=>({...identity,modelId,accessToken:'synthetic-token'}),{read:async key=>data.get(key),write:async(key,value)=>data.set(key,value)},fetcher,origin,async()=>[],async()=>({agentId:'20000000-0000-4000-8000-000000000002',version:'a'.repeat(64),businessSystems:scope,modelPolicy:{primaryModelId:modelId,fallbackModelId:null},identity,signal}))}
const tools=administrationContracts.map(x=>({name:x.name,description:x.name,parameters:x.inputSchema}))
test('generated local contracts match the sole producer tables exactly',async()=>{
 const producer=JSON.parse(await readFile(new URL('./fixtures/administration/administration_tool_aliases.v1.json',import.meta.url),'utf8'))
 const domains=JSON.parse(await readFile(new URL('./fixtures/administration/ADMINISTRATION_AGENT_TOOLS_V1.json',import.meta.url),'utf8'))
 assert.deepEqual(administrationAliases,producer.tools);assert.deepEqual(administrationContracts,domains.tools.map(({name,method,path,inputSchema})=>({name,method,path,inputSchema})))
 assert.equal(new Set(wire).size,6);for(const name of wire)assert.match(name,/^[A-Za-z0-9_-]{1,64}$/)
})
test('real adapter maps only offered canonical tools and assistant history and restores parsed split-frame calls',async()=>{
 let calls=0
 const a=adapter(async(_url,init)=>{calls++;const body=JSON.parse(init.body);assert.deepEqual(body.tools.map(t=>t.name),wire);assert.deepEqual(body.tools.map(t=>t.parameters),tools.map(t=>t.parameters));assert.equal(body.messages[1].toolCalls[0].name,wire[0]);assert.equal(body.messages[1].toolCalls[0].id,'prior');assert.equal(body.messages[2].toolCallId,'prior')
  const raw=JSON.stringify({type:'result',content:'',toolCalls:wire.map((name,i)=>({id:'call-'+i,name,arguments:'{}'})),finishReason:'tool-calls'})+'\n'
  return new Response(new ReadableStream({start(c){const bytes=new TextEncoder().encode(raw);for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close()}}),{headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}})
 })
 const messages=[...options.messages,{role:'assistant',content:[{type:'tool-call',id:'prior',name:canonical[0],arguments:'{}'}]},{role:'user',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:'prior',content:[{type:'text',text:'{}'}]}]}]
 const chunks=await collect(a.stream({...options,tools,messages}));assert.deepEqual(chunks.filter(c=>c.type==='tool-call-delta').map(c=>c.name),canonical);assert.equal(calls,1)
})
test('unknown, direct canonical, missing-offer aliases and unregistered history cannot execute',async()=>{
 for(const name of [canonical[0],'fs_administration_leave_submit_v1','fs_administration_leave_context_v2',wire[0].toUpperCase(),wire[1]]){const a=adapter(async()=>response([{id:'invalid',name,arguments:'{}'}]));await assert.rejects(()=>collect(a.stream({...options,tools:tools.slice(0,1)})),e=>e.code==='FUTURESTAFF_CONTRACT')}
 let sent=0;await assert.rejects(()=>collect(adapter(async()=>{sent++;return response([])}).stream({...options,tools:tools.slice(0,1),messages:[...options.messages,{role:'assistant',content:[{type:'tool-call',id:'old',name:canonical[1],arguments:'{}'}]}]})));assert.equal(sent,0)
 for(const name of [...wire,'fs_administration_leave_submit_v1','FS_ADMINISTRATION_LEAVE_CONTEXT_V1'])for(const scope of [undefined,[],['administration'],['administration','erp']]){assert.equal(businessToolAllowed(name,scope),false);assert.equal(templateToolAllowed(name,[name],scope??[]),false)}
})
test('request-local maps are discarded on scope changes, cancellation and subsequent calls',async()=>{
 let release;const pending=new Promise(r=>release=r),controller=new AbortController()
 const a=adapter(async()=>{await pending;return response([{id:'late',name:wire[0],arguments:'{}'}])})
 const running=collect(a.stream({...options,tools:tools.slice(0,1),signal:controller.signal}));await new Promise(r=>setTimeout(r,10));controller.abort();release();await assert.rejects(()=>running)
 for(const scope of [[],['erp'],['administration','erp']]){let offered;const current=adapter(async(_u,init)=>{offered=JSON.parse(init.body).tools;return response([{id:'wrong-scope',name:wire[0],arguments:'{}'}])},scope);await assert.rejects(()=>collect(current.stream({...options,tools})));assert.deepEqual(offered,[])}
})

test('ordinary calls without tools keep the existing transport shape',async()=>{
 let sent=false
 const a=adapter(async(_u,init)=>{sent=true;assert.deepEqual(JSON.parse(init.body).tools,[]);return response([])})
 await collect(a.stream(options));assert.equal(sent,true)
})

test('unregistered administrative history is a typed contract rejection before transport',async()=>{
 let sent=false
 const a=adapter(async()=>{sent=true;return response([])})
 await assert.rejects(()=>collect(a.stream({...options,messages:[...options.messages,{role:'assistant',content:[{type:'tool-call',id:'old',name:canonical[0],arguments:'{}'}]}]})),e=>e.code==='FUTURESTAFF_CONTRACT')
 assert.equal(sent,false)
})
