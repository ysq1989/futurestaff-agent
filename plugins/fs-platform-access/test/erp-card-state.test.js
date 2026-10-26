import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdtemp,writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const temporary=await mkdtemp(path.join(os.tmpdir(),'fs-erp-message-state-'))
const compiled=await build({entryPoints:[path.join(root,'plugins/fs-platform-access/src/client/erp-card-state.ts')],bundle:true,write:false,platform:'node',format:'esm'})
const moduleFile=path.join(temporary,'state.mjs');await writeFile(moduleFile,compiled.outputFiles[0].text)
const {ErpCardStore,ErpCardError}=await import(pathToFileURL(moduleFile).href)
const meta={kind:'futurestaff.erp',viewId:'preview',sessionId:'session',title:'销售订单'}
const preview={...meta,kind:'preview',resource:'sales-orders',data:{operation:'sales.create',body:{quantity:2},references:[]}}
const completed={...preview,kind:'entity',viewId:'saved',confirmationViewId:'preview',data:{order_no:'SO-001'},conversationUpdated:true}

test('one preview shares a confirmation lock across card and drawer, then only retries undelivered feedback',async()=>{
 const calls=[];let settle;const store=new ErpCardStore(async(action)=>{calls.push(action);if(action==='view')return preview;if(calls.filter(value=>value==='confirm').length===1)return new Promise(resolve=>{settle=resolve});return completed})
 await store.read(meta)
 const first=store.confirm(meta),second=store.confirm(meta)
 assert.equal(store.peek(meta).status,'running');assert.equal(store.peek(meta).view.kind,'preview')
 settle({...completed,conversationUpdated:false});await Promise.all([first,second])
 assert.deepEqual(calls,['view','confirm']);assert.equal(store.peek(meta).status,'succeeded')
 await store.confirm(meta)
 assert.deepEqual(calls,['view','confirm','confirm']);assert.equal(store.peek(meta).view.conversationUpdated,true)
 await store.confirm(meta);assert.equal(calls.length,3)
})

test('reading a saved entity preserves confirmation and delivery metadata until feedback is returned',async()=>{
 let reads=0,confirmations=0
 const rawSaved={viewId:'saved',sessionId:'session',kind:'entity',resource:'sales-orders',title:'销售订单',data:{order_no:'SO-001',status:'已确认'}}
 const store=new ErpCardStore(async(action)=>{
  if(action==='view')return ++reads===1?preview:rawSaved
  confirmations++;return {...rawSaved,confirmationViewId:'preview',conversationUpdated:confirmations>1}
 })
 await store.read(meta);await store.confirm(meta);await store.read(meta)
 assert.equal(store.peek(meta).status,'succeeded')
 assert.equal(store.peek(meta).view.conversationUpdated,false)
 assert.equal(store.peek(meta).view.confirmationViewId,'preview')
 assert.equal(store.peek(meta).view.data.status,'已确认')
 await store.confirm(meta)
 assert.equal(confirmations,2);assert.equal(store.peek(meta).view.conversationUpdated,true)
})

test('an uncertain confirmation cannot be resubmitted or reset by rereading an unchanged preview',async()=>{
 const calls=[];const store=new ErpCardStore(async(action)=>{calls.push(action);if(action==='confirm')throw Error('network interrupted');return preview})
 await store.read(meta);await store.confirm(meta)
 assert.equal(store.peek(meta).status,'unconfirmed')
 await store.confirm(meta);await store.read(meta);await store.confirm(meta)
 assert.deepEqual(calls,['view','confirm','view']);assert.equal(store.peek(meta).status,'unconfirmed')
})

test('a known committed readback error permits retrieving the saved result through the original receipt',async()=>{
 let confirmations=0;const store=new ErpCardStore(async(action)=>{if(action==='view')return preview;if(++confirmations===1)throw new ErpCardError('ERP_READBACK_PENDING','saved but not read back');return completed})
 await store.read(meta);await store.confirm(meta)
 assert.equal(store.peek(meta).status,'unconfirmed');assert.equal(store.peek(meta).recovery,'readback')
 await store.confirm(meta);assert.equal(store.peek(meta).status,'succeeded');assert.equal(confirmations,2)
})

test('expired or changed previews clear data and cannot be confirmed',async()=>{
 let calls=0;const store=new ErpCardStore(async()=>{calls++;throw new ErpCardError('ERP_VIEW_EXPIRED','expired')})
 await store.read(meta);await store.confirm(meta)
 assert.equal(store.peek(meta).status,'expired');assert.equal(store.peek(meta).view,undefined);assert.equal(calls,1)
})

test('identity changes hide old data and discard a late confirmation response',async()=>{
 let settle;const store=new ErpCardStore(async(action)=>action==='view'?preview:new Promise(resolve=>{settle=resolve}))
 await store.read(meta);const confirmation=store.confirm(meta);store.resetIdentity()
 settle(completed);await confirmation
 assert.equal(store.peek(meta).status,'expired');assert.equal(store.peek(meta).view,undefined)
 await store.read(meta);assert.equal(store.peek(meta).view,undefined)
})
