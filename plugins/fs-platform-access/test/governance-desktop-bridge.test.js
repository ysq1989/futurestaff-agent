import test from 'node:test'
import assert from 'node:assert/strict'
import {identifyCandidates} from '../lib/governance-candidates.js'
import {DesktopIntakeBridge,createIsolatedDesktopIntakeBridge} from '../lib/governance-desktop-bridge.js'

async function fixture(domain='enterprise_knowledge') {
 const owner={tenantId:'tenant-a',actorId:'actor-a'}
 const draft=(await identifyCandidates({owner,activeConversationId:'task-a',conversationId:'task-a',sourceId:'event-1',sourceVersion:'1',authorized:true,text:'公司规定每周一盘点',now:1000}))[0]
 draft.domain=domain;draft.scope={policyId:'p1',policyVersion:'1',purpose:'intake candidate only',audiences:['receiver-a'],validUntil:500000}
 const context={...owner,identityId:'identity-a',desktopSessionId:'desktop-session-a',appId:'desktop-app',appVersion:'1.0',agentId:'agent-a',agentVersion:'2.0',releaseId:'release-1',serverTaskId:'server-task-a',authorizationVersion:'auth-1',hostSessionId:'host-session-a',turn:1,runtimeEpoch:'runtime-a',firstLiveSeq:3,validUntil:500000,grants:[{domain,policyId:'p1',policyVersion:'1',purpose:'intake candidate only',audiences:['receiver-a'],receiver:'private-inbox-a'}]}
 return {draft,context}
}
const pending=reference=>({status:'pending',reference})
const confirmed=(reference,now=1000)=>({status:'confirmed',reference,confirmationId:'confirmation-a',confirmedAt:now,expiresAt:now+200000})
const receipt=(reference,status='received')=>({status,reference})
function adapter(overrides={}) {
 return {kind:'isolated_mock',beginConfirmation:async binding=>confirmed(binding.reference),queryConfirmation:async reference=>confirmed(reference),submit:async submission=>receipt(submission.binding.reference),queryReceipt:async reference=>receipt(reference),cancel:async reference=>receipt(reference,'cancelled'),...overrides}
}
function setup(mock=adapter()) {let now=1000;const bridge=createIsolatedDesktopIntakeBridge(mock,{clock:()=>now});return {bridge,at:value=>{now=value}}}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}

test('desktop bridge is disconnected by default and accepts no client approval method',async()=>{
 const {draft,context}=await fixture(),bridge=new DesktopIntakeBridge({clock:()=>1000})
 bridge.setContext(context);assert.equal((await bridge.prepare(draft)).status,'not_connected')
 assert.equal((await bridge.submit()).status,'not_connected');assert.equal(bridge.approve,undefined)
 assert.throws(()=>createIsolatedDesktopIntakeBridge({kind:'production'}),/INVALID_ISOLATED/)
})

test('complete candidate and Host context binding is immutable; duplicate prepare does not renew',async()=>{
 const {draft,context}=await fixture();let calls=0,seen
 const {bridge,at}=setup(adapter({beginConfirmation:async binding=>{calls++;seen=structuredClone(binding);return confirmed(binding.reference)}}))
 bridge.setContext(context);const first=await bridge.prepare(draft);at(2000);const second=await bridge.prepare(structuredClone(draft))
 assert.equal(first.status,'ready');assert.equal(second.reference.bindingHash,first.reference.bindingHash)
 assert.equal(second.confirmation.expiresAt,201000);assert.equal(calls,1);assert.deepEqual(seen.draft,draft)
 assert.deepEqual(seen.reference.context,context);assert.equal(first.localOnly,true)
 draft.content='edited';assert.notEqual(bridge.getSnapshot().binding.draft.content,draft.content)
 await assert.rejects(bridge.prepare(draft),/PREVIEW_HASH_CONFLICT/)
})

