import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {VideoEngine} from '../lib/index.js'
import {videoProcessFailure} from '../lib/runtime.js'
const input={requestId:'create-001',title:'社区咖啡店新品',brief:'示例：咖啡店活动介绍',scenes:[{id:'hero',title:'春日新品',narration:'来喝一杯。',lines:['业务示例'],visual:'hero',durationSeconds:2}],voice:{provider:'none'}}
async function fixture(t,options={}){const root=await mkdtemp(path.join(os.tmpdir(),'fs-video-'));t.after(()=>rm(root,{recursive:true,force:true}));const engine=new VideoEngine({workspaceRoot:root,ownerKey:'member-a-agent-a',...options});t.after(()=>engine.dispose());return{root,engine}}
test('create idempotency, immutable revisions, reopen and optimistic conflict',async t=>{const{root,engine}=await fixture(t);const first=await engine.create(input);assert.equal((await engine.create(input)).projectId,first.projectId);await assert.rejects(engine.create({...input,title:'different'}),{code:'VIDEO_REQUEST_CONFLICT'});const original=await readFile(first.revisionPath,'utf8');const next=await engine.revise({requestId:'revise-001',projectId:first.projectId,baseRevisionId:first.revisionId,changes:{music:'gentle',scenes:[{...input.scenes[0],title:'慢慢喝一杯'}]}});assert.notEqual(first.revisionId,next.revisionId);assert.equal(await readFile(first.revisionPath,'utf8'),original);const reopened=new VideoEngine({workspaceRoot:root,ownerKey:'member-a-agent-a'});assert.equal((await reopened.get({projectId:first.projectId})).revisionId,next.revisionId);assert.equal((await reopened.get({projectId:first.projectId,revisionId:first.revisionId})).revision.title,input.title);await assert.rejects(engine.revise({requestId:'revise-002',projectId:first.projectId,baseRevisionId:first.revisionId,changes:{title:'stale'}}),{code:'VIDEO_REVISION_CONFLICT'})})
test('owner and project traversal fail closed',async t=>{const{root,engine}=await fixture(t);const first=await engine.create(input);const foreign=new VideoEngine({workspaceRoot:root,ownerKey:'other-member'});await assert.rejects(foreign.get({projectId:first.projectId}),{code:'VIDEO_OWNER_MISMATCH'});await assert.rejects(engine.get({projectId:'../outside'}),{code:'VIDEO_INPUT_INVALID'})})
test('symlink directories cannot redirect member output',async t=>{const root=await mkdtemp(path.join(os.tmpdir(),'fs-video-link-'));const external=await mkdtemp(path.join(os.tmpdir(),'fs-video-external-'));t.after(()=>rm(root,{recursive:true,force:true}));t.after(()=>rm(external,{recursive:true,force:true}));await symlink(external,path.join(root,'video-projects'),process.platform==='win32'?'junction':'dir');const engine=new VideoEngine({workspaceRoot:root,ownerKey:'member'});await assert.rejects(engine.create(input),{code:'VIDEO_PATH_UNSAFE'})})
test('background job cancellation keeps original revision and stable request',async t=>{const{engine}=await fixture(t,{executor:async({signal,onProgress})=>{await onProgress('frames',.2);await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));return{} }});const p=await engine.create(input);const request={requestId:'render-001',projectId:p.projectId,revisionId:p.revisionId};const job=await engine.render(request);assert.equal((await engine.render(request)).jobId,job.jobId);const done=await engine.cancel({projectId:p.projectId,jobId:job.jobId});assert.equal(done.status,'cancelled');assert.equal((await engine.get({projectId:p.projectId})).revisionId,p.revisionId)})
test('missing project never starts renderer',async t=>{const{engine}=await fixture(t,{executor:()=>{throw Error('must not execute')}});await assert.rejects(engine.render({requestId:'render-001',projectId:crypto.randomUUID(),revisionId:crypto.randomUUID()}),{code:'VIDEO_NOT_FOUND'})})
test('runtime initialization is an accepted observable background stage, and failures persist',async t=>{let rejectRuntime;const{engine}=await fixture(t,{runtimeProvider:()=>new Promise((_,reject)=>{rejectRuntime=reject}),executor:()=>{throw Error('must not render')}});const p=await engine.create(input);const job=await engine.render({requestId:'render-001',projectId:p.projectId,revisionId:p.revisionId});for(let i=0;i<100&&!rejectRuntime;i++)await new Promise(r=>setTimeout(r,5));assert.equal((await engine.status({projectId:p.projectId,jobId:job.jobId})).stage,'runtime');rejectRuntime(Error('download unavailable'));let status;for(let i=0;i<100;i++){status=await engine.status({projectId:p.projectId,jobId:job.jobId});if(status.status==='failed')break;await new Promise(r=>setTimeout(r,5))}assert.equal(status.status,'failed');assert.equal((await engine.get({projectId:p.projectId})).revisionId,p.revisionId)})
test('storage quotas and missing assets reject before running',async t=>{const{engine}=await fixture(t,{limits:{maxProjects:1}});await engine.create(input);await assert.rejects(engine.create({...input,requestId:'create-002'}),{code:'VIDEO_PROJECT_LIMIT'});const other=await fixture(t,{limits:{maxWorkspaceBytes:1}});await assert.rejects(other.engine.create(input),{code:'VIDEO_STORAGE_LIMIT'});const asset=await fixture(t);const p=await asset.engine.create({...input,scenes:[{...input.scenes[0],assetId:crypto.randomUUID()}]});await assert.rejects(asset.engine.render({requestId:'render-001',projectId:p.projectId,revisionId:p.revisionId}),{code:'VIDEO_ASSET_UNAVAILABLE'})})
test('manual manifest tampering cannot silently change a frozen revision',async t=>{const{engine}=await fixture(t);const p=await engine.create(input);const raw=JSON.parse(await readFile(p.revisionPath,'utf8'));raw.scenes[0].title='Changed outside revision API';await writeFile(p.revisionPath,JSON.stringify(raw));await assert.rejects(engine.get({projectId:p.projectId}),{code:'VIDEO_PROJECT_CORRUPT'})})
test('known runtime errors remain actionable without leaking arbitrary raw messages',async t=>{const{engine}=await fixture(t,{runtimeProvider:async()=>{throw Error('VIDEO_RUNTIME_DOWNLOAD_FAILED')}});const p=await engine.create(input);const job=await engine.render({requestId:'render-001',projectId:p.projectId,revisionId:p.revisionId});let state;for(let i=0;i<100;i++){state=await engine.status({projectId:p.projectId,jobId:job.jobId});if(state.status==='failed')break;await new Promise(r=>setTimeout(r,5))}assert.equal(state.error.code,'VIDEO_RUNTIME_DOWNLOAD_FAILED');assert.match(state.error.message,/免费制作组件准备失败/);assert.equal((await engine.get({projectId:p.projectId})).revisionId,p.revisionId)})

