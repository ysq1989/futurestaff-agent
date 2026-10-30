import {constants} from 'node:fs'
import {open,realpath} from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type {ContentBlock} from '@deepseek-ai/dsh-llm'

type ImageRef=Extract<ContentBlock,{type:'image'}>['attachment']
export type CommercePreviewStore={saveImage(input:{data:Uint8Array;mediaType:'image/png';name:string}):Promise<ImageRef>}

export function assertCommercePreviewPath(input:unknown):asserts input is string{
 if(typeof input!=='string'||!input||path.isAbsolute(input)||/[\\:\x00]/.test(input)
  ||input.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('COMMERCE_IMAGE_PATH_INVALID')
}

/** Output layouts accept 16MP; previewing them must not apply the 4MP source-photo limit. */
export async function commerceImagePreview(root:string,input:string,store:CommercePreviewStore,signal:AbortSignal):Promise<ImageRef>{
 assertCommercePreviewPath(input);signal.throwIfAborted()
 const canonical=await realpath(root),target=await realpath(path.resolve(canonical,input)),relative=path.relative(canonical,target)
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('COMMERCE_IMAGE_PATH_INVALID')
 const file=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW||0))
 let raw:Buffer
 try{
  const stat=await file.stat()
  if(!stat.isFile()||stat.size>64*1024*1024)throw Error('COMMERCE_IMAGE_TOO_LARGE')
  raw=await file.readFile()
 }finally{await file.close()}
 if(raw.length>64*1024*1024)throw Error('COMMERCE_IMAGE_TOO_LARGE')
 const meta=await sharp(raw,{limitInputPixels:16000000}).metadata()
 if(!['png','jpeg','webp'].includes(meta.format??'')||(meta.pages??1)>1)throw Error('COMMERCE_IMAGE_INVALID')
 for(const edge of [1600,1280,1024,768,512]){
  signal.throwIfAborted()
  const data=await sharp(raw,{limitInputPixels:16000000}).rotate()
   .resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).toBuffer()
  if(data.length<=2000000){signal.throwIfAborted();return store.saveImage({data,mediaType:'image/png',name:path.parse(input).name+'.png'})}
 }
 throw Error('COMMERCE_IMAGE_TOO_LARGE')
}
