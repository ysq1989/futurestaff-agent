import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { decodeRecipe, fetchRecipes, LocalRoleStore, recipeRuntimeSupported } from '../lib/market.js'
import { mountMarket } from '../lib/market-host.js'
import { mountAgents } from '../lib/agent-host.js'
import { ErpService } from '../lib/erp.js'
import { Readable } from 'node:stream'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const desktopRequire=createRequire(new URL('../../../desktop-shell/dsh-plugin-desktop/package.json',import.meta.url))
const {FileSystemSkillProvider}=await import(pathToFileURL(desktopRequire.resolve('@deepseek-ai/dsh-skill-filesystem')).href)
const hash = value => createHash('sha256').update(value).digest('hex')
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
export function systemRecipe(changes={}) {
 const content='---\nname: erp-sales\ndescription: ERP sales operations\n---\n\nUse erp_query and native previews.'
 const body={templateId:'10000000-0000-4000-8000-000000000001',name:'ERP',description:'ERP member assistant',icon:'ERP',category:'erp',capabilityBullets:['ERP'],instructions:'Use installed skills.',compatible:true,unavailableReason:null,requiredApplications:['erp'],businessSystems:['erp'],tools:['call_erp_api','erp_query','erp_order_form','erp_prepare_action'],skills:[{path:'erp-sales/SKILL.md',content,sha256:hash(content)}],...changes}
 return {...body,version:hash(JSON.stringify(canonical(body)))}
}

