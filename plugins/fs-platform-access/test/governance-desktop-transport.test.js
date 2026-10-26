import test from 'node:test'
import assert from 'node:assert/strict'
import {
 buildDesktopDescriptor,buildRecoveryStatusDescriptor,buildRecoveryCancellationDescriptor,
 createDesktopRecoveryRecord,decodeDesktopRecoveryRecord,recordCancellationIntent,
 sendDesktopDescriptor,
} from '../lib/governance-desktop-transport.js'

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const trace=id(9)
const owner={tenantId:id(5),actorId:id(6),identityId:id(7)}
const context={agent_id:id(1),agent_version:'a'.repeat(64),agent_release_version:'b'.repeat(64),client_version:'3.3.0',client_task_id:'synthetic-transport-task'}
const target={request_id:id(3),domain:'enterprise_knowledge',payload_hash:'c'.repeat(64)}
const manifest={domain:target.domain,recipient:'tenant_knowledge_intake',purpose:'knowledge_candidate_review',payload_hash:target.payload_hash,evidence_manifest_hash:'d'.repeat(64),scope:{policy_id:id(2),policy_version:1,audiences:['customer'],purpose:'answer_current_task',valid_until:null},source_versions:[{source_id:id(8),version:'statement-1'}],selected_fields:['kind','title','proposed_content','basis','base_version_id','scope','evidence'],privacy_transform_version:'redaction-v1',policy_version:'governance-private-text-v1',allow_cross_tenant_aggregation:false}
const bodies={context:{request_id:target.request_id,context},requests:{request_id:target.request_id,context,manifest},status:target,commit:{...target,context},cancellations:{...target,operation_request_id:id(10),reason:'user_cancelled'}}

test('only five supplied desktop POST operations map to their exact schema and headers',()=>{
 for(const [operation,input] of Object.entries(bodies)){
  const record=createDesktopRecoveryRecord(owner,target)
  const descriptor=operation==='status'?buildRecoveryStatusDescriptor(record,owner,trace):operation==='cancellations'?buildRecoveryCancellationDescriptor(recordCancellationIntent(record,id(10),'user_cancelled'),owner,trace):buildDesktopDescriptor(operation,input,trace)
  assert.equal(descriptor.method,'POST');assert.equal(descriptor.path,`/api/governance/v1/desktop/${operation}`)
  assert.deepEqual(descriptor.headers,{'X-Contract-Version':'1','X-Request-ID':trace,'Idempotency-Key':operation==='cancellations'?id(10):target.request_id})
  assert.deepEqual(descriptor.body,input)
  assert.equal(Object.isFrozen(descriptor),true);assert.equal(Object.isFrozen(descriptor.body),true)
  assert.equal(descriptor.semantic,operation==='commit'?'receipt_replay_only':operation==='cancellations'?'cancellation_intent_only':operation==='status'?'original_target_status':'metadata_only')
 }
})

test('desktop never constructs human approval or payload upload descriptors',()=>{
 for(const operation of ['human/confirm','human/challenges','human/status','human/cancellations','submit','knowledge/candidates','feedback/requests'])assert.throws(()=>buildDesktopDescriptor(operation,bodies.requests,trace),/UNSUPPORTED_DESKTOP_OPERATION/)
 for(const extra of [{payload:{proposed_content:'never transport body'}},{human_confirmed:true},{challenge:'forbidden'},{token:'forbidden'}])assert.throws(()=>buildDesktopDescriptor('requests',{...bodies.requests,...extra},trace))
 assert.throws(()=>buildDesktopDescriptor('commit',{...bodies.commit,payload:{content:'new intake forbidden'}},trace))
})

test('unknown fields credential headers invalid UUID versions and hashes fail before adapter effects',async()=>{
 let calls=0;const adapter={kind:'isolated_mock',send:async()=>{calls++;return {status:'received'}}}
 for(const body of [{...bodies.requests,context:{...context,identityId:owner.identityId}},{...bodies.requests,context:{...context,client_version:'latest'}},{...bodies.requests,manifest:{...manifest,payload_hash:'Z'.repeat(64)}}])assert.throws(()=>buildDesktopDescriptor('requests',body,trace))
 assert.throws(()=>buildDesktopDescriptor('requests',bodies.requests,'trace-not-uuid'))
 const original=buildDesktopDescriptor('requests',bodies.requests,trace)
 for(const change of [d=>{d.headers.Authorization='Bearer forbidden'},d=>{d.path='/api/governance/v1/desktop/human/confirm'},d=>{d.body.payload='forbidden'},d=>{d.semantic='human_approved'},d=>{d.extra=true}]){
  const invalid=structuredClone(original);change(invalid)
  await assert.rejects(sendDesktopDescriptor(invalid,{adapter}))
 }
 assert.equal(calls,0)
})

