import test from 'node:test'
import assert from 'node:assert/strict'
import {identifyCandidates} from '../lib/governance-candidates.js'
import {LocalCandidateOutbox} from '../lib/governance-outbox.js'

const owner={tenantId:'tenant-a',actorId:'actor-a'},other={tenantId:'tenant-b',actorId:'actor-a'}
async function fixture(){return (await identifyCandidates({owner,activeConversationId:'task-a',conversationId:'task-a',sourceId:'s1',sourceVersion:'1',authorized:true,text:'公司规定：保留样品。希望：支持2:3',now:1000}))[0]}
function box(){let now=1000;const queue=new LocalCandidateOutbox(owner,{clock:()=>now});return {queue,advance:()=>{now=301001}}}
test('local intent is domain-specific and disconnected by default; duplicate clicks do not renew confirmation',async()=>{
 const {queue}=box(),draft=await fixture()
 await assert.rejects(queue.confirm(draft),/LOCAL_PERMISSION/)
 queue.setPermission('platform_product_feedback',true)
 await assert.rejects(queue.confirm(draft),/LOCAL_PERMISSION/)
 queue.setPermission(draft.domain,true)
 const first=await queue.confirm(draft),second=await queue.confirm(draft)
 assert.equal(first.previewHash,second.previewHash);assert.equal(first.expiresAt,second.expiresAt);assert.equal(queue.entries.length,1)
 assert.equal(await queue.flush(),'not_connected');assert.equal(queue.entries[0].status,'queued')
 await assert.rejects(queue.confirm({...draft,content:'公司规定已改'}),/HASH_CONFLICT/)
})
test('expired, restored and switched accounts require fresh confirmation and preserve isolated partitions',async()=>{
 const {queue,advance}=box(),draft=await fixture();queue.setPermission(draft.domain,true);await queue.confirm(draft)
 const json=queue.serialize();advance()
 let calls=0;await queue.flush({kind:'isolated_mock',submit:async()=>{calls++;return 'received'},query:async()=>null})
 assert.equal(calls,0);assert.equal(queue.entries[0].status,'expired')
 const restored=box().queue;restored.restore(json);assert.equal(restored.entries[0].status,'needs_confirmation')
 restored.setOwner(other);assert.equal(restored.entries.length,0);restored.restore(json);assert.equal(restored.entries.length,0)
 restored.setOwner(owner);assert.equal(restored.entries[0].status,'needs_confirmation')
 assert.throws(()=>restored.restore('{"schema":2}'),/INVALID_OUTBOX/)
})
test('unknown result recovery queries the original key without replacing or reposting',async()=>{
 const {queue}=box(),draft=await fixture();queue.setPermission(draft.domain,true);await queue.confirm(draft)
 let submits=0,queries=0
 const mock={kind:'isolated_mock',submit:async entry=>{submits++;assert.equal(entry.draft.requestId,draft.requestId);throw Error('uncertain')},query:async entry=>{queries++;assert.equal(entry.draft.requestId,draft.requestId);return 'received'}}
 await queue.flush(mock);assert.equal(queue.entries[0].status,'unknown')
 await queue.flush(mock);assert.equal(queue.entries[0].status,'received');assert.equal(submits,1);assert.equal(queries,1)
})
test('cancellation tombstone defeats delayed submission and cancellation operation id stays stable',async()=>{
 const {queue}=box(),draft=await fixture();queue.setPermission(draft.domain,true);await queue.confirm(draft)
 let finish,started;const ready=new Promise(resolve=>{started=resolve})
 const pending=queue.flush({kind:'isolated_mock',submit:()=>{started();return new Promise(resolve=>{finish=resolve})},query:async()=>null})
 await ready;queue.cancel(draft.domain,draft.requestId)
 const operationId=queue.entries[0].operationId;queue.cancel(draft.domain,draft.requestId);finish('received');await pending
 assert.equal(queue.entries[0].status,'cancelled');assert.equal(queue.entries[0].operationId,operationId)
 await queue.confirm(draft);assert.equal(queue.entries[0].status,'cancelled')
})
test('revocation and switching stop in-flight responses and never overwrite another account',async()=>{
 for(const revoke of [queue=>queue.setPermission('enterprise_knowledge',false),queue=>queue.setOwner(other)]){
  const {queue}=box(),draft=await fixture();queue.setPermission(draft.domain,true);await queue.confirm(draft)
  let finish,signal,started;const ready=new Promise(resolve=>{started=resolve})
  const pending=queue.flush({kind:'isolated_mock',submit:(_entry,s)=>{signal=s;started();return new Promise(resolve=>{finish=resolve})},query:async()=>null})
  await ready;revoke(queue);assert.equal(signal.aborted,true);finish('received');await pending
  queue.setOwner(owner);assert.equal(queue.entries[0].status,'needs_confirmation')
 }
})
test('malformed or conflicting durable records fail before replacing an existing local receipt',async()=>{
 const {queue}=box(),draft=await fixture();queue.setPermission(draft.domain,true);await queue.confirm(draft)
 const malformed=JSON.parse(queue.serialize());malformed.entries[0].expiresAt=draft.scope.validUntil+1
 assert.throws(()=>queue.restore(JSON.stringify(malformed)),/INVALID_OUTBOX/)
 assert.equal(queue.entries[0].status,'queued')
 const conflict=JSON.parse(queue.serialize());conflict.entries[0].previewHash='f'.repeat(64)
 assert.throws(()=>queue.restore(JSON.stringify(conflict)),/HASH_CONFLICT/)
 assert.equal(queue.entries[0].status,'queued')
})
test('cancelling during asynchronous confirmation leaves a durable tombstone that prevents late enqueue',async()=>{
 const {queue}=box(),draft=await fixture();queue.setPermission(draft.domain,true)
 const pending=queue.confirm(draft);queue.cancel(draft.domain,draft.requestId)
 await assert.rejects(pending,/CANCELLED/)
 const saved=queue.serialize(),restored=box().queue;restored.restore(saved);restored.setPermission(draft.domain,true)
 await assert.rejects(restored.confirm(draft),/CANCELLED/)
 const first=JSON.parse(saved).tombstones[0].operationId;restored.cancel(draft.domain,draft.requestId)
 assert.equal(JSON.parse(restored.serialize()).tombstones[0].operationId,first)
 let calls=0;await restored.flush({kind:'isolated_mock',submit:async()=>{calls++;return 'received'},query:async()=>null});assert.equal(calls,0)
})
test('a bounded local queue never produces a snapshot that cannot be restored',async()=>{
 const {queue}=box(),draft=await fixture();queue.setPermission(draft.domain,true)
 for(let i=0;i<100;i++)await queue.confirm({...draft,requestId:crypto.randomUUID()})
 await assert.rejects(queue.confirm({...draft,requestId:crypto.randomUUID()}),/QUEUE_FULL/)
 assert.equal(queue.entries.length,100)
 const restored=box().queue;restored.restore(queue.serialize());assert.equal(restored.entries.length,100)
})
test('orphan cancellation quota fails closed while existing saved entries remain cancellable',async()=>{
 const {queue}=box(),draft=await fixture();queue.setPermission(draft.domain,true);await queue.confirm(draft)
 for(let i=0;i<100;i++)queue.cancel('enterprise_knowledge',crypto.randomUUID())
 assert.throws(()=>queue.cancel('enterprise_knowledge',crypto.randomUUID()),/QUEUE_FULL/)
 queue.cancel(draft.domain,draft.requestId);assert.equal(queue.entries[0].status,'cancelled')
 const restored=box().queue;restored.restore(queue.serialize());assert.equal(restored.entries[0].status,'cancelled')
})
test('cancelling one domain leaves the same request UUID in the other domain untouched',async()=>{
 const {queue}=box(),knowledge=await fixture(),feedback={...knowledge,domain:'platform_product_feedback'}
 queue.setPermission(knowledge.domain,true);queue.setPermission(feedback.domain,true)
 await queue.confirm(knowledge);const firstFeedback=await queue.confirm(feedback)
 queue.cancel(knowledge.domain,knowledge.requestId)
 assert.equal(queue.entries.find(entry=>entry.draft.domain===knowledge.domain).status,'cancelled')
 assert.equal(queue.entries.find(entry=>entry.draft.domain===feedback.domain).status,'queued')
 assert.equal((await queue.confirm(feedback)).operationId,firstFeedback.operationId)
})
test('domain-qualified orphan cancel and dismiss survive restoration without suppressing the sibling domain',async()=>{
 for(const action of ['cancel','dismiss']){
  const {queue}=box(),knowledge=await fixture(),feedback={...knowledge,domain:'platform_product_feedback'}
  queue[action](knowledge.domain,knowledge.requestId)
  const saved=JSON.parse(queue.serialize());assert.equal(saved.tombstones[0].domain,knowledge.domain)
  const restored=box().queue;restored.restore(JSON.stringify(saved));restored.setPermission(knowledge.domain,true);restored.setPermission(feedback.domain,true)
  await assert.rejects(restored.confirm(knowledge),/CANCELLED/);await restored.confirm(feedback)
  assert.equal(restored.entries[0].draft.domain,feedback.domain);assert.equal(restored.entries[0].status,'queued')
  for(const changed of [item=>delete item.domain,item=>{item.domain='unrecognized_domain'}]){
   const invalid=structuredClone(saved);changed(invalid.tombstones[0])
   assert.throws(()=>restored.restore(JSON.stringify(invalid)),/INVALID_OUTBOX/)
   assert.equal(restored.entries[0].status,'queued','malformed domain cannot partly replace the active queue')
  }
 }
})
test('cancelling a queued sibling never aborts the other domain in-flight under the same UUID',async()=>{
 const {queue}=box(),knowledge=await fixture(),feedback={...knowledge,domain:'platform_product_feedback'}
 queue.setPermission(knowledge.domain,true);queue.setPermission(feedback.domain,true)
 await queue.confirm(feedback);await queue.confirm(knowledge)
 let finish,signal,started;const ready=new Promise(resolve=>{started=resolve})
 const pending=queue.flush({kind:'isolated_mock',submit:(_entry,s)=>{signal=s;started();return new Promise(resolve=>{finish=resolve})},query:async()=>null})
 await ready;queue.cancel(knowledge.domain,knowledge.requestId);assert.equal(signal.aborted,false)
 finish('received');await pending
 assert.equal(queue.entries.find(entry=>entry.draft.domain===feedback.domain).status,'received')
 assert.equal(queue.entries.find(entry=>entry.draft.domain===knowledge.domain).status,'cancelled')
})
test('revoking knowledge intent leaves feedback in-flight completable without duplicate submission',async()=>{
 const {queue}=box(),knowledge=await fixture(),feedback={...knowledge,domain:'platform_product_feedback'}
 queue.setPermission(knowledge.domain,true);queue.setPermission(feedback.domain,true)
 await queue.confirm(feedback);await queue.confirm(knowledge)
 let finish,signal,started,submits=0,queries=0;const ready=new Promise(resolve=>{started=resolve})
 const mock={kind:'isolated_mock',submit:(_entry,s)=>{submits++;signal=s;started();return new Promise(resolve=>{finish=resolve})},query:async()=>{queries++;return 'received'}}
 const pending=queue.flush(mock);await ready;queue.setPermission(knowledge.domain,false)
 assert.equal(signal.aborted,false,'the other domain must not abort feedback work')
 finish('received');await pending;await queue.flush(mock)
 assert.equal(queue.entries.find(entry=>entry.draft.domain===feedback.domain).status,'received')
 assert.equal(queue.entries.find(entry=>entry.draft.domain===knowledge.domain).status,'needs_confirmation')
 assert.equal(submits,1);assert.equal(queries,0)
})
test('revoking one domain during another domain confirmation does not invalidate its local user action',async()=>{
 const {queue}=box(),knowledge=await fixture(),feedback={...knowledge,domain:'platform_product_feedback'}
 queue.setPermission(knowledge.domain,true);queue.setPermission(feedback.domain,true)
 const pending=queue.confirm(feedback);queue.setPermission(knowledge.domain,false)
 assert.equal((await pending).status,'queued')
 await assert.rejects(queue.confirm(knowledge),/LOCAL_PERMISSION/)
})
