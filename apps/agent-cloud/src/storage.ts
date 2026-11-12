import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto'
import {mkdir,readFile,open,rename,readdir,unlink} from 'node:fs/promises'
import path from 'node:path'

export const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
export const opaque=()=>randomBytes(32).toString('base64url')
export class ApiError extends Error {
  constructor(readonly status:number,readonly code:string,message:string){super(message)}
}
export function bounded(value:unknown,max=1000):string {
  if(typeof value!=='string'||!value.trim()||value.length>max)throw new ApiError(400,'INVALID_REQUEST','输入内容不完整或过长。')
  return value
}
export function uuid(value:unknown):string {
  const v=bounded(value,40)
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))throw new ApiError(400,'INVALID_ID','记录标识无效。')
  return v.toLowerCase()
}
/** Only server-generated names enter this directory; authentication records use authenticated encryption. */
export class Storage {
  private readonly key:Buffer
  constructor(readonly root:string,key:string){
    this.key=Buffer.from(key,'base64')
    if(this.key.length!==32)throw Error('AGENT_ENCRYPTION_KEY must contain 32 random bytes in base64')
  }
  async init(){await mkdir(this.root,{recursive:true,mode:0o700})}
  file(group:string,id:string){
    if(!/^[a-z0-9/-]+$/i.test(group)||group.split('/').some(x=>x==='..')||!/^[a-z0-9-]+$/i.test(id))throw Error('unsafe storage key')
    return path.join(this.root,group,id+'.json')
  }
  async read<T>(group:string,id:string,encrypted=false):Promise<T|undefined>{
    let text:string
    try{text=await readFile(this.file(group,id),'utf8')}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e}
    if(encrypted){const p=JSON.parse(text) as {iv:string;tag:string;data:string};const d=createDecipheriv('aes-256-gcm',this.key,Buffer.from(p.iv,'base64'));d.setAAD(Buffer.from(group+'/'+id));d.setAuthTag(Buffer.from(p.tag,'base64'));text=Buffer.concat([d.update(Buffer.from(p.data,'base64')),d.final()]).toString('utf8')}
    return JSON.parse(text) as T
  }
  async write(group:string,id:string,value:unknown,encrypted=false){
    let text=JSON.stringify(value)
    if(encrypted){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,iv);c.setAAD(Buffer.from(group+'/'+id));const data=Buffer.concat([c.update(text,'utf8'),c.final()]);text=JSON.stringify({iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')})}
    const file=this.file(group,id);await mkdir(path.dirname(file),{recursive:true,mode:0o700})
    const temp=file+'.'+randomUUID()+'.tmp'
    try{
      const handle=await open(temp,'wx',0o600)
      try{await handle.writeFile(text);await handle.sync()}finally{await handle.close()}
      await rename(temp,file)
      // Linux production also persists the renamed directory entry before admission returns.
      try{const directory=await open(path.dirname(file),'r');try{await directory.sync()}finally{await directory.close()}}
      catch(e){if(process.platform!=='win32'||!['EPERM','EISDIR','EINVAL','EACCES'].includes((e as NodeJS.ErrnoException).code??''))throw e}
    }finally{await unlink(temp).catch(()=>{})}
  }
  async remove(group:string,id:string){await unlink(this.file(group,id)).catch(e=>{if(e.code!=='ENOENT')throw e})}
  async ids(group:string):Promise<string[]>{try{return(await readdir(path.dirname(this.file(group,'index')))).filter(x=>x.endsWith('.json')).map(x=>x.slice(0,-5))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e}}
}
export class Serial {
  private tails=new Map<string,Promise<unknown>>()
  async run<T>(key:string,fn:()=>Promise<T>):Promise<T>{
    const previous=this.tails.get(key)??Promise.resolve()
    const next=previous.catch(()=>{}).then(fn);this.tails.set(key,next)
    try{return await next}finally{if(this.tails.get(key)===next)this.tails.delete(key)}
  }
}
