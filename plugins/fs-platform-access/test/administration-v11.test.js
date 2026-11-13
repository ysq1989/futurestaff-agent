import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {AdministrationService,administrationToolNames,renderAdministrationResult} from '../lib/administration.js'
const principal='10000000-0000-4000-8000-000000000001',employee='20000000-0000-4000-8000-000000000002',tenant='30000000-0000-4000-8000-000000000003'
const context={contract_version:'1.1.0',principal_user_id:principal,employee_id:employee,manager_id:null,organization_revision:'org-1',job_id:null,job_name:null,grade_id:null,grade_name:null,can_manage:false,balances:[],approval_rule:{code:'missing_manager_auto_approve',revision:1}}
const service=value=>new AdministrationService('https://platform.fsstory.net',async()=>({accessToken:'synthetic-only',tenantId:tenant,userId:principal,signal:new AbortController().signal}),async()=>Response.json(value))
test('V1.1 accepts the authenticated principal with its distinct online employee and rule',async()=>{
 const result=await service(context).call(administrationToolNames[0],{})
 assert.equal(result.principal_user_id,principal);assert.equal(result.employee_id,employee);assert.deepEqual(result.approval_rule,context.approval_rule)
})
test('frozen V1.1 operation envelopes keep rule facts nested and preserve not-accepted semantics',async()=>{
 const examples=JSON.parse(await readFile(new URL('./fixtures/administration-v11/administration-v1.1-operations.json',import.meta.url),'utf8'))
 for(const name of ['approved_operation','not_accepted_operation']){
  const dto=examples[name],principalId=principal,employeeId=examples.approved_operation.result.employee_id,tenantId=examples.approved_operation.result.tenant_id
  const ctx={...context,principal_user_id:principalId,employee_id:employeeId,organization_revision:'8'}
  const create=(value=dto)=>new AdministrationService('https://platform.fsstory.net',async()=>({accessToken:'synthetic',tenantId,userId:principalId,signal:new AbortController().signal}),async url=>Response.json(url.endsWith('/context')?ctx:value))
  const result=await create().call(administrationToolNames[4],{operation_id:dto.operation_id})
  assert.deepEqual(Object.keys(result).sort(),['intent_id','submission_state','operation_id','expires_at','preview','result','error_code'].sort())
  assert.deepEqual(result.preview.approval_rule,{code:'missing_manager_auto_approve',revision:1});assert.ok(!JSON.stringify(result).includes('calendar_hash'))
  if(name==='approved_operation'){assert.equal(result.result.decision_source,'system_rule');assert.equal(result.result.resolved_by,null);for(const change of [{rule_revision:2},{resolved_by:principalId},{state:'withdrawn'},{decision_source:'human'}])await assert.rejects(()=>create({...dto,result:{...dto.result,...change}}).call(administrationToolNames[4],{operation_id:dto.operation_id}))}
  else{assert.equal(result.submission_state,'not_accepted');assert.equal(result.result,null);await assert.rejects(()=>create({...dto,result:examples.approved_operation.result}).call(administrationToolNames[4],{operation_id:dto.operation_id}))}
  if(name==='approved_operation')await assert.rejects(()=>create({...dto,result:{...dto.result,approval_rule:{code:'missing_manager_auto_approve',revision:2},rule_revision:2}}).call(administrationToolNames[4],{operation_id:dto.operation_id}))
 }
})
test('V1.1 partial or foreign identity never falls back to the old employee equality rule',async()=>{
 for(const value of [{...context,principal_user_id:undefined,employee_id:principal},{...context,contract_version:undefined,employee_id:principal},{...context,principal_user_id:employee},{...context,contract_version:'1.2.0',employee_id:principal}])await assert.rejects(()=>service(value).call(administrationToolNames[0],{}))
})

