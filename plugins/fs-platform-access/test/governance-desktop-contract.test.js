import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseContractJson,canonicalContractJson,hashContractJson,hashContractText,validateLimitedContractSchema,validateContractSchema,validateConsentPayload,validateConsentManifest,checkPayloadMetadata,verifyPayloadMetadata} from '../lib/governance-desktop-contract.js'
const fixture=JSON.parse(readFileSync(new URL('./fixtures/governance-desktop-consent-v1.json',import.meta.url),'utf8'))
const cases=fixture.goldens.cases,clone=value=>structuredClone(value),id='00000000-0000-4000-8000-000000000003'
const context=cases[0].prepare_metadata_only.context,target={request_id:id,domain:cases[0].domain,payload_hash:cases[0].bound_payload_sha256}
const bodies={DesktopContext:context,DesktopProbe:{request_id:id,context},PrepareDesktop:cases[0].prepare_metadata_only,DesktopTarget:{...target,context},RecoveryTarget:target,CancelDesktop:{...target,operation_request_id:id,reason:'user_cancelled'},WebTarget:{request_id:id},WebPreview:{request_id:id,target_hash:'a'.repeat(64)},ConfirmDesktop:{operation_request_id:id,confirmation_id:id,preview_hash:'b'.repeat(64),challenge:'synthetic-challenge',payload:cases[0].human_confirm_payload}}

