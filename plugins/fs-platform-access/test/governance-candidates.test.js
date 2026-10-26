import test from 'node:test'
import assert from 'node:assert/strict'
import {identifyCandidates,candidateHash,sanitizeCandidateText,decodeCandidateDraft} from '../lib/governance-candidates.js'
import {createSyntheticTaskCandidateController} from '../lib/governance-task-events.js'

const source={owner:{tenantId:'tenant-a',actorId:'actor-a'},activeConversationId:'task-a',conversationId:'task-a',sourceId:'statement-a',sourceVersion:'v1',authorized:true,text:'公司规定：样品保留七天。目标：生成海报；期望：支持2:3；实际：没有该选项；入口：图片工具',now:1000}
test('only explicitly authorized current excerpts produce two separate local candidate domains',async()=>{
 await assert.rejects(identifyCandidates({...source,authorized:false}),/AUTHORIZATION/)
 await assert.rejects(identifyCandidates({...source,conversationId:'other'}),/AUTHORIZATION/)
 const drafts=await identifyCandidates(source)
 assert.deepEqual(drafts.map(d=>d.domain),['enterprise_knowledge','platform_product_feedback'])
 assert.equal(drafts[1].aspectRatio,'2:3');assert.equal(drafts[1].pixelSize,null)
 assert.equal(drafts[1].basis,'explicit_user');assert.equal(drafts[1].verification,'reported')
 assert.equal(drafts[1].expected,'支持2:3');assert.equal(drafts[1].actual,'没有该选项')
 assert.deepEqual(drafts[1].assetRefs,[]);assert.equal(drafts[1].scope.policyId,'not_connected')
 assert.equal('category' in drafts[1],false,'missing option is not automatically a bug classification')
 assert.ok(!drafts[0].content.includes('目标')&&!drafts[0].content.includes('2:3'))
 assert.ok(!drafts[1].content.includes('样品')&&!drafts[1].evidence[0].excerpt.includes('公司规定'))
 assert.equal(drafts[0].evidence[0].excerpt,drafts[0].content)
 assert.notEqual(drafts[0].evidence[0].sourceHash,drafts[1].evidence[0].sourceHash)
})
test('credentials and personal contacts never survive the necessary evidence preview',async()=>{
 const text='公司规定 password=fixture-password api_key=fixture-key-1234567890 sk-fixture-secret-12345678 联系人 sample@example.invalid 13800138000'
 const [draft]=await identifyCandidates({...source,text})
 assert.equal(draft.evidence[0].redacted,true)
 const json=JSON.stringify(draft)
 for(const denied of ['fixture-password','fixture-key-1234567890','sk-fixture','sample@','13800138000'])assert.ok(!json.includes(denied))
 assert.equal(sanitizeCandidateText('普通的样品规则').redacted,false)
})
test('local preview digest binds content scope recipients purpose and evidence version',async()=>{
 const [draft]=await identifyCandidates(source),original=await candidateHash(draft)
 for(const change of [d=>d.content+='新',d=>d.scope.purpose+='新',d=>d.scope.audiences=['另一个接收方'],d=>d.evidence[0].sourceVersion='v2']){
  const edited=structuredClone(draft);change(edited);assert.notEqual(await candidateHash(edited),original)
 }
 assert.equal(await candidateHash(structuredClone(draft)),original)
 assert.throws(()=>decodeCandidateDraft({...draft,rawChat:'not allowed'}),/FIELDS/)
 await assert.rejects(candidateHash({...draft,content:'password=do-not-save'}),/SENSITIVE/)
})
test('changed evidence text requires its own digest and never silently reuses the original evidence hash',async()=>{
 const [draft]=await identifyCandidates(source)
 draft.evidence[0].excerpt='一段未经确认的替换依据'
 await assert.rejects(candidateHash(draft),/EVIDENCE_HASH/)
})
test('necessary excerpts are capped at 600 characters before evidence hashing and candidate construction',async()=>{
 const [draft]=await identifyCandidates({...source,text:'公司规定：'+ '合成说明'.repeat(300)})
 assert.equal(draft.evidence[0].excerpt.length,600);assert.equal(draft.content.length,600)
 assert.equal((await candidateHash(draft)).length,64)
})
test('URL credentials and HTTP credential header lines are redacted before local persistence',async()=>{
 const text='公司规定：连接 https://fixture-user:fixture-password@internal.invalid/path 与 postgresql://fixture-db:fixture-db-secret@db.invalid/data\nCookie: session=fixture-cookie; csrf=fixture-csrf\nSet-Cookie: session=fixture-setcookie\nAuthorization: Custom fixture-auth-secret'
 const minimized=sanitizeCandidateText(text)
 for(const secret of ['fixture-user','fixture-password','fixture-db','fixture-db-secret','fixture-cookie','fixture-csrf','fixture-setcookie','fixture-auth-secret'])assert.ok(!minimized.text.includes(secret),secret)
 const [draft]=await identifyCandidates({...source,text})
 assert.ok(!JSON.stringify(draft).includes('fixture-password'))
 assert.equal(draft.evidence[0].redacted,true)
 assert.equal(sanitizeCandidateText(minimized.text).text,minimized.text,'redaction is stable on edited previews')
})

