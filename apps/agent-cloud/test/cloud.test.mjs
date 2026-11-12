import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {randomBytes,randomUUID} from 'node:crypto'
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm'
import {createCloudServer} from '../lib/server.js'
import {ApiError} from '../lib/storage.js'
const tenantA=randomUUID(),tenantB=randomUUID(),memberA=randomUUID(),memberB=randomUUID(),agentId=randomUUID(),modelId=randomUUID()
const key=randomBytes(32).toString('base64'),origin='http://127.0.0.1:39991'
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const snapshot={agentId,name:'资料助理',description:'测试',version:'a'.repeat(64),legacyVersion:'b'.repeat(64),modelPolicy:{primaryModelId:modelId,fallbackModelId:null},businessSystems:[],files:[{path:'soul.md',content:'帮助用户检索资料。'},{path:'workspace/knowledge_base/manual.md',content:'蓝鲸项目将在周五验收。'}]}
class Gateway {
  origin='https://platform.fsstory.net';tokens=new Map();revision=snapshot;revisions=new Map()
  session(tenant,user){const token=randomUUID();this.tokens.set(token,{activeTenantId:tenant,user:{userId:user,displayName:'测试成员'}});return{accessToken:token,refreshToken:token,tokenType:'Bearer',expiresIn:3600,audience:'futurestaff-agent-pc-dev',activeTenantId:tenant}}
  async login(input){const session=this.session(tenantA,input.loginIdentifier==='other'?memberB:memberA);return{session,user:this.tokens.get(session.accessToken).user}}
  async currentUser(token){const p=this.tokens.get(token);if(!p)throw Error('token missing');return p}
  async refresh(token){const p=await this.currentUser(token);return{session:this.session(p.activeTenantId,p.user.userId)}}
  async tenants(){return{items:[{tenantId:tenantA,displayName:'主体甲'},{tenantId:tenantB,displayName:'主体乙'}]}}
  async switchTenant(token,tenant){return{session:this.session(tenant,tenant===tenantB?memberB:memberA)}}
  async logout(token){this.tokens.delete(token)}
  async agents(){return[{agentId,name:'资料助理',description:'测试',available:true,unavailableReason:null}]}
  async snapshot(_auth,id){return structuredClone(this.revisions.get(id)??this.revision)}
  allowedSystems=new Set(['erp','web'])
  async authorizeSystem(_auth,id){if(!this.allowedSystems.has(id))throw new ApiError(403,'SYSTEM_NOT_AUTHORIZED','业务系统已撤权')}
  async models(){return[{modelId,displayName:'测试模型',supportsVision:true}]}
}
const text=text=>[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text},{type:'block-end',index:0,block:{type:'text',text}},{type:'finish',reason:{kind:'stop'}}]
const tool=(name,args)=>{const id=ToolCallId(randomUUID()),arguments_=JSON.stringify(args);return[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id,name,argumentsDelta:arguments_},{type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:arguments_}},{type:'finish',reason:{kind:'tool-calls'}}]}
class Adapter extends LlmAdapter {
  calls=[];constructor(script){super();this.script=script}
  async resolveModel(provider,model){return{provider,id:model,name:model}}
  async *stream(options){this.calls.push(options);const next=this.script.shift();if(!next)throw Error('mock exhausted');const chunks=typeof next==='function'?await next(options):next;for(const chunk of chunks){options.signal?.throwIfAborted();yield chunk}}
}
async function fixture(t,script=[text('已完成')],existing){
  const dir=existing?.dir??await mkdtemp(path.join(tmpdir(),'fs-cloud-test-')),gateway=existing?.gateway??new Gateway(),adapters=[]
  const service=await createCloudServer({publicOrigin:origin,platformOrigin:gateway.origin,dataDir:dir,encryptionKey:key,staticDir:path.join(dir,'static'),gateway,sessions:{adapterFactory:()=>{const a=new Adapter([...script]);adapters.push(a);return a}}})
  await new Promise(r=>service.server.listen(0,'127.0.0.1',r));const endpoint=`http://127.0.0.1:${service.server.address().port}`
  let cookie='',csrf='';const contexts=new Map()
  const request=async(route,body,extras={})=>{const id=/^\/sessions\/([a-f0-9-]{36})/.exec(route)?.[1];if(body&&id&&!Object.hasOwn(body,'contextVersion'))body={...body,contextVersion:contexts.get(id)};const response=await fetch(endpoint+'/api/v1'+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'content-type':'application/json'}),cookie,'x-csrf-token':csrf,'x-fs-system':'agent',...extras},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();if(value.session?.contextVersion)contexts.set(value.session.id,value.session.contextVersion);return{status:response.status,value,response}}
  const login=async(name='member')=>{const r=await request('/login',{loginIdentifier:name,password:'test-password'});assert.equal(r.status,200,JSON.stringify(r.value));cookie=r.response.headers.get('set-cookie').split(';')[0];csrf=r.value.csrf;return r}
  const create=async(systemId='agent')=>{const r=await request('/sessions',{agentId,systemId,scope:{kind:'system'}});assert.equal(r.status,201,JSON.stringify(r.value));return r.value.session}
  const wait=async(id,predicate=d=>!['running','waiting'].includes(d.status))=>{for(let i=0;i<180;i++){const r=await request('/sessions/'+id);assert.equal(r.status,200);if(predicate(r.value.session))return r.value.session;await pause(25)}throw Error('session timeout')}
  let closed=false
  const close=async()=>{if(!closed){closed=true;await service.close()}}
  t.after(async()=>{await close();if(!existing?.retain)await rm(dir,{recursive:true,force:true})})
  return{dir,gateway,adapters,service,endpoint,request,login,create,wait,close,get cookie(){return cookie},get csrf(){return csrf}}
}

