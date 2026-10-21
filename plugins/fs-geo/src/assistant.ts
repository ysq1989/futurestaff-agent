import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,rename,lstat} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
export interface AssistantOwner {key:string;origin:string;signal:AbortSignal}
export interface CollectionJob {id:string;question:string;state:string;conditions:{mode:string;language:string;memoryState:string};leaseToken?:string}
export interface CollectionDriver {
 open(signal:AbortSignal):Promise<unknown>;
 collect(job:CollectionJob,beforeSubmit:()=>Promise<void>,signal:AbortSignal):Promise<Record<string,unknown>>;
 close():Promise<void>;
}
export interface AssistantPorts {
 root:string;executorId:string;authorize(sessionId:string,signal:AbortSignal):Promise<AssistantOwner>;
 request(owner:AssistantOwner,method:string,url:string,body?:unknown,signal?:AbortSignal):Promise<unknown>;
 driver(owner:AssistantOwner,directory:string):CollectionDriver;
}
const uuid=z.string().uuid(),project=z.object({projectId:uuid}),jobRef=project.extend({jobId:uuid}).strict();
export const assistantInputs={
 geo_projects_list:z.object({}).strict(),geo_questions_list:project.strict(),geo_collection_list:project.extend({page:z.number().int().min(1).max(10).default(1)}).strict(),geo_doubao_open:z.object({}).strict(),
 geo_collection_create:project.extend({promptId:uuid,requestId:z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),mode:z.literal('豆包 快速').default('豆包 快速')}).strict(),
 geo_collection_run:jobRef,geo_collection_get:jobRef,
 geo_effect_report:project.extend({jobIds:z.array(uuid).min(1).max(100),baselineJobIds:z.array(uuid).min(1).max(100).optional()}).strict(),
};
export type AssistantTool=keyof typeof assistantInputs;
interface Journal {version:1;fingerprint:string;state:'CLAIMED'|'STARTED'|'RESULT'|'REPORTED';result?:Record<string,unknown>}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function directory(value:string){await mkdir(value,{recursive:true,mode:0o700});let current=value;while(current!==path.dirname(current)){if((await lstat(current)).isSymbolicLink())throw Error('GEO_STORAGE_UNSAFE');current=path.dirname(current);}}
async function save(file:string,value:Journal,initial=false){const target=initial?file:file+'.'+randomUUID()+'.tmp';const handle=await open(target,'wx',0o600);try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}if(!initial)await rename(target,file);}
async function load(file:string):Promise<Journal|undefined>{try{if((await lstat(file)).isSymbolicLink())throw Error('GEO_STORAGE_UNSAFE');const raw=await readFile(file,'utf8');if(Buffer.byteLength(raw)>9_000_000)throw Error('GEO_JOURNAL_INVALID');const value=JSON.parse(raw);if(value.version!==1||!['CLAIMED','STARTED','RESULT','REPORTED'].includes(value.state)||typeof value.fingerprint!=='string')throw Error('GEO_JOURNAL_INVALID');return value;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}}
/** Owns bounded business operations. The model never supplies identity, paths, HTTP headers or URLs. */
export class GeoAssistant {
 private active=false;
 private browsers=new Map<string,CollectionDriver>();
 constructor(private ports:AssistantPorts){if(!path.isAbsolute(ports.root)||!/^[A-Za-z0-9_-]{3,80}$/.test(ports.executorId))throw Error('GEO_EXECUTOR_INVALID');}
 private async context(session:string,signal:AbortSignal){const owner=await this.ports.authorize(session,signal);owner.signal.throwIfAborted();signal.throwIfAborted();const root=path.join(this.ports.root,hash(owner.key));await directory(root);return {owner,root,signal:AbortSignal.any([owner.signal,signal])};}
 private browser(owner:AssistantOwner,root:string){let driver=this.browsers.get(owner.key);if(!driver){driver=this.ports.driver(owner,path.join(root,'browser'));this.browsers.set(owner.key,driver);owner.signal.addEventListener('abort',()=>{this.browsers.delete(owner.key);void driver!.close();},{once:true});}return driver;}
 async execute(name:AssistantTool,raw:unknown,session:string,signal:AbortSignal):Promise<Record<string,unknown>>{
  const schema=assistantInputs[name];if(!schema)throw Error('GEO_TOOL_UNKNOWN');const parsed=schema.parse(raw) as {projectId?:string;jobId?:string;promptId?:string;requestId?:string;mode?:string;jobIds?:string[];baselineJobIds?:string[];page?:number};
  const context=await this.context(session,signal),{owner,root}=context;
  const check=async()=>{context.signal.throwIfAborted();const current=await this.ports.authorize(session,context.signal);if(current.key!==owner.key||current.origin!==owner.origin)throw Error('GEO_IDENTITY_CHANGED');};
  const request=async(method:string,url:string,body?:unknown)=>{await check();const result=await this.ports.request(owner,method,url,body,context.signal);await check();return result;};
  const base='/projects/'+parsed.projectId;
  switch(name){
   case 'geo_projects_list':return {projects:await request('GET','/projects')};
   case 'geo_questions_list':return {questions:await request('GET',base+'/prompts')};
   case 'geo_collection_list':return {jobs:await request('GET',base+'/jobs?page='+parsed.page),page:parsed.page};
   case 'geo_collection_create':return await request('POST',base+'/jobs',{promptId:parsed.promptId,requestId:parsed.requestId,mode:parsed.mode,language:'zh-CN',memoryState:'UNKNOWN'}) as Record<string,unknown>;
   case 'geo_collection_get':return await request('GET',base+'/jobs/'+parsed.jobId) as Record<string,unknown>;
   case 'geo_effect_report':return await request('POST',base+'/report',{jobIds:parsed.jobIds,...(parsed.baselineJobIds?{baselineJobIds:parsed.baselineJobIds}:{})}) as Record<string,unknown>;
   case 'geo_doubao_open':if(this.active)throw Error('GEO_COLLECTOR_BUSY');this.active=true;try{return await this.browser(owner,root).open(context.signal) as Record<string,unknown>;}finally{this.active=false;}
  }
  if(this.active)throw Error('GEO_COLLECTOR_BUSY');this.active=true;
  try{
   const target=base+'/jobs/'+parsed.jobId,job=await request('GET',target) as CollectionJob;
   const jobsRoot=path.join(root,'jobs');await directory(jobsRoot);const file=path.join(jobsRoot,parsed.jobId!+'.json');let journal=await load(file);
   const fingerprint=hash([parsed.projectId,job.id,job.question,job.conditions]);if(journal&&journal.fingerprint!==fingerprint)throw Error('GEO_TASK_CHANGED');
   if(journal?.state==='STARTED')throw Error('GEO_RESULT_UNKNOWN');
   if(journal?.state==='REPORTED')return await request('GET',target) as Record<string,unknown>;
   if(journal?.state==='RESULT'){
    const resumed=await request('POST',target+'/resume',{executorId:this.ports.executorId}) as CollectionJob;
    const result=await request('POST',target+'/result',{executorId:this.ports.executorId,leaseToken:resumed.leaseToken,result:journal.result});
    await save(file,{...journal,state:'REPORTED'});return result as Record<string,unknown>;
   }
   if(journal?.state==='CLAIMED')throw Error('GEO_RESULT_UNKNOWN');
   if(job.state!=='QUEUED')throw Error('GEO_RESULT_UNKNOWN');
   // Reservation is durable before claiming or opening a browser. Recovery never guesses whether submission occurred.
   journal={version:1,fingerprint,state:'CLAIMED'};await save(file,journal,true);
   const claimed=await request('POST',target+'/claim',{executorId:this.ports.executorId}) as CollectionJob;
   const driver=this.browser(owner,root);
   const result=await driver.collect(claimed,async()=>{await check();await save(file,{version:1,fingerprint,state:'STARTED'});},context.signal);
   await save(file,{version:1,fingerprint,state:'RESULT',result});
   const receipt=await request('POST',target+'/result',{executorId:this.ports.executorId,leaseToken:claimed.leaseToken,result});
   await save(file,{version:1,fingerprint,state:'REPORTED'});return receipt as Record<string,unknown>;
  }finally{this.active=false;}
 }
 async close(){const all=[...this.browsers.values()];this.browsers.clear();await Promise.allSettled(all.map(b=>b.close()));}
}
