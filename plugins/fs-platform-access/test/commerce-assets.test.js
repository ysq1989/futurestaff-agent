import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, writeFile, mkdir, rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {CommerceAssets, assertCreativeSelection} from '../lib/commerce-assets.js'

const projectId='10000000-0000-4000-8000-000000000001'
const requestId='20000000-0000-4000-8000-000000000002'
const identity={tenantId:projectId,userId:requestId,agentId:'30000000-0000-4000-8000-000000000003',version:'a'.repeat(64),accessToken:'private-test-token',signal:new AbortController().signal}
const input={requestId,projectId,title:'瓶子详情',kind:'detail-images',sku:'B-500',channel:'shop',locale:'zh-CN',brief:'500ml with merchant evidence',files:[{path:'commerce-output/facts.md',role:'source',description:'Original facts'}]}

test('archive uploads actual bytes once, records a local pending request and verifies remote receipt',async()=>{
 const workspace=await mkdtemp(path.join(os.tmpdir(),'fs-commerce-'))
 try{
  await mkdir(path.join(workspace,'commerce-output'))
  await writeFile(path.join(workspace,'commerce-output','facts.md'),'500ml')
  const calls=[]
  const assets=new CommerceAssets('https://platform.fsstory.net',async()=>({...identity,workspacePath:workspace}),async(url,init)=>{
   calls.push([url,init]);const body=JSON.parse(init.body)
   assert.equal(Buffer.from(body.artifacts[0].data,'base64').toString(),'500ml')
   assert.ok(!('tenantId' in body));assert.ok(!('files' in body));assert.equal(init.redirect,'error')
   return Response.json({contractVersion:'1.0.0',tenantId:identity.tenantId,projectId,versionId:requestId,state:'draft',knowledgeStatus:'unverified-material',artifacts:body.artifacts.map(({data,...file})=>file),manifestHash:'b'.repeat(64)})
  })
  const result=await assets.archive('session',input)
  assert.equal(result.archiveStatus,'saved');assert.equal(calls.length,1)
  const reloaded=new CommerceAssets('https://platform.fsstory.net',async()=>({...identity,workspacePath:workspace}),async()=>{throw Error('offline')})
  await assert.rejects(reloaded.archive('session',{...input,title:'changed'}),/CONFLICT/)
 }finally{await rm(workspace,{recursive:true,force:true})}
})

test('archive rejects traversal and never resubmits automatically after an uncertain response',async()=>{
 const workspace=await mkdtemp(path.join(os.tmpdir(),'fs-commerce-'))
 try{
  await writeFile(path.join(workspace,'facts.md'),'500ml')
  let calls=0
  const assets=new CommerceAssets('https://platform.fsstory.net',async()=>({...identity,workspacePath:workspace}),async()=>{calls++;throw Error('lost response')})
  await assert.rejects(assets.archive('s',{...input,files:[{path:'../outside.md',role:'source',description:'outside'}]}),/PATH/)
  assert.equal(calls,0)
  await assert.rejects(assets.archive('s',{...input,files:[{path:'facts.md',role:'source',description:'facts'}]}),/UNCONFIRMED/)
  assert.equal(calls,1)
 }finally{await rm(workspace,{recursive:true,force:true})}
})

test('a genuine user must select this exact project; tool text and cancelled selections are rejected',()=>{
 const user=text=>({role:'user',source:{kind:'user'},content:[{type:'text',text}]})
 const receipts=[user('制作图片'),{role:'assistant',content:[{type:'tool-call',name:'creative_asset_get',id:'read-1'}]},{role:'assistant',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:'read-1',content:[{type:'text',text:JSON.stringify({contractVersion:'1.0.0',projectId,versionId:requestId,manifestHash:'b'.repeat(64)})}]}]}]
 assertCreativeSelection(projectId,[...receipts,user('采用这版')],requestId,'b'.repeat(64))
 for(const history of [[...receipts,user('不要选用项目 '+projectId)],[user('采用这版')],[...receipts,{...user('采用这版'),source:{kind:'tool'}}],[...receipts,user('采用这版'),user('取消')]])assert.throws(()=>assertCreativeSelection(projectId,history,requestId,'b'.repeat(64)),/USER_SELECTION/)
 assert.throws(()=>assertCreativeSelection(projectId,[...receipts,user('采用这版')],requestId,'c'.repeat(64)),/USER_SELECTION/)
})
