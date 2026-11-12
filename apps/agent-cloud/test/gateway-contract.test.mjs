import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {pathToFileURL,fileURLToPath} from 'node:url'

const repo = fileURLToPath(new URL('../../../',import.meta.url))
const {createCloudServer} = await import(pathToFileURL(path.join(repo,'apps/agent-cloud/lib/server.js')).href)
const {PlatformGateway} = await import(pathToFileURL(path.join(repo,'apps/agent-cloud/lib/platform.js')).href)
const origin = 'https://platform.fsstory.net'
const tenantId = randomUUID(), userId = randomUUID(), agentId = randomUUID(), modelId = randomUUID()
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const legacy = {agentId,name:'合同测试助理',description:'独立模拟',files:[{path:'soul.md',content:'请调用检索工具核对资料。'},{path:'workspace/knowledge_base/manual.md',content:'蓝鲸项目将在周五验收。'}],businessSystems:[]}
const configured = {...legacy,legacyVersion:hash(legacy),modelPolicy:{primaryModelId:modelId,fallbackModelId:null}}
const snapshot = {...configured,version:hash(configured)}
const meta = {contractVersion:'0.1.1',simulated:false}
const user = {userId,displayName:'合同测试成员'}
const session = token => ({accessToken:'synthetic-access-'+token+'-with-enough-entropy',refreshToken:'synthetic-refresh-'+token+'-with-enough-entropy',tokenType:'Bearer',expiresIn:3600,audience:'futurestaff-agent-pc-dev',activeTenantId:tenantId})
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})

test('production AIGC gateway calls only the dedicated PKCE authorization path and validates the callback',async()=>{
  const challenge={state:'s'.repeat(43),codeChallenge:'h'.repeat(43)},seen=[]
  const fetcher=async(url,init)=>{seen.push({url,init});assert.equal(url,origin+'/desktop/v1/apps/aigc/browser-authorize');assert.equal(init.method,'POST');assert.equal(new Headers(init.headers).get('authorization'),'Bearer synthetic-access-token');assert.deepEqual(JSON.parse(init.body),{clientId:'futurestaff-aigc-prod',redirectUri:'https://aigc.fsstory.net/oauth/callback/futurestaff',...challenge});return json({redirectUrl:'https://aigc.fsstory.net/oauth/callback/futurestaff?code='+('c'.repeat(43))+'&state='+challenge.state,meta})}
  const gateway=new PlatformGateway(origin,fetcher)
  const result=await gateway.authorizeAigc({session:{accessToken:'synthetic-access-token'}},challenge,AbortSignal.timeout(1000))
  assert.equal(new URL(result.redirectUrl).searchParams.get('state'),challenge.state);assert.equal(seen.length,1)
  const hostile=new PlatformGateway(origin,async()=>json({redirectUrl:'https://evil.test/?code='+('c'.repeat(43))+'&state='+challenge.state,meta}))
  await assert.rejects(()=>hostile.authorizeAigc({session:{accessToken:'synthetic-access-token'}},challenge,AbortSignal.timeout(1000)))
})

function productionContract() {
  let token = 1, modelCalls = 0, wrongModelTenant = false
  const requests = []
  const fetcher = async (input, init={}) => {
    const url = new URL(String(input))
    assert.equal(url.origin,origin)
    const body = init.body ? JSON.parse(init.body) : undefined
    requests.push({path:url.pathname,body})
    if(url.pathname==='/desktop/v1/auth/password') {
      assert.deepEqual(body,{loginIdentifier:'contract-user',password:'synthetic-password'})
      return json({session:session(token),user,meta})
    }
    if(url.pathname==='/desktop/v1/profile') return json({activeTenantId:tenantId,user,meta})
    if(url.pathname==='/desktop/v1/tenants') return json({activeTenantId:tenantId,items:[{tenantId,displayName:'合同测试主体',slug:'contract-test',role:'member',logoUrl:null}],meta})
    if(url.pathname==='/desktop/v1/models') return json({activeTenantId:wrongModelTenant?randomUUID():tenantId,activeModelId:modelId,items:[{modelId,displayName:'合同测试模型',provider:'openai',model:'synthetic',supportsVision:true,isDefault:true}],meta})
    if(url.pathname==='/desktop/v1/auth/refresh') {
      assert.equal(body.clientId,'futurestaff-agent-pc-dev')
      assert.match(body.refreshToken,/^synthetic-refresh-/)
      token++
      return json({session:session(token),meta})
    }
    if(url.pathname==='/desktop/v1/auth/logout') return json({ok:true,revocationEffectiveWithinSeconds:60,meta})
    if(url.pathname==='/desktop/v1/agents') return json({contractVersion:'1.0.0',activeTenantId:tenantId,items:[{agentId,name:snapshot.name,description:snapshot.description,available:true,unavailableReason:null}]})
    if(url.pathname===`/desktop/v1/agents/${agentId}/snapshot`) {
      assert.equal(url.searchParams.get('contractVersion'),'1.1.0')
      return json({contractVersion:'1.1.0',activeTenantId:tenantId,snapshot})
    }
    if(url.pathname==='/desktop/v1/chat') {
      assert.equal(body.agentId,agentId)
      assert.equal(body.agentVersion,snapshot.version)
      assert.equal(body.agentContractVersion,'1.1.0')
      assert.equal(body.modelSelection,'agent-default')
      assert.equal(body.modelId,modelId)
      assert.match(body.requestId,/^[a-f0-9-]{36}$/)
      assert.ok(body.tools.some(tool=>tool.name==='knowledge_search'))
      assert.ok(!body.tools.some(tool=>/shell|bash|write|erp_prepare/.test(tool.name)))
      const result = modelCalls++ === 0
        ? {type:'result',content:'',toolCalls:[{id:'contract-knowledge-1',name:'knowledge_search',arguments:'{"query":"蓝鲸"}'}],finishReason:'tool-calls'}
        : {type:'result',content:'蓝鲸项目周五验收。',toolCalls:[],finishReason:'stop'}
      if(modelCalls===2) assert.ok(body.messages.some(message=>message.role==='tool' && message.content.includes('周五验收')))
      return new Response(JSON.stringify(result)+'\n',{headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}})
    }
    throw Error('Unexpected synthetic HTTP route '+url.pathname)
  }
  return {fetcher,requests,get modelCalls(){return modelCalls},wrongTenant(){wrongModelTenant=true}}
}