const phoneShapedUuid='00000000-0000-4000-8000-a13800138000'
const safeUuid='00000000-0000-4000-8000-000000000001'
const technicalBase=async()=>{const [draft]=await identifyCandidates(source);draft.requestId=safeUuid;return draft}

test('valid request UUIDs remain technical identifiers when their random suffix resembles a phone number',async()=>{
 const draft=await technicalBase();draft.requestId=phoneShapedUuid
 assert.equal(sanitizeCandidateText(phoneShapedUuid).redacted,true,'the original prose PII rule remains in force')
 assert.equal(decodeCandidateDraft(draft).requestId,phoneShapedUuid)
 assert.equal((await candidateHash(draft)).length,64)
})

test('real SHA256 evidence digest with a phone-shaped decimal run survives decoding and still binds the exact excerpt',async()=>{
 const text='公司规定：合成样品按批次复核 105。'
 const [draft]=await identifyCandidates({...source,text});draft.requestId=safeUuid
 assert.equal(draft.evidence[0].sourceHash,'51f15500187940f661aa2fdf90f5ec55ed1aacefbc9dcf3fb1750a45d490a00f')
 assert.equal(sanitizeCandidateText(draft.evidence[0].sourceHash).redacted,true)
 assert.equal(decodeCandidateDraft(draft).evidence[0].sourceHash,draft.evidence[0].sourceHash)
 assert.equal((await candidateHash(draft)).length,64)
 const changed=structuredClone(draft);changed.evidence[0].sourceHash='a'.repeat(64)
 await assert.rejects(candidateHash(changed),/EVIDENCE_HASH_CONFLICT/)
})

test('strict UUIDs in owner, policy and source identifier fields do not become prose or authorize new scope',async()=>{
 for(const change of [
  draft=>{draft.owner.tenantId=phoneShapedUuid},draft=>{draft.owner.actorId=phoneShapedUuid},
  draft=>{draft.scope.policyId=phoneShapedUuid},draft=>{draft.scope.policyVersion=phoneShapedUuid},
  draft=>{draft.evidence[0].sourceId=phoneShapedUuid},draft=>{draft.evidence[0].sourceVersion=phoneShapedUuid},
 ]){const draft=await technicalBase();change(draft);assert.deepEqual(decodeCandidateDraft(draft),draft);assert.equal((await candidateHash(draft)).length,64)}
})