test('domain grants bind purpose policy audiences and receiver without granting source reuse or publishing',async()=>{
 const {draft,context}=await fixture()
 for(const edit of [c=>{c.grants[0].domain='platform_product_feedback'},c=>{c.grants[0].purpose='publish'},c=>{c.grants[0].audiences=['everyone']},c=>{c.grants[0].policyVersion='other'},c=>{c.grants[0].receiver=''}]){
  const {bridge}=setup(),changed=structuredClone(context);edit(changed)
  if(!changed.grants[0].receiver)assert.throws(()=>bridge.setContext(changed),/INVALID_BRIDGE_CONTEXT/)
  else {bridge.setContext(changed);await assert.rejects(bridge.prepare(draft),/BRIDGE_SCOPE_MISMATCH/)}
 }
 const {bridge}=setup();bridge.setContext(context);await bridge.prepare(draft)
 assert.deepEqual(Object.keys(bridge.getSnapshot().confirmation).sort(),['confirmationId','confirmedAt','expiresAt'])
 assert.equal((await bridge.submit()).status,'received')
 assert.equal(bridge.getSnapshot().knowledgePublished,undefined);assert.equal(bridge.getSnapshot().sourceReuseGranted,undefined)
})

test('malformed context or candidate is rejected before any adapter action',async()=>{
 const {draft,context}=await fixture();let calls=0;const {bridge}=setup(adapter({beginConfirmation:async b=>{calls++;return pending(b.reference)}}))
 for(const changed of [{...context,human_confirmed:true},{...context,identityId:''},{...context,validUntil:NaN},{...context,grants:[...context.grants,...context.grants]}])assert.throws(()=>bridge.setContext(changed),/INVALID_BRIDGE_CONTEXT/)
 bridge.setContext(context)
 await assert.rejects(bridge.prepare({...draft,human_confirmed:true}),/INVALID_CANDIDATE/)
 await assert.rejects(bridge.prepare({...draft,owner:{...draft.owner,actorId:'other'}}),/BRIDGE_OWNER_MISMATCH/)
 assert.equal(calls,0)
})

test('pending confirmations can only become ready from matching adapter confirmation',async()=>{
 const {draft,context}=await fixture();let polls=0;const {bridge}=setup(adapter({beginConfirmation:async b=>pending(b.reference),queryConfirmation:async r=>{polls++;return confirmed(r)}}))
 bridge.setContext(context);assert.equal((await bridge.prepare(draft)).status,'awaiting_confirmation')
 await assert.rejects(bridge.submit(),/HUMAN_CONFIRMATION_REQUIRED/)
 assert.equal((await bridge.pollConfirmation()).status,'ready');assert.equal(polls,1)
 assert.equal((await bridge.pollConfirmation()).status,'ready');assert.equal(polls,1)
})

test('wrong hash owner operation domain or extra approval fields fail closed',async()=>{
 for(const change of [r=>{r.reference.bindingHash='0'.repeat(64)},r=>{r.reference.context.actorId='other'},r=>{r.reference.operationId=crypto.randomUUID()},r=>{r.reference.domain='platform_product_feedback'},r=>{r.human_confirmed=true},r=>{r.knowledge_source_reuse=true}]){
  const {draft,context}=await fixture();let submits=0;const {bridge}=setup(adapter({beginConfirmation:async b=>{const result=confirmed(structuredClone(b.reference));change(result);return result},submit:async b=>{submits++;return receipt(b.binding.reference)}}))
  bridge.setContext(context);assert.equal((await bridge.prepare(draft)).status,'revoked');assert.equal(bridge.getSnapshot().binding,null)
  await assert.rejects(bridge.submit(),/HUMAN_CONFIRMATION_REQUIRED/);assert.equal(submits,0)
 }
})

