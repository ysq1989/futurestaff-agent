import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import {mountCommerce} from '../lib/commerce-host.js'

test('real registered image workflow validates metadata before generation and archives successful output with exact prompt',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-commerce-host-')),original=globalThis.fetch
 try{
  const identity={tenantId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000002',agentId:'30000000-0000-4000-8000-000000000003',version:'a'.repeat(64),accessToken:'fixture-only',signal:new AbortController().signal,workspacePath:root}
  const projectId='40000000-0000-4000-8000-000000000004',requestId='50000000-0000-4000-8000-000000000005'
  let generated=0,uploaded
  await mkdir(path.join(root,'commerce-output'))
  const png=await sharp({create:{width:64,height:64,channels:3,background:'#113355'}}).png().toBuffer()
  await writeFile(path.join(root,'product.png'),png);await writeFile(path.join(root,'commerce-output',requestId+'.png'),png)
  globalThis.fetch=async(url,init)=>{uploaded=JSON.parse(init.body);return Response.json({contractVersion:'1.0.0',tenantId:identity.tenantId,projectId,versionId:requestId,state:'draft',knowledgeStatus:'unverified-material',artifacts:uploaded.artifacts.map(({data,...file})=>file),manifestHash:'b'.repeat(64)})}
  const tools=new Map(),effect=fn=>fn(),ctx={inject:(deps,fn)=>{if(deps.includes('tools'))fn({effect,get:()=>undefined,tools:{register:def=>{tools.set(def.name,def);return ()=>{}}}})}}
  mountCommerce(ctx,'https://platform.fsstory.net',async()=>identity,{commerceGenerate:async()=>{generated++;return {requestId,status:'succeeded',downloadStatus:'succeeded',imagePath:'commerce-output/'+requestId+'.png'}}})
  const tool=tools.get('commerce_image_generate'),exec={agent:{id:'session'},callId:'call',signal:identity.signal}
  const input={projectId,requestId,title:'Product image',kind:'product-images',brief:'Merchant source; preserve shape',prompt:'Exact production prompt',tool:'current-ai-tool',size:'1024x1024',imagePaths:['product.png']}
  await assert.rejects(tool.execute({...input,projectId:'invalid'},exec),/ID_INVALID/)
  assert.equal(generated,0)
  const result=await tool.execute(input,exec)
  assert.equal(generated,1);assert.equal(result.archiveStatus,'saved');assert.equal(uploaded.artifacts.length,3)
  assert.equal(JSON.parse(await readFile(path.join(root,'commerce-output',requestId+'.brief.json'),'utf8')).prompt,input.prompt)
 }finally{globalThis.fetch=original;await rm(root,{recursive:true,force:true})}
})
