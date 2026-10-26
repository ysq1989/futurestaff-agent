import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as contract from '../lib/governance-desktop-contract.js'
const fixture=JSON.parse(readFileSync(new URL('./fixtures/governance-desktop-cross-language-v1.json',import.meta.url),'utf8'))
const clone=x=>structuredClone(x)

for(const sample of fixture.cases)test(`backend vector: ${sample.name}`,async()=>{
 if(sample.expected_backend.accepted){
  const checked=await contract.verifyPayloadMetadata(sample.manifest,sample.payload)
  assert.equal(checked.payloadHash,sample.manifest.payload_hash)
  assert.equal(checked.evidenceHash,sample.manifest.evidence_manifest_hash)
  assert.equal(checked.boundPayloadHashVerified,true)
 }else await assert.rejects(contract.verifyPayloadMetadata(sample.manifest,sample.payload))
})
for(const sample of fixture.canonical_cases)test(`canonical vector: ${sample.name}`,async()=>{
 const canonical=contract.canonicalContractJson(sample.value)
 assert.equal(canonical,sample.canonical_utf8)
 assert.equal(Buffer.from(canonical,'utf8').toString('hex'),sample.utf8_hex)
 assert.equal(await contract.hashContractJson(sample.value),sample.sha256)
})
for(const sample of fixture.hash_bindings)test(`all binding preimages: ${sample.domain}`,async()=>{
 const manifest=sample.preview_preimage.proposal.manifest
 assert.equal(await contract.boundPayloadHash(manifest,sample.payload_preimage.payload),sample.payload_hash)
 const {request_id,domain,payload_hash,desktop_facts}=sample.target_preimage
 assert.equal(await contract.hashDesktopTarget({request_id,domain,payload_hash},desktop_facts),sample.target_hash)
 assert.equal(await contract.hashDesktopPreview(sample.preview_preimage),sample.preview_hash)
 for(const key of ['actor_id','tenant_id','identity_id','session_id','authority','client_policy_hash']){
  const changed=clone(desktop_facts);changed[key]=key.endsWith('_id')&&key!=='session_id'?'00000000-0000-4000-8000-000000000099':'e'.repeat(64)
  assert.notEqual(await contract.hashDesktopTarget({request_id,domain,payload_hash},changed),sample.target_hash,key)
 }
 for(const key of ['expires_at','source_identity_id','desktop_session_hash']){
  const changed=clone(sample.preview_preimage);changed[key]=key==='expires_at'?'2026-10-26T00:04:00+00:00':key==='source_identity_id'?'00000000-0000-4000-8000-000000000099':'f'.repeat(64)
  assert.notEqual(await contract.hashDesktopPreview(changed),sample.preview_hash,key)
 }
 const extra=clone(sample.preview_preimage);extra.payload=sample.payload_preimage.payload
 await assert.rejects(contract.hashDesktopPreview(extra))
 const elevated=clone(sample.preview_preimage);elevated.agent_query_permission=true
 await assert.rejects(contract.hashDesktopPreview(elevated))
})
test('metadata partial checks preserve source order and refuse duplicate IDs across different versions',async()=>{
 for(const sample of fixture.cases.filter(x=>/source-versions-only-reversed|duplicate-source-different-version/.test(x.name)))
  await assert.rejects(contract.checkPayloadMetadata(sample.manifest,sample.payload),/SOURCE_VERSION/)
})
test('backend nullable-tool and codepoint lengths are retained with explicit narrower Web handoff gate',async()=>{
 const sample=fixture.cases.find(x=>x.domain==='platform_product_feedback'&&x.expected_backend.accepted)
 const emptyTool=clone(sample.payload);emptyTool.versions.tool=''
 assert.equal(contract.validateConsentPayload(sample.domain,emptyTool).versions.tool,'')
 assert.throws(()=>contract.validateWebHandoffCompatibility(sample.domain,emptyTool),/WEB_HANDOFF_EMPTY_TOOL/)
 const emptyStep=clone(sample.payload);emptyStep.repro_steps=['']
 contract.validateConsentPayload(sample.domain,emptyStep)
 assert.throws(()=>contract.validateWebHandoffCompatibility(sample.domain,emptyStep),/WEB_HANDOFF_EMPTY_REPRO_STEP/)
 const unicode=clone(sample.payload);unicode.goal='\u{1f642}'.repeat(800)
 contract.validateConsentPayload(sample.domain,unicode)
 assert.throws(()=>contract.validateWebHandoffCompatibility(sample.domain,unicode),/WEB_HANDOFF_UTF16_LENGTH/)
 contract.validateWebHandoffCompatibility(sample.domain,sample.payload)
})

test('desktop preparation enforces actual opaque source versions without narrowing intake models',()=>{
 const sample=fixture.cases.find(x=>x.expected_backend.accepted), manifest=clone(sample.manifest)
 manifest.source_versions[0].version='synthetic source with spaces'
 contract.validateConsentManifest(manifest)
 const context=fixture.hash_bindings[0].preview_preimage.proposal.context
 assert.throws(()=>contract.validateContractSchema('PrepareDesktop',{request_id:fixture.hash_bindings[0].target_preimage.request_id,context,manifest}),/DESKTOP_SOURCE_VERSION_MUST_BE_OPAQUE/)
})