test('source objects are copied and cannot mutate a descriptor after validation',()=>{
 const input=structuredClone(bodies.requests),descriptor=buildDesktopDescriptor('requests',input,trace)
 input.manifest.recipient='other';input.context.client_task_id='other'
 assert.equal(descriptor.body.manifest.recipient,manifest.recipient)
 assert.equal(descriptor.body.context.client_task_id,context.client_task_id)
})

test('requests enforce supplied private domain policy and known credential metadata fails closed',()=>{
 for(const change of [m=>{m.allow_cross_tenant_aggregation=true},m=>{m.recipient='tenant_feedback_intake'},m=>{m.purpose='product_feedback_triage'},m=>{m.privacy_transform_version='other'},m=>{m.policy_version='other'},m=>{m.source_versions[0].version='authorization:bearer'}]){
  const input=structuredClone(bodies.requests);change(input.manifest)
  assert.throws(()=>buildDesktopDescriptor('requests',input,trace))
 }
 assert.throws(()=>buildDesktopDescriptor('context',{request_id:target.request_id,context:{...context,client_task_id:'authorization:bearer'}},trace))
 const feedback=structuredClone(bodies.requests);feedback.manifest.domain='platform_product_feedback';feedback.manifest.recipient='tenant_feedback_intake';feedback.manifest.purpose='product_feedback_triage';feedback.manifest.selected_fields=['goal','expected','actual','entrypoint','versions','category','subcategory','basis','capability_status','aspect_ratio','pixel_size','repro_steps','evidence']
 assert.equal(buildDesktopDescriptor('requests',feedback,trace).body.manifest.domain,'platform_product_feedback')
})

test('transport defaults disconnected and offers no real adapter or credential options',async()=>{
 const descriptor=buildDesktopDescriptor('requests',bodies.requests,trace)
 assert.deepEqual(await sendDesktopDescriptor(descriptor),{status:'not_connected',dispatched:false})
 let calls=0
 assert.deepEqual(await sendDesktopDescriptor(descriptor,{adapter:{kind:'production',send:async()=>{calls++}}}),{status:'not_connected',dispatched:false})
 assert.equal(calls,0)
})

test('isolated adapter responses remain unverified unknown even when raw value claims received or approval',async()=>{
 const descriptor=buildDesktopDescriptor('requests',bodies.requests,trace);let calls=0
 for(const response of [{status:'received',receipt:{id:'not-reviewed'}},{human_confirmed:true,source_reuse:true,publish:true},null,'received']){
  const result=await sendDesktopDescriptor(descriptor,{adapter:{kind:'isolated_mock',send:async(d,s)=>{calls++;assert.deepEqual(d,descriptor);assert.equal(s.aborted,false);return response}}})
  assert.deepEqual(result,{status:'unknown',dispatched:true,responseValidation:'invalid_response'})
  assert.equal(Object.hasOwn(result,'response'),false);assert.equal(Object.hasOwn(result,'receipt'),false)
 }
 assert.equal(calls,4)
})

test('error abort and late adapter outcome never produce acknowledgement or retain raw data',async()=>{
 const descriptor=buildDesktopDescriptor('commit',bodies.commit,trace),controller=new AbortController();let calls=0
 controller.abort()
 const before=await sendDesktopDescriptor(descriptor,{signal:controller.signal,adapter:{kind:'isolated_mock',send:async()=>{calls++;return {status:'received'}}}})
 assert.deepEqual(before,{status:'unknown',dispatched:false,responseValidation:'aborted'});assert.equal(calls,0)
 const failed=await sendDesktopDescriptor(descriptor,{adapter:{kind:'isolated_mock',send:async()=>{throw Error('response-body-must-not-leak')}}})
 assert.deepEqual(failed,{status:'unknown',dispatched:true,responseValidation:'transport_error'})
 const live=new AbortController();let finish,started
 const ready=new Promise(resolve=>{started=resolve})
 const send=sendDesktopDescriptor(descriptor,{signal:live.signal,adapter:{kind:'isolated_mock',send:async()=>{started();return new Promise(resolve=>{finish=resolve})}}})
 await ready;live.abort();finish({status:'received'});assert.deepEqual(await send,{status:'unknown',dispatched:true,responseValidation:'aborted'})
})

