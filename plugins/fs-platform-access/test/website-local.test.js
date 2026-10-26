import test from 'node:test'
import assert from 'node:assert/strict'
import { WebsiteService } from '../lib/website.js'
const principal={kind:'local-template',templateId:'10000000-0000-4000-8000-000000000001',version:'a'.repeat(64),identity:{tenantId:'tenant',userId:'member'},tenantId:'tenant',userId:'member',accessToken:'desktop-private',signal:new AbortController().signal,tools:['website_tools','website_call'],businessSystems:['web']}
function fixture(options={}){
 const calls=[];let changed=false
 const authorize=async(_id,tool)=>{assert.ok(principal.tools.includes(tool));return changed?{...principal,version:'b'.repeat(64)}:principal}
 const service=new WebsiteService('https://dev.fsstory.net',authorize,async(url,init)=>{
  calls.push([String(url),init]);const body=init.body&&JSON.parse(init.body)
  if(String(url).includes('/agent-token'))return Response.json({schema_version:1,token:'short-private',expires_in:120,mcp_url:options.mcpUrl??'https://web-dev.fsstory.net/mcp',application_access:{schema_version:1,application_id:'futurestaff-web',tenant_id:'tenant',member_id:'member',enabled:true,can_manage:true}})
  assert.equal(String(url),'https://web-dev.fsstory.net/mcp');assert.equal(init.headers.Authorization,'Bearer short-private');assert.equal(init.redirect,'error')
  if(body.method==='notifications/initialized')return new Response(null,{status:202})
  let result={protocolVersion:'2024-11-05'}
  if(body.method==='tools/list')result={tools:[{name:'website_sites_list',inputSchema:{type:'object'}},{name:'website_draft_create',inputSchema:{type:'object'}},{name:'website_publish',inputSchema:{type:'object'}}]}
  if(body.method==='tools/call'){if(options.failWrite)throw Error('short-private');if(options.change)changed=true;result={content:[{type:'text',text:'{"ok":true}'}]}}
  return Response.json({jsonrpc:'2.0',id:body.id,result},{headers:{'mcp-session-id':'bounded-session'}})
 })
 return {service,calls}
}
test('local Website uses real member delegation and only current registered draft/read tools',async()=>{
 const {service,calls}=fixture(),catalog=await service.tools('native-session')
 assert.equal(catalog.mode,'connected');assert.deepEqual(catalog.tools.map(t=>t.name),['website_sites_list','website_draft_create'])
 assert.doesNotMatch(JSON.stringify(catalog),/private|agentId/)
 const result=await service.call('native-session',{name:'website_draft_create',arguments:{requestId:'20000000-0000-4000-8000-000000000001'}})
 assert.equal(result.content[0].text,'{"ok":true}')
 assert.ok(calls.every(([url])=>!url.includes('/agents/')))
 await assert.rejects(service.call('native-session',{name:'website_publish',arguments:{}}),/WEBSITE_OPERATION_NOT_SUPPORTED/)
 await assert.rejects(service.call('native-session',{name:'website_draft_create',arguments:{}}),/WEBSITE_REQUEST_ID_REQUIRED/)
 await assert.rejects(service.call('native-session',{name:'website_sites_list',arguments:{tenant_id:'other'}}),/WEBSITE_AUTHORITY_ARGUMENT_DENIED/)
})
test('local Website rejects foreign endpoints, changed bindings and never retries ambiguous writes',async()=>{
 const wrong=fixture({mcpUrl:'https://foreign.invalid/mcp'});await assert.rejects(wrong.service.tools('s'),/WEBSITE_IDENTITY_MISMATCH/)
 const failing=fixture({failWrite:true});await assert.rejects(failing.service.call('s',{name:'website_draft_create',arguments:{requestId:'20000000-0000-4000-8000-000000000001'}}),/WEBSITE_RESULT_UNCONFIRMED/)
 assert.equal(failing.calls.filter(([,init])=>init.body&&JSON.parse(init.body).method==='tools/call').length,1)
 const changed=fixture({change:true});await assert.rejects(changed.service.call('s',{name:'website_sites_list',arguments:{}}),/WEBSITE_SESSION_CHANGED/)
})