test('every supplied explicit-preimage canonical UTF8 and SHA256 vector matches without normalization',async()=>{
 for(const vector of [...fixture.goldens.vectors,fixture.bindingGolden]){
  const value=vector.value??vector.input,canonical=canonicalContractJson(value)
  assert.equal(canonical,vector.canonical_utf8)
  if(vector.utf8_hex)assert.equal(Buffer.from(canonical,'utf8').toString('hex'),vector.utf8_hex)
  assert.equal(await hashContractJson(value),vector.sha256)
 }
 assert.notEqual(await hashContractJson({text:'é'}),await hashContractJson({text:'e\u0301'}))
 assert.equal(canonicalContractJson({'2':2,'10':10}),'\u007b"10":10,"2":2}')
})
test('strict JSON rejects duplicate decoded keys numeric float lexemes unsafe integers and lone surrogates',()=>{
 for(const json of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"x":[{"a":1,"a":1}]}','1.0','1e0','-2E1','9007199254740992','"\\ud800"','"\\udfff"','{"x":1,}','01','true false'])assert.throws(()=>parseContractJson(json),undefined,json)
 assert.equal(canonicalContractJson(parseContractJson('{"text":"中文😀","n":2}')),'{"n":2,"text":"中文😀"}')
 assert.equal(canonicalContractJson(parseContractJson('{"__proto__":1}')),'{"__proto__":1}')
})
test('canonical DTO traversal rejects implicit conversions accessors cycles sparse arrays symbols and non-ASCII keys',()=>{
 let conversions=0;const accessor={};Object.defineProperty(accessor,'x',{enumerable:true,get(){conversions++;return 1}})
 const cycle={};cycle.self=cycle
 const symbol={};symbol[Symbol('x')]=1
 for(const value of [1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,undefined,()=>1,new Date(),{toJSON(){conversions++;return {}}},accessor,cycle,[,1],Object.assign([1],{extra:2}),symbol,{'中文':1},{text:'\ud800'}])assert.throws(()=>canonicalContractJson(value))
 assert.equal(conversions,0)
 assert.throws(()=>canonicalContractJson({text:'x'.repeat(60001)}))
})
test('all nine standalone input schemas validate only their exact fields and required values',()=>{
 for(const [name,body]of Object.entries(bodies)){
  assert.deepEqual(validateContractSchema(name,body),body)
  assert.throws(()=>validateContractSchema(name,{...body,human_confirmed:true}),undefined,name)
  const missing=clone(body);delete missing[Object.keys(missing)[0]];assert.throws(()=>validateContractSchema(name,missing),undefined,name)
 }
 assert.throws(()=>validateContractSchema('PrepareDesktop',{...bodies.PrepareDesktop,payload:cases[0].human_confirm_payload}))
 assert.throws(()=>validateContractSchema('DesktopProbe',{request_id:id,context:{...context,agent_version:'bad'}}))
 assert.throws(()=>validateContractSchema('WebTarget',{request_id:id.toUpperCase().replace('000000000003','ABCDEFABCDEF')}))
})
test('finite schema implementation fails closed on unknown keywords formats or refs including unused alternatives',()=>{
 for(const schema of [{type:'string',unknownKeyword:true},{type:'string',format:'email'},{$ref:'#/remote/Anything'},{anyOf:[{type:'string'},{type:'null',unknownKeyword:true}]}])assert.throws(()=>validateLimitedContractSchema(schema,'a'))
 validateLimitedContractSchema({type:'string',maxLength:1},'😀')
 assert.throws(()=>validateLimitedContractSchema({type:'string',maxLength:1},'😀x'))
})
test('UTC dates preserve only no fraction or six digits and reject normalized impossible calendar dates',()=>{
 const schema={type:'string',format:'date-time'}
 for(const date of ['2024-02-29T23:59:59Z','2026-10-26T01:02:03.123456Z'])validateLimitedContractSchema(schema,date)
 for(const date of ['2026-10-26T01:02:03.123Z','2026-02-30T00:00:00Z','2025-02-29T00:00:00Z','2026-10-26T00:00:00+00:00','2026-10-26T24:00:00Z'])assert.throws(()=>validateLimitedContractSchema(schema,date),undefined,date)
})
test('wire payload subset never silently maps rule_summary or self-reported verified sensitive resource evidence',()=>{
 for(const entry of cases){assert.deepEqual(validateConsentPayload(entry.domain,entry.human_confirm_payload),entry.human_confirm_payload)}
 for(const mutate of [p=>{p.basis='rule_summary'},p=>{p.evidence[0].basis='resource_verified'},p=>{p.evidence[0].source.verification_status='verified'},p=>{p.evidence[0].source.kind='resource'},p=>{p.evidence[0].sensitivity='sensitive_allowed'},p=>{p.evidence[0].asset_refs=[{}]},p=>{p.evidence[0].source.resource_app='private-app'},p=>{p.evidence[0].source.opaque_locator='private-locator'},p=>{p.evidence[0].redaction_status='blocked'}]){
  const payload=clone(cases[0].human_confirm_payload);mutate(payload);assert.throws(()=>validateConsentPayload(cases[0].domain,payload))
 }
 const feedback=clone(cases[1].human_confirm_payload);feedback.capability_status='verified_gap';assert.throws(()=>validateConsentPayload(cases[1].domain,feedback))
 const manifest=clone(cases[0].prepare_metadata_only.manifest);manifest.allow_cross_tenant_aggregation=true;assert.throws(()=>validateConsentManifest(manifest))
})
test('golden excerpts evidence and authoritative bound wrapper hashes match',async()=>{
 for(const entry of cases){
  const payload=entry.human_confirm_payload,manifest=entry.prepare_metadata_only.manifest
  for(const evidence of payload.evidence)assert.equal(await hashContractJson(evidence.excerpt),evidence.source.content_hash)
  assert.equal(await hashContractJson(payload.evidence),entry.evidence_sha256)
  const checked=await checkPayloadMetadata(manifest,payload);assert.equal(checked.evidenceHash,entry.evidence_sha256);assert.equal(checked.boundPayloadHashVerified,false)
  assert.equal((await verifyPayloadMetadata(manifest,payload)).payloadHash,entry.bound_payload_sha256)
 }
})
test('metadata cross-checks reject tampered excerpts evidence scope source versions and selected fields',async()=>{
 const sample=cases[0]
 for(const mutate of [p=>{p.evidence[0].excerpt+='changed'},p=>{p.evidence[0].source.content_hash='0'.repeat(64)},p=>{p.scope.purpose='another purpose'}]){
  const payload=clone(sample.human_confirm_payload);mutate(payload);await assert.rejects(checkPayloadMetadata(sample.prepare_metadata_only.manifest,payload))
 }
 for(const mutate of [m=>{m.evidence_manifest_hash='0'.repeat(64)},m=>{m.source_versions[0].version='other'},m=>{m.source_versions.push(clone(m.source_versions[0]))},m=>{m.selected_fields.push('unknown')},m=>{m.selected_fields.push(m.selected_fields[0])},m=>{m.selected_fields.pop()}]){
  const manifest=clone(sample.prepare_metadata_only.manifest);mutate(manifest);await assert.rejects(checkPayloadMetadata(manifest,sample.human_confirm_payload))
 }
})
test('known credential patterns fail before preview; this check is deliberately not general DLP',()=>{
 for(const text of ['-----BEGIN PRIVATE KEY----- synthetic','sk-proj-syntheticfixturecredential000','Authorization: Bearer synthetic-fixture','https://fixture-user:fixture-password@internal.invalid/path','Cookie: session=synthetic-fixture']){
  const payload=clone(cases[0].human_confirm_payload);payload.proposed_content=text;assert.throws(()=>validateConsentPayload(cases[0].domain,payload))
 }
})
