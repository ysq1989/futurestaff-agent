import assert from 'node:assert/strict'
import test from 'node:test'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {Context} from '@deepseek-ai/cordis'
import LlmRuntime,{createUserMessage,createMessage} from '@deepseek-ai/dsh-llm'
import {FutureStaffChatAdapter} from '../lib/chat.js'

// Exercise the shipped desktop compactor without editing the pinned upstream.
const desktop=createRequire(new URL('../../../desktop-shell/dsh-plugin-desktop/package.json',import.meta.url))
const load=async name=>import(pathToFileURL(desktop.resolve('@deepseek-ai/'+name)).href)
const [{default:BasicCompaction},{default:TokenMeter},{default:Projections},{Session}]=await Promise.all(['dsh-compaction-basic','dsh-token-meter','dsh-session-projection','dsh-session'].map(load))
const {agentEvents}=await load('dsh-agent')

for(const model of ['default','10000000-0000-4000-8000-000000000001'])test(`actual compactor resumes a 537 KiB conversation and preserves its durable history (${model})`,async t=>{
 const ctx=new Context();t.after(()=>ctx.fiber.dispose());await ctx.plugin(LlmRuntime)
 new Projections(ctx);new TokenMeter(ctx);ctx.provide('sessions',{flush:async()=>{}})
 const credentials={userId:'a',tenantId:'a',modelId:'10000000-0000-4000-8000-000000000001',accessToken:'synthetic',signal:new AbortController().signal}
 const values=new Map(),requests=[]
 const adapter=new FutureStaffChatAdapter(async()=>credentials,{read:async k=>values.get(k),write:async(k,v)=>values.set(k,v)},async(_url,init)=>{
  const body=JSON.parse(init.body);requests.push(body);assert.ok(Buffer.byteLength(init.body)<=524288)
  const summary=body.messages.at(-1).content.includes('compaction engine')
  return new Response(JSON.stringify({type:'result',content:summary?'## Primary Request and Intent\n- Preserve the synthetic goal and continue.\n## Next Step\n- Resume pending work.':'resumed',toolCalls:[],finishReason:'stop'})+'\n',{headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}})
 },'https://platform.fsstory.net',async()=>[{modelId:credentials.modelId,displayName:'FutureStaff',supportsVision:false}])
 ctx.llm.registerAdapter(['futurestaff'],adapter)
 const session=Session.create('session-synthetic-compaction'),system='Synthetic policy '.repeat(320)
 // Establish the same protected owner receipt that an ordinary first turn saves.
 for await(const _chunk of adapter.stream({provider:'futurestaff',model,sessionId:session.id,messages:[createUserMessage({content:[{type:'text',text:'start'}],source:{kind:'user'}})]})){}
 requests.length=0
 for(let turn=1;turn<=7;turn++){
  session.append('turn/start',{turn})
  session.append('user/message',createUserMessage({content:[{type:'text',text:'u'.repeat(38000)}],source:{kind:'user'}}),{surfaceOp:'append'})
  session.append('step/start',{turn,step:1})
  if(turn===1)session.append('request/header',{header:{config:{provider:'futurestaff',model},system},reason:'initial'})
  session.append('assistant/message',{turn,step:1,message:createMessage({role:'assistant',content:[{type:'text',text:'a'.repeat(38000)}],source:{kind:'model',provider:'futurestaff',model}})},{surfaceOp:'append'})
  session.append('step/end',{turn,step:1});session.append('turn/end',{turn,reason:{kind:'completed'}})
 }
 const originals=Array.from({length:session.seq},(_,seq)=>JSON.stringify(session.eventAt(seq)))
 session.append('turn/start',{turn:8})
 const before=ctx.tokenMeter.measure(session).totalTokens
 assert.ok(before>32768*.8)
 new BasicCompaction(ctx)
 const owner={session,options:{provider:'futurestaff',model}}
 const decision=await agentEvents(ctx,owner).waterfall('agent/pre-step',{messages:[],turn:8,step:1,signal:credentials.signal},()=>Promise.resolve({kind:'enter',messages:[]}))
 assert.equal(decision.kind,'enter');assert.equal(requests.length,1)
 assert.ok(ctx.tokenMeter.measure(session).totalTokens<32768*.8)
 for(let seq=0;seq<originals.length;seq++)assert.equal(JSON.stringify(session.eventAt(seq)),originals[seq])
 assert.ok(session.surface.replaceGeneration>0)
 const chunks=[]
 for await(const chunk of ctx.llm.stream({provider:'futurestaff',model,sessionId:session.id,system,messages:session.deriveMessages()}))chunks.push(chunk)
 assert.equal(chunks.at(-1).reason.kind,'stop');assert.equal(requests.length,2)
 assert.match(requests[1].messages[1].content,/compacted-summary/)
})