test('a service that has verified V1.1 never silently downgrades to legacy context',async()=>{
 let current={...context,employee_id:principal,approval_rule:null}
 const s=new AdministrationService('https://platform.fsstory.net',async()=>({accessToken:'synthetic',tenantId:tenant,userId:principal,signal:new AbortController().signal}),async()=>Response.json(current))
 await s.call(administrationToolNames[0],{})
 const {contract_version,principal_user_id,...legacy}=current;current=legacy
 await assert.rejects(()=>s.call(administrationToolNames[0],{}))
})
test('rule context rejects malformed or conflicting facts and service instances never adopt another employee',async()=>{
 for(const delta of [{manager_id:principal},{approval_rule:{code:'other',revision:1}},{approval_rule:{code:'missing_manager_auto_approve',revision:0}},{approval_rule:{...context.approval_rule,enabled:true}},{can_manage:true}])await assert.rejects(()=>service({...context,...delta}).call(administrationToolNames[0],{}))
 let value=context
 const s=new AdministrationService('https://platform.fsstory.net',async()=>({accessToken:'synthetic',tenantId:tenant,userId:principal,signal:new AbortController().signal}),async()=>Response.json(value))
 await s.call(administrationToolNames[0],{});value={...context,organization_revision:'org-2'};await s.call(administrationToolNames[0],{})
 value={...value,employee_id:principal};await assert.rejects(()=>s.call(administrationToolNames[0],{}))
})
test('legacy context remains strict and cannot carry a new rule without negotiation',async()=>{
 const {contract_version,principal_user_id,approval_rule,...old}=context
 await assert.rejects(()=>service(old).call(administrationToolNames[0],{}))
 const valid={...old,employee_id:principal};assert.equal((await service(valid).call(administrationToolNames[0],{})).employee_id,principal)
 await assert.rejects(()=>service({...valid,approval_rule}).call(administrationToolNames[0],{}))
})
test('mapped requests use online employee binding before and after the business HTTP',async()=>{
 const seen=[],request={tenant_id:tenant,employee_id:employee,request_id:principal,manager_id:null,organization_revision:'old-org',kind:'annual',start:'2026-11-14T09:00:00+08:00',end:'2026-11-14T13:00:00+08:00',minutes:240,reason:'synthetic',policy_ref:'reviewed',state:'approved',revision:1,approval_id:principal,decision_reason:'system rule',resolved_by:null,resolved_at:'2026-11-13T09:00:00+08:00',approval_rule:context.approval_rule,decision_source:'system_rule',rule_code:'missing_manager_auto_approve',rule_revision:1}
 const fixture=(changeContext=()=>context,changeRow=()=>request)=>new AdministrationService('https://platform.fsstory.net',async()=>({accessToken:'synthetic-only',tenantId:tenant,userId:principal,signal:new AbortController().signal}),async url=>{const part=new URL(url).pathname.split('/').at(-1);seen.push(part);return Response.json(part==='context'?changeContext(seen):{items:[changeRow()],next_cursor:null})})
 const result=await fixture().call(administrationToolNames[1],{})
 assert.equal(result.items[0].employee_id,employee);assert.equal(result.items[0].decision_source,'system_rule');assert.equal(result.items[0].resolved_by,null);assert.deepEqual(seen,['context','requests','context'])
 for(const change of [()=>({...request,employee_id:principal}),()=>({...request,rule_revision:2}),()=>({...request,resolved_by:principal}),()=>({...request,state:'withdrawn'})])await assert.rejects(()=>fixture(undefined,change).call(administrationToolNames[1],{}))
 await assert.rejects(()=>fixture(calls=>calls.at(-2)==='requests'?{...context,employee_id:principal}:context).call(administrationToolNames[1],{}))
 const pending={...request,state:'pending_system_approval',decision_source:null,rule_code:null,rule_revision:null,resolved_at:null}
 assert.equal((await fixture(undefined,()=>pending).call(administrationToolNames[1],{})).items[0].state,'pending_system_approval')
 for(const change of [{state:'pending_supervisor'},{approval_rule:null,manager_id:principal},{approval_id:null},{decision_source:'system_rule'}])await assert.rejects(()=>fixture(undefined,()=>({...pending,...change})).call(administrationToolNames[1],{}))
 const withdrawn={...pending,state:'withdrawn'};assert.equal((await fixture(undefined,()=>withdrawn).call(administrationToolNames[1],{})).items[0].state,'withdrawn')
 await assert.rejects(()=>fixture(undefined,()=>({...withdrawn,resolved_at:request.resolved_at})).call(administrationToolNames[1],{}))
})
test('a no-manager preview retains the rule but remains unsubmitted and drops proof',async()=>{
 const now=Date.parse('2026-11-13T09:00:00Z'),args={kind:'annual',start:'2026-11-14T09:00:00+08:00',end:'2026-11-14T13:00:00+08:00',reason:'synthetic'}
 const p={job_id:null,job_name:null,grade_id:null,grade_name:null,preview_id:principal,expires_at:now/1000+600,...args,minutes:240,year:2026,account_revision:1,policy_id:principal,policy_ref:'reviewed',policy_title:'reviewed policy',min_minutes:240,available_before_minutes:4800,available_after_minutes:4560,manager_id:null,organization_revision:'org-1',approval_rule:context.approval_rule,confirmation_hash:'private'}
 const create=(readContext=()=>context)=>new AdministrationService('https://platform.fsstory.net',async()=>({accessToken:'synthetic',tenantId:tenant,userId:principal,signal:new AbortController().signal}),async url=>Response.json(url.endsWith('/context')?readContext():{intent_id:principal,submission_state:'prepared',operation_id:null,expires_at:new Date(now+600000).toISOString(),preview:p,result:null,error_code:null,human_confirmation_url:'https://platform.fsstory.net/administration?intent='+principal}),()=>now)
 const s=create()
 const result=await s.call(administrationToolNames[5],args)
 assert.equal(result.submission_state,'prepared');assert.equal(result.result,null);assert.deepEqual(result.preview.approval_rule,context.approval_rule);assert.equal(JSON.stringify(result).includes('private'),false)
 let reads=0
 await assert.rejects(()=>create(()=>++reads===1?context:{...context,approval_rule:{...context.approval_rule,revision:2}}).call(administrationToolNames[5],args))
})

