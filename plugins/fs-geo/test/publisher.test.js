import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {LocalPublicationRunner,FilePublicationJournal} from '../lib/publisher.js';
import {apply} from '../lib/index.js';

test('publisher package is pinned and rejects unverified transport before any external action',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../publishing-source-manifest.json',import.meta.url),'utf8'));
 for(const [file,hash] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(new URL('../publishing-source/'+file,import.meta.url))).digest('hex'),hash);
 const root=await mkdtemp(path.join(tmpdir(),'fs-geo-publisher-'));
 let calls=0;
 const id='00000000-0000-4000-8000-000000000001';
 const claim={id,projectId:id,articleId:id,accountId:id,tenantId:id,executorId:id,leaseToken:id,version:1,state:'RUNNING',scheduledAt:new Date().toISOString(),leaseExpiresAt:new Date(Date.now()+180000).toISOString(),title:'Fixture',body:'Fixture only',result:null,provenance:null};
 const runner=new LocalPublicationRunner({authorize:async()=>{calls++;throw Error('REAL_NETWORK_FORBIDDEN')},report:async()=>{calls++}}, {verified:false,transport:async()=>{calls++;throw Error('REAL_PUBLISH_FORBIDDEN')}},new FilePublicationJournal(root));
 try{await assert.rejects(runner.run(claim,{jobId:id,accountId:id,version:1}),/核验/);assert.equal(calls,0)}finally{await rm(root,{recursive:true,force:true})}
});
test('default GEO Host stops writes to the legacy local workspace without opening its database',()=>{
 let route;
 apply({inject:()=>{},effect:fn=>fn(),webServer:{register:value=>{route=value;return()=>{}}}});
 let body;
 const response={setHeader:()=>{},end:value=>{body=value}};
 route.handler({},response);
 assert.equal(response.statusCode,409);
 assert.equal(JSON.parse(body).error.code,'GEO_CLOUD_WORKSPACE_REQUIRED');
});
