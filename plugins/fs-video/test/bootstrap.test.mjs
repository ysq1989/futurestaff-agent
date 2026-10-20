import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,symlink,rm,readFile,writeFile,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import {checkedVideoRuntimeTree,validateVideoRuntimeLock,validateVideoRuntimeFiles,validateInstalledVideoRuntime,createVideoRuntimePreparer,ensureVideoRuntime} from '../lib/bootstrap.js'
const source={url:'https://www.python.org/x.zip',name:'x.zip',kind:'python',destination:'python',sha256:'a'.repeat(64),size:1}
const lock={schemaVersion:1,version:'20261020.1',platform:'win32-x64',sources:[source,{...source,name:'f.zip',kind:'ffmpeg',destination:'bin'}]}
test('runtime downloads reject arbitrary sources, traversal, duplicates and unbounded artifacts',()=>{
  assert.equal(validateVideoRuntimeLock(lock),lock)
  for(const change of [{url:'http://www.python.org/x'},{url:'https://evil.example/x'},{name:'../tool.zip'},{sha256:'x'},{size:500*1024*1024},{destination:'../../Windows'}])assert.throws(()=>validateVideoRuntimeLock({...lock,sources:[{...source,...change}]}))
  assert.throws(()=>validateVideoRuntimeLock({...lock,sources:[source,source]}))
})
test('runtime cache rejects linked ancestors and cancelled installation',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'fs-video-bootstrap-'))
  try{
    await mkdir(path.join(root,'outside'));await symlink(path.join(root,'outside'),path.join(root,'linked'),process.platform==='win32'?'junction':'dir')
    await assert.rejects(checkedVideoRuntimeTree(path.join(root,'linked','runtime')))
    const abort=new AbortController();abort.abort()
    await assert.rejects(ensureVideoRuntime(path.join(root,'cache'),abort.signal))
  }finally{await rm(root,{recursive:true,force:true})}
})

