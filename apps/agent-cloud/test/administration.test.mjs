import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {randomBytes,randomUUID} from 'node:crypto'
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm'
import {administrationContracts,administrationToolNames} from '@futurestaff/fs-platform-access/cloud'
import {createCloudServer} from '../lib/server.js'
import {PlatformGateway} from '../lib/platform.js'
import {ApiError} from '../lib/storage.js'

const platform='https://platform.fsstory.net',origin='http://127.0.0.1:39992'
const tenant=randomUUID(),otherTenant=randomUUID(),member=randomUUID(),otherMember=randomUUID(),model=randomUUID(),manager=randomUUID()
const adminId=randomUUID(),plainId=randomUUID(),erpId=randomUUID(),webId=randomUUID(),mixedId=randomUUID()
const start='2026-11-13T09:00:00+08:00',end='2026-11-13T13:00:00+08:00',previewInput={kind:'annual',start,end,reason:'合成个人安排'}
const hr={job_id:null,job_name:null,grade_id:null,grade_name:null}
const context={...hr,employee_id:member,manager_id:manager,organization_revision:'org-1',can_manage:false,balances:[]}
const key=randomBytes(32).toString('base64'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
function snapshot(id,systems,content){return{agentId:id,name:systems[0]??'资料助手',version:'a'.repeat(64),legacyVersion:'b'.repeat(64),businessSystems:systems,modelPolicy:{primaryModelId:model,fallbackModelId:null},files:[{path:'memory.md',content}]}}
function preview(){
 const id=randomUUID(),expires=Date.now()+590000
 return{intent_id:id,submission_state:'prepared',operation_id:null,expires_at:new Date(expires).toISOString(),result:null,error_code:null,human_confirmation_url:platform+'/administration?intent='+id,
  confirmation_hash:'PRIVATE_HASH_MUST_NOT_LEAK',preview:{...hr,preview_id:id,expires_at:Math.floor(expires/1000),...previewInput,minutes:240,year:2026,account_revision:1,policy_id:randomUUID(),policy_ref:'knowledge:reviewed-only',policy_title:'合成已审核制度',min_minutes:60,available_before_minutes:1440,available_after_minutes:1200,manager_id:manager,organization_revision:'org-1',confirmation_hash:'PRIVATE_HASH_MUST_NOT_LEAK'}}
}
const text=value=>[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:value},{type:'block-end',index:0,block:{type:'text',text:value}},{type:'finish',reason:{kind:'stop'}}]
const tool=(name,args={})=>{const id=ToolCallId(randomUUID()),arguments_=JSON.stringify(args);return[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id,name,argumentsDelta:arguments_},{type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:arguments_}},{type:'finish',reason:{kind:'tool-calls'}}]}
class Adapter extends LlmAdapter {
 calls=[];constructor(script){super();this.script=[...script]}
 async resolveModel(provider,model){return{provider,id:model,name:model}}
 async *stream(options){this.calls.push(options);const next=this.script.shift();if(!next)throw Error('synthetic script exhausted');for(const chunk of typeof next==='function'?await next(options):next){options.signal?.throwIfAborted();yield chunk}}
}
class Gateway {
 origin=platform;tokens=new Map();allowed=new Set(['administration','erp','web']);checks=[]
 snapshots=new Map([[adminId,snapshot(adminId,['administration'],'ADMIN_ONLY_RESOURCE')],[plainId,snapshot(plainId,[],'PLAIN_ONLY_RESOURCE')],[erpId,snapshot(erpId,['erp'],'ERP_ONLY_RESOURCE')],[webId,snapshot(webId,['web'],'WEB_ONLY_RESOURCE')],[mixedId,snapshot(mixedId,['administration','erp'],'MIXED_MUST_NOT_ENTER')]])
 session(t=tenant,u=member){const token=randomUUID();this.tokens.set(token,{activeTenantId:t,user:{userId:u,displayName:'合成员工'}});return{accessToken:token,refreshToken:token,tokenType:'Bearer',expiresIn:3600,audience:'fixture',activeTenantId:t}}
 async login(input){const session=this.session(tenant,input.loginIdentifier==='other'?otherMember:member);return{session,user:this.tokens.get(session.accessToken).user}}
 async currentUser(token){const profile=this.tokens.get(token);if(!profile)throw new ApiError(401,'LOGIN_REQUIRED','合成登录已撤销');return profile}
 async refresh(token){const p=await this.currentUser(token);return{session:this.session(p.activeTenantId,p.user.userId)}}
 async tenants(){return{items:[{tenantId:tenant,displayName:'合成主体'},{tenantId:otherTenant,displayName:'另一合成主体'}]}}
 async switchTenant(_token,id){return{session:this.session(id)}}
 async logout(token){this.tokens.delete(token)}
 async agents(){return[...this.snapshots.values()].map(s=>({agentId:s.agentId,name:s.name,description:'合成',available:true,unavailableReason:null}))}
 async snapshot(_auth,id){const s=this.snapshots.get(id);if(!s)throw new ApiError(403,'AGENT_UNAVAILABLE','配置已撤销');return structuredClone(s)}
 async authorizeSystem(auth,id,signal){signal.throwIfAborted();this.checks.push(id);if(!this.allowed.has(id))throw new ApiError(403,'SYSTEM_NOT_AUTHORIZED','应用已撤权')}
 async models(){return[{modelId:model,displayName:'合成模型',supportsVision:true}]}
}
async function fixture(t,script=[text('合成完成')],options={}){
 const dir=options.dir??await mkdtemp(path.join(tmpdir(),'fs-administration-cloud-')),gateway=options.gateway??new Gateway(),adapters=[],http=[]
 const fetcher=async(input,init={})=>{
  const url=new URL(String(input));assert.equal(url.origin,platform);http.push({url,init})
  assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store')
  if(options.fetcher)return options.fetcher(url,init)
  if(url.pathname==='/desktop/v1/chat')return new Response(JSON.stringify({type:'result',content:'真实适配器合成响应',toolCalls:[],finishReason:'stop'})+'\n',{headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}})
  assert.equal(new Headers(init.headers).get('authorization')?.startsWith('Bearer '),true)
  const part=url.pathname.split('/').at(-1)
  return Response.json(part==='context'?context:part==='requests'?{items:[],next_cursor:null}:part==='ledger'?{items:[]}:part==='policies'?[]:part==='previews'?preview():{intent_id:randomUUID(),submission_state:'unknown',operation_id:part,expires_at:new Date(Date.now()+590000).toISOString(),preview:null,result:null,error_code:null})
 }
 const service=await createCloudServer({publicOrigin:origin,platformOrigin:platform,dataDir:dir,encryptionKey:key,staticDir:path.join(dir,'static'),gateway,sessions:{fetcher,...(!options.realAdapter?{adapterFactory:()=>{const a=new Adapter(script);adapters.push(a);return a}}:{})}})
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const endpoint='http://127.0.0.1:'+service.server.address().port
 let cookie='',csrf='';const versions=new Map()
 const request=async(route,body,system='administration')=>{
  const id=/^\/sessions\/([a-f0-9-]{36})/.exec(route)?.[1]
  if(body&&id&&!Object.hasOwn(body,'contextVersion'))body={...body,contextVersion:versions.get(id)}
  const response=await fetch(endpoint+'/api/v1'+route,{method:body===undefined?'GET':'POST',headers:{origin,cookie,'x-csrf-token':csrf,'x-fs-system':system,...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})})
  const value=await response.json();if(value.session?.contextVersion)versions.set(value.session.id,value.session.contextVersion)
  return{status:response.status,value,response}
 }
 const login=async(name='member')=>{const r=await request('/login',{loginIdentifier:name,password:'synthetic-only'});assert.equal(r.status,200);cookie=r.response.headers.get('set-cookie').split(';')[0];csrf=r.value.csrf;return r}
 const create=async(id=adminId,system='administration')=>{const r=await request('/sessions',{agentId:id,systemId:system,scope:{kind:'system'}});assert.equal(r.status,201,JSON.stringify(r.value));return r.value.session}
 const send=(s,message='合成行政请求',requestId=randomUUID())=>request('/sessions/'+s.id+'/messages',{requestId,text:message,contextVersion:s.contextVersion},s.systemId)
 const wait=async(s)=>{for(let i=0;i<160;i++){const r=await request('/sessions/'+s.id,undefined,s.systemId);assert.equal(r.status,200,JSON.stringify(r.value));if(!['running','waiting'].includes(r.value.session.status))return r.value.session;await pause(20)}throw Error('synthetic turn did not settle')}
 let closed=false;const close=async()=>{if(!closed){closed=true;await service.close()}}
 t.after(async()=>{await close();if(!options.retain)await rm(dir,{recursive:true,force:true})})
 return{dir,gateway,adapters,http,service,endpoint,request,login,create,send,wait,close,get cookie(){return cookie},get csrf(){return csrf}}
}

