import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {GeoAssistant} from '../lib/assistant.js';
const projectId='00000000-0000-4000-8000-000000000001',jobId='00000000-0000-4000-8000-000000000002';
test('assistant persists before sending and retries upload without re-asking after restart',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'geo-assistant-'));let asks=0,uploads=0,failUpload=true,revoked=false;
 const controller=new AbortController();
 const job={id:jobId,promptId:projectId,question:'业务系统有哪些？',conditions:{mode:'豆包 快速',language:'zh-CN',memoryState:'UNKNOWN'},state:'QUEUED'};
 const ports={root,executorId:'device_one',authorize:async()=>{if(revoked)throw Error('GEO_PERMISSION_REQUIRED');return {key:'owner',origin:'https://geo.test',signal:controller.signal};},
  request:async(_owner,method,url,body)=>{
   if(url.endsWith('/claim')){job.state='RUNNING';return {...job,leaseToken:projectId};}
   if(url.endsWith('/resume'))return {...job,leaseToken:projectId};
   if(url.endsWith('/result')){uploads++;if(failUpload)throw Error('GEO_API_UNAVAILABLE');return {state:'SUCCEEDED',evidenceId:projectId};}
   if(method==='GET')return job;throw Error('unexpected request');
  },driver:()=>({open:async()=>({state:'READY'}),collect:async(_job,beforeSubmit)=>{await beforeSubmit();asks++;return {state:'SUCCEEDED',answer:'原始答案',screenshots:[]};},close:async()=>{}})};
 try{
  const first=new GeoAssistant(ports);await assert.rejects(()=>first.execute('geo_collection_run',{projectId,jobId},'session',controller.signal),/GEO_API_UNAVAILABLE/);assert.equal(asks,1);assert.equal(uploads,1);
  await first.close();failUpload=false;
  const restarted=new GeoAssistant(ports);const result=await restarted.execute('geo_collection_run',{projectId,jobId},'session',controller.signal);assert.equal(result.state,'SUCCEEDED');assert.equal(asks,1);assert.equal(uploads,2);
  revoked=true;await assert.rejects(()=>restarted.execute('geo_collection_run',{projectId,jobId},'session',controller.signal),/GEO_PERMISSION_REQUIRED/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('assistant with interrupted submission preserves UNKNOWN and never asks again',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'geo-interrupt-'));const controller=new AbortController();let asks=0;const job={id:jobId,question:'原题',conditions:{mode:'豆包 快速',language:'zh-CN',memoryState:'UNKNOWN'},state:'QUEUED'};
 const ports={root,executorId:'device_one',authorize:async()=>({key:'owner',origin:'https://geo.test',signal:controller.signal}),request:async(_o,_m,url)=>url.endsWith('/claim')?{...job,leaseToken:projectId}:job,
 driver:()=>({open:async()=>({state:'READY'}),collect:async(_job,beforeSubmit)=>{await beforeSubmit();asks++;throw Error('simulated process interruption');},close:async()=>{}})};
 try{const first=new GeoAssistant(ports);await assert.rejects(()=>first.execute('geo_collection_run',{projectId,jobId},'session',controller.signal));await first.close();const again=new GeoAssistant(ports);await assert.rejects(()=>again.execute('geo_collection_run',{projectId,jobId},'session',controller.signal),/GEO_RESULT_UNKNOWN/);assert.equal(asks,1);}finally{await rm(root,{recursive:true,force:true});}
});
test('browser login and collection share one mutex',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'geo-concurrent-'));const controller=new AbortController();let started,finish;
 const ready=new Promise(r=>{started=r;});const opening=new Promise(r=>{finish=r;});
 const host=new GeoAssistant({root,executorId:'device_one',authorize:async()=>({key:'owner',origin:'https://geo.test',signal:controller.signal}),request:async()=>{throw Error('NO_API_EXPECTED');},driver:()=>({open:async()=>{started();await opening;return {state:'READY'};},collect:async()=>{throw Error('NO_COLLECTION_EXPECTED');},close:async()=>{}})});
 try{const first=host.execute('geo_doubao_open',{},'session',controller.signal);await ready;await assert.rejects(()=>host.execute('geo_doubao_open',{},'session',controller.signal),/GEO_COLLECTOR_BUSY/);finish();assert.equal((await first).state,'READY');}finally{await host.close();await rm(root,{recursive:true,force:true});}
});
