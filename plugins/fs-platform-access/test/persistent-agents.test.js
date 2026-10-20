import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { AgentWorkspaceStore, decodeAgentSnapshot, fetchAgentData } from '../lib/agents.js'
import { resolveSessionAgent, mountAgents } from '../lib/agent-host.js'
import { createServer } from 'node:http'
import { defaultDataRoot, memberDataDirectory } from '../lib/data-root.js'

const identity = { environment:'production', tenantId:'10000000-0000-4000-8000-000000000001', userId:'20000000-0000-4000-8000-000000000001' }
const agentId='30000000-0000-4000-8000-000000000001'
const snapshot = { agentId, name:'签证助手', description:'收单', version:'a'.repeat(64), files:[{path:'soul.md',content:'Know intake'}] }
const modelSnapshot={...snapshot,version:'b'.repeat(64),legacyVersion:snapshot.version,modelPolicy:{primaryModelId:'50000000-0000-4000-8000-000000000001',fallbackModelId:null}}

test('data root is outside install directory and members/environments stay separate',()=>{
  assert.equal(defaultDataRoot('win32',{LOCALAPPDATA:'C:\\Users\\test\\AppData\\Local'}),path.win32.join('C:\\Users\\test\\AppData\\Local','FutureStaff Agent'))
  const root=path.resolve('fixtures')
  assert.notEqual(memberDataDirectory(identity,root),memberDataDirectory({...identity,environment:'dev'},root))
  assert.throws(()=>memberDataDirectory({...identity,tenantId:'../foreign'},root))
})

test('platform skill bundles are discoverable inside only their owning agent workspace',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-skill-'))
 try{
  const store=new AgentWorkspaceStore(root,identity)
  const skill={path:'skills/fashion-launch/SKILL.md',content:'---\nname: fashion-launch\ndescription: Fashion\n---\nOnly approved facts'}
  const directory=await store.materialize({...snapshot,files:[skill]},new AbortController().signal)
  assert.equal(await readFile(path.join(directory,'workspace','.agents',skill.path),'utf8'),skill.content)
  await store.materialize({...snapshot,version:'b'.repeat(64),files:[]},new AbortController().signal)
  await assert.rejects(readFile(path.join(directory,'workspace','.agents',skill.path),'utf8'),{code:'ENOENT'})
 }finally{await rm(root,{recursive:true,force:true})}
})

test('remote files cannot write outside the controlled snapshot or include scripts',()=>{
  for(const file of ['../soul.md','/soul.md','skills/a/../../x.md','skills/a/run.py','credentials.json','skills/CON.md','skills/a.md:secret','skills/a./x.md']){
    assert.throws(()=>decodeAgentSnapshot({...snapshot,files:[{path:file,content:'x'}]}))
  }
})

test('native skill reconciliation preserves local edits instead of replacing them',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-skill-conflict-'))
 try{
  const store=new AgentWorkspaceStore(root,identity),signal=new AbortController().signal
  const skill={path:'skills/fashion-launch/SKILL.md',content:'platform content'}
  const directory=await store.materialize({...snapshot,files:[skill]},signal)
  const file=path.join(directory,'workspace','.agents',skill.path)
  await writeFile(file,'human edit')
  await assert.rejects(store.materialize({...snapshot,version:'b'.repeat(64),files:[{...skill,content:'updated platform'}]},signal),/AGENT_SKILL_LOCAL_CONFLICT/)
  assert.equal(await readFile(file,'utf8'),'human edit')
 }finally{await rm(root,{recursive:true,force:true})}
})

test('agent selection is idempotent, preserves user work, and sessions cannot switch agents',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'fs-agents-'))
  try{
    const store=new AgentWorkspaceStore(root,identity)
    const directory=await store.materialize(snapshot,new AbortController().signal)
    assert.equal(await readFile(path.join(directory,'workspace','.futurestaff-agent','definition','soul.md'),'utf8'),'Know intake')
    await writeFile(path.join(directory,'workspace','user.txt'),'keep')
    await store.materialize({...snapshot,name:'Renamed'},new AbortController().signal)
    assert.equal(await readFile(path.join(directory,'workspace','user.txt'),'utf8'),'keep')
    await store.bind('session-1',agentId)
    assert.equal((await new AgentWorkspaceStore(root,identity).binding('session-1')).agentId,agentId)
    await assert.rejects(store.bind('session-1','40000000-0000-4000-8000-000000000001'))
  }finally{await rm(root,{recursive:true,force:true})}
})

test('linked agent directory is rejected before writing',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'fs-agents-'))
  try{
    const outside=path.join(root,'outside');await mkdir(outside)
    await mkdir(path.join(root,'agents'))
    await symlink(outside,path.join(root,'agents',agentId),process.platform==='win32'?'junction':'dir')
    await assert.rejects(new AgentWorkspaceStore(root,identity).materialize(snapshot,new AbortController().signal))
    await assert.rejects(new AgentWorkspaceStore(root,identity).workspacePath(agentId))
  }finally{await rm(root,{recursive:true,force:true})}
})