test('confirmation links accept only frozen canonical administrative and legacy Platform targets',async()=>{
 const urls=JSON.parse(await readFile(new URL('./fixtures/administration-v11/administration-web-confirmation-urls.json',import.meta.url),'utf8'))
 const value=url=>({intent_id:urls.intent_id,human_confirmation_url:url,preview:{approval_rule:context.approval_rule}})
 for(const url of urls.accepted){const result=renderAdministrationResult(administrationToolNames[5],value(url));assert.ok(result.includes(']('+url+')'));assert.ok(result.includes('尚未提交'));assert.ok(result.includes('审批方式'));assert.ok(result.includes('前往行政应用'))}
 for(const url of [...urls.rejected,...urls.accepted.map(u=>u+'&'),...urls.accepted.map(u=>u+'#'),...urls.accepted.map(u=>u.replace('?intent=','?%69ntent=')),...urls.accepted.map(u=>u.replace('/leave?','/a/../leave?'))]){
  if(urls.accepted.includes(url))continue
  assert.throws(()=>renderAdministrationResult(administrationToolNames[5],value(url)),undefined,url)
 }
 assert.throws(()=>renderAdministrationResult(administrationToolNames[5],value(urls.accepted[0]),'https://dev.fsstory.net'))
 const hex='abcdefab-cdef-4abc-8def-abcdefabcdef'
 assert.throws(()=>renderAdministrationResult(administrationToolNames[5],{intent_id:hex,human_confirmation_url:'https://administration.fsstory.net/leave?intent='+hex.toUpperCase(),preview:{}}))
})

test('a human decision source cannot accompany a nonterminal request',async()=>{
 const manager=principal,row={tenant_id:tenant,employee_id:employee,request_id:principal,manager_id:manager,organization_revision:'org-1',kind:'annual',start:'2026-11-14T09:00:00Z',end:'2026-11-14T13:00:00Z',minutes:240,reason:'synthetic',policy_ref:'reviewed',state:'pending_supervisor',revision:1,approval_id:principal,decision_reason:'',resolved_by:manager,resolved_at:'2026-11-13T09:00:00Z',approval_rule:null,decision_source:'human',rule_code:null,rule_revision:null}
 const ctx={...context,manager_id:manager,approval_rule:null}
 const create=()=>new AdministrationService('https://platform.fsstory.net',async()=>({accessToken:'synthetic',tenantId:tenant,userId:principal,signal:new AbortController().signal}),async url=>Response.json(url.endsWith('/context')?ctx:{items:[row],next_cursor:null}))
 await assert.rejects(()=>create().call(administrationToolNames[1],{}))
})