test('administration gateway admits by validated fixed context and never by the old apps directory',async()=>{
 const calls=[],signal=AbortSignal.timeout(1000),auth={session:{accessToken:'synthetic-only'},tenantId:tenant,user:{userId:member}}
 const gateway=new PlatformGateway(platform,async(url,init)=>{calls.push({url,init});assert.equal(url,platform+'/desktop/v1/administration/context');return Response.json(context)})
 await gateway.authorizeSystem(auth,'administration',signal)
 assert.ok(calls.length>0);assert.ok(calls.every(c=>c.init.redirect==='error'&&new Headers(c.init.headers).get('authorization')==='Bearer synthetic-only'))
 for(const status of [401,403,503]){
  const denied=new PlatformGateway(platform,async()=>Response.json({private:'must not leak'},{status}))
  await assert.rejects(()=>denied.authorizeSystem(auth,'administration',signal),e=>e.status===status&&!e.message.includes('must not leak'))
 }
 const foreign=new PlatformGateway(platform,async()=>Response.json({...context,employee_id:otherMember}))
 await assert.rejects(()=>foreign.authorizeSystem(auth,'administration',signal))
})

test('administration directory and creation require an exclusively dedicated publication and its real model policy',async t=>{
 const f=await fixture(t);await f.login()
 const directory=await f.request('/systems');assert.equal(directory.status,200)
 const admin=directory.value.items.find(s=>s.systemId==='administration');assert.ok(admin);assert.deepEqual(admin.agents.map(a=>a.agentId),[adminId]);assert.equal(admin.mode,'chat')
 for(const id of [plainId,erpId,webId,mixedId])assert.equal((await f.request('/sessions',{agentId:id,systemId:'administration',scope:{kind:'system'}})).status,403)
 const missingModel=randomUUID();f.gateway.snapshots.set(missingModel,{...snapshot(missingModel,['administration'],'NO_MODEL'),modelPolicy:{primaryModelId:null,fallbackModelId:null}})
 assert.equal((await f.request('/sessions',{agentId:missingModel,systemId:'administration',scope:{kind:'system'}})).value.error.code,'MODEL_NOT_CONFIGURED')
 const s=await f.create(),auth=await f.service.auth.load(f.cookie.split('=')[1]),stored=await f.service.sessions.get(auth,s.id,'administration')
 assert.deepEqual(stored.snapshot.modelPolicy,{primaryModelId:model,fallbackModelId:null});assert.equal(s.systemId,'administration')
 f.gateway.allowed.delete('administration');const unavailable=(await f.request('/systems')).value.items.find(x=>x.systemId==='administration');assert.equal(unavailable.available,false)
})

