/** Real loopback HTTP business/Knowledge/Platform mesh; scripted LLM, synthetic member. */
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {randomBytes,randomUUID} from 'node:crypto'
import path from 'node:path'
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm'
import {createCloudServer} from '../lib/server.js'
import {PlatformGateway} from '../lib/platform.js'
import {ApiError} from '../lib/storage.js'
export async function startSemanticFixture(file,port=0){
 const data=JSON.parse(await readFile(file,'utf8')),directory=path.join(path.dirname(file),'cloud');await mkdir(directory,{recursive:true})
 const http=[]
 const fetcher=async(input,init)=>{const url=new URL(String(input));if(url.origin!=='https://platform.fsstory.net')throw Error('unregistered fixture origin');http.push({path:url.pathname,method:init?.method??'GET'});return fetch(data.platform_origin+url.pathname+url.search,init)}
 class Gateway extends PlatformGateway {
  constructor(){super('https://platform.fsstory.net',fetcher)}
  async login(input){if(input.loginIdentifier!=='demo'||input.password!=='synthetic-only')throw new ApiError(401,'LOGIN_REQUIRED','使用隔离演示账号。');return{session:{accessToken:data.access_token,refreshToken:'synthetic-unused',tokenType:'Bearer',expiresIn:900,audience:'fixture',activeTenantId:data.tenant_id},user:{userId:data.actor_id,displayName:'合成演示成员'}}}
  async currentUser(token){const response=await fetch(data.platform_origin+'/fixture/profile',{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw new ApiError(401,'LOGIN_REQUIRED','隔离演示会话已过期。');return response.json()}
  async tenants(){return{items:[{tenantId:data.tenant_id,displayName:'澄禾生活（合成）'}]}}
  async agents(){return[{agentId:data.agent_id,name:'电商经营分析助手',description:'合成案例',available:true,unavailableReason:null}]}
  async models(){return[{modelId:data.snapshot.modelPolicy.primaryModelId,displayName:'脚本模型（无付费调用）',supportsVision:false}]}
  async authorizeSystem(auth,id,signal){if(id!=='ecommerce-demo')throw new ApiError(403,'SYSTEM_NOT_AUTHORIZED','隔离案例仅开放电商。');return super.authorizeSystem(auth,id,signal)}
  async logout(){}
 }
 const tool=(name,args)=>{const id=ToolCallId(randomUUID()),value=JSON.stringify(args);return[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id,name,argumentsDelta:value},{type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:value}},{type:'finish',reason:{kind:'tool-calls'}}]}
 const text=value=>[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:value},{type:'block-end',index:0,block:{type:'text',text:value}},{type:'finish',reason:{kind:'stop'}}]
 function queryId(value){if(typeof value==='string'){try{return queryId(JSON.parse(value))}catch{return}}if(value&&typeof value==='object'){if(typeof value.query_id==='string'&&/^[a-f\d-]{36}$/.test(value.query_id))return value.query_id;for(const child of Object.values(value).reverse()){const id=queryId(child);if(id)return id}}}
 const adapters=[]
 class Script extends LlmAdapter {
  phase=0;question=false;key='payment-inflow';period='2026-10';calls=[]
  constructor(doc){super();this.doc=doc;adapters.push(this)}
  async resolveModel(provider,model){return{provider,id:model,name:model}}
  async *stream(options){
   this.calls.push(options);let chunks
   if(this.phase===0){const prompt=this.doc.messages.filter(m=>m.role==='user').at(-1)?.text??'';if(/月报|周报|规划|目标|任务|OKR|KPI/i.test(prompt)){chunks=tool('knowledge_search',{query:prompt});this.phase=4}else{this.question=/gmv/i.test(prompt)&&!/支付|下单/.test(prompt);this.key=/订单明细/.test(prompt)?'order':/退款明细/.test(prompt)?'refund':/复购/.test(prompt)?'repeat-paying-ratio':/客户/.test(prompt)?'paying-customers':/净/.test(prompt)?'net-payment-inflow':/退款/.test(prompt)?'refund-outflow':/gmv/i.test(prompt)?/下单/.test(prompt)?'placed-goods-gmv':'paid-goods-gmv':'payment-inflow';this.period=/2026-11|本月/.test(prompt)?'2026-11':'2026-10';chunks=tool('semantics.resolve.v1',{query:prompt});this.phase=1}}
   else if(this.phase===4)chunks=text('已查询当前获批经营资料，请以工具返回的标题、版本和来源为准。目标是计划，任务状态是文档快照；不能用验收切片给全店或真实员工评分。')
   else if(this.phase===1&&this.question){chunks=tool('ask_user_question',{question:'GMV有两种已审核口径，请选择。',options:['商品支付GMV','下单商品GMV']});this.question=false;this.phase=1.5}
   else if(this.phase===1||this.phase===1.5){const last=this.doc.messages.filter(m=>m.role==='user').at(-1)?.text??'';if(/下单/.test(last))this.key='placed-goods-gmv';const binding=data.catalog.bindings.find(b=>b.metric_key===this.key);chunks=tool('semantics.query.prepare.v1',{binding_id:binding.id,period:this.period,group_by:'channel',rows:true,limit:5});this.phase=2}
   else if(this.phase===2){const id=queryId(options);if(!id)throw Error('No real prepared query_id');chunks=tool('semantics.query.execute.v1',{query_id:id});this.phase=3}
   else chunks=text('业务服务结果已显示在指标卡片。此为合成交易切片，请结合口径、时间和证据阅读，不能据此推断完整经营规模或环比。')
   for(const chunk of chunks){options.signal?.throwIfAborted();yield chunk}
  }
 }
 // Resolve a free port before freezing publicOrigin, as in the normal loopback test server.
 if(!port){const {createServer}=await import('node:net');const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));port=probe.address().port;await new Promise(r=>probe.close(r))}
 const origin='http://127.0.0.1:'+port
 const service=await createCloudServer({publicOrigin:origin,platformOrigin:'https://platform.fsstory.net',dataDir:directory,encryptionKey:randomBytes(32).toString('base64'),staticDir:path.resolve(import.meta.dirname,'../../agent-mobile/dist'),gateway:new Gateway(),sessions:{fetcher,adapterFactory:doc=>new Script(doc)}})
 await new Promise(r=>service.server.listen(port,'127.0.0.1',r))
 return{service,origin,data,http,adapters}
}
if(process.argv[1]===import.meta.filename){const fixture=await startSemanticFixture(process.argv[2]);await writeFile(path.join(path.dirname(process.argv[2]),'cloud-ready.json'),JSON.stringify({origin:fixture.origin,scripted_model:true,real_model_calls:0}));console.log('Isolated Cloud/PWA ready: '+fixture.origin);const timer=setInterval(async()=>{try{await readFile(path.join(path.dirname(process.argv[2]),'cloud-stop'));clearInterval(timer);await fixture.service.close()}catch{}},500)}