test('technical identifier handling never bypasses prose, free-form source, PII, credential or malformed UUID/hash checks',async()=>{
 const original=await technicalBase()
 for(const change of [
  draft=>{draft.content='用户电话 13800138000'},draft=>{draft.title='联系 sample@example.invalid'},
  draft=>{draft.evidence[0].excerpt='Bearer fixture-secret'},draft=>{draft.scope.purpose='api_key=fixture-secret'},
  draft=>{draft.owner.tenantId='13800138000'},draft=>{draft.owner.actorId='actor-'+phoneShapedUuid},
  draft=>{draft.scope.policyId='policy-'+phoneShapedUuid},draft=>{draft.scope.policyVersion='password=fixture-secret'},
  draft=>{draft.evidence[0].sourceId='source-'+phoneShapedUuid},draft=>{draft.evidence[0].sourceVersion='source-'+phoneShapedUuid},
  draft=>{draft.content=phoneShapedUuid},draft=>{draft.scope.audiences=[phoneShapedUuid]},
 ]){const draft=structuredClone(original);change(draft);assert.throws(()=>decodeCandidateDraft(draft),/SENSITIVE/)}
 for(const change of [
  draft=>{draft.requestId=phoneShapedUuid+'x'},draft=>{draft.requestId=' '+safeUuid},draft=>{draft.requestId='request-13800138000'},
  draft=>{draft.evidence[0].sourceHash='a'.repeat(63)},draft=>{draft.evidence[0].sourceHash='g'.repeat(64)},draft=>{draft.evidence[0].sourceHash='A'.repeat(64)},
 ]){const draft=structuredClone(original);change(draft);assert.throws(()=>decodeCandidateDraft(draft))}
})

const phoneShapedHash='51f15500187940f661aa2fdf90f5ec55ed1aacefbc9dcf3fb1750a45d490a00f'
const taskSourceId=(seq='10',session='session-a',task='task-a')=>`s:${session}|t:${task}|e:${seq}|h:${phoneShapedHash}`
const taskSourceVersion=(seq='10')=>`local-seq:${seq};auth:${phoneShapedHash}`

test('only exact Host task source formats treat canonical sequence numbers and bounded hex digests as technical data',async()=>{
 for(const seq of ['0','10','13800138000','9007199254740991']){
  const draft=await technicalBase();draft.evidence[0].sourceId=taskSourceId(seq,'session-a',phoneShapedUuid);draft.evidence[0].sourceVersion=taskSourceVersion(seq)
  assert.equal(decodeCandidateDraft(draft).evidence[0].sourceId,draft.evidence[0].sourceId)
  assert.equal((await candidateHash(draft)).length,64)
 }
})

test('a real current task producer can retain its phone-shaped authorization hash without weakening evidence checks',async()=>{
 const task=createSyntheticTaskCandidateController({owner:source.owner,sessionId:'session-a',taskId:'task-a',turn:3,authorizationVersion:'fixture-auth-255',firstLiveSeq:10},{clock:()=>1000})
 try{
  await task.accept({seq:10,eventId:'fixture-10',version:'10',turn:3,type:'user_statement',source:'user',text:'公司规定：保留七天。'})
  await task.end()
  const draft=task.getSnapshot().candidates[0].draft
  assert.equal(draft.evidence[0].sourceVersion,'local-seq:10;auth:2a680f6e9f42d50aee06687a43ed17542103735d771a39d9eb47c1bc91a69781')
  assert.equal(sanitizeCandidateText(draft.evidence[0].sourceVersion).redacted,true)
  assert.equal((await candidateHash(draft)).length,64)
 }finally{task.dispose()}
})

