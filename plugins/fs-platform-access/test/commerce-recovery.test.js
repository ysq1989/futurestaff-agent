import test from 'node:test'
import assert from 'node:assert/strict'
import {commerceImageRecovery} from '../lib/commerce-recovery.js'
const requestId='30000000-0000-4000-8000-000000000003'
const call=(id,name,args)=>({role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id,name,arguments:JSON.stringify(args)}]})
const result=(id,value,kind='tool')=>({role:'user',source:{kind},content:[{type:'tool-result',toolCallId:id,content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}]}]})
test('unconfirmed commerce generation blocks repayment until the exact correlated task is known',()=>{
 const history=[call('g','commerce_image_generate',{requestId}),result('g','Error: AGENT_IMAGE_RESULT_UNCONFIRMED'),{role:'user',source:{kind:'user'},content:[{type:'text',text:'继续'}]}]
 assert.match(commerceImageRecovery(history),new RegExp(requestId))
 assert.ok(commerceImageRecovery([...history,call('s','agent_image_status',{requestId}),result('s',{requestId:'40000000-0000-4000-8000-000000000004',status:'succeeded'})]))
 assert.equal(commerceImageRecovery([...history,call('s','agent_image_status',{requestId}),result('s',{requestId,status:'succeeded'})]),undefined)
 assert.equal(commerceImageRecovery([call('g','commerce_image_generate',{requestId}),result('g',{requestId,status:'succeeded',archiveStatus:'unconfirmed'})]),undefined)
 assert.equal(commerceImageRecovery([call('g','commerce_image_generate',{requestId}),result('g','Error: COMMERCE_REFERENCE_REQUIRED')]),undefined)
})
