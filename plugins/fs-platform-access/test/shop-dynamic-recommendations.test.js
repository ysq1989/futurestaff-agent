import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createHash} from 'node:crypto'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const source=await build({entryPoints:[fileURLToPath(new URL('../src/shop-operations.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false})
const compiled=await mkdtemp(path.join(os.tmpdir(),'fs-shop-recommendations-')),compiledFile=path.join(compiled,'shop-operations.mjs')
await writeFile(compiledFile,source.outputFiles[0].contents)
const {ShopOperationViews}=await import(pathToFileURL(compiledFile).href)
test.after(()=>rm(compiled,{recursive:true,force:true}))
const operation=(method,path)=>'shop_api_product_'+createHash('sha256').update(method+'\n'+path).digest('hex').slice(0,12)
const listName=operation('GET','product/product/list'),indexName=operation('GET','product/product'),detailName=operation('GET','product/product/<id>')
const query={query:{page:2,limit:100}}
function fixture(name=listName){
 const state={owner:'member:shop',allowed:true,catalogAllowed:true,tool:{name,category:'product',annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},rows:[{id:134,store_name:'真实手串',image:'https://cdn.example.com/134.jpg',price:'828.00',stock:1,is_show:1,cost_price:'private-cost',supplier:{phone:'private-contact'}},{id:131,store_name:'真实项链',image:'https://cdn.example.com/131.jpg',price:'828',stock:1,is_show:1}],status:200,readOnly:true,responseOperation:name,onRead:undefined,onCatalog:undefined}
 const calls=[],catalogCalls=[],abort=new AbortController()
 const service={catalog:async input=>{catalogCalls.push(input);await state.onCatalog?.();if(!state.allowed)throw Error('DSH_FORBIDDEN');return {tools:state.catalogAllowed?[state.tool]:[]}},admin:async(current,args)=>{calls.push({name:current,args});await state.onRead?.();if(!state.allowed)throw Error('DSH_FORBIDDEN');return {structuredContent:{operation:state.responseOperation,title:'获取所有商品列表',readOnly:state.readOnly,data:{status:state.status,msg:'success',data:{count:150,list:state.rows}}}}}}
 const views=new ShopOperationViews(service,async()=>({owner:state.owner,origin:'https://shop-test.example.com',signal:abort.signal}),async id=>{if(id!=='session')throw Error('SHOP_SESSION_DENIED')})
 return {state,calls,catalogCalls,abort,views,read:()=>views.call(name,query,'session')}
}

test('current read-only GET product master lists yield host-only product facts and requery the same authorized operation',async()=>{
 assert.equal(listName,'shop_api_product_d8f7c2d2d8d2')
 for(const name of [listName,indexName]){
  const f=fixture(name),read=await f.read(),view=await f.views.recommend(read.viewId,[{productId:134,reason:'符合用户需求'}],'session')
  assert.equal(view.kind,'recommendations');assert.deepEqual(view.data.products[0],{id:134,name:'真实手串',image:'https://cdn.example.com/134.jpg',price:'828.00',stock:1,onSale:true,reason:'符合用户需求'})
  assert.equal(JSON.stringify(view).includes('private-'),false)
  f.state.rows=[{...f.state.rows[0],price:'829.00',stock:2}]
  const selected=await f.views.select(view.viewId,134,'session')
  assert.equal(selected.data.products[0].price,'829.00');assert.equal(selected.data.selectedProductId,134)
  assert.ok(f.calls.every(call=>call.name===name&&call.args===query),'readback must keep the exact original operation and args')
  assert.ok(f.catalogCalls.length>=2);assert.ok(f.catalogCalls.every(input=>input.category==='product'&&input.search===name))
  await assert.rejects(f.views.confirm(view.viewId,'session'),/SHOP_CONFIRMATION_REQUIRED/)
 }
})

test('details, order lists, writes and arbitrary shop_api list-shaped data never become recommendation sources',async()=>{
 for(const name of [detailName,operation('POST','product/product/list'),'shop_api_order_list','shop_api_product_arbitrary']){
  const f=fixture(name),read=await f.read()
  await assert.rejects(f.views.recommend(read.viewId,[{productId:134,reason:'a'}],'session'),/SHOP_RECOMMENDATION_SOURCE_REQUIRED/)
  assert.equal(f.calls.length,1)
 }
})

test('fresh catalog membership and safe product/read-only annotations are mandatory, not model arguments or titles',async()=>{
 for(const change of [f=>{f.state.catalogAllowed=false},f=>{f.state.tool.category='order'},f=>{f.state.tool.annotations.readOnlyHint=false},f=>{f.state.tool.annotations.destructiveHint=true},f=>{f.state.tool.annotations.openWorldHint=true},f=>{f.state.tool.method='POST'},f=>{f.state.tool.path='order/list'},f=>{f.state.tool.permission='order/list'}]){
  const f=fixture(),read=await f.read();change(f)
  await assert.rejects(f.views.recommend(read.viewId,[{productId:134,reason:'a'}],'session'),/SHOP_RECOMMENDATION_SOURCE_REQUIRED/)
  assert.equal(f.calls.length,1,'rejected source must not make a new data query')
 }
})

test('an owner replacement during catalog validation prevents the original view from making a new data query',async()=>{
 const f=fixture(),read=await f.read()
 f.state.onCatalog=()=>{f.state.owner='foreign'}
 await assert.rejects(f.views.recommend(read.viewId,[{productId:134,reason:'a'}],'session'),/SHOP_VIEW_EXPIRED/)
 assert.equal(f.calls.length,1,'do not issue the old view query in a replacement account')
})

test('a late catalog revocation or cancellation during requery cannot produce or update a recommendation',async()=>{
 const f=fixture(),read=await f.read()
 f.state.onRead=()=>{f.state.catalogAllowed=false}
 await assert.rejects(f.views.recommend(read.viewId,[{productId:134,reason:'a'}],'session'),/SHOP_RECOMMENDATION_SOURCE_REQUIRED/)
 const g=fixture(),source=await g.read(),view=await g.views.recommend(source.viewId,[{productId:134,reason:'a'}],'session')
 g.state.onRead=()=>{g.abort.abort()}
 await assert.rejects(g.views.select(view.viewId,134,'session'))
 assert.equal(view.data.selectedProductId,undefined)
})

test('both original-page membership and refreshed membership remain required',async()=>{
 const f=fixture(),read=await f.read()
 await assert.rejects(f.views.recommend(read.viewId,[{productId:999,reason:'invented'}],'session'),/SHOP_RECOMMENDATION_PRODUCT_REQUIRED/)
 f.state.rows=[]
 await assert.rejects(f.views.recommend(read.viewId,[{productId:134,reason:'a'}],'session'),/SHOP_RECOMMENDATION_STALE/)
})

test('dynamic list response must be successful, operation-matched, read-only and contain actual product fields',async()=>{
 for(const change of [f=>{f.state.status=403},f=>{f.state.readOnly=false},f=>{f.state.responseOperation=detailName},f=>{f.state.rows=[{id:134,status:'paid',price:'828'}]}]){
  const f=fixture();change(f);const read=await f.read()
  await assert.rejects(f.views.recommend(read.viewId,[{productId:134,reason:'a'}],'session'),/SHOP_RECOMMENDATION_(?:SOURCE|PRODUCT)_REQUIRED/)
 }
})

test('permission revocation, owner/session changes and cancellation still reject recommendation view and selection',async()=>{
 const f=fixture(),read=await f.read(),view=await f.views.recommend(read.viewId,[{productId:134,reason:'a'}],'session')
 f.state.catalogAllowed=false
 await assert.rejects(f.views.select(view.viewId,134,'session'),/SHOP_RECOMMENDATION_SOURCE_REQUIRED/)
 await assert.rejects(f.views.view(view.viewId,'session'),/SHOP_RECOMMENDATION_SOURCE_REQUIRED/)
 f.state.catalogAllowed=true;f.state.owner='foreign'
 await assert.rejects(f.views.select(view.viewId,134,'session'),/SHOP_VIEW_EXPIRED/)
 f.state.owner='member:shop'
 await assert.rejects(f.views.select(view.viewId,134,'foreign'),/SHOP_SESSION_DENIED/)
 f.abort.abort();await assert.rejects(f.views.select(view.viewId,134,'session'))
})
