import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,readdir,rename,rm,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import * as storage from '../lib/storage.js'

async function fixture(t) {
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-video-storage-'))
 t.after(()=>rm(root,{recursive:true,force:true}))
 const file=path.join(root,'job.json'),temporary=path.join(root,'job.tmp')
 await writeFile(file,'{"status":"running"}');await writeFile(temporary,'{"status":"failed"}')
 return {root,file,temporary}
}

for(const code of ['EPERM','EACCES','EBUSY'])test(`Windows ${code} retries retain the old job until replacement succeeds`,async t=>{
 const {file,temporary}=await fixture(t);let attempts=0
 await storage.renameWithRetry(temporary,file,async(source,target)=>{
  assert.equal(await readFile(target,'utf8'),'{"status":"running"}')
  assert.equal(await readFile(source,'utf8'),'{"status":"failed"}')
  if(++attempts<3)throw Object.assign(new Error('sharing violation'),{code})
  await rename(source,target)
 },'win32')
 assert.equal(attempts,3);assert.equal(await readFile(file,'utf8'),'{"status":"failed"}')
 await assert.rejects(readFile(temporary),{code:'ENOENT'})
})

test('permanent Windows denial is bounded and preserves the original job and error',async t=>{
 const {file,temporary}=await fixture(t),failure=Object.assign(new Error('access denied'),{code:'EPERM'});let attempts=0
 await assert.rejects(storage.renameWithRetry(temporary,file,async()=>{attempts++;throw failure},'win32'),error=>error===failure)
 assert.equal(attempts,6);assert.equal(await readFile(file,'utf8'),'{"status":"running"}')
})

test('non-sharing errors and POSIX errors are returned without retry',async t=>{
 const {file,temporary}=await fixture(t)
 for(const [platform,code] of [['linux','EPERM'],['win32','ENOENT']]){
  let attempts=0;const failure=Object.assign(new Error(code),{code})
  await assert.rejects(storage.renameWithRetry(temporary,file,async()=>{attempts++;throw failure},platform),error=>error===failure)
  assert.equal(attempts,1)
 }
})

test('failed atomic JSON replacement cleans its temporary file without removing the target',async t=>{
 const {root}=await fixture(t),directory=path.join(root,'target.json');await mkdir(directory)
 await writeFile(path.join(directory,'preserved'),'keep')
 await assert.rejects(storage.atomicJson(root,directory,{status:'failed'}))
 assert.equal(await readFile(path.join(directory,'preserved'),'utf8'),'keep')
 assert.deepEqual((await readdir(root)).sort(),['job.json','job.tmp','target.json'])
})