test('each accepted render keeps its original session runtime provider',async t=>{
 let first=0,second=0
 const {engine}=await fixture(t,{executor:async()=>({})})
 const p=await engine.create(input)
 engine.configureRuntimeProvider(async()=>{first++;return {}})
 const pending=engine.render({requestId:'render-session-one',projectId:p.projectId,revisionId:p.revisionId})
 engine.configureRuntimeProvider(async()=>{second++;return {}})
 const job=await pending
 for(let i=0;i<100;i++){if((await engine.status({projectId:p.projectId,jobId:job.jobId})).status==='succeeded')break;await new Promise(r=>setTimeout(r,5))}
 assert.equal(first,1);assert.equal(second,0)
})

test('runtime import errors keep an actionable public code and private diagnostics without suggesting network or silent narration removal',async t=>{
 const {engine}=await fixture(t,{executor:async()=>{throw videoProcessFailure('Traceback:\nImportError: DLL load failed while importing _overlapped: C:\\private-member\\python\\_overlapped.pyd')}})
 const p=await engine.create(input),job=await engine.render({requestId:'render-import-failure',projectId:p.projectId,revisionId:p.revisionId})
 let state
 for(let i=0;i<100;i++){state=await engine.status({projectId:p.projectId,jobId:job.jobId});if(state.status==='failed')break;await new Promise(r=>setTimeout(r,5))}
 assert.equal(state.error.code,'VIDEO_RUNTIME_IMPORT_FAILED')
 assert.match(state.error.message,/组件未能加载/)
 assert.doesNotMatch(state.error.message,/网络|无旁白|private-member/)
 const diagnostics=await readFile(path.join(p.projectPath,'jobs',job.jobId,'error.log'),'utf8')
 assert.match(diagnostics,/_overlapped/)
 assert.equal((await engine.get({projectId:p.projectId})).revisionId,p.revisionId)
})