test('five minute local window and confirmation timestamps cannot be extended or replayed',async()=>{
 for(const edit of [r=>{r.expiresAt=301001},r=>{r.confirmedAt=999},r=>{r.confirmedAt=1001},r=>{r.expiresAt=r.confirmedAt},r=>{r.expiresAt=600000}]){
  const {draft,context}=await fixture();const {bridge}=setup(adapter({beginConfirmation:async b=>{const result=confirmed(b.reference);edit(result);return result}}))
  bridge.setContext(context);assert.equal((await bridge.prepare(draft)).status,'revoked')
 }
 const {draft,context}=await fixture();const {bridge,at}=setup();bridge.setContext(context);await bridge.prepare(draft);at(201000)
 assert.equal(bridge.refresh().status,'expired');await assert.rejects(bridge.submit(),/HUMAN_CONFIRMATION_REQUIRED/)
 assert.equal((await bridge.prepare(draft)).status,'expired')
})

test('transport uncertainty only queries original request and never resubmits or rekeys',async()=>{
 const {draft,context}=await fixture();let submits=0,queries=0,original
 const {bridge}=setup(adapter({submit:async b=>{submits++;original=b.binding.reference;throw Error('connection lost')},queryReceipt:async r=>{queries++;assert.deepEqual(r,original);return queries===1?null:receipt(r)}}))
 bridge.setContext(context);await bridge.prepare(draft);assert.equal((await bridge.submit()).status,'unknown')
 assert.equal((await bridge.submit()).status,'unknown');assert.equal(submits,1)
 await assert.rejects(bridge.prepare({...draft,requestId:crypto.randomUUID()}),/ORIGINAL_RECEIPT_QUERY_REQUIRED/)
 assert.equal((await bridge.recover()).status,'unknown');assert.equal((await bridge.recover()).status,'received')
 assert.equal(queries,2);assert.equal(submits,1)
})

test('mismatched receipt stays uncertain and cannot be treated as not received',async()=>{
 const {draft,context}=await fixture();const {bridge}=setup(adapter({submit:async b=>receipt({...b.binding.reference,requestId:crypto.randomUUID()}),queryReceipt:async()=>null}))
 bridge.setContext(context);await bridge.prepare(draft);assert.equal((await bridge.submit()).status,'unknown')
 assert.equal(bridge.getSnapshot().needsQuery,true);assert.equal((await bridge.recover()).status,'unknown')
})

test('same tick duplicate submit and confirmation polls issue one operation',async()=>{
 const {draft,context}=await fixture(),gate=deferred();let submits=0
 const {bridge}=setup(adapter({submit:async b=>{submits++;await gate.promise;return receipt(b.binding.reference)}}));bridge.setContext(context);await bridge.prepare(draft)
 const first=bridge.submit(),second=bridge.submit();assert.equal(bridge.getSnapshot().status,'submitting');gate.resolve();await Promise.all([first,second])
 assert.equal(submits,1);assert.equal(bridge.getSnapshot().status,'received')
})

test('cancel creates stable tombstone before delayed submit and ignores late receipt',async()=>{
 const {draft,context}=await fixture(),gate=deferred();let signal;const cancellations=[]
 const {bridge}=setup(adapter({submit:async(b,s)=>{signal=s;await gate.promise;return receipt(b.binding.reference)},cancel:async(r,id)=>{cancellations.push(id);return receipt(r,'cancelled')}}));bridge.setContext(context);await bridge.prepare(draft)
 const send=bridge.submit();await bridge.cancel();assert.equal(signal.aborted,true);gate.resolve();await send;await bridge.cancel()
 assert.equal(bridge.getSnapshot().status,'cancelled');assert.equal(bridge.getSnapshot().binding,null)
 assert.equal(cancellations.length,2);assert.equal(cancellations[0],cancellations[1]);assert.equal((await bridge.prepare(draft)).status,'cancelled')
})

test('cancel during hash preparation or pending human reply prevents later begin or submit',async()=>{
 for(const duringHash of [true,false]){
  const {draft,context}=await fixture(),gate=deferred(),started=deferred();let calls=0,submits=0
  const {bridge}=setup(adapter({beginConfirmation:async b=>{calls++;started.resolve();await gate.promise;return confirmed(b.reference)},submit:async b=>{submits++;return receipt(b.binding.reference)}}));bridge.setContext(context)
  const preparing=bridge.prepare(draft);if(!duringHash)await started.promise;await bridge.cancel();gate.resolve();await preparing
  assert.equal(bridge.getSnapshot().status,'cancelled');assert.equal(submits,0);if(duringHash)assert.equal(calls,0)
 }
})

