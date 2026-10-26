import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {candidateHash,identifyCandidates} from '../lib/governance-candidates.js'
import {canonicalContractJson,boundPayloadHash,hashContractText} from '../lib/governance-desktop-contract.js'
import {CandidateConsentHost,mountCandidateConsent} from '../lib/governance-desktop-window-host.js'
const wires=JSON.parse(readFileSync(new URL('./fixtures/governance-desktop-consent-v1.json',import.meta.url),'utf8')).goldens.cases
const owner={tenantId:'00000000-0000-4000-8000-000000000001',actorId:'00000000-0000-4000-8000-000000000002'},now=Date.parse('2026-10-26T00:00:00Z'),handle='00000000-0000-4000-8000-000000000009'
async function fixture(domain='enterprise_knowledge',ratio=undefined){
 const auth=new AbortController(),task=new AbortController();let context={...owner,sessionId:'task-session',taskBinding:'host-agent-release-v1',signal:auth.signal}
 const wire=wires.find(sample=>sample.prepare_metadata_only.manifest.domain===domain)
 const draft=(await identifyCandidates({owner,activeConversationId:'task-session',conversationId:'task-session',sourceId:'s',sourceVersion:'1',text:domain==='enterprise_knowledge'?'公司规定：交接双人复核。':'期望：生成2:3宣传图；实际：无法找到比例选项。',authorized:true,now}))[0]
 const prepare=structuredClone(wire.prepare_metadata_only),payload=structuredClone(wire.human_confirm_payload)
 prepare.manifest.scope.valid_until='2026-10-26T00:04:00Z'
 if(domain==='enterprise_knowledge')payload.scope=structuredClone(prepare.manifest.scope)
 else{payload.versions.tool='synthetic-tool-v1';if(ratio!==undefined)payload.aspect_ratio=ratio}
 prepare.manifest.payload_hash=await boundPayloadHash(prepare.manifest,payload)
 const scope=prepare.manifest.scope
 Object.assign(draft,{basis:payload.basis,scope:{policyId:scope.policy_id,policyVersion:String(scope.policy_version),audiences:scope.audiences,purpose:scope.purpose,validUntil:Date.parse(scope.valid_until)},evidence:await Promise.all(payload.evidence.map(async e=>({sourceId:e.source.source_id,sourceVersion:e.source.version,sourceHash:await hashContractText(e.excerpt),excerpt:e.excerpt,redacted:e.redaction_status==='redacted',kind:'user_statement'})))},domain==='enterprise_knowledge'?{title:payload.title,content:payload.proposed_content,knowledgeKind:payload.kind}:{goal:payload.goal,expected:payload.expected,actual:payload.actual,entrypoint:payload.entrypoint,versions:structuredClone(payload.versions),aspectRatio:payload.aspect_ratio?`${payload.aspect_ratio.width}:${payload.aspect_ratio.height}`:'',content:`目标：${payload.goal}；期望：${payload.expected}；实际：${payload.actual}；入口：${payload.entrypoint}。`})
 const target={request_id:prepare.request_id,domain:prepare.manifest.domain,payload_hash:prepare.manifest.payload_hash}
 const grant={handle,draft,taskBinding:context.taskBinding,sessionId:context.sessionId,prepare,payloadJson:canonicalContractJson(payload),server:{...target,server_task_id:handle,task_authorization_revision:1,authority_source:'none',action:'desktop.intake.consent',target_hash:'a'.repeat(64),status:'pending',expires_at:'2026-10-26T00:05:00+00:00',receipt:null,formal_knowledge_permission:false,agent_query_permission:false},signal:task.signal}
 let phase='opening',opens=0,cancels=0
 const policy={platformOrigin:'https://platform.invalid',handoffOrigin:'http://127.0.0.1:43120'}
 const provider={authoritySignal:new AbortController().signal,nativeWindowPolicy:()=>policy,list:async()=>[grant]}
 const runtime={openCandidateConsent:(input,onState)=>{opens++;phase='awaiting_web';onState(phase);return{state:()=>phase,cancel:()=>{cancels++;phase='cancelled';onState(phase)}}}}
 const host=new CandidateConsentHost({provider:()=>provider,runtime:()=>runtime,authorize:async()=>context,now:()=>now})
 return{host,grant,context,auth,task,provider,runtime,opens:()=>opens,cancels:()=>cancels,setPhase:x=>{phase=x},rebind:taskBinding=>{context={...context,taskBinding};grant.taskBinding=taskBinding},hash:await candidateHash(draft)}
}
test('default absent provider is closed without identity calls or body',async()=>{let calls=0;const host=new CandidateConsentHost({provider:()=>undefined,runtime:()=>undefined,authorize:async()=>{calls++;throw Error('private')}});assert.deepEqual(await host.list('session'),{status:'not_connected',candidates:[]});assert.equal(calls,0)})
test('Host lists only matching current task metadata then opens the actual native adapter once',async()=>{const f=await fixture(),listed=await f.host.list('task-session');assert.equal(listed.candidates[0].previewHash,f.hash);assert.equal(JSON.stringify(listed).includes('交接'),false);const [a,b]=await Promise.all([f.host.open('task-session',handle),f.host.open('task-session',handle)]);assert.equal(a.state,'awaiting_web');assert.equal(b.state,'awaiting_web');assert.equal(f.opens(),1);f.host.dispose()})
test('feedback ratio matches its exact local string and transfers the unchanged canonical body',async()=>{
 const f=await fixture('platform_product_feedback'),original=f.grant.payloadJson
 try{
  assert.equal(f.grant.draft.aspectRatio,'2:3')
  assert.equal((await f.host.list('task-session')).status,'ready')
  let transferred;const open=f.runtime.openCandidateConsent;f.runtime.openCandidateConsent=(request,changed)=>{transferred=request.payloadJson;return open(request,changed)}
  assert.equal((await f.host.open('task-session',handle)).state,'awaiting_web')
  assert.equal(transferred,original);assert.equal(f.grant.payloadJson,original)
 }finally{f.host.dispose()}
})
test('feedback null ratio matches an empty local ratio without adding wire dimensions',async()=>{
 const f=await fixture('platform_product_feedback',null)
 try{assert.equal(f.grant.draft.aspectRatio,'');assert.equal((await f.host.list('task-session')).status,'ready');assert.equal((await f.host.open('task-session',handle)).state,'awaiting_web');assert.equal(JSON.parse(f.grant.payloadJson).aspect_ratio,null)}finally{f.host.dispose()}
})
test('feedback ratio mismatch is refused without reducing, reformatting or dropping dimensions',async()=>{
 for(const [ratio,local] of [[undefined,'3:2'],[undefined,'4:6'],[undefined,'02:3'],[undefined,'2 :3'],[undefined,''],[null,'2:3']]){
  const f=await fixture('platform_product_feedback',ratio)
  try{f.grant.draft.aspectRatio=local;assert.equal((await f.host.list('task-session')).status,'not_connected');assert.equal((await f.host.open('task-session',handle)).state,'not_connected');assert.equal(f.opens(),0)}finally{f.host.dispose()}
 }
})
test('transferred or closed outcomes only check the original handle and never reopen plaintext',async()=>{const f=await fixture();await f.host.list('task-session');await f.host.open('task-session',handle);f.setPhase('transferred');assert.equal((await f.host.status('task-session',handle)).state,'transferred');f.setPhase('closed');assert.equal((await f.host.open('task-session',handle)).state,'unknown');assert.equal(f.opens(),1);f.host.dispose()})

