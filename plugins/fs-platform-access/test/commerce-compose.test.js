import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {composeCommerce} from '../lib/commerce-compose.js'

test('editable layout composites real source pixels and prevents overflow or version replacement',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-commerce-layout-'))
 try{
  const product=await sharp({create:{width:80,height:80,channels:3,background:'#1555AA'}}).png().toBuffer()
  await writeFile(path.join(root,'product.png'),product)
  const layout={requestId:'40000000-0000-4000-8000-000000000004',width:500,height:300,background:'#FFFFFF',layers:[{type:'image',imagePath:'product.png',left:300,top:60,width:80,height:80},{type:'text',lines:['商品展示','500 ml'],left:20,top:30,width:220,height:160,fontSize:32,color:'#222222'}]}
  const result=await composeCommerce(root,layout)
  const pixel=await sharp(result.path).extract({left:320,top:80,width:1,height:1}).removeAlpha().raw().toBuffer()
  assert.deepEqual([...pixel],[21,85,170]);assert.deepEqual(JSON.parse(await readFile(result.layoutPath,'utf8')),layout)
  await composeCommerce(root,layout)
  await assert.rejects(composeCommerce(root,{...layout,background:'#000000'}),/CONFLICT/)
  await assert.rejects(composeCommerce(root,{...layout,layers:[{...layout.layers[1],height:10}]}),/OVERFLOW/)
 }finally{await rm(root,{recursive:true,force:true})}
})
