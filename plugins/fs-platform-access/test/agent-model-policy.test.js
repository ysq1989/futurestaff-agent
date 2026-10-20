import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {FutureStaffChatAdapter} from '../lib/chat.js'
import {AgentWorkspaceStore,decodeAgentSnapshot,fetchAgentData} from '../lib/agents.js'
import {mountAgents} from '../lib/agent-host.js'
import {apply as applyDefault} from '../lib/model-default.js'

const free='10000000-0000-4000-8000-000000000001',paid='10000000-0000-4000-8000-000000000002'
const agentId='30000000-0000-4000-8000-000000000001'
const identity={environment:'production',tenantId:'40000000-0000-4000-8000-000000000001',userId:'50000000-0000-4000-8000-000000000001'}
const primary={primaryModelId:free,fallbackModelId:null}
const legacy={agentId,name:'Video',description:'Make video',version:'a'.repeat(64),files:[],businessSystems:['shop']}
const modern={...legacy,version:'b'.repeat(64),legacyVersion:legacy.version,modelPolicy:primary}
const request=(extra={})=>({provider:'futurestaff',model:'default',sessionId:'video-session',messages:[{role:'user',source:{kind:'user'},content:[{type:'text',text:'做一条咖啡店视频'}]}],...extra})
const collect=async stream=>{const chunks=[];for await(const item of stream)chunks.push(item);return chunks}
const response=()=>new Response(JSON.stringify({type:'result',content:'ok',toolCalls:[],finishReason:'stop'})+'\n',
  {headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}})

function bench(options={}){
  const events=[],sent=[],values=new Map(),abort=new AbortController()
  let owner={userId:identity.userId,tenantId:identity.tenantId,signal:abort.signal}
  const binding=()=>({agentId,version:modern.version,modelPolicy:primary,identity:{userId:owner.userId,tenantId:owner.tenantId},signal:owner.signal,...options.binding})
  const adapter=new FutureStaffChatAdapter(async id=>{
    events.push(['authorize',id]);if(options.deny||![free,paid].includes(id))throw Error('unavailable')
    return {...owner,accessToken:'host-private',modelId:id}
  },{read:async key=>values.get(key),write:async(key,value)=>values.set(key,value)},async(_url,init)=>{
    events.push(['provider']);sent.push(JSON.parse(init.body));return response()
  },'https://platform.fsstory.net',async()=>[
    {modelId:free,displayName:'Free Agent model',supportsVision:false,isDefault:false},
    {modelId:paid,displayName:'Tenant default',supportsVision:true,isDefault:true},
  ],async session=>{events.push(['binding',session]);if(options.bindingError)throw options.bindingError;return binding()},
  async()=>({dataUrl:'data:image/png;base64,AA==',path:'input.png'}),async()=>owner)
  return {adapter,events,sent,abort,setOwner:value=>{owner=value}}
}

test('default, title and tool continuation use the Agent primary after binding, never the paid tenant default',async()=>{
  const b=bench(),prepared=await b.adapter.prepareCall('futurestaff','default')
  assert.deepEqual(b.events,[])
  assert.throws(()=>prepared.stream(request({model:paid})),error=>error.code==='FUTURESTAFF_MODEL_BINDING')
  await collect(prepared.stream(request()))
  await collect(b.adapter.stream(request({purpose:'session-title',system:'只输出标题',maxTokens:32})))
  await collect(b.adapter.stream(request({messages:[...request().messages,
    {role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id:'create1',name:'video_project_create',arguments:'{}'}]},
    {role:'user',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:'create1',content:[{type:'text',text:'saved'}]}]},
  ]})))
  assert.equal(b.sent.length,3)
  for(const body of b.sent){assert.equal(body.modelId,free);assert.equal(body.modelSelection,'agent-default');assert.equal(body.agentContractVersion,'1.1.0');assert.equal(body.agentVersion,modern.version)}
  assert.deepEqual(b.events.filter(x=>x[0]==='authorize').map(x=>x[1]),[free,free,free])
  assert.deepEqual(b.events.slice(0,3),[['binding','video-session'],['authorize',free],['provider']])
})

