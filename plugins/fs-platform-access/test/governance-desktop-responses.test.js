import test from 'node:test'
import assert from 'node:assert/strict'
import {parseDesktopResponse} from '../lib/governance-desktop-responses.js'
import {buildDesktopDescriptor, createDesktopRecoveryRecord, recordCancellationIntent, buildRecoveryStatusDescriptor, sendDesktopDescriptor, mergeDesktopRecoveryResponse} from '../lib/governance-desktop-transport.js'
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const hash='c'.repeat(64), targetHash='d'.repeat(64)
const owner={tenantId:id(5),actorId:id(6),identityId:id(7)}
const target={request_id:id(3),domain:'enterprise_knowledge',payload_hash:hash}
const record=createDesktopRecoveryRecord(owner,target)
const descriptor=buildRecoveryStatusDescriptor(record,owner,id(9))
const receipt={...target,status:'received',resource_id:id(11),consent_receipt_id:id(12),received_at:'2026-10-26T04:00:00.123456+00:00',revision:1}
const pending={...target,server_task_id:id(10),task_authorization_revision:1,authority_source:'none',action:'desktop.intake.consent',target_hash:targetHash,status:'pending',expires_at:'2026-10-26T04:05:00+00:00',receipt:null,formal_knowledge_permission:false,agent_query_permission:false,expired:false}
const received={...pending,status:'received',authority_source:'explicit_web_single_candidate_approval',receipt}
const cancelled={...pending,status:'cancelled',receipt:{...receipt,status:'revoked',revision:2}}
const wire=(value,extra={})=>({statusCode:200,contentType:'application/json',body:JSON.stringify(value),...extra})
test('exact current-source public responses parse and preserve receipt status revoked',()=>{
 for(const value of [pending,received,cancelled,{...cancelled,receipt:null}]){
  const parsed=parseDesktopResponse(descriptor,wire(value))
  assert.deepEqual(parsed,{kind:'target',value});assert.equal(Object.isFrozen(parsed.value),true)
 }
 assert.equal(parseDesktopResponse(descriptor,wire(cancelled)).value.receipt.status,'revoked')
})
test('receipt or authorization claims require complete matching public and receipt fields',()=>{
 for(const change of [v=>v.receipt.revoked=true,v=>delete v.server_task_id,v=>v.request_id=id(90),v=>v.domain='platform_product_feedback',v=>v.payload_hash='a'.repeat(64),v=>v.receipt.request_id=id(90),v=>v.receipt.domain='platform_product_feedback',v=>v.receipt.payload_hash='a'.repeat(64),v=>v.formal_knowledge_permission=true,v=>v.agent_query_permission=true,v=>v.task_authorization_revision=2,v=>v.authority_source='none',v=>v.receipt=null,v=>v.receipt.resource_id='not-uuid',v=>v.receipt.revision=0,v=>v.receipt.received_at='2026-02-30T04:00:00+00:00',v=>v.extra='private text']){
  const value=structuredClone(received);change(value);assert.throws(()=>parseDesktopResponse(descriptor,wire(value)))
 }
 for(const status of ['confirmed','committing','cancelling','revoked','unknown'])assert.throws(()=>parseDesktopResponse(descriptor,wire({...pending,status})))
 assert.throws(()=>parseDesktopResponse(descriptor,wire({...cancelled,receipt:{...receipt,status:'received'}})))
 assert.throws(()=>parseDesktopResponse(descriptor,wire({...pending,receipt})))
})
test('status flag and operation-specific terminal states are enforced',()=>{
 assert.throws(()=>parseDesktopResponse(descriptor,wire({...pending,expired:undefined})))
 const context={agent_id:id(1),agent_version:'a'.repeat(64),agent_release_version:'b'.repeat(64),client_version:'3.3.0',client_task_id:'synthetic'}
 const commit=buildDesktopDescriptor('commit',{...target,context},id(9))
 const {expired,...publicPending}=pending
 assert.throws(()=>parseDesktopResponse(commit,wire(publicPending)))
 const {expired:_,...publicReceived}=received
 assert.equal(parseDesktopResponse(commit,wire(publicReceived)).value.status,'received')
})
test('raw JSON boundary rejects duplicate keys nonJSON errors unknown HTTP and extra envelope fields',()=>{
 for(const value of [received,wire(received,{statusCode:500}),wire(received,{statusCode:202}),wire(received,{contentType:'text/html'}),wire(received,{body:'<!doctype html>private failure'}),wire(received,{body:JSON.stringify(received).replace('"status":"received"','"status":"pending","status":"received"')}),wire(received,{secret:'never retain'}),wire({detail:{code:'DESKTOP_REQUEST_EXPIRED',retryable:false}},{statusCode:410})])assert.throws(()=>parseDesktopResponse(descriptor,value))
})
test('known server target binding mismatch fails and context response never grants authority',()=>{
 assert.throws(()=>parseDesktopResponse(descriptor,wire(received),{server_task_id:id(90),target_hash:targetHash}))
 assert.throws(()=>parseDesktopResponse(descriptor,wire(received),{server_task_id:id(10),target_hash:'a'.repeat(64)}))
 const context=buildDesktopDescriptor('context',{request_id:id(3),context:{agent_id:id(1),agent_version:'a'.repeat(64),agent_release_version:'b'.repeat(64),client_version:'3.3.0',client_task_id:'synthetic'}},id(9))
 const value={channel:'desktop_candidate_intake',actor_id:owner.actorId,tenant_id:owner.tenantId,policy_id:id(2),scope_policy_version:1,policy_version:'governance-private-text-v1',privacy_transform_version:'redaction-v1',audiences:['customer','employee','internal','partner','recruiting'],purposes:['answer_current_task'],client_version_attested:false,task_authorization:'requires_web_single_candidate_approval',formal_knowledge_permission:false,agent_query_permission:false}
 assert.deepEqual(parseDesktopResponse(context,wire(value)),{kind:'context',value})
 assert.throws(()=>parseDesktopResponse(context,wire({...value,client_version_attested:true})))
 assert.throws(()=>parseDesktopResponse(context,wire({...value,audiences:['customer','customer']})))
})
test('isolated transport parses reviewed envelope while default remains disconnected and abort discards late body',async()=>{
 assert.deepEqual(await sendDesktopDescriptor(descriptor),{status:'not_connected',dispatched:false})
 const valid=await sendDesktopDescriptor(descriptor,{adapter:{kind:'isolated_mock',send:async()=>wire(received)}})
 assert.equal(valid.status,'validated');assert.equal(valid.response.value.receipt.status,'received')
 for(const response of [wire(received,{statusCode:500}),wire(received,{body:'nonJSON'}),{status:'received'}]){
  const result=await sendDesktopDescriptor(descriptor,{adapter:{kind:'isolated_mock',send:async()=>response}})
  assert.equal(result.status,'unknown');assert.equal(Object.hasOwn(result,'response'),false)
 }
 const controller=new AbortController()
 const result=await sendDesktopDescriptor(descriptor,{signal:controller.signal,adapter:{kind:'isolated_mock',send:async()=>{controller.abort();return wire(received)}}})
 assert.equal(result.status,'unknown');assert.equal(Object.hasOwn(result,'response'),false)
})
test('recovery applies same key receipts without losing cancellation intent or terminal cancellation',()=>{
 const intent=recordCancellationIntent(record,id(15),'user_cancelled')
 const first=mergeDesktopRecoveryResponse(intent,owner,received)
 assert.equal(first.status,'cancellation_pending');assert.deepEqual(first.record,intent)
 const stopped=mergeDesktopRecoveryResponse(intent,owner,cancelled,first.response)
 assert.equal(stopped.status,'cancelled');assert.equal(stopped.response.receipt.status,'revoked')
 const late=mergeDesktopRecoveryResponse(intent,owner,received,stopped.response)
 assert.equal(late.status,'cancelled');assert.equal(late.response.receipt.status,'revoked')
 assert.throws(()=>mergeDesktopRecoveryResponse(intent,{...owner,tenantId:id(90)},received))
 assert.throws(()=>mergeDesktopRecoveryResponse(intent,owner,{...received,target_hash:'a'.repeat(64)},received))
})
test('cancellation before prepare accepts the server tombstone hash without fabricating desktop facts',()=>{
 const intent=recordCancellationIntent(record,id(15),'user_cancelled')
 const tombstone={...cancelled,server_task_id:id(40),target_hash:'b'.repeat(64),receipt:null,expired:true}
 const observation=mergeDesktopRecoveryResponse(intent,owner,tombstone)
 assert.equal(observation.status,'cancelled');assert.equal(observation.response.target_hash,'b'.repeat(64))
 assert.deepEqual(observation.record.target,target)
 const response=parseDesktopResponse(descriptor,wire(tombstone))
 assert.equal(response.value.receipt,null)
})
test('actual nullable receipt fields remain null without invented identifiers',()=>{
 const value={...received,receipt:{...receipt,resource_id:null,consent_receipt_id:null}}
 const parsed=parseDesktopResponse(descriptor,wire(value))
 assert.equal(parsed.value.receipt.resource_id,null);assert.equal(parsed.value.receipt.consent_receipt_id,null)
})
test('late pending cannot regress an observed durable receipt',()=>{
 const observation=mergeDesktopRecoveryResponse(record,owner,pending,received)
 assert.equal(observation.status,'received');assert.equal(observation.response.receipt.status,'received')
})
test('stale cancellation cannot remove revoked receipt or lower its revision',()=>{
 const newer={...cancelled,receipt:{...cancelled.receipt,revision:3}}
 for(const stale of [{...cancelled,receipt:null},cancelled,received,pending]){
  const observation=mergeDesktopRecoveryResponse(record,owner,stale,newer)
  assert.equal(observation.status,'cancelled');assert.equal(observation.response.receipt.status,'revoked');assert.equal(observation.response.receipt.revision,3)
 }
 const conflict={...cancelled,receipt:{...cancelled.receipt,resource_id:id(99)}}
 assert.throws(()=>mergeDesktopRecoveryResponse(record,owner,conflict,cancelled),/RECOVERY_RECEIPT_CONFLICT/)
})
