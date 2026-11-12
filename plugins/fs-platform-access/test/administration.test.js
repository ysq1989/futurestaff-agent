import test from 'node:test'
import assert from 'node:assert/strict'
import {AdministrationService,administrationToolNames,renderAdministrationResult} from '../lib/administration.js'
import {businessToolAllowed,templateToolAllowed,decodeBusinessSystems} from '../lib/business-scope.js'
import {scopeApplications} from '../lib/system-policy.js'

const origin='https://platform.fsstory.net'
const employee='10000000-0000-4000-8000-000000000001',tenant='20000000-0000-4000-8000-000000000002'
const manager='30000000-0000-4000-8000-000000000003',id='40000000-0000-4000-8000-000000000004',operation='50000000-0000-4000-8000-000000000005'
const now=Date.parse('2026-11-12T10:00:00Z'),start='2026-11-13T09:00:00+08:00',end='2026-11-13T13:00:00+08:00'
const hr={job_id:null,job_name:null,grade_id:null,grade_name:null}
const preview={...hr,preview_id:id,expires_at:Math.floor(now/1000)+600,kind:'annual',start,end,reason:'个人安排',minutes:240,year:2026,account_revision:1,policy_id:id,policy_ref:'knowledge:reviewed-v1',policy_title:'已审核年假制度',min_minutes:60,available_before_minutes:1440,available_after_minutes:1200,calendar_hash:'c'.repeat(64),manager_id:manager,organization_revision:'org-1'}
const row={tenant_id:tenant,request_id:id,employee_id:employee,manager_id:manager,organization_revision:'org-1',kind:'annual',start,end,minutes:240,reason:'个人安排',policy_ref:'knowledge:reviewed-v1',state:'pending_supervisor',revision:1,approval_id:null,decision_reason:'',resolved_by:null,resolved_at:null}
const intent={intent_id:id,submission_state:'prepared',operation_id:null,expires_at:new Date(now+600000).toISOString(),preview,result:null,error_code:null,human_confirmation_url:origin+'/administration?intent='+id}
const context={...hr,employee_id:employee,employee_name:'合成员工',manager_id:manager,manager_name:'合成主管',organization_revision:'org-1',can_manage:false,balances:[{kind:'annual',year:2026,granted_minutes:1440,used_minutes:0,reserved_minutes:0,available_minutes:1440,revision:1}]}
function fixture(overrides={}){
 const calls=[],signal=new AbortController(),identity={accessToken:'synthetic-private-token',tenantId:tenant,userId:employee,signal:signal.signal};let authorizations=0
 const authorize=async()=>{authorizations++;return overrides.authorize?overrides.authorize(authorizations,identity):identity}
 const fetcher=async(url,init)=>{calls.push({url:String(url),init});if(overrides.fetcher)return overrides.fetcher(url,init)
  const path=new URL(url).pathname
  let value=path.endsWith('/context')?context:path.endsWith('/requests')?{items:[row],next_cursor:null}:path.endsWith('/ledger')?{items:[{id,action:'opening',minutes:1440,at:'2026-01-01T00:00:00Z'}]}:path.endsWith('/policies')?[{policy_id:id,title:'已审核制度',kind:'annual',year:2026,min_minutes:60,knowledge_ref:'knowledge:reviewed-v1',active:true}]:path.endsWith('/previews')?intent:{...intent,operation_id:operation,submission_state:'accepted',result:row}
  value=overrides.project?overrides.project(structuredClone(value),path):value
  return Response.json(value)
 }
 return{service:new AdministrationService(origin,authorize,fetcher,()=>now),calls,signal,get authorizations(){return authorizations}}
}
test('six canonical names use fixed root desktop paths, fresh identity and minimal results',async()=>{
 const f=fixture(),inputs=[{},{after:id,size:2},{},{},{operation_id:operation},{kind:'annual',start,end,reason:'个人安排'}]
 for(let i=0;i<administrationToolNames.length;i++)await f.service.call(administrationToolNames[i],inputs[i])
 assert.deepEqual(f.calls.map(x=>new URL(x.url).pathname),['/desktop/v1/administration/context','/desktop/v1/administration/requests','/desktop/v1/administration/ledger','/desktop/v1/administration/policies','/desktop/v1/administration/operations/'+operation,'/desktop/v1/administration/previews'])
 assert.equal(f.authorizations,12)
 assert.deepEqual(f.calls.map(x=>x.init.method),['GET','GET','GET','GET','GET','POST'])
 for(const call of f.calls){assert.equal(call.init.redirect,'error');assert.equal(call.init.headers.Authorization,'Bearer synthetic-private-token');assert.equal(call.init.headers.Cookie,undefined);assert.equal(call.init.headers.Origin,undefined)}
 assert.deepEqual(JSON.parse(f.calls.at(-1).init.body),inputs.at(-1))
})
test('closed inputs and unknown write tools reject before any credential or HTTP work',async()=>{
 const f=fixture()
 for(const [name,input] of [['administration.leave.submit.v1',{}],[administrationToolNames[0],{employee_id:employee}],[administrationToolNames[1],{size:101}],[administrationToolNames[1],{after:'../other'}],[administrationToolNames[4],{operation_id:id,path:'/manage'}],[administrationToolNames[5],{kind:'annual',start:'tomorrow',end,reason:'x'}],[administrationToolNames[5],{kind:'annual',start,end,reason:'x',kind_context:'human'}]])await assert.rejects(()=>f.service.call(name,input))
 assert.equal(f.calls.length,0);assert.equal(f.authorizations,0)
})
test('administration exact tools require exclusive scope and unknown administration names never fall through',()=>{
 assert.throws(()=>scopeApplications(['administration']),/ADMINISTRATION_CONTEXT_AUTH_REQUIRED/)
 assert.deepEqual(decodeBusinessSystems(['administration']),['administration'])
 for(const name of administrationToolNames){assert.equal(businessToolAllowed(name,['administration']),true);for(const scope of [undefined,[],['erp'],['administration','web']])assert.equal(businessToolAllowed(name,scope),false);assert.equal(templateToolAllowed(name,[name],['administration']),true);assert.equal(templateToolAllowed(name,[],['administration']),false)}
 for(const scope of [undefined,[],['administration']])assert.equal(businessToolAllowed('administration.leave.submit.v1',scope),false)
 assert.equal(templateToolAllowed('administration.manage', ['administration.manage'],['administration']),false)
})
test('foreign owner, unbound operations and invalid display snapshots are rejected',async()=>{
 for(const change of [(v,p)=>p.endsWith('/context')?{...v,employee_id:manager}:v,(v,p)=>p.endsWith('/context')?{...v,job_name:'虚构权限岗位'}:v])await assert.rejects(()=>fixture({project:change}).service.call(administrationToolNames[0],{}))
 await assert.rejects(()=>fixture({project:v=>({...v,items:[{...row,tenant_id:manager}]})}).service.call(administrationToolNames[1],{}))
 await assert.rejects(()=>fixture({project:v=>({...v,operation_id:id})}).service.call(administrationToolNames[4],{operation_id:operation}))
})
test('HR display may omit a name for a known ID but never attach a name without its ID',async()=>{
 const f=fixture({project:v=>({...v,job_id:id,job_name:null,grade_id:manager,grade_name:null})})
 const result=await f.service.call(administrationToolNames[0],{});assert.equal(result.job_id,id);assert.equal(result.job_name,null)
})
test('preview projects out hashes and private extras and renders only a fixed human confirmation link',async()=>{
 const f=fixture({project:v=>({...v,private_token:'secret',confirmation_hash:'x',preview:{...v.preview,confirmation_hash:'secret-hash',unneeded:'hidden'}})})
 const result=await f.service.call(administrationToolNames[5],{kind:'annual',start,end,reason:'个人安排'})
 assert.equal(JSON.stringify(result).includes('secret'),false);assert.equal(JSON.stringify(result).includes('confirmation_hash'),false);assert.equal(JSON.stringify(result).includes('calendar_hash'),false)
 const rendered=renderAdministrationResult(administrationToolNames[5],result)
 assert.ok(rendered.includes('[前往Platform核对并本人确认]('+origin+'/administration?intent='+id+')'));assert.ok(rendered.includes('尚未提交'));assert.equal(rendered.includes('](<'),false)
 for(const url of ['https://evil.invalid/administration?intent='+id,origin+'/administration?intent='+id+'&confirmation_hash=x',origin+'/administration?intent='+manager,origin+'/administration?intent='+id+'#fragment'])await assert.rejects(()=>fixture({project:v=>({...v,human_confirmation_url:url})}).service.call(administrationToolNames[5],{kind:'annual',start,end,reason:'个人安排'}))
})
test('unknown POST outcome is one attempt, and raw peer errors or credentials never surface',async()=>{
 const f=fixture({fetcher:async()=>{throw Error('synthetic-private-token')}})
 await assert.rejects(()=>f.service.call(administrationToolNames[5],{kind:'annual',start,end,reason:'个人安排'}),e=>e.code==='ADMINISTRATION_PREVIEW_OUTCOME_UNKNOWN'&&e.unknownOutcome&&!e.message.includes('synthetic-private-token'))
 assert.equal(f.calls.length,1)
 await assert.rejects(()=>f.service.call(administrationToolNames[5],{kind:'annual',start,end,reason:'个人安排'}),/ALREADY_ATTEMPTED/)
 assert.equal(f.calls.length,1)
})
test('changed identity, revocation after response and oversized receipts fail closed',async()=>{
 const owner=fixture({authorize:(count,identity)=>count===1?identity:{...identity,userId:manager}})
 await assert.rejects(()=>owner.service.call(administrationToolNames[0],{}),/OWNER_CHANGED/)
 const revoked=fixture({authorize:(count,identity)=>{if(count>1)throw Error('ADMINISTRATION_PERMISSION_DENIED');return identity}})
 await assert.rejects(()=>revoked.service.call(administrationToolNames[0],{}));assert.equal(revoked.calls.length,1)
 await assert.rejects(()=>fixture({fetcher:async()=>new Response('x'.repeat(1048577),{headers:{'content-type':'application/json'}})}).service.call(administrationToolNames[0],{}),/RECEIPT_INVALID/)
 assert.throws(()=>new AdministrationService('https://evil.invalid',async()=>({})))
})