test('an explicit native UUID remains explicit for its Session and does not change the next Session default',async()=>{
  const b=bench()
  await collect((await b.adapter.prepareCall('futurestaff',paid)).stream(request({model:paid,sessionId:'explicit-session'})))
  await collect(b.adapter.stream(request({sessionId:'new-agent-session'})))
  assert.deepEqual(b.sent.map(x=>[x.modelId,x.modelSelection]),[[paid,'session-explicit'],[free,'agent-default']])
  let service,grants=0
  applyDefault({provide:(_name,value)=>{service=value}},{snapshot:()=>({user:{userId:identity.userId},activeTenantId:identity.tenantId,models:[]}),authorize:async id=>{assert.equal(id,paid);grants++}})
  await service.saveSelection({provider:'futurestaff',model:paid})
  assert.equal(grants,1)
  assert.deepEqual(service.currentSelection(),{provider:'futurestaff',model:'default'})
})

test('missing, unavailable or stale primary policy fails without authorizing any automatic fallback',async()=>{
  for(const options of [
    {binding:{modelPolicy:{primaryModelId:null,fallbackModelId:paid}}},
    {binding:{modelPolicy:undefined}},
    {bindingError:Error('AGENT_MODEL_VERSION_CHANGED')},
  ]){
    const b=bench(options)
    await assert.rejects(collect(b.adapter.stream(request())))
    assert.equal(b.events.filter(x=>x[0]==='authorize').length,0)
    assert.equal(b.sent.length,0)
  }
  const denied=bench({deny:true,binding:{modelPolicy:{primaryModelId:free,fallbackModelId:paid}}})
  await assert.rejects(collect(denied.adapter.stream(request())))
  assert.deepEqual(denied.events.filter(x=>x[0]==='authorize').map(x=>x[1]),[free])
  assert.equal(denied.sent.length,0)
})

test('prepare captures identity without a model grant and an account switch rejects before model authorization',async()=>{
  const b=bench(),prepared=await b.adapter.prepareCall('futurestaff','default')
  assert.deepEqual(b.events,[])
  b.setOwner({...identity,userId:'60000000-0000-4000-8000-000000000001',signal:new AbortController().signal})
  await assert.rejects(collect(prepared.stream(request())),error=>error.code==='FUTURESTAFF_TENANT')
  assert.equal(b.events.filter(x=>x[0]==='authorize').length,0)
  assert.equal(b.sent.length,0)
  const aborted=bench(),before=await aborted.adapter.prepareCall('futurestaff','default')
  aborted.abort.abort()
  await assert.rejects(collect(before.stream(request())))
  assert.deepEqual(aborted.events,[])
})

test('vision admission checks the bound primary rather than the tenant default metadata',async()=>{
  const b=bench(),metadata=(await b.adapter.listModels())[0]
  assert.equal(metadata.name,'智能体默认模型')
  await assert.rejects(collect(b.adapter.stream(request({messages:[{...request().messages[0],content:[{type:'image',attachment:{attachmentId:'fixture'}}]}]}))),/不支持图片/)
  assert.deepEqual(b.events.filter(x=>x[0]==='authorize').map(x=>x[1]),[free])
  assert.equal(b.sent.length,0)
})

test('legacy cached snapshots remain readable while policy fields require an exact negotiated pair',async()=>{
  assert.deepEqual(decodeAgentSnapshot(legacy),legacy)
  assert.deepEqual(decodeAgentSnapshot(modern),modern)
  for(const value of [
    {...modern,legacyVersion:undefined},
    {...legacy,modelPolicy:primary},
    {...modern,modelPolicy:{...primary,apiKey:'forbidden'}},
    {...modern,modelPolicy:{primaryModelId:'invalid',fallbackModelId:null}},
  ])assert.throws(()=>decodeAgentSnapshot(value))
  const credentials={...identity,accessToken:'fixture',signal:new AbortController().signal}
  await fetchAgentData('https://platform.fsstory.net',credentials,agentId,async url=>{
    assert.match(String(url),/\/snapshot$/);return Response.json({contractVersion:'1.0.0',activeTenantId:identity.tenantId,snapshot:legacy})
  })
  await fetchAgentData('https://platform.fsstory.net',credentials,agentId,async url=>{
    assert.match(String(url),/contractVersion=1\.1\.0$/);return Response.json({contractVersion:'1.1.0',activeTenantId:identity.tenantId,snapshot:modern})
  },'1.1.0')
  await assert.rejects(fetchAgentData('https://platform.fsstory.net',credentials,agentId,async()=>Response.json({contractVersion:'1.0.0',activeTenantId:identity.tenantId,snapshot:legacy}),'1.1.0'))
})