test('an unavailable administration context leaves the other directory entries usable and remains fail closed',async t=>{
 const f=await fixture(t);await f.login();const s=await f.create(),original=f.gateway.authorizeSystem.bind(f.gateway)
 for(const status of [404,503]){
  f.gateway.authorizeSystem=async(auth,system,signal)=>{if(system==='administration')throw new ApiError(status,'ADMINISTRATION_UNAVAILABLE','服务暂时不可用');return original(auth,system,signal)}
  const r=await f.request('/systems');assert.equal(r.status,200);assert.equal(r.value.items.find(x=>x.systemId==='agent').available,true)
  const admin=r.value.items.find(x=>x.systemId==='administration');assert.equal(admin.available,false);assert.ok(admin.unavailableReason.includes('暂时不可用'))
  assert.equal((await f.request('/sessions/'+s.id)).status,status);assert.equal((await f.send(s)).status,status);assert.equal(f.adapters.length,0)
 }
})

test('a real DSH administration turn registers exactly six canonical business tools and renders a verified human link',async t=>{
 const operation=randomUUID(),calls=administrationToolNames.map((name,i)=>tool(name,i===1?{size:5}:i===4?{operation_id:operation}:i===5?previewInput:{}))
 const f=await fixture(t,[...calls,options=>{const encoded=JSON.stringify(options);assert.ok(!encoded.includes('PRIVATE_HASH_MUST_NOT_LEAK'));return text('只准备预览，尚未提交。')}]);await f.login();const s=await f.create()
 assert.equal((await f.send(s)).status,202);const done=await f.wait(s);assert.equal(done.status,'idle')
 const schemas=f.adapters[0].calls[0].tools,names=schemas.map(x=>x.name)
 assert.deepEqual(names.filter(n=>n.startsWith('administration.')).sort(),[...administrationToolNames].sort());assert.ok(!names.includes('erp_query'));assert.ok(!names.includes('website_read'))
 for(const contract of administrationContracts){const actual=schemas.find(x=>x.name===contract.name).parameters;assert.equal(actual.additionalProperties,false);assert.deepEqual(Object.keys(actual.properties).sort(),Object.keys(contract.inputSchema.properties).sort());assert.deepEqual(actual.required??[],contract.inputSchema.required??[])}
 assert.deepEqual(f.http.map(c=>c.url.pathname),['/desktop/v1/administration/context','/desktop/v1/administration/requests','/desktop/v1/administration/ledger','/desktop/v1/administration/policies','/desktop/v1/administration/operations/'+operation,'/desktop/v1/administration/previews'])
 assert.equal(f.http.filter(c=>c.init.method==='POST').length,1);assert.ok(done.messages.some(m=>m.role==='tool'&&m.text.includes('[前往Platform核对并本人确认]('+platform+'/administration?intent=')))
 assert.ok(!JSON.stringify(done).includes('confirmation_hash'));assert.ok(!JSON.stringify(done).includes('PRIVATE_HASH_MUST_NOT_LEAK'))
})

