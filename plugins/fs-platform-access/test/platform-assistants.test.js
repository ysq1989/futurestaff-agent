import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {AgentInstallationStore} from '../lib/agent-distribution.js'
import {mountPlatformAssistants} from '../lib/platform-assistants.js'
import {AgentWorkspaceStore} from '../lib/agents.js'
import {mountAgents} from '../lib/agent-host.js'

const tenantId='10000000-0000-4000-8000-000000000001',userId='20000000-0000-4000-8000-000000000002',agentId='30000000-0000-4000-8000-000000000003',templateId='40000000-0000-4000-8000-000000000004'
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-platform-choice-'));t.after(()=>rm(root,{recursive:true,force:true}))
 const controller=new AbortController(),identity={environment:'dev',tenantId,userId},store=new AgentInstallationStore(root,identity)
 const raw=Buffer.from(JSON.stringify({contractVersion:'2.0.0',notes:'Platform method',requirements:{minClientVersion:'3.3.5',capabilities:['core.chat','local.files']},snapshot:{agentId,name:'电商创意助手',description:'Commerce',version:'a'.repeat(64),legacyVersion:'b'.repeat(64),modelPolicy:{primaryModelId:tenantId,fallbackModelId:null},businessSystems:[],files:[{path:'soul.md',content:'Approved role'}]}}))
 const version=createHash('sha256').update(raw).digest('hex'),card={templateId,name:'电商创意助手',description:'Commerce',icon:'EC',category:'commerce',skills:['commerce-library'],requiredApplications:[],state:'available',agentId:null,version:null,unavailableReason:null}
 const calls=[],config={tenantId,items:[card]},published={agentId,name:'电商创意助手',description:'Commerce',version,sha256:version,bytes:raw.length,notes:'',requirements:{minClientVersion:'3.3.5',capabilities:['core.chat','local.files']},available:true,unavailableReason:null,publishedAt:null}
 const fetcher=async(url,init)=>{const pathname=new URL(url).pathname;calls.push({path:pathname,method:init.method,body:init.body});
  if(pathname==='/desktop/v1/platform-assistants')return Response.json({contractVersion:'1.0.0',activeTenantId:config.tenantId,items:config.items})
  if(pathname.endsWith('/use'))return Response.json({agentId,state:'preparing'})
  if(pathname==='/desktop/v1/agent-distribution')return Response.json({contractVersion:'2.0.0',activeTenantId:tenantId,items:[published]})
  return new Response(raw)
 }
 const mounted=mountPlatformAssistants({effect:fn=>fn(),webServer:{register:()=>()=>{}}},'https://dev.fsstory.net',store,async()=>({...identity,accessToken:'fixture-only',signal:controller.signal}),fetcher)
 return {store,mounted,config,calls,card,version,controller}
}
test('platform choice uses strict server selection then installs the exact real native release',async t=>{
 const {mounted,store,config,calls,card,version}=await fixture(t)
 assert.equal((await mounted.list())[0].installed,false)
 assert.deepEqual(await mounted.use(templateId),{state:'preparing',agentId})
 assert.equal(calls.find(call=>call.method==='POST').body,'{}')
 assert.equal(await store.state(agentId),undefined)
 config.items=[{...card,state:'ready',agentId,version}]
 assert.equal((await mounted.use(templateId)).state,'installed')
 assert.equal((await store.state(agentId)).activeVersion,version)
 assert.equal((await mounted.list())[0].installed,true)
 config.items=[{...card,state:'ready',agentId,version:'c'.repeat(64)}]
 const changed=(await mounted.list())[0]
 assert.equal(changed.installed,true)
 assert.equal(changed.updateAvailable,true)
 assert.equal(changed.installedVersion,version)
})
test('withdrawn or foreign-subject definitions cannot be selected or installed',async t=>{
 const {mounted,config,calls}=await fixture(t)
 config.items=[];await assert.rejects(mounted.use(templateId),/UNAVAILABLE/)
 assert.equal(calls.some(call=>call.method==='POST'),false)
 config.tenantId=userId;await assert.rejects(mounted.list(),/RECEIPT_INVALID/)
 await assert.rejects(mounted.use('../other'),/REQUIRED/)
})

test('selected published sessions bind a native-redirected canonical workspace and reject a forged prefix',async t=>{
 const {mounted,store,config,card,version}=await fixture(t)
 config.items=[{...card,state:'ready',agentId,version}]
 await mounted.use(templateId)
 const canonical=path.join(store.root,'native-redirected-root',agentId,'releases',version,'workspace')
 const original=AgentWorkspaceStore.prototype.workspacePath
 t.mock.method(AgentWorkspaceStore.prototype,'workspacePath',async function(requested){
  if(this.root===store.root&&this.releaseVersion===version){assert.equal(requested,agentId);return canonical}
  return original.call(this,requested)
 })
 const sessions=new Map([['real',{header:{cwd:canonical}}],['forged',{header:{cwd:path.join(store.root,'foreign',agentId,'releases',version,'workspace')}}]])
 const host=mountAgents({effect:fn=>fn(),webServer:{register:()=>()=>{}},get:name=>name==='sessions'?{get:id=>sessions.get(id)}:undefined},
  'https://dev.fsstory.net',store.identity,store.root,async()=>({...store.identity,accessToken:'fixture',signal:new AbortController().signal}))
 const binding=await host.resolveBinding('real')
 assert.equal(binding.agentId,agentId)
 assert.equal(binding.releaseVersion,version)
 assert.ok(binding.modelVersion)
 await assert.rejects(host.resolveBinding('forged'),/AGENT_SESSION_MISMATCH/)
 assert.equal(await host.store.binding('forged'),undefined)
})
