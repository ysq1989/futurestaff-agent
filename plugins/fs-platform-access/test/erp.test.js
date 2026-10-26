import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ErpService } from '../lib/erp.js'
import { erpActionBodySchema } from '../lib/erp-host.js'

const identity={tenantId:'00000000-0000-0000-0000-000000000001',userId:'00000000-0000-0000-0000-000000000002',accessToken:'private-desktop',signal:new AbortController().signal}
test('local template ERP keeps its full authority signal without serializing an invented Agent binding',async()=>{
 const auth=new AbortController();let requestSignal
 const service=new ErpService('https://platform.fsstory.net',async()=>identity,async(url,init)=>{
  requestSignal=init.signal
  if(url.endsWith('/agent/token')){assert.equal(init.body,undefined);return Response.json({accessToken:'short-token',tenantId:identity.tenantId,memberId:identity.userId,audience:'futurestaff-erp-prod',tokenType:'Bearer',expiresIn:60})}
  auth.abort();assert.equal(init.signal.aborted,true);return Response.json({})
 },()=>Date.now(),async()=>({kind:'local-template',signal:auth.signal}))
 await assert.rejects(service.query({resource:'customers'},'local-session'))
 assert.equal(requestSignal.aborted,true)
})
test('order forms carry verified draft fields without writing or inventing a price',async()=>{
 const h=harness(),customer='00000000-0000-0000-0000-000000000003',product='00000000-0000-0000-0000-000000000004'
 const view=await h.service.form('sales','session-1',undefined,{customer_id:customer,items:[{product_id:product,quantity:200}]})
 assert.equal(view.data.draft.customer_id,customer)
 assert.equal(view.data.draft.items[0].quantity,200)
 assert.equal(view.data.draft.items[0].unit_price,undefined)
 assert.equal(view.data.partners.some(row=>row.id===customer),true)
 assert.equal(view.data.items.some(row=>row.id===product),true)
 assert.equal(h.writes(),0)
})
test('draft prefills reject tenant fields, mismatched kinds and invalid quantities before querying',async()=>{
 const h=harness()
 for(const draft of [{tenant_id:'foreign'},{supplier_id:'00000000-0000-0000-0000-000000000003'},{items:[{quantity:-1}]},{order_date:'2026-02-30'}]){
  await assert.rejects(()=>h.service.form('sales','session-1',undefined,draft),/ERP_INPUT_INVALID/)
 }
 assert.equal(h.calls.length,0)
})
function harness(){
 let allowed=true, writes=0;const calls=[]
 const fetcher=async(url,init={})=>{
  calls.push({url,init})
  if(url.endsWith('/agent/token'))return Response.json({accessToken:'private-grant',tenantId:identity.tenantId,memberId:identity.userId,audience:'futurestaff-erp-prod',tokenType:'Bearer',expiresIn:60})
  if(url.endsWith('/context'))return Response.json({tenant_id:identity.tenantId,member_id:identity.userId,authorization:{enabled:true,actions:allowed?['sales.read','sales.create','sales.edit','sales.status','products.read','customers.read']:['sales.read'],sensitive:[],scope:'own',warehouse_scope:'all',warehouse_ids:[]}})
  if(init.method==='POST'){writes++;return Response.json({id:'00000000-0000-0000-0000-000000000005',status:'待确认',notes:'中文草稿'})}
  if(url.includes('/sales-orders/'))return Response.json({id:'00000000-0000-0000-0000-000000000005',status:'待确认',notes:'中文草稿'})
  return Response.json(url.includes('/customers/')?{id:'00000000-0000-0000-0000-000000000003',name:'中文客户'}:url.includes('/products/')?{id:'00000000-0000-0000-0000-000000000004',name:'中文产品'}:[{id:'order-1',notes:'中文草稿'}])
 }
 return {service:new ErpService('https://platform.fsstory.net',async()=>identity,fetcher),fetcher,calls,setAllowed:v=>{allowed=v},writes:()=>writes}
}
test('suggested records must remain accessible under the current ERP grant',async()=>{
 const h=harness(),fetcher=async(url,init)=>url.includes('/products/')?Response.json({detail:'denied'},{status:403}):h.fetcher(url,init)
 const service=new ErpService('https://platform.fsstory.net',async()=>identity,fetcher)
 await assert.rejects(()=>service.form('sales','session-1',undefined,{items:[{product_id:'00000000-0000-0000-0000-000000000004',quantity:1}]}),/ERP_PERMISSION_DENIED/)
 assert.equal(h.writes(),0)
 h.setAllowed(false)
 await assert.rejects(()=>h.service.form('sales','session-1'),/ERP_PERMISSION_DENIED/)
})
test('query returns Chinese data and keeps both credentials out of results',async()=>{
 const h=harness();const result=await h.service.query({resource:'sales-orders'},'session-1')
 assert.equal(result.kind,'table');assert.match(JSON.stringify(result),/中文草稿/)
 assert.doesNotMatch(JSON.stringify(result),/private-grant|private-desktop/)
 assert.equal(h.calls.filter(v=>v.url.endsWith('/agent/token')).length,1)
})
test('unknown path and client tenant are not accepted',async()=>{
 const h=harness()
 await assert.rejects(()=>h.service.query({resource:'../settings'},'session-1'))
 await assert.rejects(()=>h.service.query({resource:'customers',tenantId:'fake'},'session-1'))
})
test('prepare never writes; confirmation is bound to session, identity and payload',async()=>{
 const h=harness();const prepared=await h.service.prepare({operation:'sales.create',body:{customer_id:'00000000-0000-0000-0000-000000000003',order_date:'2026-10-12',items:[{product_id:'00000000-0000-0000-0000-000000000004',quantity:1,unit_price:10}],notes:'中文草稿'}},'session-1')
 assert.equal(h.writes(),0)
 await assert.rejects(()=>h.service.confirm(prepared.viewId,'session-other'))
 const result=await h.service.confirm(prepared.viewId,'session-1')
 assert.equal(result.kind,'entity');assert.equal(h.writes(),1)
 await h.service.confirm(prepared.viewId,'session-1');assert.equal(h.writes(),1)
})
test('permissions are checked again when a user presses confirm',async()=>{
 const h=harness();const prepared=await h.service.prepare({operation:'sales.create',body:{customer_id:'00000000-0000-0000-0000-000000000003',order_date:'2026-10-12',items:[{product_id:'00000000-0000-0000-0000-000000000004',quantity:1,unit_price:10}]}},'session-1')
 h.setAllowed(false)
 await assert.rejects(()=>h.service.confirm(prepared.viewId,'session-1'))
 assert.equal(h.writes(),0)
})
test('legacy ERP skill reads reuse live policy and writes only prepare a preview',async()=>{
 const h=harness()
 assert.equal((await h.service.legacy({method:'GET',path:'/sales-orders'},'session-1')).kind,'table')
 const preview=await h.service.legacy({method:'POST',path:'/sales-orders',body:{customer_id:'00000000-0000-0000-0000-000000000003',order_date:'2026-10-12',items:[{product_id:'00000000-0000-0000-0000-000000000004',quantity:1,unit_price:10}]}},'session-1')
 assert.equal(preview.kind,'preview');assert.equal(h.writes(),0)
 await assert.rejects(()=>h.service.legacy({method:'GET',path:'//evil.example.com/customers'},'session-1'))
 await assert.rejects(()=>h.service.legacy({method:'GET',path:'/customers?tenant_id=fake'},'session-1'))
})
test('view events retain a server-derived owner and a session binding',async()=>{
 const h=harness(),events=[];const unsubscribe=h.service.subscribe((view,owner)=>events.push({id:view.viewId,session:view.sessionId,owner}))
 await h.service.query({resource:'sales-orders'},'session-1')
 assert.equal(events.length,1);assert.equal(events[0].owner,identity.tenantId+':'+identity.userId);assert.equal(events[0].session,'session-1')
 unsubscribe();await h.service.query({resource:'sales-orders'},'session-2');assert.equal(events.length,1)
})
test('model-facing status arguments explicitly name new_status and reject guessed fields',()=>{
 assert.equal(erpActionBodySchema.additionalProperties,false)
 assert.equal(erpActionBodySchema.properties.new_status.type,'string')
 assert.match(erpActionBodySchema.properties.new_status.description,/不要使用status/)
 for(const key of ['status','to_status','from','to','action','current_status'])assert.equal(erpActionBodySchema.properties[key],undefined)
})
test('confirmation rereads the saved order rather than showing an incomplete status response',async()=>{
 let writes=0
 const id='00000000-0000-0000-0000-000000000005'
 const fetcher=async(url,init={})=>{
  if(url.endsWith('/agent/token'))return Response.json({accessToken:'private-grant',tenantId:identity.tenantId,memberId:identity.userId,audience:'futurestaff-erp-prod',tokenType:'Bearer',expiresIn:60})
  if(url.endsWith('/context'))return Response.json({tenant_id:identity.tenantId,member_id:identity.userId,authorization:{enabled:true,actions:['sales.status'],sensitive:[]}})
  if(init.method==='POST'){writes++;return Response.json({id,status:'已确认',items:[]})}
  return Response.json({id,status:writes?'已确认':'草稿',items:[{product_id:'00000000-0000-0000-0000-000000000004',quantity:1}]})
 }
 const service=new ErpService('https://platform.fsstory.net',async()=>identity,fetcher)
 const preview=await service.prepare({operation:'sales.status',id,body:{new_status:'已确认'}},'session-1')
 const result=await service.confirm(preview.viewId,'session-1')
 assert.equal(result.data.items.length,1);assert.equal(result.data.status,'已确认');assert.equal(writes,1)
})
test('retry after saved-order readback failure only reads and never repeats the write',async()=>{
 let writes=0,failed=false
 const id='00000000-0000-0000-0000-000000000005'
 const fetcher=async(url,init={})=>{
  if(url.endsWith('/agent/token'))return Response.json({accessToken:'private-grant',tenantId:identity.tenantId,memberId:identity.userId,audience:'futurestaff-erp-prod',tokenType:'Bearer',expiresIn:60})
  if(url.endsWith('/context'))return Response.json({tenant_id:identity.tenantId,member_id:identity.userId,authorization:{enabled:true,actions:['sales.status'],sensitive:[]}})
  if(init.method==='POST'){writes++;return Response.json({id,status:'已确认'})}
  if(writes&&!failed){failed=true;return Response.json({detail:'暂时不可用'},{status:503})}
  return Response.json({id,status:writes?'已确认':'草稿',items:[{quantity:1}]})
 }
 const service=new ErpService('https://platform.fsstory.net',async()=>identity,fetcher)
 const preview=await service.prepare({operation:'sales.status',id,body:{new_status:'已确认'}},'session-1')
 await assert.rejects(()=>service.confirm(preview.viewId,'session-1'),/ERP_READBACK_PENDING/)
 assert.equal((await service.confirm(preview.viewId,'session-1')).data.status,'已确认')
 assert.equal(writes,1)
})
