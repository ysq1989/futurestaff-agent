import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {FutureStaffChatAdapter,chatOwnerKey} from '../lib/chat.js'
import {semanticAliases,semanticToolNames,semanticWireNames} from '../lib/semantic-contract.generated.js'
const origin='https://platform.fsstory.net',modelId='10000000-0000-4000-8000-000000000001'
const signal=new AbortController().signal,identity={userId:'synthetic-member',tenantId:'synthetic-tenant',signal}
const options={provider:'futurestaff',model:'default',sessionId:'semantic-test',messages:[{role:'user',content:[{type:'text',text:'查询合成数据'}],source:{kind:'user'}}]}
const tools=semanticToolNames.map(name=>({name,description:name,parameters:{type:'object',properties:{}}}))
const collect=async stream=>{const result=[];for await(const chunk of stream)result.push(chunk);return result}
const response=toolCalls=>new Response(JSON.stringify({type:'result',content:'',toolCalls,finishReason:toolCalls.length?'tool-calls':'stop'})+'\n',{headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}})
function adapter(fetcher,scope=['ecommerce-demo']){const data=new Map([[chatOwnerKey(origin,options.sessionId),JSON.stringify({userId:identity.userId,tenantId:identity.tenantId})]]);return new FutureStaffChatAdapter(async()=>({...identity,modelId,accessToken:'synthetic-token'}),{read:async key=>data.get(key),write:async(key,value)=>data.set(key,value)},fetcher,origin,async()=>[],async()=>({agentId:'20000000-0000-4000-8000-000000000002',version:'a'.repeat(64),businessSystems:scope,modelPolicy:{primaryModelId:modelId,fallbackModelId:null},identity,signal}))}
test('semantic canonical/wire source is explicit and generated without alias drift',async()=>{
 const producer=JSON.parse(await readFile(new URL('./fixtures/semantics/semantic_tool_aliases.v1.json',import.meta.url),'utf8'))
 assert.deepEqual(semanticAliases,producer.tools)
 for(const name of semanticWireNames)assert.match(name,/^[A-Za-z0-9_-]{1,64}$/)
})
test('production model adapter sends safe function names/history and returns canonical calls',async()=>{
 const a=adapter(async(_url,init)=>{const body=JSON.parse(init.body);assert.deepEqual(body.tools.map(t=>t.name),semanticWireNames);assert.equal(body.messages[1].toolCalls[0].name,semanticWireNames[0]);return response(semanticWireNames.map((name,i)=>({id:'call-'+i,name,arguments:'{}'})))})
 const messages=[...options.messages,{role:'assistant',content:[{type:'tool-call',id:'prior',name:semanticToolNames[0],arguments:'{}'}]},{role:'user',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:'prior',content:[{type:'text',text:'{}'}]}]}]
 const chunks=await collect(a.stream({...options,tools,messages}));assert.deepEqual(chunks.filter(c=>c.type==='tool-call-delta').map(c=>c.name),semanticToolNames)
})
test('unoffered aliases, canonical responses and unknown semantic versions fail closed',async()=>{
 for(const name of [semanticToolNames[0],semanticWireNames[1],'semantics_query_sql_v1','SEMANTICS_RESOLVE_V1'])await assert.rejects(()=>collect(adapter(async()=>response([{id:'bad',name,arguments:'{}'}])).stream({...options,tools:tools.slice(0,1)})))
 for(const scope of [[],['erp'],['administration'],['ecommerce-demo','erp']]){let offered;const a=adapter(async(_u,init)=>{offered=JSON.parse(init.body).tools;return response([{id:'bad',name:semanticWireNames[0],arguments:'{}'}])},scope);await assert.rejects(()=>collect(a.stream({...options,tools})));assert.deepEqual(offered,[])}
})