test('metadata refresh preserves an already transferred confirmation window without reopening the body',async()=>{
 const f=await fixture()
 try{
  await f.host.list('task-session');await f.host.open('task-session',handle)
  f.setPhase('transferred');assert.equal((await f.host.status('task-session',handle)).state,'transferred')
  const refreshed=await f.host.list('task-session')
  assert.equal(refreshed.status,'ready');assert.equal(refreshed.candidates[0]?.handle,handle)
  assert.equal(f.cancels(),0,'metadata lookup must leave the current Web review open')
  assert.equal((await f.host.open('task-session',handle)).state,'transferred')
  assert.equal(f.opens(),1,'refresh must keep the original one-shot window')
  assert.equal(JSON.stringify(refreshed).includes(f.grant.payloadJson),false)
 }finally{f.host.dispose()}
})

test('transferred windows still close when refreshed grants expire or replace their original binding',async()=>{
 for(const mutate of [f=>{f.grant.server.expires_at='2026-10-25T00:00:00+00:00'},f=>f.rebind('replacement-task'),f=>{f.grant.server.target_hash='b'.repeat(64)},f=>{f.grant.prepare.context.client_task_id='replacement-client-task'},f=>{f.grant.signal=new AbortController().signal}]){
  const f=await fixture()
  try{
   await f.host.list('task-session');await f.host.open('task-session',handle)
   f.setPhase('transferred');await f.host.status('task-session',handle);mutate(f)
   assert.equal((await f.host.list('task-session')).status,'not_connected')
   assert.equal(f.cancels(),1);await f.host.open('task-session',handle);assert.equal(f.opens(),1)
  }finally{f.host.dispose()}
 }
})
test('cancelling while provider resolution waits blocks late list/open',async()=>{const f=await fixture();let release;f.provider.list=()=>new Promise(r=>{release=r});const pending=f.host.list('task-session');await new Promise(r=>setTimeout(r,0));f.host.dispose();release([f.grant]);assert.equal((await pending).status,'not_connected');assert.equal(f.opens(),0)})
test('identity revocation closes the native window and removes all grant bodies',async()=>{const f=await fixture();await f.host.list('task-session');await f.host.open('task-session',handle);f.auth.abort();assert.equal(f.cancels(),1);assert.equal((await f.host.status('task-session',handle)).state,'not_connected');f.host.dispose()})
test('foreign task, altered payload, and expired server bindings do not open',async()=>{for(const mutate of [g=>{g.draft.content='无关的候选'},g=>{g.draft.scope.validUntil=now-1},g=>{g.taskBinding='other'},g=>{g.payloadJson='{}'},g=>{g.server.expires_at='2026-10-25T00:00:00+00:00'}]){const f=await fixture();mutate(f.grant);assert.equal((await f.host.list('task-session')).candidates.length,0);assert.equal((await f.host.open('task-session',handle)).state,'not_connected');assert.equal(f.opens(),0);f.host.dispose()}})

