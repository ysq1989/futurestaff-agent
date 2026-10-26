import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:http'

const built=await build({entryPoints:[fileURLToPath(new URL('../src/agent-message-card-host.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm'})
const {mountAgentMessageCards}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
async function bench(t) {
 let route,definition,disposed,owner='tenant:user',policy='default',abort=new AbortController(),received=[]
 const cleanup=[],agent={id:'native-session',followup:input=>{received.push(input)}},active=new Map([[agent.id,agent]])
 const ctx={on:(name,fn)=>{if(name==='agent/disposed')disposed=fn},effect:factory=>{const c=factory();if(typeof c==='function')cleanup.push(c)},
  get:key=>key==='agents'?active:undefined,webServer:{register:r=>{route=r;return()=>{}}},inject:(_deps,callback)=>callback({effect:ctx.effect,tools:{register:d=>{definition=d;return()=>{}}}})}
 mountAgentMessageCards(ctx,async()=>({owner,policy,signal:abort.signal}))
 const server=createServer((req,res)=>route.handler(req,res))
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(async()=>{for(const c of cleanup.reverse())c();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))})
 const origin=`http://127.0.0.1:${server.address().port}`
 const post=async(body,headers={})=>{const r=await fetch(origin+route.path,{method:'POST',headers:{'content-type':'application/json','x-futurestaff-card':'1',...headers},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
 return {definition,agent,received,post,origin,active,route,dispose:()=>disposed({agent}),setOwner:x=>{owner=x},setPolicy:x=>{policy=x},abort:()=>abort.abort()}
}
const options=()=>({title:'请选择下一步',description:'普通 Agent 的通用卡片',actions:[{id:'compare',label:'比较方案'}]})

test('real Host tool and HTTP card answer are fixed to the generating Agent and delivered only once',async t=>{
 const b=await bench(t)
 assert.equal(b.definition.name,'agent_message_card')
 const v=await b.definition.execute(options(),{agent:b.agent,signal:new AbortController().signal})
 assert.equal(b.definition.output.presentationMeta({},v).snapshot.viewId,v.viewId)
 assert.equal(b.received.length,0)
 assert.equal((await b.post({action:'view',viewId:v.viewId,sessionId:v.sessionId})).status,200)
 assert.equal(b.received.length,0)
 const results=await Promise.all(Array.from({length:3},()=>b.post({action:'respond',viewId:v.viewId,sessionId:v.sessionId,actionId:'compare',values:{}})))
 assert.ok(results.every(r=>r.status===200&&r.data.conversationUpdated))
 assert.equal(b.received.length,1)
 assert.match(b.received[0].id,/^futurestaff-card-response-/)
 assert.equal(b.received[0].source.plugin,'futurestaff-message-card')
 assert.equal(JSON.parse(b.received[0].content[0].text).sessionId,b.agent.id)
 assert.match(b.received[0].content[1].text,/不授予业务写权限/)
})

test('same-origin Host route rejects foreign/oversized/forged payloads and identity changes',async t=>{
 const b=await bench(t),v=await b.definition.execute(options(),{agent:b.agent,signal:new AbortController().signal}),base={viewId:v.viewId,sessionId:v.sessionId}
 assert.equal((await b.post({action:'view',...base},{origin:'https://foreign.example'})).status,403)
 assert.equal((await b.post({action:'view',...base},{'x-futurestaff-card':''})).status,403)
 assert.equal((await b.post({action:'view',...base,tenantId:'foreign'})).status,400)
 assert.equal((await b.post({action:'retry',...base,actionId:'new-choice'})).status,400)
 assert.equal((await b.post({action:'respond',...base,actionId:'compare',values:{x:'a'.repeat(65536)}})).status,400)
 b.setOwner('other');assert.equal((await b.post({action:'respond',...base,actionId:'compare',values:{}})).status,403)
 assert.equal(b.received.length,0)
})

test('late disposal cannot message a replacement runtime; retry preserves the original response id',async t=>{
 const b=await bench(t),v=await b.definition.execute(options(),{agent:b.agent,signal:new AbortController().signal}),base={viewId:v.viewId,sessionId:v.sessionId}
 b.active.set(b.agent.id,{id:b.agent.id,followup:()=>assert.fail('foreign runtime')})
 const r=await b.post({action:'respond',...base,actionId:'compare',values:{}})
 assert.equal(r.status,200);assert.equal(r.data.conversationUpdated,false);assert.equal(b.received.length,0)
 b.active.set(b.agent.id,b.agent)
 const retried=await b.post({action:'retry',...base})
 assert.equal(retried.data.conversationUpdated,true)
 assert.equal(retried.data.response.eventId,r.data.response.eventId)
 assert.equal(b.received.length,1)
 b.dispose();assert.equal((await b.post({action:'retry',...base})).data.conversationUpdated,true)
 await assert.rejects(b.definition.execute(options(),{agent:{id:'forged'},signal:new AbortController().signal}),/AGENT_CARD_SESSION_REQUIRED/)
})

test('split UTF-8 HTTP chunks retain the exact Chinese user answer',async t=>{
 const b=await bench(t),v=await b.definition.execute({title:'中文补全',fields:[{id:'note',label:'要求',type:'text'}],actions:[{id:'ok',label:'提交'}]},{agent:b.agent,signal:new AbortController().signal})
 const data=Buffer.from(JSON.stringify({action:'respond',viewId:v.viewId,sessionId:v.sessionId,actionId:'ok',values:{note:'保留中文原回答'}}))
 const request={method:'POST',headers:{'x-futurestaff-card':'1'},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){for(const byte of data)yield Buffer.from([byte])}}
 let result
 await b.route.handler(request,{setHeader(){},end(value){result=JSON.parse(value)}})
 assert.equal(result.response.values.note,'保留中文原回答')
})
