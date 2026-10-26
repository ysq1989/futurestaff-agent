import test from 'node:test'
import assert from 'node:assert/strict'
import {identifyCandidates} from '../lib/governance-candidates.js'
import {inspectCandidateDraftCompatibility} from '../lib/governance-desktop-draft-compatibility.js'

const now=Date.parse('2026-10-26T04:30:00Z')
async function draft(domain='enterprise_knowledge') {
 const drafts=await identifyCandidates({owner:{tenantId:'fixture-tenant',actorId:'fixture-member'},activeConversationId:'fixture-task',conversationId:'fixture-task',sourceId:'fixture-task:excerpt',sourceVersion:'1',text:domain==='enterprise_knowledge'?'公司规定：品牌海报长期统一采用2:3。':'目标：制作海报；期望：支持2:3；实际：没有比例选项；入口：海报。',authorized:true,now})
 return drafts.find(item=>item.domain===domain)
}
test('existing local candidate stays local and returns explicit provenance policy and confirmation requirements',async()=>{
 const candidate=await draft(),before=structuredClone(candidate),result=inspectCandidateDraftCompatibility(candidate,now)
 assert.equal(result.status,'local_only');assert.equal(result.canSubmit,false);assert.equal(result.desktopConfirmation,'not_connected')
 for(const code of ['trusted_task_identity','trusted_policy','complete_source_provenance','wire_hash_rebind','web_confirmation','domain_payload_fields'])assert.ok(result.requirements.includes(code),code)
 assert.ok(result.localIssues.includes('noncanonical_source_id'));assert.deepEqual(candidate,before)
 assert.equal('payload'in result,false);assert.equal('manifest'in result,false)
 assert.equal(JSON.stringify(result).includes(candidate.content),false)
})
test('UUID-shaped local owner and source and filled fields never become authorization or a wire migration',async()=>{
 const candidate=await draft('platform_product_feedback')
 candidate.owner={tenantId:'00000000-0000-4000-8000-000000000001',actorId:'00000000-0000-4000-8000-000000000002'}
 candidate.evidence[0].sourceId='00000000-0000-4000-8000-000000000003'
 candidate.versions={application:'1.0.0',client:'1.0.0',agent:'1.0.0',tool:''}
 const result=inspectCandidateDraftCompatibility(candidate,now)
 assert.equal(result.canSubmit,false);assert.ok(!result.localIssues.includes('noncanonical_source_id'))
 assert.ok(!result.localIssues.includes('missing_feedback_fields'));assert.ok(result.requirements.includes('complete_source_provenance'))
 assert.ok(result.requirements.includes('domain_payload_fields'));assert.ok(result.requirements.includes('web_confirmation'))
})
test('local summary needs explicit review and duplicate source identifiers are never merged or reassigned',async()=>{
 const candidate=await draft();candidate.basis='rule_summary';candidate.evidence.push(structuredClone(candidate.evidence[0]))
 const result=inspectCandidateDraftCompatibility(candidate,now)
 assert.ok(result.requirements.includes('local_summary_review'));assert.ok(result.localIssues.includes('duplicate_source_id'))
 assert.equal(candidate.basis,'rule_summary');assert.equal(candidate.evidence.length,2)
})
test('stale local scope and incomplete feedback fields remain actionable local review issues',async()=>{
 const candidate=await draft('platform_product_feedback');candidate.scope.validUntil=now;candidate.versions.application='';candidate.expected=''
 const result=inspectCandidateDraftCompatibility(candidate,now)
 assert.ok(result.localIssues.includes('expired_local_scope'));assert.ok(result.localIssues.includes('missing_feedback_fields'))
 assert.equal(result.canSubmit,false)
})
test('malformed or sensitive local records fail closed with a content-free result',async()=>{
 const candidate=await draft();candidate.content='Authorization: Bearer fixture-only'
 const result=inspectCandidateDraftCompatibility(candidate,now)
 assert.equal(result.status,'invalid_local_draft');assert.equal(result.canSubmit,false)
 assert.deepEqual(result.localIssues,['invalid_local_draft']);assert.ok(!JSON.stringify(result).includes('fixture-only'))
 assert.equal(inspectCandidateDraftCompatibility(null,now).status,'invalid_local_draft')
})