test('login cookie, CSRF and cross-origin admission reject without model work',async t=>{
  const f=await fixture(t);assert.equal((await f.request('/me')).status,401)
  const logged=await f.login();assert.match(logged.response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.equal(logged.value.session,undefined)
  assert.equal((await f.request('/sessions',{agentId},{'x-csrf-token':'wrong'})).status,403)
  assert.equal((await f.request('/sessions',{agentId},{Origin:'https://evil.example'})).status,403)
  assert.equal(f.adapters.length,0)
  const files=await (await import('node:fs/promises')).readdir(path.join(f.dir,'auth'));const disk=await readFile(path.join(f.dir,'auth',files[0]),'utf8');assert.ok(!disk.includes('accessToken'));assert.ok(!disk.includes('test-password'))
})

test('AIGC SSO uses current identity, CSRF and a fixed PKCE callback without a model or chat context',async t=>{
  const f=await fixture(t);let calls=0
  f.gateway.authorizeAigc=async(auth,input)=>{calls++;assert.equal(auth.tenantId,tenantA);assert.equal(auth.user.userId,memberA);assert.deepEqual(Object.keys(input).sort(),['codeChallenge','state']);return{redirectUrl:'https://aigc.fsstory.net/oauth/callback/futurestaff?code='+('c'.repeat(43))+'&state='+input.state}}
  const input={launchId:randomUUID(),tenantId:tenantA,memberId:memberA,state:'s'.repeat(43),codeChallenge:'h'.repeat(43)}
  assert.equal((await f.request('/aigc/authorize',input)).status,401)
  await f.login()
  assert.equal((await f.request('/aigc/authorize',input,{'x-csrf-token':'wrong'})).status,403)
  assert.equal((await f.request('/aigc/authorize',input,{Origin:'https://evil.test'})).status,403)
  const r=await f.request('/aigc/authorize',input)
  assert.equal(r.status,200,JSON.stringify(r.value));assert.equal(new URL(r.value.callbackUrl).searchParams.get('state'),input.state)
  assert.equal((await f.request('/aigc/authorize',input)).value.callbackUrl,r.value.callbackUrl)
  assert.equal(calls,1);assert.equal(f.adapters.length,0)
  assert.deepEqual(Object.keys(r.value),['callbackUrl']);assert.equal(r.response.headers.get('cache-control'),'no-store')
  assert.equal((await f.request('/aigc/authorize',{...input,codeChallenge:'x'.repeat(43)})).status,409)
  assert.equal((await f.request('/aigc/authorize',{...input,launchId:randomUUID(),tenantId:tenantB})).status,409)
  assert.equal((await f.request('/aigc/authorize',{...input,launchId:randomUUID(),projectId:randomUUID()})).status,400)
  assert.equal(calls,1)
})

test('AIGC handoff rejects malformed or cross-host callbacks and preserves authorization failures',async t=>{
  const f=await fixture(t);await f.login()
  const input=()=>({launchId:randomUUID(),tenantId:tenantA,memberId:memberA,state:'s'.repeat(43),codeChallenge:'h'.repeat(43)})
  f.gateway.authorizeAigc=async()=>{throw new ApiError(403,'AIGC_ACCESS_DENIED','当前没有AIGC权限')}
  assert.equal((await f.request('/aigc/authorize',input())).status,403)
  for(const redirectUrl of ['https://evil.test/oauth/callback/futurestaff?code='+('c'.repeat(43))+'&state='+('s'.repeat(43)),'https://aigc.fsstory.net/oauth/callback/futurestaff?code='+('c'.repeat(43))+'&state=wrong']){
    f.gateway.authorizeAigc=async()=>({redirectUrl})
    assert.equal((await f.request('/aigc/authorize',input())).status,502)
  }
  assert.equal(f.adapters.length,0)
})

test('cached AIGC codes cannot be delivered after a subject switch or logout',async t=>{
  const f=await fixture(t);await f.login();let calls=0
  f.gateway.authorizeAigc=async(_auth,input)=>{calls++;return{redirectUrl:'https://aigc.fsstory.net/oauth/callback/futurestaff?code='+('c'.repeat(43))+'&state='+input.state}}
  const input={launchId:randomUUID(),tenantId:tenantA,memberId:memberA,state:'s'.repeat(43),codeChallenge:'h'.repeat(43)}
  assert.equal((await f.request('/aigc/authorize',input)).status,200)
  const switched=await f.request('/tenant',{tenantId:tenantB});assert.equal(switched.status,200)
  assert.equal((await f.request('/aigc/authorize',input,{'x-csrf-token':switched.value.csrf})).status,409)
  await f.request('/logout',{}, {'x-csrf-token':switched.value.csrf})
  assert.equal((await f.request('/aigc/authorize',input)).status,401);assert.equal(calls,1)
})
test('actual DSH tool round trip persists native history and deduplicates accepted inputs',async t=>{
  const f=await fixture(t,[tool('knowledge_search',{query:'蓝鲸'}),options=>{assert.ok(JSON.stringify(options.messages).includes('周五验收'));return text('蓝鲸项目周五验收。')}]);await f.login();const s=await f.create(),requestId=randomUUID(),input={requestId,text:'蓝鲸项目什么时候验收？'}
  assert.equal((await f.request(`/sessions/${s.id}/messages`,input)).status,202)
  const done=await f.wait(s.id);assert.equal(done.status,'idle');assert.ok(done.messages.some(m=>m.text==='蓝鲸项目周五验收。'));assert.equal(f.adapters[0].calls.length,2)
  assert.equal((await f.request(`/sessions/${s.id}/messages`,input)).status,202);assert.equal(f.adapters[0].calls.length,2)
  assert.equal((await f.request(`/sessions/${s.id}/messages`,{...input,text:'不同内容'})).status,409)
  const persisted=await f.service.sessions.get(await f.service.auth.load(f.cookie.split('=')[1]),s.id);assert.equal(persisted.hasLog,true)
})
test('question survives browser disconnect and answer has exactly one tool continuation',async t=>{
  const f=await fixture(t,[tool('ask_user_question',{question:'选择哪个方案？',options:['甲','乙']}),text('按甲执行。')]);await f.login();const s=await f.create()
  await f.request(`/sessions/${s.id}/messages`,{requestId:randomUUID(),text:'先询问方案'})
  const waiting=await f.wait(s.id,d=>d.status==='waiting');assert.ok(waiting.question.id);assert.equal(f.adapters[0].calls.length,1)
  await pause(80);assert.equal((await f.request(`/sessions/${s.id}`)).value.session.question.id,waiting.question.id)
  const answer={requestId:randomUUID(),questionId:waiting.question.id,answer:'甲'}
  assert.equal((await f.request(`/sessions/${s.id}/answer`,answer)).status,202)
  assert.equal((await f.wait(s.id)).status,'idle');assert.equal((await f.request(`/sessions/${s.id}/answer`,answer)).status,202);assert.equal(f.adapters[0].calls.length,2)
})
test('tenant and member ownership deny reading sessions and files',async t=>{
  const f=await fixture(t);await f.login();const s=await f.create();await f.login('other');assert.equal((await f.request('/sessions/'+s.id)).status,404)
  await f.login();const switched=await f.request('/tenant',{tenantId:tenantB});assert.equal(switched.status,200);assert.equal(switched.value.user.userId,memberB)
  assert.equal((await f.request('/sessions/'+s.id)).status,404)
})
test('pinned Agent authorization changes stop a model call before dispatch',async t=>{
  const f=await fixture(t);await f.login();const s=await f.create();f.gateway.revision={...snapshot,version:'c'.repeat(64)}
  assert.equal((await f.request(`/sessions/${s.id}/messages`,{requestId:randomUUID(),text:'hello'})).status,409);assert.equal(f.adapters.length,0)
})
test('cloud restart resumes completed DSH history despite a missing UI hasLog marker',async t=>{
  const f=await fixture(t,[text('第一回合')],{retain:true});await f.login();const s=await f.create();await f.request(`/sessions/${s.id}/messages`,{requestId:randomUUID(),text:'remember this'});await f.wait(s.id);await f.close()
  const docFile=path.join(f.dir,'members',f.service.auth.owner(await f.service.auth.load(f.cookie.split('=')[1])),'sessions',s.id+'.json')
  const doc=JSON.parse(await readFile(docFile,'utf8'));delete doc.hasLog;await (await import('node:fs/promises')).writeFile(docFile,JSON.stringify(doc))
  const r=await fixture(t,[options=>{assert.ok(JSON.stringify(options.messages).includes('第一回合'));return text('已恢复')}],{dir:f.dir,gateway:f.gateway});await r.login();assert.equal((await r.request(`/sessions/${s.id}/messages`,{requestId:randomUUID(),text:'continue',contextVersion:s.contextVersion})).status,202);assert.ok((await r.wait(s.id)).messages.some(m=>m.text==='已恢复'))
})
test('stopping a pending question releases the tool without further model calls',async t=>{
  const f=await fixture(t,[tool('ask_user_question',{question:'等待回答'})]);await f.login();const s=await f.create();await f.request(`/sessions/${s.id}/messages`,{requestId:randomUUID(),text:'ask'});await f.wait(s.id,d=>d.status==='waiting')
  const stop=await f.request(`/sessions/${s.id}/stop`,{});assert.equal(stop.status,200);assert.equal(stop.value.session.status,'stopped');assert.equal(stop.value.session.question,undefined);assert.equal(f.adapters[0].calls.length,1)
})
test('normalized image is private, MIME checked and usable by a DSH user input',async t=>{
  const f=await fixture(t);await f.login();const s=await f.create(),image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64')
  const response=await fetch(f.endpoint+`/api/v1/sessions/${s.id}/attachments`,{method:'POST',headers:{Origin:origin,cookie:f.cookie,'x-csrf-token':f.csrf,'content-type':'image/png','x-file-name':'photo.png','x-fs-system':'agent','x-fs-context':s.contextVersion},body:image});assert.equal(response.status,201);const {attachment}=await response.json()
  const privateImage=await fetch(f.endpoint+attachment.url,{headers:{cookie:f.cookie}});assert.equal(privateImage.status,200);assert.equal(privateImage.headers.get('cache-control'),'no-store')
  assert.equal((await fetch(f.endpoint+attachment.url)).status,401)
  await f.request(`/sessions/${s.id}/messages`,{requestId:randomUUID(),text:'看图',attachmentIds:[attachment.id]});await f.wait(s.id);assert.ok(f.adapters[0].calls[0].messages.some(m=>m.content.some(b=>b.type==='image')))
})

test('concurrent cold loads use one canonical document and one accepted turn',async t=>{
  const f=await fixture(t,[text('种子')],{retain:true});await f.login();const s=await f.create();await f.close()
  const r=await fixture(t,[text('只调用一次')],{dir:f.dir,gateway:f.gateway});await r.login()
  const member=await r.service.auth.load(r.cookie.split('=')[1]),[a,b]=await Promise.all([r.service.sessions.get(member,s.id),r.service.sessions.get(member,s.id)]);assert.equal(a,b)
  const input={requestId:randomUUID(),text:'同一请求'};await Promise.all([r.service.sessions.send(member,a,{...input,contextVersion:s.contextVersion}),r.service.sessions.send(member,b,{...input,contextVersion:s.contextVersion})]);await r.wait(s.id);assert.equal(r.adapters.reduce((n,a)=>n+a.calls.length,0),1)
})
test('stop during asynchronous runtime mount prevents later dispatch',async t=>{
  const f=await fixture(t);await f.login();const s=await f.create(),member=await f.service.auth.load(f.cookie.split('=')[1]),doc=await f.service.sessions.get(member,s.id)
  let release,entered;const enteredPromise=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
  f.gateway.snapshot=async()=>{entered();await gate;return structuredClone(snapshot)}
  const sending=f.service.sessions.send(member,doc,{requestId:randomUUID(),text:'不可执行',contextVersion:s.contextVersion});await enteredPromise
  const stopping=f.service.sessions.stop(doc);release();await assert.rejects(sending,/任务已停止/);await stopping;assert.equal(doc.status,'stopped');assert.equal(f.adapters.length,0)
})
test('logout concurrent with refresh cannot restore the deleted browser session',async t=>{
  const f=await fixture(t);await f.login();const id=f.cookie.split('=')[1],member=await f.service.auth.load(id);member.expiresAt=0;await f.service.auth.save(member)
  let release,entered;const gate=new Promise(r=>release=r),start=new Promise(r=>entered=r),original=f.gateway.refresh.bind(f.gateway)
  f.gateway.refresh=async token=>{entered();await gate;return original(token)}
  const refreshing=f.service.auth.fresh(id);await start;const exiting=f.service.auth.logout(member);release();await assert.rejects(refreshing);await exiting;await assert.rejects(f.service.auth.load(id));assert.equal((await f.request('/me')).status,401)
})
test('restart retains the pending question and explicit answer resumes without repeating old tools',async t=>{
  const f=await fixture(t,[tool('ask_user_question',{question:'重启后还回答吗？'})],{retain:true});await f.login();const s=await f.create();await f.request(`/sessions/${s.id}/messages`,{requestId:randomUUID(),text:'ask'});const waiting=await f.wait(s.id,d=>d.status==='waiting');await f.close()
  const r=await fixture(t,[text('已收到重启后的回答')],{dir:f.dir,gateway:f.gateway});await r.login();const restored=(await r.request('/sessions/'+s.id)).value.session;assert.equal(restored.status,'interrupted');assert.equal(restored.question.id,waiting.question.id)
  const answer={requestId:randomUUID(),questionId:restored.question.id,answer:'是'};assert.equal((await r.request(`/sessions/${s.id}/answer`,answer)).status,202);assert.equal((await r.wait(s.id)).status,'idle');assert.equal(r.adapters[0].calls.length,1)
})


test('single-system admission rejects missing or unauthorized systems without model dispatch',async t=>{
  const f=await fixture(t);await f.login();
  assert.equal((await f.request('/sessions',{agentId})).status,400);
  assert.equal((await f.request('/sessions',{agentId,systemId:'erp',scope:{kind:'system'}})).status,403);
  assert.equal(f.adapters.length,0);
});

test('dedicated system snapshots never mix tools, published resources or private conversation inputs',async t=>{
  const f=await fixture(t,[text('ERP范围')]);await f.login();
  f.gateway.revision={...snapshot,businessSystems:['erp'],files:[{path:'memory.md',content:'ERP_ONLY_PUBLISHED_MEMORY'}]};
  const s=await f.create('erp');
  assert.equal(s.systemId,'erp');assert.ok(s.contextVersion);
  const stored=await f.service.auth.store.read('members/'+f.service.auth.owner(await f.service.auth.load(f.cookie.split('=')[1]))+'/sessions',s.id);assert.equal(stored.snapshot.files[0].content,'ERP_ONLY_PUBLISHED_MEMORY');
  const input={requestId:randomUUID(),text:'ERP_PRIVATE_CONTEXT_CANARY',contextVersion:s.contextVersion};
  assert.equal((await f.request('/sessions/'+s.id+'/messages',input,{'x-fs-system':'erp'})).status,202);
  let done;for(let i=0;i<100;i++){done=await f.request('/sessions/'+s.id,undefined,{'x-fs-system':'erp'});if(done.value.session.status==='idle')break;await pause(25);}
  const options=f.adapters[0].calls[0],encoded=JSON.stringify(options);
  assert.ok(encoded.includes('erp_query'));assert.ok(!encoded.includes('website_read'));
  assert.ok(!encoded.includes('PRIVATE_MIXED_MEMORY_CANARY'));assert.ok(!encoded.includes('PRIVATE_MIXED_HELP_CANARY'));
  assert.equal((await f.request('/sessions/'+s.id,undefined,{'x-fs-system':'web'})).status,404);
  const wrong=await f.request('/sessions/'+s.id+'/messages',{...input,requestId:randomUUID()},{'x-fs-system':'web'});assert.equal(wrong.status,404);
  assert.deepEqual((await f.request('/sessions?systemId=web')).value.items,[]);
  const webAgentId=randomUUID();f.gateway.revisions.set(webAgentId,{...snapshot,agentId:webAgentId,businessSystems:['web'],files:[]});
  const created=await f.request('/sessions',{agentId:webAgentId,systemId:'web',scope:{kind:'system'}});assert.equal(created.status,201);const web=created.value.session;
  assert.equal((await f.request('/sessions/'+web.id+'/messages',{...input,text:'只查询网站',contextVersion:web.contextVersion},{'x-fs-system':'web'})).status,202);
  for(let i=0;i<100;i++){const r=await f.request('/sessions/'+web.id,undefined,{'x-fs-system':'web'});if(r.value.session.status==='idle')break;await pause(25);}
  const webInput=JSON.stringify(f.adapters[1].calls[0]);assert.ok(webInput.includes('website_read'));assert.ok(!webInput.includes('erp_query'));assert.ok(!webInput.includes('ERP_PRIVATE_CONTEXT_CANARY'));assert.ok(!webInput.includes('ERP_ONLY_PUBLISHED_MEMORY'));
  assert.equal((await f.request('/sessions?systemId=erp')).value.items.length,1);assert.equal((await f.request('/sessions?systemId=web')).value.items[0].id,web.id);
  assert.equal((await fetch(f.endpoint+'/api/v1/sessions/'+s.id+'/export?systemId=web',{headers:{cookie:f.cookie}})).status,404);

});

test('context versions are server-owned and a stale write does not start model work',async t=>{
  const f=await fixture(t);await f.login();const s=await f.create();
  const stale=await f.request('/sessions/'+s.id+'/messages',{requestId:randomUUID(),text:'hello',contextVersion:'client-guessed'},{'x-fs-system':'agent'});
  assert.equal(stale.status,409);assert.equal(f.adapters.length,0);
});


test('legacy non-business history is preserved read-only and never resumes its old runtime',async t=>{
  const f=await fixture(t);await f.login();const s=await f.create();
  const auth=await f.service.auth.load(f.cookie.split('=')[1]),doc=await f.service.sessions.get(auth,s.id);
  delete doc.systemId;delete doc.scope;delete doc.contextVersion;doc.messages.push({id:randomUUID(),role:'assistant',text:'OLD_MIXED_HISTORY',time:Date.now()});
  await f.service.auth.store.write('members/'+doc.owner+'/sessions',doc.id,doc);
  const old=await f.request('/sessions/'+s.id,undefined,{'x-fs-system':'legacy'});assert.equal(old.status,200);assert.equal(old.value.session.readOnly,true);assert.ok(old.value.session.messages.some(m=>m.text==='OLD_MIXED_HISTORY'));
  const write=await f.request('/sessions/'+s.id+'/messages',{requestId:randomUUID(),text:'继续'},{'x-fs-system':'legacy'});assert.equal(write.status,409);assert.equal(write.value.error.code,'LEGACY_READ_ONLY');assert.equal(f.adapters.length,0);
  assert.equal((await f.request('/sessions/'+s.id,undefined,{'x-fs-system':'agent'})).status,404);
});

test('published version change preserves authorized history but blocks old execution',async t=>{
  const f=await fixture(t);await f.login();const s=await f.create();f.gateway.revision={...snapshot,version:'d'.repeat(64)};
  assert.equal((await f.request('/sessions/'+s.id)).status,200);
  assert.equal((await f.request('/sessions/'+s.id+'/messages',{requestId:randomUUID(),text:'继续'})).status,409);assert.equal(f.adapters.length,0);
});

test('private attachments reject another system even for the same signed-in member',async t=>{
  const f=await fixture(t);await f.login();const s=await f.create(),image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64');
  const result=await fetch(f.endpoint+'/api/v1/sessions/'+s.id+'/attachments',{method:'POST',headers:{Origin:origin,cookie:f.cookie,'x-csrf-token':f.csrf,'x-fs-system':'agent','x-fs-context':s.contextVersion,'content-type':'image/png'},body:image});assert.equal(result.status,201);const {attachment}=await result.json();
  assert.equal((await fetch(f.endpoint+attachment.url.replace('systemId=agent','systemId=erp'),{headers:{cookie:f.cookie}})).status,404);
  assert.equal((await fetch(f.endpoint+attachment.url,{headers:{cookie:f.cookie}})).status,200);
});


test('old business history remains on disk but cannot bypass current domain authorization',async t=>{
  const f=await fixture(t);await f.login();f.gateway.revision={...snapshot,businessSystems:['erp']};const s=await f.create('erp');
  const auth=await f.service.auth.load(f.cookie.split('=')[1]),doc=await f.service.sessions.get(auth,s.id);delete doc.systemId;delete doc.scope;delete doc.contextVersion;
  await f.service.auth.store.write('members/'+doc.owner+'/sessions',doc.id,doc);
  const read=await f.request('/sessions/'+s.id,undefined,{'x-fs-system':'legacy'});assert.equal(read.status,409);assert.equal(read.value.error.code,'LEGACY_SCOPE_UNVERIFIED');
  assert.deepEqual((await f.request('/sessions?systemId=legacy')).value.items,[]);assert.ok(await f.service.auth.store.read('members/'+doc.owner+'/sessions',doc.id));assert.equal(f.adapters.length,0);
});


test('business app revocation blocks scoped history and new model dispatch even while Agent scope stays published',async t=>{
  const f=await fixture(t);await f.login();f.gateway.revision={...snapshot,businessSystems:['erp']};const s=await f.create('erp');f.gateway.allowedSystems.delete('erp');
  assert.equal((await f.request('/sessions/'+s.id,undefined,{'x-fs-system':'erp'})).status,403);
  assert.equal((await f.request('/sessions/'+s.id+'/messages',{requestId:randomUUID(),text:'continue',contextVersion:s.contextVersion},{'x-fs-system':'erp'})).status,403);
  assert.equal(f.adapters.length,0);
  const systems=await f.request('/systems');assert.equal(systems.value.items.find(x=>x.systemId==='erp').available,false);
});


test('multi-system publications are rejected before an upstream adapter can rehydrate mixed context',async t=>{
  const f=await fixture(t);await f.login();f.gateway.revision={...snapshot,businessSystems:['erp','web'],files:[{path:'memory.md',content:'MIXED_UPSTREAM_CANARY'}]};
  assert.equal((await f.request('/sessions',{agentId,systemId:'erp',scope:{kind:'system'}})).status,403);
  assert.equal((await f.request('/sessions',{agentId,systemId:'web',scope:{kind:'system'}})).status,403);
  const mixed=f.gateway.revision;f.gateway.revision={...snapshot};delete f.gateway.revision.businessSystems;assert.equal((await f.request('/sessions',{agentId,systemId:'agent',scope:{kind:'system'}})).status,403);f.gateway.revision=mixed;
  const systems=await f.request('/systems');assert.equal(systems.value.items.find(x=>x.systemId==='erp').available,false);assert.equal(f.adapters.length,0);
});


test('one revoked configuration does not hide authorized history and repeated agents share one list authorization check',async t=>{
  const f=await fixture(t);await f.login();const first=await f.create(),second=await f.create(),revokedId=randomUUID();f.gateway.revisions.set(revokedId,{...snapshot,agentId:revokedId});
  assert.equal((await f.request('/sessions',{agentId:revokedId,systemId:'agent',scope:{kind:'system'}})).status,201);
  const original=f.gateway.snapshot.bind(f.gateway);let calls=0;f.gateway.snapshot=async(auth,id)=>{calls++;if(id===revokedId)throw new ApiError(403,'AGENT_UNAVAILABLE','revoked');return original(auth,id)};
  const listed=await f.request('/sessions?systemId=agent');assert.equal(listed.status,200);assert.deepEqual(new Set(listed.value.items.map(x=>x.id)),new Set([first.id,second.id]));assert.equal(calls,2);
});
