import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import {startSemanticFixture} from './semantic-http-fixture.mjs'

test('real HTTP semantic case uses actual plans and delivers authoritative PWA receipts', {skip:!process.env.SEMANTIC_HTTP_FIXTURE},async t=>{
 const f=await startSemanticFixture(process.env.SEMANTIC_HTTP_FIXTURE);t.after(()=>f.service.close())
 let cookie='',csrf=''
 async function request(route,body){const r=await fetch(f.origin+'/api/v1'+route,{method:body?'POST':'GET',headers:{origin:f.origin,cookie,'x-csrf-token':csrf,'x-fs-system':'ecommerce-demo',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return{r,value}}
 const login=await request('/login',{loginIdentifier:'demo',password:'synthetic-only'});cookie=login.r.headers.get('set-cookie').split(';')[0];csrf=login.value.csrf
 const systems=(await request('/systems')).value;assert.ok(JSON.stringify(systems).includes('ecommerce-demo'))
 const results=[]
 for(const [prompt,raw,numerator,denominator]of [['2026年10月GMV',450100],['2026年10月支付金额',453300],['2026年10月退款金额',41725],['2026年10月资金净流入',411575],['2026年10月复购率',null,9,18],['2026年10月订单明细',32],['2026年10月退款明细',4],['本月支付金额',0]]){
  let s=(await request('/sessions',{agentId:f.data.agent_id,systemId:'ecommerce-demo',scope:{kind:'system'}})).value.session
  await request('/sessions/'+s.id+'/messages',{requestId:randomUUID(),text:prompt,contextVersion:s.contextVersion})
  let answered=false
  for(let i=0;i<500;i++){
   s=(await request('/sessions/'+s.id+'?systemId=ecommerce-demo')).value.session
   if(s.question&&!answered){assert.equal(prompt,'2026年10月GMV');assert.ok(s.question.options.includes('商品支付GMV'));await request('/sessions/'+s.id+'/answer',{requestId:randomUUID(),questionId:s.question.id,answer:'商品支付GMV',contextVersion:s.contextVersion});answered=true}
   if(!['running','waiting'].includes(s.status))break
   await new Promise(r=>setTimeout(r,30))
  }
  assert.equal(s.status,'idle',JSON.stringify(s.messages))
  if(prompt==='2026年10月GMV')assert.equal(answered,true,'ambiguous GMV must wait for the explicit answer')
  assert.ok(!s.messages.some(m=>m.role==='tool'&&m.error),JSON.stringify(s.messages))
  const receipt=s.messages.find(m=>m.semanticReceipt)?.semanticReceipt;assert.ok(receipt,JSON.stringify(s.messages));assert.equal(receipt.total.raw,raw)
  if(numerator){assert.equal(receipt.total.numerator,numerator);assert.equal(receipt.total.denominator,denominator)}
  if(prompt==='本月支付金额'){assert.equal(receipt.period,'2026-11');assert.equal(receipt.coverage,'incomplete_sample')}
  assert.ok(receipt.definition.content_hash&&receipt.binding.validation_hash&&receipt.dataset_hash);assert.ok(receipt.rows.length<=5)
  results.push({prompt,receipt})
 }
 assert.ok(f.http.some(row=>row.path==='/desktop/v1/semantics/prepare'))
 assert.ok(f.http.some(row=>row.path==='/desktop/v1/semantics/execute'))
 for(const prompt of ['10月经营月报','2027年度企业规划','顾知行11月任务OKR KPI']){
  let s=(await request('/sessions',{agentId:f.data.agent_id,systemId:'ecommerce-demo',scope:{kind:'system'}})).value.session
  await request('/sessions/'+s.id+'/messages',{requestId:randomUUID(),text:prompt,contextVersion:s.contextVersion})
  for(let i=0;i<500;i++){s=(await request('/sessions/'+s.id+'?systemId=ecommerce-demo')).value.session;if(s.status!=='running')break;await new Promise(r=>setTimeout(r,30))}
  assert.equal(s.status,'idle',JSON.stringify(s.messages));assert.ok(!s.messages.some(m=>m.error))
  const match=s.messages.find(m=>m.role==='tool'&&m.text.includes('"mode":"bounded-text-v1"')&&m.text.includes('version_id'));assert.ok(match,JSON.stringify(s.messages))
  assert.ok(match.text.includes('ecommerce-demo.'));results.push({prompt,knowledge:true,sources:match.text})
 }
 assert.ok(f.http.some(row=>row.path==='/desktop/v1/semantics/knowledge-search'))
 for(const adapter of f.adapters){const declared=JSON.stringify(adapter.calls[0]);assert.ok(declared.includes('semantics.resolve.v1'));assert.ok(!declared.includes('administration.leave.preview.v1'));assert.ok(!declared.includes('erp_query'))}
 await writeFile(path.join(path.dirname(process.env.SEMANTIC_HTTP_FIXTURE),'cloud-http-results.json'),JSON.stringify({passed:true,scripted_model:true,real_model_calls:0,results},null,2))
})