test('dual-version bindings preserve business tools and only pin a first model policy when legacy content matches',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'fs-agent-model-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  let current=modern,live
  const host=mountAgents({effect:factory=>factory(),webServer:{register:()=>()=>{}},get:name=>name==='sessions'?{get:()=>live}:undefined},
    'https://platform.fsstory.net',identity,root,async()=>({...identity,accessToken:'fixture',signal:new AbortController().signal}),async url=>{
      const isModern=String(url).endsWith('?contractVersion=1.1.0')
      return Response.json({contractVersion:isModern?'1.1.0':'1.0.0',activeTenantId:identity.tenantId,snapshot:isModern?current:legacy})
    })
  const directory=await host.store.materialize(modern,new AbortController().signal)
  live={header:{cwd:path.join(directory,'workspace')}}
  assert.deepEqual(await host.resolveBinding('new-session'),{agentId,version:legacy.version,modelVersion:modern.version})
  assert.equal((await host.resolvePolicyBinding('new-session')).version,modern.version)
  assert.equal((await host.authorizeBusiness('new-session','shop')).version,legacy.version)
  current={...modern,version:'c'.repeat(64),modelPolicy:{primaryModelId:paid,fallbackModelId:null}}
  await assert.rejects(host.resolvePolicyBinding('new-session'),/AGENT_MODEL_VERSION_CHANGED/)
  assert.equal((await host.authorizeBusiness('new-session','shop')).version,legacy.version)
  await host.store.materialize(legacy,new AbortController().signal)
  assert.deepEqual(await host.resolveBinding('legacy-session'),{agentId,version:legacy.version})
  assert.equal((await host.resolvePolicyBinding('legacy-session')).version,current.version)
  assert.deepEqual(await host.resolveBinding('legacy-session'),{agentId,version:legacy.version,modelVersion:current.version})
  assert.equal((await new AgentWorkspaceStore(root,identity).snapshot(agentId)).version,legacy.version)
  current={...current,legacyVersion:'d'.repeat(64)}
  await host.resolveBinding('stale-legacy-session')
  await assert.rejects(host.resolvePolicyBinding('stale-legacy-session'),/AGENT_MODEL_VERSION_CHANGED/)
  assert.equal((await host.resolveBinding('stale-legacy-session')).modelVersion,undefined)
})

test('legacy model pins are atomic across stores and never replace an existing version or foreign owner',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'fs-agent-model-pin-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const a=new AgentWorkspaceStore(root,identity),b=new AgentWorkspaceStore(root,identity)
  await a.materialize(legacy,new AbortController().signal)
  await a.bind('same',agentId)
  const same=await Promise.all([a.pinModelVersion('same',agentId,legacy.version,modern.version),b.pinModelVersion('same',agentId,legacy.version,modern.version)])
  assert.equal(same[0].modelVersion,modern.version);assert.equal(same[1].modelVersion,modern.version)
  await a.bind('race',agentId)
  const results=await Promise.allSettled([a.pinModelVersion('race',agentId,legacy.version,modern.version),b.pinModelVersion('race',agentId,legacy.version,'c'.repeat(64))])
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
  assert.equal(results.filter(x=>x.status==='rejected').length,1)
  const winner=results.find(x=>x.status==='fulfilled').value.modelVersion
  assert.equal((await a.binding('race')).modelVersion,winner)
  await assert.rejects(a.pinModelVersion('race',agentId,legacy.version,winner===modern.version?'c'.repeat(64):modern.version),/AGENT_MODEL_VERSION_CHANGED/)
  assert.equal((await b.binding('race')).modelVersion,winner)
  const foreign=new AgentWorkspaceStore(root,{...identity,userId:'60000000-0000-4000-8000-000000000001'})
  await assert.rejects(foreign.pinModelVersion('same',agentId,legacy.version,modern.version))
  await assert.rejects(a.pinModelVersion('same',agentId,'d'.repeat(64),modern.version),/AGENT_MODEL_VERSION_CHANGED/)
  assert.equal((await a.binding('same')).version,legacy.version)
})