test('Host source exceptions are field-specific, byte-bounded and cannot carry arbitrary PII or credential text',async()=>{
 const original=await technicalBase()
 const bounded=structuredClone(original);bounded.evidence[0].sourceId=taskSourceId('10','会'.repeat(20)+'s'.repeat(20),'话é'+'t'.repeat(38))
 assert.equal(new TextEncoder().encode(bounded.evidence[0].sourceId).byteLength,200)
 assert.equal(decodeCandidateDraft(bounded).evidence[0].sourceId,bounded.evidence[0].sourceId)
 const oversized=structuredClone(bounded);oversized.evidence[0].sourceId=taskSourceId('10','会'.repeat(20)+'s'.repeat(20),'话éé'+'t'.repeat(37))
 assert.equal(new TextEncoder().encode(oversized.evidence[0].sourceId).byteLength,201)
 assert.throws(()=>decodeCandidateDraft(oversized),/INVALID_CANDIDATE_EVIDENCE/)
 for(const value of [
  taskSourceId('01'),taskSourceId('-1'),taskSourceId('9007199254740992'),taskSourceId('10000000000000000'),
  taskSourceId()+'|extra:1',taskSourceId().replace('|h:','|hash:'),taskSourceId().replace('|e:10','|e:1e1'),
  taskSourceId('10','电话13800138000'),taskSourceId('10','sample@example.invalid'),taskSourceId('10','session-a','api_key=fixture-secret'),
  taskSourceId('10','s'.repeat(41)),taskSourceId('10','会'.repeat(40),'话'.repeat(40)),taskSourceId('10','line\nbreak'),
  taskSourceId().replace(phoneShapedHash,phoneShapedHash.toUpperCase()),taskSourceId().replace(phoneShapedHash,phoneShapedHash+'g'),
 ]){const draft=structuredClone(original);draft.evidence[0].sourceId=value;assert.throws(()=>decodeCandidateDraft(draft),value)}
 for(const value of [taskSourceVersion('01'),taskSourceVersion('-1'),taskSourceVersion('9007199254740992'),taskSourceVersion()+';extra:1',taskSourceVersion().replace(';auth:',';token:'),taskSourceVersion().replace('local-seq:','source-seq:'),taskSourceVersion().replace(phoneShapedHash,phoneShapedHash.toUpperCase()),'local-seq:10;auth:Bearer fixture-secret']){
  const draft=structuredClone(original);draft.evidence[0].sourceVersion=value;assert.throws(()=>decodeCandidateDraft(draft),value)
 }
 for(const change of [draft=>{draft.owner.tenantId=taskSourceId()},draft=>{draft.scope.policyId=taskSourceId()},draft=>{draft.scope.policyVersion=taskSourceVersion()},draft=>{draft.content=taskSourceVersion()}]){
  const draft=structuredClone(original);change(draft);assert.throws(()=>decodeCandidateDraft(draft),/SENSITIVE/)
 }
})

test('reserved Host source prefixes reject malformed grammar even when the digest contains no PII-shaped digits',async()=>{
 const original=await technicalBase(),hash='a'.repeat(64)
 for(const value of [
  `s:session-a|t:task-a|e:01|h:${hash}`,`s:session-a|t:task-a|e:-1|h:${hash}`,`s:session-a|t:task-a|e:1e1|h:${hash}`,
  `s:session-a|t:task-a|e:10|h:${'g'.repeat(64)}`,`s:session-a|t:task-a|e:10|h:${'a'.repeat(63)}`,
  `s:session-a|t:task-a|e:10|h:${hash}|extra:1`,'s:legacy-looking',
 ]){const draft=structuredClone(original);draft.evidence[0].sourceId=value;assert.throws(()=>decodeCandidateDraft(draft),/INVALID_CANDIDATE_EVIDENCE/)}
 for(const value of [
  `local-seq:01;auth:${hash}`,`local-seq:-1;auth:${hash}`,`local-seq:1e1;auth:${hash}`,
  `local-seq:10;auth:${'g'.repeat(64)}`,`local-seq:10;auth:${hash};extra:1`,'local-seq:legacy-looking',
 ]){const draft=structuredClone(original);draft.evidence[0].sourceVersion=value;assert.throws(()=>decodeCandidateDraft(draft),/INVALID_CANDIDATE_EVIDENCE/)}
 assert.deepEqual(decodeCandidateDraft(original),original,'ordinary existing labels remain compatible')
})
