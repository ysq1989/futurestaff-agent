import test from 'node:test'
import assert from 'node:assert/strict'
import {candidateHash} from '../lib/governance-candidates.js'
import {TaskCandidateController,createSyntheticTaskCandidateController,normalizeTaskSessionEvent} from '../lib/governance-task-events.js'
const binding={owner:{tenantId:'tenant-a',actorId:'actor-a'},sessionId:'session-a',taskId:'task-a',turn:3,authorizationVersion:'fixture-auth-v1',firstLiveSeq:10}
const event=(seq,text,extra={})=>({seq,eventId:`fixture-${seq}`,version:String(seq),turn:3,type:'user_statement',source:'user',text,...extra})
const assistant=(seq,text)=>({seq,eventId:`fixture-${seq}`,version:String(seq),turn:3,type:'assistant_message',text,interrupted:false})
const end=seq=>({seq,eventId:`fixture-${seq}`,version:String(seq),turn:3,type:'task_end',outcome:'completed'})
const controller=()=>createSyntheticTaskCandidateController(binding,{clock:()=>1000})

test('default disabled and desktop input stay disconnected',async()=>{
 for(const options of [{},{sourceKind:'desktop_current_task',enabled:true},{sourceKind:'isolated_synthetic'}]){
  const source=new TaskCandidateController(options);source.setBinding(binding)
  assert.equal(await source.accept(event(10,'公司规定：保留七天。')),'ignored');await source.end();assert.equal(source.getSnapshot().eventCount,0);assert.deepEqual(source.getSnapshot().candidates,[])
 }
})
test('raw live text append needs genuine user source and trusted active turn',()=>{
 const context={firstLiveSeq:10,turn:3,activeTurn:3},raw={type:'user/message',seq:10,time:1000,surfaceOp:'append',data:{id:'message-a',role:'user',content:[{type:'text',text:'公司规定：保留七天。'},{type:'image',url:'private-image'}],source:{kind:'user'}}}
 const projected=normalizeTaskSessionEvent(raw,context)
 assert.equal(projected.type,'user_statement');assert.equal(projected.text,'公司规定：保留七天。');assert.equal(projected.version,'10');assert.equal(projected.turn,3);assert.ok(!JSON.stringify(projected).includes('private-image'))
 for(const kind of ['plugin','goal','tool'])assert.equal(normalizeTaskSessionEvent({...raw,data:{...raw.data,source:{kind}}},context),null)
 for(const surfaceOp of ['replace','prepend',{op:'append'},{op:'replace'}])assert.equal(normalizeTaskSessionEvent({...raw,surfaceOp},context),null)
 assert.equal(normalizeTaskSessionEvent({...raw,seq:9},context),null);assert.equal(normalizeTaskSessionEvent(raw,{...context,activeTurn:2}),null)
 for(const type of ['tool/result','raw/chunk','inbox/message','seed'])assert.equal(normalizeTaskSessionEvent({...raw,type},context),null)
})
test('raw interrupted assistant and abnormal task endings do not produce facts',()=>{
 const context={firstLiveSeq:10,turn:3,activeTurn:3},data={turn:3,step:1,message:{role:'assistant',content:[{type:'text',text:'适用哪个部门？'}],source:{kind:'model'}}}
 assert.equal(normalizeTaskSessionEvent({type:'assistant/message',seq:10,data:{...data,interrupted:true}},context),null)
 for(const kind of ['aborted','blocked','error','max-tokens','interrupted'])assert.equal(normalizeTaskSessionEvent({type:'turn/end',seq:11,data:{turn:3,reason:{kind}}},context).outcome,'aborted')
})
test('domain merge minimizes summaries and deduplicates equivalent text from different events',async()=>{
 const source=controller();await source.accept(event(10,'公司规定：保留七天。产品反馈：希望图片工具长期支持2:3。'));await source.accept(event(11,'公司规定： 保留七天。'));await source.accept(event(12,'更正公司规定：保留十四天。'));await source.end()
 const knowledge=source.getSnapshot().candidates.find(item=>item.draft.domain==='enterprise_knowledge'),feedback=source.getSnapshot().candidates.find(item=>item.draft.domain==='platform_product_feedback')
 assert.ok(!knowledge.summary.includes('2:3'));assert.ok(!feedback.summary.includes('七天'));assert.equal(knowledge.draft.evidence.length,2)
 assert.deepEqual(knowledge.sourceEventIds,['fixture-10','fixture-11','fixture-12']);assert.equal(knowledge.origin,'rule_summary');await candidateHash(knowledge.draft)
})
test('question-linked short answers keep only original user evidence and disclose rule inference',async()=>{
 for(const [prelude,question,answer,domain] of [['公司规定：样品保留七天。','适用哪个部门？','仅研发部。','enterprise_knowledge'],['图片工具没有比例选项。','这张海报需要什么比例？','2:3就行。','platform_product_feedback']]){
  const source=controller();await source.accept(event(10,prelude));await source.accept(assistant(11,question));await source.accept(event(12,answer));await source.end();const proposal=source.getSnapshot().candidates[0]
  assert.equal(proposal.draft.domain,domain);assert.equal(proposal.origin,'rule_summary');assert.match(proposal.draft.title,/规则整理/);assert.equal(proposal.draft.verification,'unverified');assert.equal(proposal.draft.basis,'rule_summary')
  assert.equal(proposal.draft.evidence[0].excerpt,prelude);assert.equal(proposal.draft.evidence[1].excerpt,answer);assert.deepEqual(proposal.sourceEventIds,['fixture-10','fixture-12']);await candidateHash(proposal.draft)
 }
})
test('explicit requests complaints and bare corrections are distinguished',async()=>{
 for(const text of ['请图片工具长期支持2:3。','图片工具的这个步骤太慢，不方便。']){
  const source=controller();await source.accept(event(10,text));await source.end();const proposal=source.getSnapshot().candidates[0]
  assert.equal(proposal.origin,'explicit_user');assert.equal(proposal.draft.basis,'explicit_user');assert.equal(proposal.draft.evidence[0].excerpt,text)
 }
 const source=controller();await source.accept(event(10,'公司规定：样品保留七天。'));await source.accept(event(11,'不对，是14天。'));await source.end();const proposal=source.getSnapshot().candidates[0]
 assert.equal(proposal.origin,'rule_summary');assert.equal(proposal.draft.verification,'unverified');assert.equal(proposal.draft.evidence.at(-1).excerpt,'不对，是14天。')
})
test('redaction markers survive memory minimization',async()=>{
 const source=controller();await source.accept(event(10,'公司规定：访问 https://fixture-user:fixture-password@internal.invalid/path。'));await source.end();const proposal=source.getSnapshot().candidates[0]
 assert.equal(proposal.draft.evidence[0].redacted,true);assert.ok(!JSON.stringify(source.getSnapshot()).includes('fixture-password'));await candidateHash(proposal.draft)
})
test('increment gaps and concurrent accepts retain ordering while replay leaves ids and epoch unchanged',async()=>{
 const source=controller(),epoch=source.getSnapshot().epoch
 assert.equal(await source.accept(event(9,'公司规定：旧内容。')),'ignored')
 await Promise.all([source.accept(event(10,'公司规定：保留七天。')),source.accept(event(14,'产品反馈：希望图片工具长期支持2:3。'))])
 assert.equal(await source.accept(event(12,'公司规定：迟到内容。')),'ignored');assert.equal(await source.accept(event(14,'产品反馈：希望图片工具长期支持2:3。')),'duplicate')
 assert.equal(source.getSnapshot().candidates.length,0);await source.accept(end(20));await source.end();assert.equal(source.getSnapshot().candidates.length,2)
 const snapshot=source.getSnapshot();assert.equal(snapshot.epoch,epoch);await source.accept(end(20));await source.end();assert.equal(source.getSnapshot(),snapshot)
})
test('content version id and seq conflicts block pending work and event identity cannot be self-reported',async()=>{
 for(const conflict of [event(10,'公司规定：改为十四天。'),event(10,'公司规定：保留七天。',{eventId:'other'}),event(11,'公司规定：保留七天。',{eventId:'fixture-10'}),event(10,'公司规定：保留七天。',{version:'new'}),{...event(11,'公司规定：自报身份。'),owner:{tenantId:'forged',actorId:'forged'}}]){
  const source=controller();await source.accept(event(10,'公司规定：保留七天。'));const first=source.accept(conflict),late=source.accept(event(25,'希望：迟到不得恢复。'))
  assert.equal(await first,'blocked');assert.equal(await late,'ignored');await source.end();assert.equal(source.getSnapshot().candidates.length,0);assert.equal(source.getSnapshot().status,'blocked')
 }
})
test('closing sequence prevents already queued late messages from entering task results',async()=>{
 const source=controller();await source.accept(event(10,'公司规定：保留七天。'))
 const finished=source.accept(end(11)),late=source.accept(event(12,'希望：结束后不得出现的反馈。'))
 await finished;assert.equal(await late,'ignored');await source.end()
 assert.deepEqual(source.getSnapshot().candidates.map(item=>item.draft.domain),['enterprise_knowledge'])
})
test('task cancellation events clear both pending summaries and ready cards immediately',async()=>{
 for(const ready of [false,true])for(const cancellation of [{...end(20),outcome:'aborted'},{seq:20,eventId:'cancel-20',version:'20',turn:3,type:'task_cancel'}]){
  const source=controller();await source.accept(event(10,'公司规定：保留七天。'));const work=source.end();if(ready)await work
  const epoch=source.getSnapshot().epoch,pending=source.accept(cancellation);assert.equal(source.getSnapshot().candidates.length,0);assert.ok(source.getSnapshot().epoch>epoch)
  assert.equal(await pending,'accepted');await work;assert.equal(source.getSnapshot().status,'cancelled');assert.equal(source.getSnapshot().candidates.length,0)
 }
})
test('binding identity task session permission and disposal transitions invalidate pending accepts',async()=>{
 for(const action of [source=>source.setBinding({...binding,owner:{tenantId:'tenant-b',actorId:'actor-b'}}),source=>source.setBinding({...binding,taskId:'task-b'}),source=>source.setBinding({...binding,sessionId:'session-b'}),source=>source.revoke(),source=>source.cancel(),source=>source.setEnabled(false),source=>source.dispose()]){
  const source=controller(),epoch=source.getSnapshot().epoch,pending=source.accept(event(10,'公司规定：保留七天。'));action(source);assert.ok(source.getSnapshot().epoch>epoch)
  await pending;await source.end();assert.equal(source.getSnapshot().candidates.length,0)
 }
})
test('dismissal suppresses one domain across pending summary and repeated end',async()=>{
 const source=controller();await source.accept(event(10,'公司规定：保留七天。产品反馈：希望图片工具长期支持2:3。'));const pending=source.end();source.dismiss('enterprise_knowledge');await pending
 assert.deepEqual(source.getSnapshot().candidates.map(item=>item.draft.domain),['platform_product_feedback'])
 source.dismiss('platform_product_feedback');const snapshot=source.getSnapshot();await source.end();assert.equal(source.getSnapshot(),snapshot)
})
test('saved evidence namespaces distinguish trusted sessions tasks and authorization revisions at the same seq',async()=>{
 const ids=[],versions=[]
 for(const change of [{},{sessionId:'session-b'},{taskId:'task-b'},{authorizationVersion:'fixture-auth-v2'}]){
  const source=createSyntheticTaskCandidateController({...binding,...change},{clock:()=>1000});await source.accept(event(10,'公司规定：保留七天。'));await source.end()
  const evidence=source.getSnapshot().candidates[0].draft.evidence[0];assert.ok(evidence.sourceId.length<=200);assert.match(evidence.sourceId,/^s:session-/);assert.match(evidence.sourceId,/\|t:task-/)
  assert.match(evidence.sourceVersion,/local-seq:10;auth:/);ids.push(evidence.sourceId);versions.push(evidence.sourceVersion)
 }
 assert.equal(new Set(ids).size,4);assert.notEqual(versions[0],versions[3])
})
test('equivalent binding and event key ordering never reopen a dismissed task',async()=>{
 const source=controller(),first=event(10,'公司规定：保留七天。');await source.accept(first)
 assert.equal(await source.accept({text:first.text,source:first.source,type:first.type,turn:first.turn,version:first.version,eventId:first.eventId,seq:first.seq}),'duplicate')
 await source.end();source.dismiss('enterprise_knowledge');const snapshot=source.getSnapshot()
 source.setBinding({firstLiveSeq:10,authorizationVersion:'fixture-auth-v1',turn:3,taskId:'task-a',sessionId:'session-a',owner:{actorId:'actor-a',tenantId:'tenant-a'}})
 assert.equal(source.getSnapshot(),snapshot);await source.end();assert.equal(source.getSnapshot().candidates.length,0)
})
test('one-task ratios preferences and ungrounded clarification answers never become product or enterprise claims',async()=>{
 for(const text of ['2:3 就行。','这次海报用2:3即可。','希望这次做成2:3。','本次图片需要2:3。','不对，这次用2:3。']){
  const source=controller();await source.accept(assistant(10,'这张海报需要什么比例？'));await source.accept(event(11,text));await source.end();assert.equal(source.getSnapshot().candidates.length,0,text)
 }
 const source=controller();await source.accept(assistant(10,'这次内容适用哪个区域？'));await source.accept(event(11,'仅华东地区。'));await source.end();assert.equal(source.getSnapshot().candidates.length,0)
})
test('unsupported ratio or missing option is unverified feedback without an automatic bug classification',async()=>{
 for(const text of ['图片工具无法生成2:3。','实际：图片制作没有比例选项。']){
  const source=controller();await source.accept(event(10,text));await source.end();const proposal=source.getSnapshot().candidates[0]
  assert.equal(proposal.draft.domain,'platform_product_feedback');assert.equal(proposal.draft.verification,'unverified');assert.equal(proposal.origin,'explicit_user');assert.equal('category' in proposal.draft,false)
 }
})
test('only explicit long-term brand standards suggest knowledge and do not include one-off preferences',async()=>{
 const source=controller();await source.accept(event(10,'我们品牌长期固定使用2:3作为统一海报标准。希望这次画面清爽一点。'));await source.end()
 const proposal=source.getSnapshot().candidates[0];assert.equal(source.getSnapshot().candidates.length,1);assert.equal(proposal.draft.domain,'enterprise_knowledge')
 assert.match(proposal.draft.content,/品牌长期/);assert.ok(!proposal.draft.evidence[0].excerpt.includes('清爽'));await candidateHash(proposal.draft)
})
test('short-answer evidence preserves same-domain user context without copying another domain',async()=>{
 const source=controller();await source.accept(event(10,'公司规定：样品保留七天。图片工具没有比例选项。'));await source.accept(assistant(11,'这张海报需要什么比例？'));await source.accept(event(12,'2:3 就行。'));await source.end()
 const feedback=source.getSnapshot().candidates.find(item=>item.draft.domain==='platform_product_feedback'),knowledge=source.getSnapshot().candidates.find(item=>item.draft.domain==='enterprise_knowledge')
 assert.equal(feedback.draft.evidence.length,2);assert.ok(feedback.draft.evidence[0].excerpt.includes('没有比例选项'));assert.equal(feedback.draft.evidence[1].excerpt,'2:3 就行。')
 assert.ok(!JSON.stringify(feedback.draft.evidence).includes('样品'));assert.ok(!JSON.stringify(knowledge.draft.evidence).includes('比例选项'));assert.ok(!knowledge.draft.content.includes('2:3'))
})
test('natural company rules with bounded modifiers retain their explicit enterprise meaning',async()=>{
 for(const text of ['更正：我们公司的长期交接规定仍需双人复核。','我们企业的现行内部交接流程要求双人复核。']){
  const source=controller();await source.accept(event(10,text));await source.end()
  assert.equal(source.getSnapshot().candidates.length,1,text)
  const proposal=source.getSnapshot().candidates[0];assert.equal(proposal.draft.domain,'enterprise_knowledge');assert.equal(proposal.origin,'explicit_user');assert.equal(proposal.draft.evidence[0].excerpt,text)
 }
})
test('one-task brand dimensions override uniform or fixed wording and never suggest durable knowledge',async()=>{
 for(const text of ['这次品牌海报统一使用2:3尺寸。','本次品牌图固定用2:3。']){
  const source=controller();await source.accept(event(10,text));await source.end();assert.equal(source.getSnapshot().candidates.length,0,text)
 }
})
test('domain clauses are selected before extraction so long-term and feedback 2:3 never inherit one-task 4:5',async()=>{
 for(const [necessary,preference,domain] of [['我们品牌长期固定使用2:3作为统一海报标准。','这次适用4:5画幅。','enterprise_knowledge'],['产品反馈：图片工具没有2:3比例选项。','这次希望做4:5。','platform_product_feedback']]){
  const source=controller();await source.accept(event(10,necessary+preference));await source.end()
  assert.equal(source.getSnapshot().candidates.length,1)
  const proposal=source.getSnapshot().candidates[0];assert.equal(proposal.draft.domain,domain);assert.equal(proposal.draft.aspectRatio,'2:3')
  assert.equal(proposal.draft.content,necessary);assert.equal(proposal.draft.evidence[0].excerpt,necessary)
  for(const text of [proposal.draft.content,proposal.summary,JSON.stringify(proposal.draft.evidence)]){assert.ok(text.includes('2:3'));assert.ok(!text.includes('4:5'));assert.ok(!text.includes('这次'))}
  await candidateHash(proposal.draft)
 }
})