test('an unknown preview cannot be retried in the same turn but an explicit new input gets one new attempt',async t=>{
 let posts=0
 const f=await fixture(t,[tool(administrationToolNames[5],previewInput),tool(administrationToolNames[5],previewInput),text('预览结果未确认。')],{fetcher:async()=>{posts++;throw Error('PRIVATE_PEER_CREDENTIAL')}})
 await f.login();const s=await f.create(),requestId=randomUUID()
 assert.equal((await f.send(s,'准备一次',requestId)).status,202);const done=await f.wait(s);assert.equal(posts,1);assert.ok(JSON.stringify(done).includes('ADMINISTRATION_PREVIEW_OUTCOME_UNKNOWN'));assert.ok(JSON.stringify(done).includes('ADMINISTRATION_PREVIEW_ALREADY_ATTEMPTED'));assert.ok(!JSON.stringify(done).includes('PRIVATE_PEER_CREDENTIAL'))
 assert.equal((await f.send(s,'准备一次',requestId)).status,202);assert.equal(posts,1)
 assert.equal((await f.send(s,'我明确重新准备')).status,202);await f.wait(s);assert.equal(posts,2)
})

test('unknown administration writes and extra identity fields never reach a business HTTP endpoint',async t=>{
 const f=await fixture(t,[tool('administration.leave.submit.v1',{}),tool(administrationToolNames[0],{employee_id:otherMember}),text('只能查询本人及准备预览')]);await f.login();const s=await f.create();await f.send(s);const done=await f.wait(s)
 assert.equal(f.http.length,0);assert.ok(done.messages.some(m=>m.role==='tool'&&m.error));assert.ok(!JSON.stringify(done).includes('PRIVATE_HASH_MUST_NOT_LEAK'))
})

