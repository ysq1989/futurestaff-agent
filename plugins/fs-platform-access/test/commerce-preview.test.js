import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {mountCommerce} from '../lib/commerce-host.js'

const id='50000000-0000-4000-8000-000000000005'
async function fixture(t,options={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'commerce-preview-'));t.after(()=>rm(root,{recursive:true,force:true}))
 const signal=new AbortController().signal
 const identity={tenantId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000002',agentId:'30000000-0000-4000-8000-000000000003',version:'a'.repeat(64),workspacePath:root,signal}
 const saved=[],tools=new Map(),effect=fn=>fn()
 const attachments={saveImage:async input=>{
  if(options.previewFailure)throw Error('attachment store unavailable')
  saved.push(input);const meta=await sharp(input.data).metadata()
  return {attachmentId:'sha256:'+'b'.repeat(64),mediaType:'image/png',width:meta.width,height:meta.height,bytes:input.data.length,name:input.name}
 }}
 const authorize=async()=>options.identityChange&&saved.length?{...identity,tenantId:'90000000-0000-4000-8000-000000000009'}:identity
 const ctx={inject:(deps,fn)=>{if(deps.includes('tools'))fn({effect,get:()=>options.noAttachments?undefined:attachments,tools:{register:def=>{tools.set(def.name,def);return()=>{}}}})}}
 mountCommerce(ctx,'https://platform.fsstory.net',authorize,{commerceGenerate:async()=>{throw Error('must not generate')}})
 return {root,tools,saved,exec:{agent:{id:'session'},callId:'call',signal}}
}

test('successful commerce composition emits a durable image block without changing original bytes',async t=>{
 const f=await fixture(t),tool=f.tools.get('commerce_image_compose')
 const result=await tool.execute({requestId:id,width:128,height:96,background:'#112233',layers:[]},f.exec)
 const original=await readFile(path.join(f.root,result.imagePath))
 assert.equal(result.previewStatus,'succeeded')
 const blocks=tool.output.render({},result)
 assert.equal(blocks[1]?.type,'image');assert.deepEqual(blocks[1].attachment,result.preview)
 assert.equal(JSON.parse(blocks[0].text).preview,undefined)
 assert.equal(JSON.parse(blocks[0].text).previewKind,'commerce')
 assert.equal(f.saved.length,1);assert.equal(result.preview.width,128)
 assert.deepEqual(await readFile(path.join(f.root,result.imagePath)),original)
})

test('accepted 8MP commerce layouts get a bounded preview rather than the 4MP source-image rejection',async t=>{
 const f=await fixture(t)
 const result=await f.tools.get('commerce_image_compose').execute({requestId:id,width:4096,height:2048,background:'#112233',layers:[]},f.exec)
 assert.equal(result.previewStatus,'succeeded')
 assert.ok(result.preview.width<=1600&&result.preview.height<=1600)
 assert.ok(result.preview.bytes<=2_000_000)
 assert.equal((await sharp(await readFile(path.join(f.root,result.imagePath))).metadata()).width,4096)
})

test('existing commerce pictures can be previewed without generation or archiving',async t=>{
 const f=await fixture(t)
 await mkdir(path.join(f.root,'commerce-output'))
 const original=await sharp({create:{width:64,height:64,channels:3,background:'#334455'}}).png().toBuffer()
 await writeFile(path.join(f.root,'commerce-output','existing.png'),original)
 const tool=f.tools.get('commerce_image_preview')
 assert.ok(tool,'existing output needs a read-only recovery preview tool')
 const result=await tool.execute({imagePath:'commerce-output/existing.png'},f.exec)
 assert.equal(result.previewStatus,'succeeded');assert.equal(f.saved.length,1)
 assert.equal(tool.output.render({},result)[1].type,'image')
 assert.deepEqual(await readFile(path.join(f.root,'commerce-output','existing.png')),original)
 for(const imagePath of ['../outside.png',path.join(f.root,'commerce-output/existing.png'),'commerce-output/../../outside.png']){
  await assert.rejects(tool.execute({imagePath},f.exec),/PATH_INVALID/)
 }
})

test('attachment failure preserves the completed commerce output and reports unavailable preview',async t=>{
 const f=await fixture(t,{previewFailure:true})
 const result=await f.tools.get('commerce_image_compose').execute({requestId:id,width:128,height:96,background:'#112233',layers:[]},f.exec)
 assert.equal(result.status,'succeeded');assert.equal(result.previewStatus,'unavailable')
 assert.ok((await readFile(path.join(f.root,result.imagePath))).length>0)
})

test('a principal change while saving the preview cannot return the old identity image',async t=>{
 const f=await fixture(t,{identityChange:true})
 await assert.rejects(f.tools.get('commerce_image_compose').execute({requestId:id,width:128,height:96,background:'#112233',layers:[]},f.exec),/CREATIVE_IDENTITY_CHANGED/)
})

test('explicit preview cannot report success for a non-image or a missing attachment service',async t=>{
 const f=await fixture(t,{noAttachments:true}),tool=f.tools.get('commerce_image_preview')
 assert.ok(tool)
 await assert.rejects(tool.execute({imagePath:'commerce-output/missing.txt'},f.exec),/COMMERCE_IMAGE_INVALID/)
 await assert.rejects(tool.execute({imagePath:'commerce-output/existing.png'},f.exec),/COMMERCE_PREVIEW_UNAVAILABLE/)
})