const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const bundled=JSON.parse(await readFile(new URL('../lib/runtime-files.json',import.meta.url),'utf8'))
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
async function fixture(t,overrides={}){
  const root=await mkdtemp(path.join(os.tmpdir(),'fs-video-runtime-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const archiveBytes={'python.zip':Buffer.from('verified python archive'),'ffmpeg.zip':Buffer.from('verified ffmpeg archive'),'font.ttf':Buffer.from('verified font bytes')}
  const sources=[
    {url:'https://www.python.org/python.zip',name:'python.zip',kind:'python',destination:'python'},
    {url:'https://www.gyan.dev/ffmpeg.zip',name:'ffmpeg.zip',kind:'ffmpeg',destination:'bin'},
    {url:'https://raw.githubusercontent.com/test/font.ttf',name:'font.ttf',kind:'file',destination:'fonts/NotoSansSC.ttf'},
  ].map(s=>({...s,sha256:sha(archiveBytes[s.name]),size:archiveBytes[s.name].length}))
  const lock={schemaVersion:1,version:'20261020.99',platform:'win32-x64',sources}
  const fileBytes={
    'python/python.exe':'verified python executable',
    'python/python311._pth':'python311.zip\n.\nLib/site-packages\n',
    'bin/ffmpeg.exe':'verified ffmpeg executable','bin/ffprobe.exe':'verified ffprobe executable',
    'fonts/NotoSansSC.ttf':archiveBytes['font.ttf'],
    'licenses/ffmpeg/LICENSE.txt':'verified license',
    'licenses/PROVENANCE.json':JSON.stringify(lock,null,2),
  }
  const files={schemaVersion:1,version:lock.version,platform:lock.platform,files:Object.fromEntries(Object.entries(fileBytes).map(([name,bytes])=>[name,sha(bytes)]))}
  files.files['licenses/NOTICE.txt']=bundled.files['licenses/NOTICE.txt']
  const events=[]
  async function put(target,relative,bytes){const file=path.join(target,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes)}
  const options={lock,files,platform:'win32',architecture:'x64',lockPollMs:5,lockTimeoutMs:1500,
    download:async(s,signal)=>{events.push({kind:'download',name:s.name,signal});return new Response(archiveBytes[s.name])},
    extractArchive:async(archive,target)=>{
      events.push({kind:'extract',name:path.basename(archive)})
      if(path.basename(archive)==='python.zip')await put(target,'python.exe',fileBytes['python/python.exe'])
      else for(const name of ['ffmpeg.exe','ffprobe.exe'])await put(target,'ffmpeg-test/bin/'+name,fileBytes['bin/'+name])
      if(path.basename(archive)==='ffmpeg.zip')await put(target,'ffmpeg-test/LICENSE.txt',fileBytes['licenses/ffmpeg/LICENSE.txt'])
    },...overrides}
  return {root,cache:path.join(root,'cache'),lock,files,options,events,archiveBytes,put,ensure:createVideoRuntimePreparer(options)}
}

test('downloaded bytes must match pinned size and hash before extraction; failures clean only the generated stage',async t=>{
  const f=await fixture(t)
  const ensure=createVideoRuntimePreparer({...f.options,download:async s=>new Response(Buffer.alloc(s.size,0))})
  await assert.rejects(ensure(f.cache),/VIDEO_RUNTIME_DOWNLOAD_INTEGRITY/)
  assert.deepEqual(await readdir(f.cache),[])
  assert.equal(f.events.some(e=>e.kind==='extract'),false)
  await f.ensure(f.cache)
  assert.deepEqual(await readdir(f.cache),[f.lock.version])
})

test('oversize transport is stopped and checked installation has no self-authorizing cache hashes',async t=>{
  const f=await fixture(t)
  const oversized=createVideoRuntimePreparer({...f.options,download:async s=>new Response(Buffer.alloc(s.size+1))})
  await assert.rejects(oversized(f.cache),/VIDEO_RUNTIME_DOWNLOAD_LIMIT/)
  assert.deepEqual(await readdir(f.cache),[])
  const {runtimeRoot}=await f.ensure(f.cache)
  await validateInstalledVideoRuntime(runtimeRoot,f.files)
  assert.equal((await readFile(path.join(runtimeRoot,'python/python311._pth'),'utf8')).includes('import site'),false)
  const count=f.events.filter(e=>e.kind==='download').length
  await writeFile(path.join(runtimeRoot,'python/python.exe'),'tampered executable')
  const ownManifest=JSON.parse(await readFile(path.join(runtimeRoot,'runtime-manifest.json'),'utf8'))
  ownManifest.files={'python/python.exe':sha('tampered executable')}
  await writeFile(path.join(runtimeRoot,'runtime-manifest.json'),JSON.stringify(ownManifest))
  await assert.rejects(f.ensure(f.cache),/VIDEO_RUNTIME_INVALID/)
  assert.equal(f.events.filter(e=>e.kind==='download').length,count)
  delete ownManifest.files
  await writeFile(path.join(runtimeRoot,'runtime-manifest.json'),JSON.stringify(ownManifest))
  await assert.rejects(f.ensure(f.cache),/VIDEO_RUNTIME_INTEGRITY_FAILED/)
})

test('extra executable search files and even empty pycache directories are rejected',async t=>{
  const f=await fixture(t),{runtimeRoot}=await f.ensure(f.cache)
  const extra=path.join(runtimeRoot,'python','startup.pth')
  await writeFile(extra,'import malicious_code\n')
  await assert.rejects(validateInstalledVideoRuntime(runtimeRoot,f.files),/VIDEO_RUNTIME_UNEXPECTED_FILE/)
  await rm(extra)
  const pycache=path.join(runtimeRoot,'python','__pycache__');await mkdir(pycache)
  await assert.rejects(validateInstalledVideoRuntime(runtimeRoot,f.files),/VIDEO_RUNTIME_UNEXPECTED_FILE/)
  await rm(pycache,{recursive:true})
  await validateInstalledVideoRuntime(runtimeRoot,f.files)
  assert.throws(()=>validateVideoRuntimeFiles({...f.files,files:{...f.files.files,'python/added.pyc':'a'.repeat(64)}}),/VIDEO_RUNTIME_FILES_INVALID/)
})

test('a cancelled caller leaves shared preparation alive for another waiter',async t=>{
  const f=await fixture(t),started=deferred(),gate=deferred();let underlying
  const ensure=createVideoRuntimePreparer({...f.options,download:async(s,signal)=>{
    if(s.kind==='python'){underlying=signal;started.resolve();await gate.promise}
    return new Response(f.archiveBytes[s.name])
  }})
  const a=new AbortController(),b=new AbortController(),first=ensure(f.cache,a.signal),second=ensure(f.cache,b.signal)
  const firstRejected=assert.rejects(first,error=>error.name==='AbortError')
  await started.promise;a.abort();await firstRejected
  assert.equal(underlying.aborted,false);gate.resolve()
  const result=await second;await validateInstalledVideoRuntime(result.runtimeRoot,f.files)
})

test('all waiters cancelling aborts transport, cleans stage and permits one clean retry',async t=>{
  const f=await fixture(t),started=deferred();let block=true,aborted=false
  const ensure=createVideoRuntimePreparer({...f.options,download:async(s,signal)=>{
    if(block){started.resolve();await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason)},{once:true})})}
    return new Response(f.archiveBytes[s.name])
  }})
  const a=new AbortController(),b=new AbortController(),first=ensure(f.cache,a.signal),second=ensure(f.cache,b.signal)
  const rejected=[assert.rejects(first,error=>error.name==='AbortError'),assert.rejects(second,error=>error.name==='AbortError')]
  await started.promise;a.abort();b.abort();await Promise.all(rejected)
  block=false
  const result=await ensure(f.cache)
  assert.equal(aborted,true);await validateInstalledVideoRuntime(result.runtimeRoot,f.files)
  assert.deepEqual(await readdir(f.cache),[f.lock.version])
})