test('message cards work with unchanged pure roles and an explicit exact recipe declaration',()=>{
 const plain=systemRecipe({businessSystems:[],requiredApplications:[],tools:[],skills:[]})
 const explicit=systemRecipe({businessSystems:[],requiredApplications:[],tools:['agent_message_card'],skills:[]})
 assert.equal(recipeRuntimeSupported(decodeRecipe(plain)),true)
 assert.equal(recipeRuntimeSupported(decodeRecipe(explicit)),true)
 assert.equal(recipeRuntimeSupported(systemRecipe({businessSystems:[],requiredApplications:[],tools:['agent_message_card_execute'],skills:[]})),false)
 assert.equal(recipeRuntimeSupported(systemRecipe({businessSystems:[],requiredApplications:[],tools:['futurestaff_message_card'],skills:[]})),false)
})
test('0.3 recipes verify nested material hashes, exact tool scope and negotiated freshness',async()=>{
 const recipe=systemRecipe()
 assert.deepEqual(decodeRecipe(recipe),recipe)
 assert.equal(recipeRuntimeSupported(recipe),true)
 assert.equal(recipeRuntimeSupported(systemRecipe({tools:['unsupported_business_tool'],businessSystems:['product-hub'],requiredApplications:['product_hub']})),false)
 assert.throws(()=>decodeRecipe(systemRecipe({skills:[{path:'../bad/SKILL.md',content:'x',sha256:hash('x')}]})))
 assert.throws(()=>decodeRecipe(systemRecipe({skills:[{path:'erp/SKILL.md',content:'changed',sha256:hash('x')}]})))
 assert.throws(()=>decodeRecipe(systemRecipe({skills:[{path:'erp/skill.md',content:'x',sha256:hash('x')}]})), 'native DSH requires an exact SKILL.md entry')
 assert.throws(()=>decodeRecipe(systemRecipe({tools:['erp_query'],businessSystems:[],requiredApplications:[]})))
 const credentials={tenantId:'tenant',accessToken:'secret',signal:new AbortController().signal}
 assert.equal((await fetchRecipes('https://dev.fsstory.net',credentials,async(_url,init)=>{
  assert.equal(init.headers['x-futurestaff-template-contract'],'0.3.0')
  return Response.json({contractVersion:'0.3.0',activeTenantId:'tenant',items:[recipe]})
 })).length,1)
 await assert.rejects(fetchRecipes('https://dev.fsstory.net',credentials,async()=>Response.json({contractVersion:'0.2.0',activeTenantId:'tenant',items:[]})))
})
test('immutable managed Skill bytes are really installed and tampering blocks reuse without deleting project files',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'fs-skills-'))
 try{
  const baseline=path.join(temp,'standard');await mkdir(baseline);await writeFile(path.join(baseline,'agent.cordis.yml'),'- id: trusted\n')
  const store=new LocalRoleStore(path.join(temp,'roles')),recipe=systemRecipe()
  const id=await store.install(recipe,baseline,'/fixed/role.js',new AbortController().signal)
  const role=await store.read(id),file=path.join(role.path,'.agents','skills','erp-sales','SKILL.md')
  assert.equal(await readFile(file,'utf8'),recipe.skills[0].content)
  const control=new AbortController(),provider=new FileSystemSkillProvider({get:()=>undefined,logger:{warn:message=>{throw Error(message)}}},{invalidate(){},signal:control.signal},{watch:false,dshHome:path.join(temp,'no-user-dsh'),agentsHome:path.join(temp,'no-user-agents')})
  try{
   const rows=await provider.list({cwd:role.path,signal:control.signal}),skill=rows.find(row=>row.name==='erp-sales')
   assert.ok(skill,'the real bundled DSH provider must discover the installed Skill')
   assert.match((await provider.get(skill,{cwd:role.path,signal:control.signal})).content,/erp_query/)
  }finally{await provider.dispose();control.abort()}
  const project=path.join(role.path,'project.txt');await writeFile(project,'preserve')
  await writeFile(file,'changed')
  await assert.rejects(store.read(id),/MARKET_SKILL_CHANGED/)
  assert.equal(await readFile(project,'utf8'),'preserve')
 }finally{await rm(temp,{recursive:true,force:true})}
})
test('Host-admitted local ERP session uses member tools without a fake Agent and retains pinned history under current grants',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'fs-local-erp-')),originalFetch=globalThis.fetch
 try{
  const root=path.join(temp,'roles'),baseline=path.join(temp,'standard'),recipe=systemRecipe()
  await mkdir(baseline);await writeFile(path.join(baseline,'agent.cordis.yml'),'- id: trusted\n')
  const identity={environment:'dev',tenantId:'20000000-0000-4000-8000-000000000001',userId:'30000000-0000-4000-8000-000000000001'}
  let applications=[{appId:'erp',tenantId:identity.tenantId,capabilities:['erp.read']}],current=recipe
  const authorize=async()=>({...identity,applications,accessToken:'private-desktop',signal:new AbortController().signal})
  globalThis.fetch=async(url)=>{assert.equal(new URL(url).pathname,'/desktop/v1/agent-templates');return Response.json({contractVersion:'0.3.0',activeTenantId:identity.tenantId,items:[current]})}
  const routes=[],live=new Map(),workspaces=new Map()
  const services={
   agentPresets:{list:async()=>{let entries=[];try{entries=await readdir(root,{withFileTypes:true})}catch(error){if(error.code!=='ENOENT')throw error}return[{id:'standard',path:path.join(baseline,'agent.cordis.yml')},...entries.filter(e=>e.isDirectory()&&e.name.startsWith('fs-')).map(e=>({id:e.name,path:path.join(root,e.name,'agent.cordis.yml')}))]}},
   workspaceRegistry:{create:async directory=>{const row={id:'w'+workspaces.size,path:directory};workspaces.set(row.id,row);return row}},
   sessionController:{create:async request=>{const id='s'+live.size;live.set(id,{header:{cwd:workspaces.get(request.workspaceId).path,agentPreset:request.agentPreset}});return{sessionId:id,agentPreset:request.agentPreset}}},
   sessions:{get:id=>live.get(id),flush:async()=>true},sessionProjections:{stateOf:session=>session.header.agentPreset},
  }
  const ctx={effect:fn=>fn(),webServer:{register:route=>routes.push(route)},get:name=>services[name]}
  const market=mountMarket(ctx,'https://dev.fsstory.net',identity,root,authorize)
  const agents=mountAgents(ctx,'https://dev.fsstory.net',identity,temp,authorize,globalThis.fetch,market.resolveBusiness)
  async function call(suffix,body){
   const request=Readable.from(body?[JSON.stringify(body)]:[]);request.method=['mine','catalog'].includes(suffix)?'GET':'POST';request.headers={'x-futurestaff-market':'1'};request.socket={remoteAddress:'127.0.0.1'}
   let data;const response={statusCode:0,setHeader(){},end:raw=>{data=JSON.parse(raw)}}
   await routes.find(route=>route.path==='/_futurestaff/agent-market/'+suffix).handler(request,response);return{status:response.statusCode,...data}
  }
  const installed=await call('install',{templateId:recipe.templateId,version:recipe.version});assert.equal(installed.status,200)
  const opened=await call('open',{presetId:installed.presetId});assert.equal(opened.status,200)
  const binding=await market.resolveBinding(opened.sessionId);assert.deepEqual(binding.tools,recipe.tools);assert.deepEqual(binding.businessSystems,['erp']);assert.equal(binding.agentId,undefined)
  const principal=await agents.authorizeBusiness(opened.sessionId,'erp','erp_query');assert.equal(principal.kind,'local-template');assert.equal(principal.agentId,undefined)
  await assert.rejects(agents.authorizeBusiness(opened.sessionId,'web','website_call'),/SCOPE_DENIED/)
  await assert.rejects(agents.authorizeBusiness(opened.sessionId,'erp','unlisted_tool'),/SCOPE_DENIED/)
  const erp=new ErpService('https://dev.fsstory.net',authorize,async(url,init)=>{
   if(url.endsWith('/agent/token')){assert.equal(init.body,undefined,'the local principal is a real member, not an invented Agent');return Response.json({tenantId:identity.tenantId,memberId:identity.userId,tokenType:'Bearer',expiresIn:60,audience:'futurestaff-erp-dev',accessToken:'short-erp-private'})}
   if(url.endsWith('/context'))return Response.json({tenant_id:identity.tenantId,member_id:identity.userId,authorization:{enabled:true,actions:['customers.read']}})
   assert.equal(url,'https://erp-dev.fsstory.net/api/erp/customers');return Response.json([{id:'real-customer',name:'真实ERP客户'}])
  },()=>Date.now(),id=>agents.authorizeBusiness(id,'erp'))
  assert.match(JSON.stringify(await erp.query({resource:'customers'},opened.sessionId)),/真实ERP客户/)
  current=systemRecipe({instructions:'New instructions, same grant'})
  assert.equal((await market.resolveBinding(opened.sessionId)).version,recipe.version,'old material remains pinned across an authorized update')
  assert.equal((await call('uninstall',{presetId:installed.presetId})).status,200)
  assert.equal((await call('open',{presetId:installed.presetId})).status,409)
  assert.equal((await agents.authorizeBusiness(opened.sessionId,'erp')).version,recipe.version)
  live.set('forged',{header:{...live.get(opened.sessionId).header}});await assert.rejects(agents.authorizeBusiness('forged','erp'))
  current=systemRecipe({tools:['erp_query']});await assert.rejects(market.resolveBinding(opened.sessionId),/MARKET_STALE/)
  current=recipe;applications=[];await assert.rejects(agents.authorizeBusiness(opened.sessionId,'erp'),/APPLICATION_REQUIRED/)
  applications=[{appId:'erp',tenantId:identity.tenantId,capabilities:['erp.read']}]
  await writeFile(path.join(opened.path,'.agents','skills','erp-sales','SKILL.md'),'changed');await assert.rejects(agents.authorizeBusiness(opened.sessionId,'erp'),/MARKET_SKILL_CHANGED/)
  current=systemRecipe({name:'Agent管理员',businessSystems:[],tools:['call_agent_admin_api'],requiredApplications:['agent'],skills:[]})
  applications=[{appId:'agent',tenantId:identity.tenantId,capabilities:['agent.read']}]
  assert.deepEqual((await call('catalog')).items,[],'core Agent application alone cannot grant administrator tools')
  assert.equal((await call('install',{templateId:current.templateId,version:current.version})).status,409)
  applications=[{appId:'agent',tenantId:identity.tenantId,capabilities:['agent.admin']}]
  const admin=await call('install',{templateId:current.templateId,version:current.version});assert.equal(admin.status,200)
  const adminOpened=await call('open',{presetId:admin.presetId});assert.equal(adminOpened.status,200)
  assert.equal((await agents.authorizeBusiness(adminOpened.sessionId,'agent','call_agent_admin_api')).kind,'local-template')
  applications=[{appId:'agent',tenantId:identity.tenantId,capabilities:['agent.read']}]
  await assert.rejects(market.resolveBinding(adminOpened.sessionId),/APPLICATION_REQUIRED/)
  await assert.rejects(agents.authorizeBusiness(adminOpened.sessionId,'agent','call_agent_admin_api'),/APPLICATION_REQUIRED/)
 }finally{globalThis.fetch=originalFetch;await rm(temp,{recursive:true,force:true})}
})
