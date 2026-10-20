import {lstat,mkdir,readFile,realpath,rename,writeFile,open,unlink} from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {VideoError} from './contracts.js'

export async function safeDirectory(directory:string){
 const parent=path.dirname(directory);if(parent!==directory)await safeDirectory(parent)
 try{const stat=await lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new VideoError('VIDEO_PATH_UNSAFE')}
 catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await mkdir(directory,{mode:0o700});const stat=await lstat(directory);if(stat.isSymbolicLink())throw new VideoError('VIDEO_PATH_UNSAFE')}
}
export async function existingFile(root:string,file:string){
 const base=await realpath(root),target=await realpath(file),relative=path.relative(base,target)
 if(relative.startsWith('..')||path.isAbsolute(relative)||(await lstat(file)).isSymbolicLink())throw new VideoError('VIDEO_PATH_UNSAFE')
 const pieces=path.relative(base,file).split(path.sep);let cursor=base
 for(const part of pieces){cursor=path.join(cursor,part);if((await lstat(cursor)).isSymbolicLink())throw new VideoError('VIDEO_PATH_UNSAFE')}
 return target
}
export async function readJson<T>(root:string,file:string):Promise<T>{try{return JSON.parse(await readFile(await existingFile(root,file),'utf8')) as T}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new VideoError('VIDEO_NOT_FOUND');throw e}}
export async function atomicJson(root:string,file:string,value:unknown){
 await safeDirectory(path.dirname(file));const relative=path.relative(await realpath(root),await realpath(path.dirname(file)))
 if(relative.startsWith('..')||path.isAbsolute(relative))throw new VideoError('VIDEO_PATH_UNSAFE')
 try{if((await lstat(file)).isSymbolicLink())throw new VideoError('VIDEO_PATH_UNSAFE')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
 const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});await rename(temporary,file)
}
export async function fileLock<T>(directory:string,operation:()=>Promise<T>):Promise<T>{
 const file=path.join(directory,'.write.lock');let handle
 try{handle=await open(file,'wx',0o600)}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;let stale=false;try{const lock=JSON.parse(await readFile(file,'utf8'));if(Number.isInteger(lock.pid)&&lock.pid>0){try{process.kill(lock.pid,0)}catch(error){stale=(error as NodeJS.ErrnoException).code==='ESRCH'}}}catch{}if(!stale)throw new VideoError('VIDEO_BUSY');await unlink(file);try{handle=await open(file,'wx',0o600)}catch{throw new VideoError('VIDEO_BUSY')}}
 await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}))
 try{return await operation()}finally{await handle.close();await unlink(file)}
}