test('administration history restores only in its original owner and system without replaying preview work',async t=>{
 const f=await fixture(t,[tool(administrationToolNames[5],previewInput),text('ADMIN_PRIVATE_HISTORY')],{retain:true});await f.login();const s=await f.create();await f.send(s);await f.wait(s);await f.close()
 const r=await fixture(t,[options=>{assert.ok(JSON.stringify(options).includes('ADMIN_PRIVATE_HISTORY'));return text('已查看原预览，请本人确认')}],{dir:f.dir,gateway:f.gateway});await r.login()
 assert.equal((await r.request('/sessions/'+s.id)).status,200);assert.equal((await r.send(s,'查看已有记录')).status,202);await r.wait(s);assert.equal(r.http.length,0)
 for(const system of ['agent','erp','web','aigc','legacy']){assert.equal((await r.request('/sessions/'+s.id,undefined,system)).status,404);assert.deepEqual((await r.request('/sessions?systemId='+system)).value.items,[])}
 await r.login('other');assert.equal((await r.request('/sessions/'+s.id)).status,404)
 await r.login();assert.equal((await r.request('/tenant',{tenantId:otherTenant})).status,200);assert.equal((await r.request('/sessions/'+s.id)).status,404)
})

test('restart never replays an accepted request whose preview outcome was unknown',async t=>{
 const f=await fixture(t,[tool(administrationToolNames[5],previewInput),text('原预览结果未确认')],{retain:true,fetcher:async()=>{throw Error('synthetic disconnected POST')}});await f.login();const s=await f.create(),requestId=randomUUID()
 await f.send(s,'准备预览',requestId);await f.wait(s);assert.equal(f.http.length,1);await f.close()
 const r=await fixture(t,[text('不会被调用')],{dir:f.dir,gateway:f.gateway});await r.login()
 assert.equal((await r.send(s,'准备预览',requestId)).status,202);assert.equal(r.http.length,0);assert.equal(r.adapters.length,0)
 const restored=(await r.request('/sessions/'+s.id)).value.session;assert.ok(JSON.stringify(restored).includes('ADMINISTRATION_PREVIEW_OUTCOME_UNKNOWN'))
})

test('switching tenant cancels an in-flight preview and a late receipt never enters either workspace',async t=>{
 let entered,release;const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve)
 const f=await fixture(t,[tool(administrationToolNames[5],previewInput),text('不应收到旧预览')],{fetcher:async(_url,init)=>{entered(init.signal);await gate;return Response.json(preview())}})
 await f.login();const s=await f.create(),auth=await f.service.auth.load(f.cookie.split('=')[1]),oldOwner=f.service.auth.owner(auth)
 await f.send(s);const signal=await started
 const switched=f.request('/tenant',{tenantId:otherTenant})
 if(!signal.aborted)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}))
 release();assert.equal((await switched).status,200);assert.equal(f.http.length,1)
 const stored=await f.service.auth.store.read('members/'+oldOwner+'/sessions',s.id)
 assert.equal(stored.status,'stopped');assert.ok(!JSON.stringify(stored).includes('human_confirmation_url'));assert.ok(!JSON.stringify(stored).includes('[前往Platform核对并本人确认]'));assert.ok(!JSON.stringify(stored).includes('PRIVATE_HASH_MUST_NOT_LEAK'))
 assert.equal((await f.request('/sessions/'+s.id)).status,404);assert.deepEqual((await f.request('/sessions?systemId=administration')).value.items,[])
})