test('revocation and every trusted context change clear preview and ignore late confirmation',async()=>{
 const changes=[c=>({...c,tenantId:'other'}),c=>({...c,actorId:'other'}),c=>({...c,identityId:'other'}),c=>({...c,desktopSessionId:'other'}),c=>({...c,appVersion:'2'}),c=>({...c,agentVersion:'3'}),c=>({...c,releaseId:'other'}),c=>({...c,serverTaskId:'other'}),c=>({...c,authorizationVersion:'other'}),c=>({...c,hostSessionId:'other'}),c=>({...c,turn:2}),c=>({...c,runtimeEpoch:'other'}),c=>({...c,firstLiveSeq:4}),()=>null]
 for(const change of changes){
  const {draft,context}=await fixture(),gate=deferred(),started=deferred();let signal
  const {bridge}=setup(adapter({beginConfirmation:async(b,s)=>{signal=s;started.resolve();await gate.promise;return confirmed(b.reference)}}));bridge.setContext(context)
  const preparing=bridge.prepare(draft);await started.promise;bridge.setContext(change(context));assert.equal(signal.aborted,true);gate.resolve();await preparing
  assert.equal(bridge.getSnapshot().status,'revoked');assert.equal(bridge.getSnapshot().binding,null);assert.equal(bridge.getSnapshot().reference,null)
 }
})

test('unknown receipt is hidden from changed account and only exact valid original context may recover',async()=>{
 const {draft,context}=await fixture();let queries=0;const {bridge,at}=setup(adapter({submit:async()=>{throw Error('unknown')},queryReceipt:async r=>{queries++;return receipt(r)}}))
 bridge.setContext(context);await bridge.prepare(draft);await bridge.submit();bridge.setContext({...context,actorId:'other'})
 assert.equal(bridge.getSnapshot().needsQuery,true);assert.equal(bridge.getSnapshot().reference,null)
 await assert.rejects(bridge.recover(),/ORIGINAL_CONTEXT_REQUIRED/);await assert.rejects(bridge.prepare({...draft,owner:{...draft.owner,actorId:'other'},requestId:crypto.randomUUID()}),/ORIGINAL_RECEIPT_QUERY_REQUIRED/)
 bridge.setContext(context);assert.equal((await bridge.recover()).status,'received');assert.equal(queries,1)
 const another=setup(adapter({submit:async()=>{throw Error('unknown')}}));another.bridge.setContext(context);await another.bridge.prepare(draft);await another.bridge.submit();another.at(500000)
 assert.equal(another.bridge.refresh().status,'expired');assert.equal(another.bridge.getSnapshot().needsQuery,true)
 await assert.rejects(another.bridge.recover(),/ORIGINAL_CONTEXT_REQUIRED/)
 at(500000)
})

test('revocation after dispatch keeps uncertainty, blocks new confirmation and does not clear query need',async()=>{
 const {draft,context}=await fixture(),gate=deferred();const {bridge}=setup(adapter({submit:async b=>{await gate.promise;return receipt(b.binding.reference)}}))
 bridge.setContext(context);await bridge.prepare(draft);const send=bridge.submit();bridge.revoke();gate.resolve();await send
 assert.equal(bridge.getSnapshot().status,'revoked');assert.equal(bridge.getSnapshot().needsQuery,true);assert.equal(bridge.getSnapshot().binding,null)
 bridge.setContext(context);await assert.rejects(bridge.prepare(draft),/ORIGINAL_RECEIPT_QUERY_REQUIRED/)
 assert.equal((await bridge.recover()).status,'received')
})

