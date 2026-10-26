import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'

async function source(name) {
 const result=await build({entryPoints:[fileURLToPath(new URL('../src/'+name+'.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm'})
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
}
const {AgentMessageCards}=await source('agent-message-cards')
const {parseAgentCardContent,agentMessageCardSnapshot}=await source('agent-message-card-contract')
const content=()=>({title:'确认偏好的方案',facts:[{label:'范围',value:'仅记录偏好'}],fields:[{id:'note',label:'补充要求',type:'text',required:true},{id:'size',label:'尺寸',type:'select',options:[{value:'small',label:'小'}]}],actions:[{id:'send',label:'提交回答'},{id:'cancel',label:'暂不填写',submit:false}]})
function setup() {
 let now=100,owner='tenant:user',policy='binding-a',abort=new AbortController(),calls=[]
 const cards=new AgentMessageCards(async()=>({owner,policy,signal:abort.signal}),async(view)=>{calls.push(structuredClone(view));return true},{now:()=>now,ttlMs:1000})
 return {cards,calls,setOwner:value=>{owner=value},setPolicy:value=>{policy=value},expire:()=>{now+=1001},abort:()=>abort.abort()}
}

test('any authorized Agent can present data-only cards; rendering and rereading do not send a response',async()=>{
 const b=setup(),input=content(),view=await b.cards.present(input,'session')
 assert.equal(view.module,'agent-card');assert.equal(view.expiresAt,1100)
 assert.equal(agentMessageCardSnapshot(view).title,input.title)
 input.title='changed outside';view.data.title='also changed'
 assert.equal((await b.cards.view(view.viewId,'session')).title,'确认偏好的方案')
 assert.equal(b.calls.length,0)
})

test('first answer is immutable; concurrent repeated clicks share one original-session response',async()=>{
 const b=setup(),v=await b.cards.present(content(),'session')
 const results=await Promise.all(Array.from({length:4},()=>b.cards.respond(v.viewId,'session','send',{note:'真实需求',size:'small'})))
 assert.equal(b.calls.length,1);assert.equal(b.calls[0].sessionId,'session')
 assert.equal(new Set(results.map(x=>x.response.eventId)).size,1)
 assert.ok(results.every(x=>x.conversationUpdated===true))
 await assert.rejects(b.cards.respond(v.viewId,'session','cancel',{}),/AGENT_CARD_ALREADY_ANSWERED/)
 assert.equal((await b.cards.view(v.viewId,'session')).response.values.note,'真实需求')
 assert.equal(b.calls.length,1)
})

test('invalid fields, forged choices, cross-session and stale identity never deliver',async()=>{
 const b=setup(),v=await b.cards.present(content(),'session')
 for(const [choice,values] of [['send',{}],['send',{note:'ok',size:'forged'}],['unknown',{note:'ok'}],['cancel',{note:'smuggled'}],['send',{note:'ok',url:'https://example.test'}]])await assert.rejects(b.cards.respond(v.viewId,'session',choice,values),/AGENT_CARD_RESPONSE_INVALID/)
 await assert.rejects(b.cards.respond(v.viewId,'foreign','send',{note:'ok'}),/AGENT_CARD_EXPIRED/)
 b.setOwner('other');await assert.rejects(b.cards.view(v.viewId,'session'),/AGENT_CARD_FORBIDDEN/)
 b.setOwner('tenant:user');b.setPolicy('other');await assert.rejects(b.cards.respond(v.viewId,'session','send',{note:'ok'}),/AGENT_CARD_FORBIDDEN/)
 assert.equal(b.calls.length,0)
})

test('cancel can skip required fields; expired/aborted cards cannot act',async()=>{
 const b=setup(),v=await b.cards.present(content(),'session'),r=await b.cards.respond(v.viewId,'session','cancel',{})
 assert.deepEqual({...r.response.values},{})
 b.expire();await assert.rejects(b.cards.retry(v.viewId,'session'),/AGENT_CARD_EXPIRED/)
 const c=setup(),w=await c.cards.present(content(),'session');c.abort();await assert.rejects(c.cards.respond(w.viewId,'session','cancel',{}))
})

test('unavailable return channel preserves original answer; view is read-only and retry only reuses original event',async()=>{
 let available=false,calls=[],abort=new AbortController()
 const cards=new AgentMessageCards(async()=>({owner:'a',policy:'a',signal:abort.signal}),async v=>{calls.push(v.response.eventId);return available})
 const v=await cards.present({title:'选择',actions:[{id:'a',label:'方案A'}]},'original')
 const r=await cards.respond(v.viewId,'original','a',{})
 assert.equal(r.conversationUpdated,false)
 await cards.view(v.viewId,'original');assert.equal(calls.length,1)
 available=true;assert.equal((await cards.retry(v.viewId,'original')).conversationUpdated,true)
 assert.equal(new Set(calls).size,1)
 await cards.retry(v.viewId,'original');assert.equal(calls.length,2)
 const untouched=await cards.present({title:'仅信息'},'original')
 await assert.rejects(cards.retry(untouched.viewId,'original'),/AGENT_CARD_RESPONSE_REQUIRED/)
})

test('strict content and replay boundaries reject executable targets, malformed forms and oversized data',()=>{
 for(const patch of [{url:'https://example.test'},{html:'<b>x</b>'},{actions:[{id:'a',label:'go',tool:'erp_confirm'}]},{fields:[{id:'password',label:'密码',type:'password'}]},{fields:[{id:'field',label:'空选项',type:'select',options:[]}]},{facts:Array.from({length:13},()=>({label:'a',value:'b'}))},{actions:[{id:'a',label:'A'},{id:'a',label:'B'}]}])assert.throws(()=>parseAgentCardContent({...content(),...patch}),/AGENT_CARD_INPUT_INVALID/)
 const plain=parseAgentCardContent({title:'<script>unsafe()</script>',description:'仅作为文字显示'})
 assert.equal(plain.title,'<script>unsafe()</script>')
 assert.equal(agentMessageCardSnapshot({module:'shop',data:plain}),undefined)
})
