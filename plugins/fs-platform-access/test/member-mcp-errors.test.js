import test from 'node:test'
import assert from 'node:assert/strict'
import { MemberMcp } from '../lib/member-mcp.js'
import { SystemAssistantService } from '../lib/system-assistant-tools.js'

const secret='private-upstream-bearer-and-tenant'
const reason={code:'MEMBERSHIP_TIER_REQUIRED',requiredTier:'team',message:secret,token:secret}
const checkEntitlement=error=>{
 assert.equal(error.code,'MEMBERSHIP_TIER_REQUIRED')
 assert.equal(error.requiredTier,'team')
 assert.match(error.message,/货源集市.*团队套餐/)
 assert.match(error.message,/MEMBERSHIP_TIER_REQUIRED/)
 assert.doesNotMatch(error.message+' '+JSON.stringify(error),new RegExp(secret))
 return true
}
const read={operation:'products_search',arguments:{}}
function service(fetcher){
 const identity={kind:'local-template',templateId:'10000000-0000-4000-8000-000000000001',version:'a'.repeat(64),tenantId:'tenant',userId:'member',accessToken:'private-desktop',signal:new AbortController().signal,businessSystems:['product-hub'],tools:['call_product_hub_api'],workspacePath:'/private'}
 return new SystemAssistantService('https://dev.fsstory.net',async()=>identity,fetcher)
}
function grant(){return Response.json({schema_version:1,accessToken:'private-short',tokenType:'Bearer',expiresIn:60,audience:'futurestaff-product-hub-dev',tenantId:'tenant',memberId:'member',permissions:['product_hub.read'],apiBaseUrl:'https://product-dev.fsstory.net',assistantTemplateId:'10000000-0000-4000-8000-000000000001',mcpUrl:'https://product-dev.fsstory.net/api/product-hub/mcp'})}

test('MCP preserves only the recognized team entitlement code and fixed Chinese reason without retry',async()=>{
 let calls=0
 const mcp=new MemberMcp('https://product-dev.fsstory.net/api/product-hub/mcp','private-short',new AbortController().signal,async()=>{},async()=>{calls++;return Response.json({detail:reason},{status:403})})
 await assert.rejects(mcp.rpc('initialize'),checkEntitlement)
 assert.equal(calls,1)
})

test('system bridge keeps recognized entitlement errors from grant and MCP HTTP denials',async()=>{
 for(const deniedAt of ['grant','mcp']){
  let calls=0
  const bridge=service(async url=>{calls++;return String(url).endsWith('/token')&&deniedAt==='mcp'?grant():Response.json({detail:reason},{status:403})})
  await assert.rejects(bridge.run('product-hub',read,'session'),checkEntitlement)
  assert.equal(calls,deniedAt==='grant'?1:2)
 }
})

test('MCP HTTP-200 tool failure keeps only a strict known code and never retries a call',async()=>{
 let toolCalls=0
 const bridge=service(async(url,init)=>{
  if(String(url).endsWith('/token'))return grant()
  const body=JSON.parse(init.body)
  if(body.method==='notifications/initialized')return new Response(null,{status:202})
  let result={protocolVersion:'2024-11-05'}
  if(body.method==='tools/list')result={tools:[{name:'product_hub_products_search'}]}
  if(body.method==='tools/call'){toolCalls++;result={isError:true,content:[{type:'text',text:JSON.stringify({error:{status:403,...reason}})}]}}
  return Response.json({jsonrpc:'2.0',id:body.id,result})
 })
 await assert.rejects(bridge.run('product-hub',read,'session'),checkEntitlement)
 assert.equal(toolCalls,1)
})

test('unknown, mismatched and malformed HTTP denials stay generic and hide all upstream text',async()=>{
 for(const [status,body] of [[403,{detail:{...reason,code:'UNKNOWN'}}],[403,{detail:{...reason,requiredTier:'enterprise'}}],[401,{detail:reason}],[500,{detail:reason}],[403,{error:reason}]]){
  let calls=0
  const mcp=new MemberMcp('https://product-dev.fsstory.net/api/product-hub/mcp','private-short',new AbortController().signal,async()=>{},async()=>{calls++;return Response.json(body,{status})})
  await assert.rejects(mcp.rpc('tools/list'),error=>{
   assert.equal(error.message,'SYSTEM_ASSISTANT_REQUEST_DENIED');assert.equal(error.code,undefined)
   assert.doesNotMatch(error.message+' '+JSON.stringify(error),new RegExp(secret));return true
  })
  assert.equal(calls,1)
 }
 for(const body of ['not-json '+secret,'{"detail":']){
  const mcp=new MemberMcp('https://product-dev.fsstory.net/api/product-hub/mcp','private-short',new AbortController().signal,async()=>{},async()=>new Response(body,{status:403}))
  await assert.rejects(mcp.rpc('tools/list'),/SYSTEM_ASSISTANT_REQUEST_DENIED/)
 }
})

test('oversized entitlement-shaped error body is bounded and cannot expose its text',async()=>{
 let canceled=false,pulls=0
 const body=new ReadableStream({pull(controller){pulls++;controller.enqueue(new TextEncoder().encode(' '.repeat(4096)))},cancel(){canceled=true}})
 const mcp=new MemberMcp('https://product-dev.fsstory.net/api/product-hub/mcp','private-short',new AbortController().signal,async()=>{},async()=>new Response(body,{status:403}))
 await assert.rejects(mcp.rpc('tools/list'),/SYSTEM_ASSISTANT_REQUEST_DENIED/)
 assert.equal(canceled,true);assert.ok(pulls<=6)
})

test('a different system cannot claim the Product Hub subscription message',async()=>{
 const identity={kind:'local-template',templateId:'10000000-0000-4000-8000-000000000001',version:'a'.repeat(64),tenantId:'tenant',userId:'member',accessToken:'private-desktop',signal:new AbortController().signal,businessSystems:['visa'],tools:['visa_query'],workspacePath:'/private'}
 const bridge=new SystemAssistantService('https://dev.fsstory.net',async()=>identity,async()=>Response.json({detail:reason},{status:403}))
 await assert.rejects(bridge.run('visa',{resource:'cases'},'session'),error=>{
  assert.equal(error.message,'SYSTEM_ASSISTANT_REQUEST_DENIED');assert.equal(error.code,undefined);return true
 })
})