test('metadata recovery record retains original target identity and no task grant body or credential',()=>{
 const record=createDesktopRecoveryRecord(owner,target)
 assert.deepEqual(record,{schema:1,owner,target,cancellation:null})
 assert.deepEqual(decodeDesktopRecoveryRecord(JSON.parse(JSON.stringify(record))),record)
 assert.equal(JSON.stringify(record).includes('client_task_id'),false)
 assert.equal(JSON.stringify(record).includes('context'),false)
 assert.equal(Object.isFrozen(record.target),true)
 for(const invalid of [{...record,payload:'never retain'},{...record,owner:{...owner,token:'never retain'}},{...record,target:{...target,context}},{...record,owner:{...owner,identityId:''}},{...record,schema:2}])assert.throws(()=>decodeDesktopRecoveryRecord(invalid))
})

test('status recovery requires current exact same tenant actor and identity but no old context',()=>{
 const record=createDesktopRecoveryRecord(owner,target)
 const descriptor=buildRecoveryStatusDescriptor(record,owner,trace)
 assert.deepEqual(descriptor.body,target);assert.equal(Object.hasOwn(descriptor.body,'context'),false)
 for(const key of ['tenantId','actorId','identityId']){
  const changed={...owner,[key]:id(42)}
  assert.throws(()=>buildRecoveryStatusDescriptor(record,changed,trace),/RECOVERY_OWNER_MISMATCH/)
 }
 assert.throws(()=>buildRecoveryStatusDescriptor(record,{...owner,context},trace),/INVALID_RECOVERY_OWNER/)
 assert.throws(()=>buildDesktopDescriptor('status',target,trace),/RECOVERY_OWNER_CONTEXT_REQUIRED/)
 assert.throws(()=>buildDesktopDescriptor('cancellations',bodies.cancellations,trace),/RECOVERY_OWNER_CONTEXT_REQUIRED/)
})

test('cancellation intent has stable operation and reason and is never an acknowledgement',()=>{
 const original=createDesktopRecoveryRecord(owner,target)
 assert.throws(()=>buildRecoveryCancellationDescriptor(original,owner,trace),/CANCELLATION_INTENT_REQUIRED/)
 const record=recordCancellationIntent(original,id(10),'user_cancelled')
 assert.deepEqual(recordCancellationIntent(record,id(10),'user_cancelled'),record)
 for(const [operation,reason] of [[id(11),'user_cancelled'],[id(10),'identity_changed']])assert.throws(()=>recordCancellationIntent(record,operation,reason),/CANCELLATION_IDEMPOTENCY_CONFLICT/)
 const descriptor=buildRecoveryCancellationDescriptor(record,owner,trace)
 assert.deepEqual(descriptor.body,bodies.cancellations);assert.equal(descriptor.headers['Idempotency-Key'],id(10))
 assert.equal(record.cancellation.acknowledged,undefined)
 assert.throws(()=>buildRecoveryCancellationDescriptor(record,{...owner,actorId:id(42)},trace),/RECOVERY_OWNER_MISMATCH/)
})

test('metadata replays preserve original request and domain even under different trace ids',()=>{
 const record=createDesktopRecoveryRecord(owner,target),cancelled=recordCancellationIntent(record,id(10),'intent_expired')
 for(const currentTrace of [trace,id(15),id(16)]){
  const status=buildRecoveryStatusDescriptor(cancelled,owner,currentTrace),cancel=buildRecoveryCancellationDescriptor(cancelled,owner,currentTrace)
  assert.equal(status.body.request_id,target.request_id);assert.equal(status.body.domain,target.domain);assert.equal(status.body.payload_hash,target.payload_hash)
  assert.equal(cancel.body.operation_request_id,id(10));assert.equal(cancel.body.request_id,target.request_id)
 }
 assert.throws(()=>decodeDesktopRecoveryRecord({...record,target:{...target,payload_hash:'invalid'}}))
})

test('commit is receipt replay metadata only and sends neither payload nor local human confirmation',async()=>{
 const descriptor=buildDesktopDescriptor('commit',bodies.commit,trace)
 assert.equal(descriptor.semantic,'receipt_replay_only');assert.deepEqual(Object.keys(descriptor.body).sort(),['context','domain','payload_hash','request_id'])
 let calls=0
 const result=await sendDesktopDescriptor(descriptor,{adapter:{kind:'isolated_mock',send:async d=>{calls++;assert.equal(d.semantic,'receipt_replay_only');return {status:'pending'}}}})
 assert.equal(calls,1);assert.equal(result.status,'unknown')
})