test('application or publication revocation blocks administration history and execution before a model starts',async t=>{
 const f=await fixture(t);await f.login();const s=await f.create();f.gateway.allowed.delete('administration')
 assert.equal((await f.request('/sessions/'+s.id)).status,403);assert.equal((await f.send(s)).status,403);assert.deepEqual((await f.request('/sessions?systemId=administration')).value.items,[]);assert.equal(f.adapters.length,0)
 f.gateway.allowed.add('administration');f.gateway.snapshots.set(adminId,snapshot(adminId,['administration','web'],'NEW_MIXED_RESOURCE'))
 assert.equal((await f.request('/sessions/'+s.id)).status,403);assert.equal((await f.send(s)).status,403);assert.equal(f.adapters.length,0)
})

test('a revoked owner cannot receive a late administration result',async t=>{
 const f=await fixture(t,[tool(administrationToolNames[0]),text('不披露撤权后的内容')],{fetcher:async()=>{f.gateway.allowed.delete('administration');return Response.json({...context,employee_name:'LATE_PRIVATE_EMPLOYEE'})}})
 await f.login();const s=await f.create();await f.send(s)
 let settled=false
 for(let i=0;i<100;i++){const raw=await f.service.auth.store.read('members/'+f.service.auth.owner(await f.service.auth.load(f.cookie.split('=')[1]))+'/sessions',s.id);if(raw.status==='idle'||raw.status==='error'){assert.ok(!JSON.stringify(raw).includes('LATE_PRIVATE_EMPLOYEE'));settled=true;break}await pause(20)}
 assert.equal(settled,true,'the revoked tool turn must actually finish before checking its persisted result')
 assert.equal(f.http.length,1);assert.equal((await f.request('/sessions/'+s.id)).status,403)
})

test('administration and the original chat workspaces never share tools, resources or conversation inputs',async t=>{
 const f=await fixture(t,[text('isolated')]);await f.login();const admin=await f.create();await f.send(admin,'ADMIN_PRIVATE_INPUT');await f.wait(admin)
 for(const [id,system]of [[plainId,'agent'],[erpId,'erp'],[webId,'web']]){
  const s=await f.create(id,system);await f.send(s,'本系统输入');await f.wait(s)
  const input=JSON.stringify(f.adapters.at(-1).calls[0]);assert.ok(!input.includes('ADMIN_PRIVATE_INPUT'));assert.ok(!input.includes('ADMIN_ONLY_RESOURCE'));assert.ok(!input.includes('administration.leave.'))
 }
 assert.equal((await f.request('/sessions/'+admin.id+'/messages',{requestId:randomUUID(),text:'stale',contextVersion:'wrong'})).status,409)
})

test('the production model adapter retains the dedicated administration publication and original primary model',async t=>{
 const f=await fixture(t,[],{realAdapter:true});await f.login();const s=await f.create();await f.send(s);const done=await f.wait(s);assert.equal(done.status,'idle')
 const call=f.http.find(c=>c.url.pathname==='/desktop/v1/chat');assert.ok(call)
 const body=JSON.parse(call.init.body);assert.equal(body.agentId,adminId);assert.equal(body.agentVersion,'a'.repeat(64));assert.equal(body.modelId,model);assert.equal(body.modelSelection,'agent-default')
 const names=body.tools.map(t=>t.name);assert.equal(names.filter(n=>n.startsWith('fs_administration_leave_')).length,6);assert.ok(!names.some(n=>n.startsWith('administration.')))
})
