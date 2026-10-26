import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdtemp,writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=fileURLToPath(new URL('../../../',import.meta.url)),directory=await mkdtemp(path.join(os.tmpdir(),'fs-erp-card-gallery-'))
const bundle=await build({entryPoints:[path.join(root,'plugins/fs-platform-access/src/client/erp-gallery.ts')],bundle:true,write:false,platform:'node',format:'esm'})
const file=path.join(directory,'gallery.mjs');await writeFile(file,bundle.outputFiles[0].text)
const {erpCardDefinition,latestErpCard}=await import(pathToFileURL(file).href)
test('durable ERP results reconstruct a turn-tail card without accepting foreign tools or failed results',()=>{
 let state=erpCardDefinition.start({}, {event:{type:'turn/start',data:{turn:2}}})
 const update=event=>{state=erpCardDefinition.update({state},{event})}
 update({type:'tool/call',data:{turn:2,name:'erp_prepare_action',callId:'erp'}})
 update({type:'tool/call',data:{turn:2,name:'unrelated_tool',callId:'foreign'}})
 const result=(callId,isError=false)=>({type:'tool/result',seq:12,data:{turn:2,meta:{kind:'futurestaff.erp',viewId:'preview',sessionId:'session',title:'订单核对'},message:{source:{callId},content:[{type:'tool-result',isError,content:[]}]}}})
 update(result('foreign'));update(result('erp',true));assert.equal(state.items.length,0)
 update(result('erp'))
 const projection=erpCardDefinition.buildLocationData({state},'turn',null)
 assert.equal(projection.key,'futurestaff-erp-cards');assert.equal(projection.value.items.length,1)
 assert.equal(latestErpCard(state.items,11),null)
 assert.deepEqual(latestErpCard(state.items,12),{kind:'futurestaff.erp',viewId:'preview',sessionId:'session',title:'订单核对'})
})
