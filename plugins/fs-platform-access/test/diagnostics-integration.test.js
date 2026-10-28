import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createServer} from 'node:http'
import {mountDiagnosticsHost} from '../lib/diagnostics-host.js'
import {FutureStaffChatAdapter} from '../lib/chat.js'
import {PlatformDevApi} from '../lib/api.js'
import {PlatformDevAccessController} from '../lib/dev-access.js'
import {InMemoryTenantResources} from '../lib/isolation.js'

test('Host bridge rejects foreign origins and content; valid renderer metadata reaches owner outbox',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'fs-diag-integration-')),cleanups=[],routes=[]
  const identity={environment:'dev',tenantId:randomUUID(),userId:randomUUID()},signal=new AbortController().signal
  const ctx={get:()=>undefined,provide:()=>{},effect:register=>{cleanups.push(register())},webServer:{register:route=>{routes.push(route);return()=>{}}}}
  const diagnostics=mountDiagnosticsHost(ctx,{directory,identity,origin:'https://dev.fsstory.net',appVersion:'3.3.2',platform:'win32',autoFlush:false,
    authorize:async()=>({...identity,accessToken:'private-host-only',signal})})
  const server=createServer((req,res)=>{void routes[0].handler(req,res)})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(async()=>{for(const cleanup of cleanups.reverse())await cleanup?.();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true})})
  const base='http://127.0.0.1:'+server.address().port,url=base+'/_futurestaff/platform-dev/diagnostics'
  const send=(body,origin=base)=>fetch(url,{method:'POST',headers:{'content-type':'application/json','x-futurestaff-diagnostics':'1',origin},body:JSON.stringify(body)})
  assert.equal((await send({category:'renderer',operation:'render',code:'RENDERER_ERROR'},'https://evil.example')).status,403)
  assert.equal((await send({code:'RENDERER_ERROR',message:'private body'})).status,400)
  assert.equal((await send({category:'renderer',operation:'render',severity:'error',code:'RENDERER_ERROR'})).status,202)
  await diagnostics.dispose()
  const state=JSON.parse(await readFile(path.join(directory,'outbox.json'),'utf8'))
  assert.equal(state.records.length,1)
  assert.equal(state.records[0].event.code,'RENDERER_ERROR')
  assert.doesNotMatch(JSON.stringify(state),/private body|private-host-only/)
})

test('chat reports status/size/duration and correlation without leaking prompts or credentials',async()=>{
  const captures=[],userId=randomUUID(),tenantId=randomUUID(),signal=new AbortController().signal
  const adapter=new FutureStaffChatAdapter(async()=>({accessToken:'private-token',userId,tenantId,modelId:randomUUID(),signal}),
    {read:async()=>undefined,write:async()=>{}},async()=>new Response('private server detail',{status:413}),
    'https://dev.fsstory.net',async()=>[],undefined,undefined,undefined,input=>captures.push(input))
  let failure
  try {for await(const _ of adapter.stream({provider:'futurestaff',model:'default',sessionId:randomUUID(),messages:[{role:'user',source:{kind:'user'},content:[{type:'text',text:'private prompt'}]}]})) {}}catch(error){failure=error}
  assert.equal(captures.length,1)
  assert.equal(captures[0].httpStatus,413)
  assert.equal(captures[0].requestId,failure.failure.requestId)
  assert.ok(captures[0].requestBytes>0)
  assert.doesNotMatch(JSON.stringify(captures),/private prompt|private-token|private server/)
})

test('platform API reports caught authentication/HTTP failures with fixed operation metadata',async()=>{
  const captures=[]
  const api=new PlatformDevApi(async()=>new Response('private upstream body',{status:503}),undefined,input=>captures.push(input))
  await assert.rejects(api.loginWithPassword({loginIdentifier:'private-user',password:'private-password'}))
  assert.equal(captures.length,1)
  assert.equal(captures[0].operation,'login')
  assert.equal(captures[0].httpStatus,503)
  assert.doesNotMatch(JSON.stringify(captures),/private-/)
})

test('successful HTTP with an invalid decoded auth contract is also collected',async()=>{
  const captures=[]
  const api=new PlatformDevApi(async()=>new Response(JSON.stringify({session:null,user:null,meta:{contractVersion:'0.1.1',simulated:false}}),
    {headers:{'content-type':'application/json'}}),undefined,input=>captures.push(input))
  await assert.rejects(api.loginWithPassword({loginIdentifier:'private-user',password:'private-password'}),error=>error.code==='CONTRACT_MISMATCH')
  assert.equal(captures.length,1)
  assert.equal(captures[0].code,'CONTRACT_MISMATCH')
  assert.doesNotMatch(JSON.stringify(captures),/private-/)
})

test('broken response streams report the same final code and request id as the runtime failure',async()=>{
  const captures=[],signal=new AbortController().signal
  const adapter=new FutureStaffChatAdapter(async()=>({accessToken:'private-token',userId:randomUUID(),tenantId:randomUUID(),modelId:randomUUID(),signal}),
    {read:async()=>undefined,write:async()=>{}},async()=>new Response(new ReadableStream({start(controller){controller.error(new TypeError('private upstream message'))}}),
      {headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}}),
    'https://dev.fsstory.net',async()=>[],undefined,undefined,undefined,input=>captures.push(input))
  let failure
  try{for await(const _ of adapter.stream({provider:'futurestaff',model:'default',sessionId:randomUUID(),messages:[{role:'user',source:{kind:'user'},content:[{type:'text',text:'private prompt'}]}]})){}}catch(error){failure=error}
  assert.equal(captures.length,1)
  assert.equal(captures[0].code,failure.code)
  assert.equal(captures[0].requestId,failure.failure.requestId)
  assert.doesNotMatch(JSON.stringify(captures),/private/)
})

test('diagnostic authorization requires live owner but no apps or model access and logout cancels it',async()=>{
  const tenantId=randomUUID(),userId=randomUUID(),session={activeTenantId:tenantId,audience:'futurestaff-agent-pc-dev',accessToken:'private-access',refreshToken:'private-refresh',tokenType:'Bearer',expiresIn:900}
  let calls=0,refreshCalls=0
  const api={loginWithPassword:async()=>({session,user:{userId,displayName:'test',email:null}}),listTenants:async()=>({activeTenantId:tenantId,items:[{tenantId,displayName:'test',slug:'test-tenant',role:'member',logoUrl:null}]}),
    listApplications:async()=>{calls++;return{activeTenantId:tenantId,items:[]}},listModels:async()=>({activeTenantId:tenantId,activeModelId:null,items:[]}),logout:async()=>{},refresh:async()=>{refreshCalls++;throw Error('must not refresh for telemetry')}}
  const controller=new PlatformDevAccessController(api,{load:async()=>undefined,save:async()=>{},clear:async()=>{}},new InMemoryTenantResources())
  await assert.rejects(controller.authorizeDiagnostics())
  await controller.login({loginIdentifier:'test',password:'private'})
  const before=calls,credentials=await controller.authorizeDiagnostics()
  assert.equal(calls,before)
  assert.equal(credentials.userId,userId)
  const originalNow=Date.now
  Date.now=()=>originalNow()+1000000
  try{await assert.rejects(controller.authorizeDiagnostics())}finally{Date.now=originalNow}
  assert.equal(refreshCalls,0,'background reporting cannot trigger auth I/O or recursively report its own auth failures')
  await controller.logout()
  assert.equal(credentials.signal.aborted,true)
  await assert.rejects(controller.authorizeDiagnostics())
  controller.dispose()
})