test('domain-qualified references never accept sibling receipt under the same UUID',async()=>{
 const {draft,context}=await fixture();const other=await fixture('platform_product_feedback');other.draft.requestId=draft.requestId
 const {bridge}=setup(adapter({submit:async b=>receipt({...b.binding.reference,domain:'platform_product_feedback'})}));bridge.setContext(context);await bridge.prepare(draft)
 assert.equal((await bridge.submit()).status,'unknown')
 const sibling=setup().bridge;sibling.setContext(other.context);await sibling.prepare(other.draft);assert.equal((await sibling.submit()).status,'received')
 assert.notEqual(sibling.getSnapshot().reference.bindingHash,bridge.getSnapshot().reference.bindingHash)
})

test('malformed context replacement revokes an existing ready confirmation before throwing',async()=>{
 const {draft,context}=await fixture();let submits=0;const {bridge}=setup(adapter({submit:async b=>{submits++;return receipt(b.binding.reference)}}))
 bridge.setContext(context);await bridge.prepare(draft);assert.equal(bridge.getSnapshot().status,'ready')
 assert.throws(()=>bridge.setContext({...context,identityId:''}),/INVALID_BRIDGE_CONTEXT/)
 assert.equal(bridge.getSnapshot().status,'revoked');assert.equal(bridge.getSnapshot().binding,null)
 await assert.rejects(bridge.submit(),/HUMAN_CONFIRMATION_REQUIRED/);assert.equal(submits,0)
})

test('submission carries only the adapter verified bound confirmation and query cannot erase cancellation',async()=>{
 const {draft,context}=await fixture();let sent,cancellationId
 const {bridge}=setup(adapter({submit:async submission=>{sent=structuredClone(submission);throw Error('unknown')},cancel:async(_r,id)=>{cancellationId=id;throw Error('cancel unknown')},queryReceipt:async r=>receipt(r)}))
 bridge.setContext(context);await bridge.prepare(draft);const expected=structuredClone(bridge.getSnapshot().confirmation);await bridge.submit()
 assert.deepEqual(sent.confirmation,expected);assert.deepEqual(sent.binding.draft,draft)
 await bridge.cancel();assert.equal(bridge.getSnapshot().needsQuery,true);assert.equal(bridge.getSnapshot().status,'cancelled')
 assert.equal((await bridge.recover()).status,'cancelled');assert.equal(bridge.getSnapshot().needsQuery,true)
 await assert.rejects(bridge.prepare(draft),/ORIGINAL_RECEIPT_QUERY_REQUIRED/);assert.ok(cancellationId)
})

test('authorization expiry during submit query or cancellation never accepts a late result',async()=>{
 for(const operation of ['submit','recover','cancel']){
  const {draft,context}=await fixture(),gate=deferred(),started=deferred()
  context.validUntil=2000;draft.scope.validUntil=2000
  const delayed=async reference=>{started.resolve();await gate.promise;return receipt(reference,operation==='cancel'?'cancelled':'received')}
  const {bridge,at}=setup(adapter({beginConfirmation:async b=>({...confirmed(b.reference),expiresAt:2000}),submit:async b=>operation==='submit'?delayed(b.binding.reference):Promise.reject(Error('unknown')),queryReceipt:async r=>delayed(r),cancel:async r=>delayed(r)}))
  bridge.setContext(context);await bridge.prepare(draft)
  if(operation!=='submit')await bridge.submit()
  const result=bridge[operation]();await started.promise;at(2000);gate.resolve();await result
  assert.equal(bridge.getSnapshot().status,operation==='cancel'?'cancelled':'expired')
  assert.equal(bridge.getSnapshot().needsQuery,true)
  await assert.rejects(bridge.recover(),/ORIGINAL_CONTEXT_REQUIRED/)
 }
})

test('duplicate pending poll is coalesced and denied confirmation cannot become a local grant',async()=>{
 const {draft,context}=await fixture(),gate=deferred();let polls=0
 const {bridge}=setup(adapter({beginConfirmation:async b=>pending(b.reference),queryConfirmation:async r=>{polls++;await gate.promise;return {status:'denied',reference:r}}}))
 bridge.setContext(context);await bridge.prepare(draft);const one=bridge.pollConfirmation(),two=bridge.pollConfirmation();gate.resolve();await Promise.all([one,two])
 assert.equal(polls,1);assert.equal(bridge.getSnapshot().status,'revoked');await assert.rejects(bridge.submit(),/HUMAN_CONFIRMATION_REQUIRED/)
})

