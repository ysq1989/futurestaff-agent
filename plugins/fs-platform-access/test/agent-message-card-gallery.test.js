import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'

const bundled=await build({entryPoints:[fileURLToPath(new URL('../src/client/agent-message-card-gallery.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm'})
const {agentMessageCardDefinition,agentMessageCardsAt}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const view=(suffix='1')=>({schemaVersion:1,module:'agent-card',kind:'message',viewId:`00000000-0000-4000-8000-${suffix.padStart(12,'0')}`,sessionId:'original-session',title:'下一步计划',expiresAt:2000000000000,data:{title:'下一步计划',actions:[{id:'compare',label:'先做比较'}]}})
const start=()=>agentMessageCardDefinition.start({}, {event:{type:'turn/start',data:{turn:1}}})
const call=(state,id='call-1',name='agent_message_card')=>agentMessageCardDefinition.update({state},{event:{type:'tool/call',data:{callId:id,name}}})
const result=(state,value,id='call-1',seq=5,extra={})=>agentMessageCardDefinition.update({state},{event:{type:'tool/result',seq,data:{message:{source:{callId:id},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(value)}],...extra}]}}}})

test('all successful cards remain independently visible after tool groups collapse',()=>{
 let state=call(start())
 state=result(state,view())
 state=call(state,'call-2')
 state=result(state,view('2'),'call-2',8)
 assert.equal(agentMessageCardsAt(state.items,7).length,1)
 assert.equal(agentMessageCardsAt(state.items,8).length,2)
 assert.equal(state.items[0].meta.snapshot.data.actions[0].label,'先做比较')
 assert.equal(state.items[0].meta.sessionId,'original-session')
 const projection=agentMessageCardDefinition.buildLocationData({state},'turn')
 assert.equal(projection.value.items.length,2)
 assert.equal(agentMessageCardDefinition.buildLocationData({state},'turn',projection),projection)
})

test('replay deduplicates original tool call and view identities',()=>{
 let state=result(call(start()),view())
 const once=state
 state=result(state,view())
 assert.equal(state,once)
 state=call(state,'call-2')
 state=result(state,view(),'call-2',9)
 assert.equal(state.items.length,1)
})

test('unmatched, failed, foreign, executable or malformed results never become cards',()=>{
 const state=call(start())
 for(const [value,id,extra] of [
  [view(),'foreign',{}], [view(),'call-1',{isError:true}],
  [{...view(),module:'shop'},'call-1',{}],
  [{...view(),data:{...view().data,url:'javascript:alert(1)'}},'call-1',{}],
  [{...view(),data:{...view().data,actions:[{id:'compare',label:'x',tool:'erp_write'}]}},'call-1',{}],
 ])assert.equal(result(state,value,id,5,extra),state)
 assert.equal(result(call(start(),'call-1','other_tool'),view()).items.length,0)
})
