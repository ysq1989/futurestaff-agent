import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'

// Compile this pure projection in memory; do not write the shared package lib during parallel work.
const bundled=await build({entryPoints:[fileURLToPath(new URL('../src/client/shop-recommendation-gallery.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm'})
const {shopRecommendationDefinition,shopRecommendationSnapshot}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const data=()=>({kind:'shop.products.recommendations',source:'shop',readOnly:true,selectionOnly:true,products:[{id:134,name:'真实衬衫',image:'https://cdn.example.com/shirt.jpg',price:'828.00',stock:1,onSale:true,reason:'符合已确认的需求。'}]})

test('replayed recommendation events retain their recorded facts independently of the live Host view',()=>{
 let state=shopRecommendationDefinition.start({}, {event:{type:'turn/start',data:{turn:1}}})
 state=shopRecommendationDefinition.update({state},{event:{type:'tool/call',data:{callId:'recommend',name:'shop_recommend_products'}}})
 const view={module:'shop',kind:'recommendations',viewId:'old-view',sessionId:'original-session',data:data()}
 state=shopRecommendationDefinition.update({state},{event:{type:'tool/result',seq:6,data:{message:{source:{callId:'recommend'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(view)}]}]}}}})
 assert.equal(state.items[0].meta.viewId,'old-view')
 assert.equal(state.items[0].meta.sessionId,'original-session')
 assert.deepEqual(state.items[0].meta.snapshot,view.data)
 const projection=shopRecommendationDefinition.buildLocationData({state},'turn')
 assert.equal(projection.value.items[0].meta.snapshot.products[0].price,'828.00')
})

test('historical projection rejects malformed or foreign recommendation facts and strips unsafe images',()=>{
 for(const value of [{...data(),source:'erp'},{...data(),readOnly:false},{...data(),selectionOnly:false},{...data(),products:Array.from({length:7},()=>data().products[0])},{...data(),products:[{...data().products[0],price:'not-a-price'}]},{...data(),selectedProductId:999}]){
  assert.equal(shopRecommendationSnapshot(value),undefined)
 }
 const snapshot=shopRecommendationSnapshot({...data(),products:[{...data().products[0],image:'javascript:alert(1)'}]})
 assert.equal(snapshot.products[0].image,undefined)
 assert.equal(snapshot.products[0].name,'真实衬衫')
 assert.equal(snapshot.selectionOnly,true)
})

test('only the matching successful recommendation tool contributes historical product cards',()=>{
 const state=shopRecommendationDefinition.start({}, {event:{type:'turn/start',data:{turn:1}}})
 const result={type:'tool/result',seq:4,data:{message:{source:{callId:'foreign'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({module:'shop',kind:'recommendations',viewId:'old',sessionId:'session',data:data()})}]}]}}}
 assert.equal(shopRecommendationDefinition.update({state},{event:result}),state)
 assert.equal(state.items.length,0)
})
