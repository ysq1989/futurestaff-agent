import {open,realpath,lstat,mkdir,readFile} from 'node:fs/promises'
import {constants} from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import {createHash} from 'node:crypto'

export async function boundedGarmentPixels(raw:Uint8Array):Promise<Buffer>{
 for(const edge of [1600,1280,1024,768,512]){
  const bytes=await sharp(raw,{limitInputPixels:4000000}).rotate().resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).toBuffer()
  if(bytes.length<=2000000)return bytes
 }
 throw Error('FASHION_IMAGE_TOO_LARGE')
}

export async function garmentFile(root:string|undefined,input:string):Promise<Buffer>{
 if(!root||!input||path.isAbsolute(input)||input.includes('\\')||input.split('/').some(p=>!p||p==='..'||p==='.')||input.includes(':'))throw Error('FASHION_IMAGE_PATH_INVALID')
 const canonicalRoot=await realpath(root),target=await realpath(path.resolve(canonicalRoot,input))
 const relative=path.relative(canonicalRoot,target)
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('FASHION_IMAGE_PATH_INVALID')
 const file=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW||0))
 try{
  const stat=await file.stat();if(!stat.isFile()||stat.size>12000000)throw Error('FASHION_IMAGE_TOO_LARGE')
  const bytes=await file.readFile()
  const image=sharp(bytes,{limitInputPixels:4000000}).rotate()
  const meta=await image.metadata();if(!['jpeg','png'].includes(meta.format||''))throw Error('FASHION_IMAGE_INVALID')
  await image.stats()
  return bytes
 }finally{await file.close()}
}

/** Explicit user export; immutable names and byte comparison prevent overwrites. */
export async function exportFashionFile(root:string|undefined,requestId:string,downloads:string):Promise<string>{
 if(!/^[a-f0-9-]{36}$/.test(requestId))throw Error('FASHION_EXPORT_INVALID')
 const bytes=await garmentFile(root,'fashion-output/'+requestId+'.png')
 await mkdir(downloads,{recursive:true})
 const canonical=await realpath(downloads),directory=path.join(canonical,'FutureStaff')
 await mkdir(directory,{recursive:true})
 if((await lstat(directory)).isSymbolicLink()||await realpath(directory)!==directory)throw Error('FASHION_EXPORT_INVALID')
 const target=path.join(directory,requestId+'.png')
 try{const file=await open(target,'wx',0o600);try{await file.writeFile(bytes)}finally{await file.close()}}
 catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error
  if((await lstat(target)).isSymbolicLink()||!(await readFile(target)).equals(bytes))throw Error('FASHION_EXPORT_CONFLICT')}
 return target
}

export async function garmentReference(root:string|undefined,input:string):Promise<string>{
 return 'data:image/png;base64,'+(await boundedGarmentPixels(await garmentFile(root,input))).toString('base64')
}

export async function inspectGarmentFile(root:string|undefined,input:string){
 const bytes=await garmentFile(root,input),meta=await sharp(bytes,{limitInputPixels:4000000}).metadata()
 return {width:meta.width,height:meta.height,format:meta.format?.toUpperCase(),bytes:bytes.length,hasAlpha:meta.hasAlpha,sha256:createHash('sha256').update(bytes).digest('hex'),scope:'pixel-specifications-only',garmentFidelityVerified:false}
}

export async function saveFashionImage(root:string|undefined,requestId:string,raw:Buffer,folder:'fashion-output'|'website-output'|'commerce-output'='fashion-output'):Promise<string>{
 if(!root||!/^[a-f0-9-]{36}$/.test(requestId))throw Error('FASHION_IMAGE_PATH_INVALID')
 const canonicalRoot=await realpath(root),directory=path.join(canonicalRoot,folder)
 await mkdir(directory,{recursive:true})
 if((await lstat(directory)).isSymbolicLink()||await realpath(directory)!==directory)throw Error('FASHION_IMAGE_PATH_INVALID')
 const target=path.join(directory,requestId+'.png')
 const bytes=await sharp(raw,{limitInputPixels:4000000}).png().toBuffer()
 try{const file=await open(target,'wx',0o600);try{await file.writeFile(bytes)}finally{await file.close()}}
 catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error
  if((await lstat(target)).isSymbolicLink()||!(await readFile(target)).equals(bytes))throw Error('FASHION_IMAGE_REVISION_CONFLICT')}
 return target
}