test('context or shorter preview scope expiry during hash prevents beginning any confirmation',async()=>{
 for(const expiry of ['context','scope']){
  const {draft,context}=await fixture();let begins=0
  if(expiry==='context')context.validUntil=2000
  draft.scope.validUntil=2000
  const {bridge,at}=setup(adapter({beginConfirmation:async b=>{begins++;return confirmed(b.reference)}}));bridge.setContext(context)
  const preparing=bridge.prepare(draft);at(2000);assert.equal((await preparing).status,'expired');assert.equal(begins,0)
 }
})

test('invalid evidence hash revokes before transport and terminal same key still rejects changed content',async()=>{
 const {draft,context}=await fixture();let begins=0;const malformed=structuredClone(draft);malformed.evidence[0].sourceHash='0'.repeat(64)
 const {bridge}=setup(adapter({beginConfirmation:async b=>{begins++;return confirmed(b.reference)}}));bridge.setContext(context)
 await assert.rejects(bridge.prepare(malformed),/EVIDENCE_HASH_CONFLICT/);assert.equal(begins,0);assert.equal(bridge.getSnapshot().status,'revoked')
 const completed=setup().bridge;completed.setContext(context);await completed.prepare(draft);await completed.submit()
 assert.equal((await completed.prepare(draft)).status,'received')
 await assert.rejects(completed.prepare({...draft,content:'different content'}),/PREVIEW_HASH_CONFLICT/)
})

test('synchronous subscribers revoke before confirmation submit or query adapter dispatch',async()=>{
 for(const point of ['awaiting_confirmation','submitting','querying']){
  const {draft,context}=await fixture();let begins=0,sends=0,queries=0
  const {bridge}=setup(adapter({beginConfirmation:async b=>{begins++;return confirmed(b.reference)},submit:async()=>{sends++;throw Error('unknown')},queryReceipt:async r=>{queries++;return receipt(r)}}));bridge.setContext(context)
  if(point!=='awaiting_confirmation')await bridge.prepare(draft)
  if(point==='querying')await bridge.submit()
  const unsub=bridge.subscribe(()=>{if(bridge.getSnapshot().status===point)bridge.revoke()})
  if(point==='awaiting_confirmation')await bridge.prepare(draft)
  else if(point==='submitting')await bridge.submit()
  else await bridge.recover()
  unsub();assert.equal(bridge.getSnapshot().status,'revoked');assert.equal(bridge.getSnapshot().binding,null)
  assert.equal(point==='awaiting_confirmation'?begins:point==='submitting'?sends:queries,0)
 }
})

test('cancellation after received remains pending until cancellation or revocation is acknowledged',async()=>{
 const {draft,context}=await fixture();let cancelCalls=0,operation
 const {bridge}=setup(adapter({cancel:async(r,id)=>{cancelCalls++;operation??=id;assert.equal(id,operation);if(cancelCalls===1)throw Error('unknown cancel');return receipt(r,'cancelled')},queryReceipt:async r=>receipt(r)}))
 bridge.setContext(context);await bridge.prepare(draft);await bridge.submit();await bridge.cancel()
 assert.equal(bridge.getSnapshot().status,'cancelled');assert.equal(bridge.getSnapshot().needsQuery,true)
 await bridge.recover();assert.equal(bridge.getSnapshot().status,'cancelled');assert.equal(bridge.getSnapshot().needsQuery,true)
 await assert.rejects(bridge.prepare({...draft,requestId:crypto.randomUUID()}),/ORIGINAL_RECEIPT_QUERY_REQUIRED/)
 await bridge.cancel();assert.equal(bridge.getSnapshot().needsQuery,false);assert.equal(cancelCalls,2)
})