test('cloud uses production decoders and real chat adapter for one native tool turn, refresh and dedup',async t=>{
  const mock = productionContract()
  const directory = await mkdtemp(path.join(tmpdir(),'fs-agent-cloud-contract-'))
  const gateway = new PlatformGateway(origin,mock.fetcher)
  const publicOrigin = 'http://127.0.0.1:39992'
  const service = await createCloudServer({publicOrigin,platformOrigin:origin,dataDir:directory,encryptionKey:randomBytes(32).toString('base64'),staticDir:path.join(directory,'static'),gateway,sessions:{fetcher:mock.fetcher}})
  t.after(async()=>{
    await service.close()
    assert.equal(path.dirname(directory),tmpdir())
    assert.ok(path.basename(directory).startsWith('fs-agent-cloud-contract-'))
    await rm(directory,{recursive:true,force:true})
  })
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve))
  const endpoint='http://127.0.0.1:'+service.server.address().port
  let cookie='',csrf='';const contexts=new Map()
  const request=async(route,body)=>{
    const id=/^\/sessions\/([a-f0-9-]{36})/.exec(route)?.[1];if(body&&id)body={...body,contextVersion:contexts.get(id)};
    const response=await fetch(endpoint+'/api/v1'+route,{method:body===undefined?'GET':'POST',headers:{Origin:publicOrigin,cookie,'x-csrf-token':csrf,'x-fs-system':'agent',...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})})
    const value=await response.json();if(value.session?.contextVersion)contexts.set(value.session.id,value.session.contextVersion);return {response,value}
  }
  const login=await request('/login',{loginIdentifier:'contract-user',password:'synthetic-password'})
  assert.equal(login.response.status,200,JSON.stringify(login.value))
  cookie=login.response.headers.get('set-cookie').split(';')[0];csrf=login.value.csrf
  assert.equal((await request('/agents')).response.status,200)
  const created=await request('/sessions',{agentId,systemId:'agent',scope:{kind:'system'}})
  assert.equal(created.response.status,201,JSON.stringify(created.value))
  const doc=created.value.session
  const browserId=cookie.slice(cookie.indexOf('=')+1), auth=await service.auth.load(browserId)
  auth.expiresAt=0
  await service.auth.save(auth)
  const payload={requestId:randomUUID(),text:'蓝鲸项目什么时候验收？'}
  assert.equal((await request(`/sessions/${doc.id}/messages`,payload)).response.status,202)
  let final
  for(let i=0;i<160;i++) {
    final=(await request('/sessions/'+doc.id)).value.session
    if(!['running','waiting'].includes(final.status))break
    await new Promise(resolve=>setTimeout(resolve,25))
  }
  assert.equal(final.status,'idle',JSON.stringify(final))
  assert.ok(final.messages.some(message=>message.text==='蓝鲸项目周五验收。'))
  assert.equal(mock.modelCalls,2)
  assert.equal(mock.requests.filter(request=>request.path==='/desktop/v1/auth/refresh').length,1)
  assert.equal((await request(`/sessions/${doc.id}/messages`,payload)).response.status,202)
  assert.equal(mock.modelCalls,2)
  mock.wrongTenant()
  await assert.rejects(gateway.models(await service.auth.load(browserId)),error=>error.code==='CONTRACT_MISMATCH')
})


test('production app decoder rechecks current ERP authorization and rejects tenant mismatches',async()=>{
  let grant=true,otherTenant=false;
  const gateway=new PlatformGateway(origin,async(input)=>{
    assert.equal(new URL(String(input)).pathname,'/desktop/v1/apps');
    return json({activeTenantId:otherTenant?randomUUID():tenantId,items:grant?[{appId:'erp',tenantId,displayName:'ERP',baseUrl:'https://erp.fsstory.net',deepLinks:{home:'/'},capabilities:['erp.read'],contractRange:'>=0.1.0 <0.2.0'}]:[],meta});
  });
  const auth={session:session(1),tenantId,user};
  await gateway.authorizeSystem(auth,'erp',AbortSignal.timeout(1000));
  grant=false;await assert.rejects(gateway.authorizeSystem(auth,'erp',AbortSignal.timeout(1000)),e=>e.code==='SYSTEM_NOT_AUTHORIZED');
  otherTenant=true;await assert.rejects(gateway.authorizeSystem(auth,'erp',AbortSignal.timeout(1000)),e=>e.code==='CONTRACT_MISMATCH');
});