test('first message binds the Host session cwd before sending and rejects renderer-only paths',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'fs-agent-binding-'))
  try{
    const store=new AgentWorkspaceStore(root,identity),signal=new AbortController().signal
    const directory=await store.materialize(snapshot,signal)
    assert.equal(await resolveSessionAgent(store,'legacy',path.join(root,'legacy')),undefined)
    assert.equal(await resolveSessionAgent(store,'missing',undefined),undefined)
    assert.equal(await store.workspacePath(agentId),await realpath(path.join(directory,'workspace')))
    assert.equal(await resolveSessionAgent(store,'foreign',path.join(root,'foreign',agentId,'workspace')),undefined)
    assert.deepEqual(await resolveSessionAgent(store,'first',path.join(directory,'workspace')),{agentId,version:snapshot.version})
    const other={...snapshot,agentId:'40000000-0000-4000-8000-000000000001'}
    const otherDirectory=await store.materialize(other,signal)
    await assert.rejects(resolveSessionAgent(store,'first',path.join(otherDirectory,'workspace')),/AGENT_SESSION_MISMATCH/)
    await store.materialize({...snapshot,version:'b'.repeat(64)},signal)
    assert.equal((await resolveSessionAgent(store,'first',path.join(directory,'workspace'))).version,snapshot.version)
    assert.equal((await resolveSessionAgent(store,'second',path.join(directory,'workspace'))).version,'b'.repeat(64))
  }finally{await rm(root,{recursive:true,force:true})}
})

test('Host canonical workspace path resolves a redirected root without trusting a renderer path',async()=>{
  const canonical=path.resolve('canonical',agentId,'workspace')
  const store=new AgentWorkspaceStore(path.resolve('redirected'),identity)
  const bindings=[]
  store.workspacePath=async requested=>{assert.equal(requested,agentId);return canonical}
  store.bind=async(session,agent)=>{bindings.push({session,agent})}
  store.binding=async()=>({agentId,version:snapshot.version})
  assert.equal((await resolveSessionAgent(store,'canonical-session',canonical)).agentId,agentId)
  assert.equal(await resolveSessionAgent(store,'untrusted-session',path.resolve('foreign',agentId,'workspace')),undefined)
  assert.deepEqual(bindings,[{session:'canonical-session',agent:agentId}])
})

test('Host cwd alias normalization never accepts a junction outside the Agent tree',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-agent-alias-'))
 try{
  const store=new AgentWorkspaceStore(root,identity),directory=await store.materialize(snapshot,new AbortController().signal)
  const outside=path.join(root,'outside',agentId);await mkdir(outside,{recursive:true})
  await symlink(path.join(directory,'workspace'),path.join(outside,'workspace'),process.platform==='win32'?'junction':'dir')
  assert.equal(await resolveSessionAgent(store,'aliased',path.join(outside,'workspace')),undefined)
  assert.equal(await store.binding('aliased'),undefined)
 }finally{await rm(root,{recursive:true,force:true})}
})

test('snapshot transport rejects foreign tenants, oversized bodies and aborted credentials',async()=>{
  const abort=new AbortController(),credentials={...identity,accessToken:'synthetic',signal:abort.signal}
  const foreign=async()=>Response.json({contractVersion:'1.0.0',activeTenantId:'foreign',snapshot})
  await assert.rejects(fetchAgentData('https://dev.fsstory.net',credentials,agentId,foreign))
  await assert.rejects(fetchAgentData('https://dev.fsstory.net',credentials,agentId,async()=>new Response('x'.repeat(2*1024*1024+1))))
  abort.abort()
  await assert.rejects(fetchAgentData('https://dev.fsstory.net',credentials,agentId,foreign))
})

test('Host routes create a named native workspace, keep credentials private, and bind only real sessions',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'fs-agent-host-'))
  const routes=new Map(),registered=[],headers={'x-futurestaff-agent':'1','content-type':'application/json'}
  let live,revoked=false
  const host=mountAgents({
    effect:factory=>factory(),webServer:{register:route=>{routes.set(route.path,route.handler);return()=>{}}},
    get:name=>name==='sessions'?{get:()=>live}:{create:async(directory,title)=>registered.push({directory,title})},
  },'https://dev.fsstory.net',identity,root,async()=>{
    if(revoked)throw Error('revoked')
    return {...identity,accessToken:'synthetic-host-secret',signal:new AbortController().signal}
  },async(url,init)=>{
    assert.equal(init.headers.authorization,'Bearer synthetic-host-secret')
    const modern=String(url).endsWith('?contractVersion=1.1.0')
    return Response.json({contractVersion:modern?'1.1.0':'1.0.0',activeTenantId:identity.tenantId,
      ...(String(url).includes('/snapshot')?{snapshot:modern?modelSnapshot:snapshot}:{items:[]})})
  })
  const server=createServer((req,res)=>routes.get(req.url)?.(req,res))
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin=`http://127.0.0.1:${server.address().port}`
  try{
    const post=(route,body)=>fetch(`${origin}/_futurestaff/agents/${route}`,{method:'POST',headers,body:JSON.stringify(body)})
    const selected=await post('select',{agentId})
    assert.equal(selected.status,200)
    const body=await selected.json()
    assert.equal(registered[0].title,snapshot.name)
    assert.equal(registered[0].directory,path.join(host.store.directory(agentId),'workspace'))
    assert.equal(JSON.stringify(body).includes('synthetic-host-secret'),false)
    assert.equal((await post('bind',{agentId,sessionId:'fake'})).status,409)
    live={header:{cwd:body.path}}
    assert.equal((await host.resolveBinding('real')).agentId,agentId)
    assert.equal((await host.resolveBinding('real')).version,snapshot.version)
    assert.equal((await host.resolvePolicyBinding('real')).version,modelSnapshot.version)
    assert.equal((await post('bind',{agentId,sessionId:'real'})).status,200)
    revoked=true
    assert.equal((await post('select',{agentId})).status,409)
  }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true})}
})