test('cancelled native callbacks cannot resurrect a closed handoff',async()=>{const f=await fixture();let late;f.runtime.openCandidateConsent=(_input,onState)=>{late=onState;onState('awaiting_web');return{state:()=> 'awaiting_web',cancel(){}}};await f.host.list('task-session');await f.host.open('task-session',handle);await f.host.clear('task-session');late('transferred');late('awaiting_web');assert.equal((await f.host.status('task-session',handle)).state,'cancelled');assert.equal(f.opens(),0);f.host.dispose()})
test('route requires launcher renderer capability before any Host identity or provider work',async()=>{for(const mode of ['absent','missing','wrong','correct']){const routes=[];let auth=0;const provider={authoritySignal:new AbortController().signal,nativeWindowPolicy:()=>({platformOrigin:'https://platform.invalid',handoffOrigin:'http://127.0.0.1:43120'}),list:async()=>[]};const token='x'.repeat(43),ctx={get:key=>key==='futurestaffGovernanceCandidateProvider'?provider:key==='desktopBrowserAccess'&&mode!=='absent'?{ordinaryBrowserEnabled:true,rendererHeader:{name:'x-dsh-desktop-renderer',value:token}}:undefined,provide(){},effect:fn=>{fn()},webServer:{port:43120,register:r=>{routes.push(r);return()=>{}}}};const host=mountCandidateConsent(ctx,{authorize:async()=>{auth++;throw Error('PRIVATE')}});const req={method:'POST',headers:{host:'127.0.0.1:43120',origin:'http://127.0.0.1:43120','x-futurestaff-candidate-window':'1',...(mode==='correct'?{'x-dsh-desktop-renderer':token}:mode==='wrong'?{'x-dsh-desktop-renderer':'y'.repeat(43)}:{})},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({action:'list',sessionId:'task-session'}))}};let code;const res={set statusCode(v){code=v},setHeader(){},end(){}};await routes[0].handler(req,res);assert.equal(code,mode==='correct'?200:403);assert.equal(auth,mode==='correct'?1:0);host.dispose()}})

test('invalid current provider lists revoke an existing window',async()=>{for(const result of [null,Array(9).fill(null)]){const f=await fixture();await f.host.list('task-session');await f.host.open('task-session',handle);f.provider.list=async()=>result;assert.equal((await f.host.list('task-session')).status,'not_connected');assert.equal(f.cancels(),1);assert.equal((await f.host.open('task-session',handle)).state,'not_connected');assert.equal(f.opens(),1);f.host.dispose()}})

test('policy admission revocation closes immediately and removes the staged body',async()=>{const f=await fixture(),authority=new AbortController();f.provider.authoritySignal=authority.signal;await f.host.list('task-session');await f.host.open('task-session',handle);authority.abort();assert.equal(f.cancels(),1);assert.equal((await f.host.status('task-session',handle)).state,'not_connected');f.host.dispose()})
