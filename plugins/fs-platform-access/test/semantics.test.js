import test from 'node:test'
import assert from 'node:assert/strict'
import {SemanticService,parseSemanticReceipt,semanticValue} from '../lib/semantics.js'
import {businessToolAllowed,templateToolAllowed} from '../lib/business-scope.js'
const id='10000000-0000-4000-8000-000000000001',hash='a'.repeat(64)
test('enterprise knowledge uses current dedicated identity and rejects wrong scope or changed member',async()=>{
 const identity={accessToken:'synthetic',userId:id,tenantId:id,agentId:id,snapshotVersion:hash,signal:AbortSignal.timeout(3000)}
 const doc={entry_id:id,version_id:id,category_id:id,content_hash:hash,knowledge_key:'ecommerce-demo.monthly',title:'合成月报',body:'支付4533元，样本切片',source_note:'用户授权合成',valid_until:'2027-12-31T23:59:59+08:00'}
 const response={contract_version:'1.0.0',mode:'bounded-text-v1',synthetic:true,items:[doc]}
 const service=new SemanticService('https://platform.fsstory.net',async()=>identity,async(url,init)=>{assert.equal(url,'https://platform.fsstory.net/desktop/v1/semantics/knowledge-search');assert.deepEqual(JSON.parse(init.body),{agent_id:id,snapshot_version:hash,query:'月报'});return Response.json(response)})
 assert.equal((await service.knowledge('月报',identity.signal)).items.length,1)
 const invalid=new SemanticService('https://platform.fsstory.net',async()=>identity,async()=>Response.json({...response,items:[{...doc,knowledge_key:'private.performance'}]}))
 await assert.rejects(()=>invalid.knowledge('月报',identity.signal),/DOCUMENT_SCOPE_INVALID/)
 let reads=0
 const changed=new SemanticService('https://platform.fsstory.net',async()=>({...identity,userId:++reads===1?id:'20000000-0000-4000-8000-000000000002'}),async()=>Response.json(response))
 await assert.rejects(()=>changed.knowledge('月报',identity.signal),/IDENTITY_CHANGED/)
})
export const receipt={contract_version:'1.0.0',query_id:id,capability:'ecommerce-demo.query.v1',metric_key:'paid-goods-gmv',definition:{id,version_id:id,content_hash:hash,title:'商品支付GMV'},binding:{id,version:1,validation_hash:hash},dataset_hash:hash,period:'2026-10',timezone:'Asia/Shanghai',as_of:'2026-11-10T23:59:59+08:00',coverage:'sample_slice',coverage_note:'合成交易切片，非整月经营全量',total:{raw:450100,unit:'fen'},groups:[],rows:[],next_offset:null}
test('semantic tools require exact dedicated scope and never native/general inheritance',()=>{
 for(const scope of [undefined,[],['erp'],['administration'],['ecommerce-demo','erp']])assert.equal(businessToolAllowed('semantics.resolve.v1',scope),false)
 assert.equal(businessToolAllowed('semantics.query.execute.v1',['ecommerce-demo']),true)
 assert.equal(templateToolAllowed('semantics.query.sql.v1',['semantics.query.sql.v1'],['ecommerce-demo']),false)
 assert.equal(businessToolAllowed('Semantics.query.sql.v1',undefined),false)
})
test('authoritative values render integer fen, records and numerator/denominator',()=>{
 assert.equal(semanticValue(parseSemanticReceipt(receipt).total),'¥4,501.00')
 assert.equal(semanticValue({raw:null,unit:'ratio',numerator:9,denominator:18}),'50%（9/18）')
 assert.equal(semanticValue({raw:32,unit:'records'}),'32 条')
 assert.throws(()=>parseSemanticReceipt({...receipt,total:{unit:'fen',raw:4501.123}}))
 assert.throws(()=>parseSemanticReceipt({...receipt,total:{unit:'ratio',raw:null,numerator:2,denominator:1}}))
})
test('model supplied authority fields and unknown operations never dispatch',async()=>{
 let calls=0;const identity={accessToken:'synthetic',userId:id,tenantId:id,agentId:id,snapshotVersion:hash,signal:AbortSignal.timeout(1000)}
 const service=new SemanticService('https://platform.fsstory.net',async()=>identity,async()=>{calls++;return Response.json(receipt)})
 await assert.rejects(()=>service.call('semantics.query.execute.v1',{query_id:id,tenant_id:id},identity.signal));assert.equal(calls,0)
 const value=await service.call('semantics.query.execute.v1',{query_id:id},identity.signal);assert.equal(value.total.raw,450100)
 let reads=0;const changed=new SemanticService('https://platform.fsstory.net',async()=>({...identity,userId:++reads===1?id:'20000000-0000-4000-8000-000000000002'}),async()=>Response.json(receipt))
 await assert.rejects(()=>changed.call('semantics.query.execute.v1',{query_id:id},identity.signal),/IDENTITY_CHANGED/)
})