test('independent preparers coordinate through the directory lock and never overwrite an install',async t=>{
  const f=await fixture(t),started=deferred(),gate=deferred();let downloads=0
  const options={...f.options,download:async(s,signal)=>{downloads++;if(s.kind==='python'){started.resolve();await gate.promise}signal.throwIfAborted();return new Response(f.archiveBytes[s.name])}}
  const left=createVideoRuntimePreparer(options),right=createVideoRuntimePreparer(options)
  const first=left(f.cache);await started.promise;const second=right(f.cache)
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(downloads,1);gate.resolve()
  const [a,b]=await Promise.all([first,second]);assert.equal(a.runtimeRoot,b.runtimeRoot);assert.equal(downloads,3)
  assert.deepEqual(await readdir(f.cache),[f.lock.version])
})

test('foreign locks time out without downloading or deleting another owner lock',async t=>{
  const f=await fixture(t);await mkdir(f.cache);const lockDir=path.join(f.cache,'.prepare-'+f.lock.version+'.lock');await mkdir(lockDir)
  await writeFile(path.join(lockDir,'owner.json'),'foreign owner')
  const ensure=createVideoRuntimePreparer({...f.options,lockTimeoutMs:25})
  await assert.rejects(ensure(f.cache),/VIDEO_RUNTIME_LOCK_TIMEOUT/)
  assert.equal(f.events.length,0);assert.equal(await readFile(path.join(lockDir,'owner.json'),'utf8'),'foreign owner')
  await assert.rejects(ensure('relative/cache'),/VIDEO_RUNTIME_PATH_INVALID/)
})

test('linked injected extraction fails closed and cleanup preserves outside bytes',async t=>{
  const f=await fixture(t),outside=path.join(f.root,'outside');await mkdir(outside);await writeFile(path.join(outside,'sentinel'),'keep')
  const original=f.options.extractArchive
  const ensure=createVideoRuntimePreparer({...f.options,extractArchive:async(archive,target,signal)=>{
    await original(archive,target,signal)
    if(path.basename(archive)==='python.zip')await symlink(outside,path.join(target,'linked'),process.platform==='win32'?'junction':'dir')
  }})
  await assert.rejects(ensure(f.cache),/VIDEO_RUNTIME_PATH_INVALID/)
  assert.equal(await readFile(path.join(outside,'sentinel'),'utf8'),'keep')
  assert.deepEqual(await readdir(f.cache),[])
})
