import test from 'node:test'
import assert from 'node:assert/strict'
import { SystemAssistantService,hubInput,visaInput } from '../lib/system-assistant-tools.js'
const id='10000000-0000-4000-8000-000000000001',caseId='20000000-0000-4000-8000-000000000001'
const tool={ 'product-hub':'call_product_hub_api',visa:'visa_query',agent:'call_agent_admin_api' }
function harness(system,changes={}){
 const signal=new AbortController(),calls=[]
 let authorized=true
 const identity={kind:'local-template',templateId:id,version:'a'.repeat(64),identity:{tenantId:'tenant',userId:'member'},tenantId:'tenant',userId:'member',accessToken:'private-desktop',signal:signal.signal,businessSystems:system==='agent'?[]:[system],tools:[tool[system]],workspacePath:'/private-workspace'}
 const authorize=async(_id,requested,name)=>{assert.equal(requested,system);assert.equal(name,tool[system]);if(!authorized)throw Error('AGENT_BUSINESS_SCOPE_DENIED');return identity}
 const fetcher=async(url,init={})=>{
  calls.push([String(url),init]);const body=init.body&&JSON.parse(init.body)
  if(String(url).endsWith('/agent/query'))return Response.json({schema_version:1,resource:body.resource,items:[{id:caseId,name:'Visible Agent'}]})
  if(String(url).endsWith('/token'))return Response.json({schema_version:1,accessToken:'private-short',tokenType:'Bearer',expiresIn:60,audience:system==='visa'?'futurestaff-visa-dev-new':'futurestaff-product-hub-dev',tenantId:'tenant',memberId:'member',permissions:system==='visa'?['visa.read']:['product_hub.read','product_hub.operator'],apiBaseUrl:system==='visa'?'https://visa-dev-new.fsstory.net':'https://product-dev.fsstory.net',assistantTemplateId:id,...(system==='product-hub'?{mcpUrl:'https://product-dev.fsstory.net/api/product-hub/mcp'}:{}),...changes.grant})
  assert.equal(init.headers.Authorization,'Bearer private-short');assert.equal(init.redirect,'error')
  if(system==='visa')return Response.json({caseId,status:'owned-visible'})
  if(body.method==='notifications/initialized')return new Response(null,{status:202})
  let result={protocolVersion:'2024-11-05'}
  if(body.method==='tools/list'){if(changes.revoke)authorized=false;result={tools:[{name:'product_hub_products_search'},{name:'product_hub_selection_draft_create'}]}}
  if(body.method==='tools/call'){if(changes.failWrite)throw Error('private-short');result={content:[{type:'text',text:'{"draftId":"'+caseId+'"}'}]}}
  return Response.json({jsonrpc:'2.0',id:body.id,result})
 }
 return {service:new SystemAssistantService('https://dev.fsstory.net',authorize,fetcher),calls,signal}
}
test('member Product Hub uses fixed real host, current template and live MCP allowlist with private draft semantics',async()=>{
 const h=harness('product-hub'),result=await h.service.run('product-hub',{operation:'products_search',arguments:{keyword:'真实商品',pageSize:20}},'s')
 assert.match(result.content[0].text,/draftId/)
 const grant=JSON.parse(h.calls[0][1].body);assert.deepEqual(grant,{templateId:id})
 assert.equal(h.calls.filter(([url])=>url==='https://product-dev.fsstory.net/api/product-hub/mcp').length,4)
 const draft=await h.service.run('product-hub',{operation:'selection_draft_create',arguments:{idempotencyKey:'draft-001',name:'Private draft',productIds:[caseId]}},'s')
 assert.equal(draft.published,false);assert.equal(draft.state,'draft');assert.doesNotMatch(JSON.stringify(draft),/private-short|private-desktop/)
 const denied=harness('product-hub',{grant:{permissions:['product_hub.read']}})
 await assert.rejects(denied.service.run('product-hub',{operation:'selection_draft_create',arguments:{idempotencyKey:'draft-001',name:'Private',productIds:[caseId]}},'s'),/REQUEST_DENIED/)
})
test('Visa resolves only exact owned GET paths with bounded filters and no renderer authority',async()=>{
 const h=harness('visa'),result=await h.service.run('visa',{resource:'progress',caseId},'s')
 assert.equal(result.resource,'progress');assert.equal(result.data.status,'owned-visible');assert.equal(h.calls[1][0],'https://visa-dev-new.fsstory.net/api/immigration/cases/'+caseId+'/processing');assert.equal(h.calls[1][1].method,'GET')
 assert.equal(visaInput({resource:'cases',params:{q:'A B'}}).path,'/api/immigration/cases?q=A+B&page_size=20')
 for(const input of [{resource:'case',caseId:'../other'},{resource:'cases',params:{tenant_id:'other'}},{resource:'cases',params:{page_size:200}},{resource:'payment',caseId},{resource:'events',caseId,method:'POST'}])assert.throws(()=>visaInput(input))
})
test('Admin bridge stays read only and forwards no Agent identity or arbitrary URL',async()=>{
 const h=harness('agent'),result=await h.service.run('agent',{method:'GET',path:'/agents/'+caseId},'s')
 assert.equal(result.items[0].name,'Visible Agent');assert.deepEqual(JSON.parse(h.calls[0][1].body),{templateId:id,resource:'agents',id:caseId})
 for(const input of [{method:'POST',path:'/agents'},{method:'GET',path:'https://foreign/agents'},{method:'GET',path:'/agents?tenantId=other'},{method:'GET',path:'/templates',tenantId:'other'}])await assert.rejects(h.service.run('agent',input,'s'))
 assert.equal(h.calls.length,1)
})
test('member bridge rejects foreign grants, revoked templates and ambiguous writes without retry',async()=>{
 for(const grant of [{apiBaseUrl:'https://foreign.invalid'},{tenantId:'other'},{memberId:'other'},{assistantTemplateId:caseId},{permissions:['admin']},{audience:'wrong'}]){
  const h=harness('product-hub',{grant});await assert.rejects(h.service.run('product-hub',{operation:'products_search',arguments:{}},'s'),/IDENTITY_MISMATCH/);assert.equal(h.calls.length,1)
 }
 const revoked=harness('product-hub',{revoke:true});await assert.rejects(revoked.service.run('product-hub',{operation:'products_search',arguments:{}},'s'),/SCOPE_DENIED/);assert.equal(revoked.calls.filter(([,init])=>init.body&&JSON.parse(init.body).method==='tools/call').length,0)
 const failed=harness('product-hub',{failWrite:true});await assert.rejects(failed.service.run('product-hub',{operation:'selection_draft_create',arguments:{idempotencyKey:'draft-001',name:'Private',productIds:[caseId]}},'s'),/RESULT_UNCONFIRMED/);assert.equal(failed.calls.filter(([,init])=>init.body&&JSON.parse(init.body).method==='tools/call').length,1)
 assert.throws(()=>hubInput({operation:'publish',arguments:{}}));assert.throws(()=>hubInput({operation:'products_search',arguments:{Authorization:'secret'}}))
})
