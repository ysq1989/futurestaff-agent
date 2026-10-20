import {createHash, randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {createReadStream} from 'node:fs'
import {lstat, mkdir, open, readFile, readdir, realpath, rename, rm, rmdir, unlink, writeFile} from 'node:fs/promises'
import path from 'node:path'

export interface VideoRuntimeSource {url:string;name:string;kind:'python'|'ffmpeg'|'wheel'|'file';destination:string;sha256:string;size:number}
export interface VideoRuntimeLock {schemaVersion:1;version:string;platform:'win32-x64';sources:VideoRuntimeSource[]}
export interface VideoRuntimeFiles {schemaVersion:1;version:string;platform:'win32-x64';files:Record<string,string>}
type RuntimeResult={runtimeRoot:string}
const NOTICE='Free tools are downloaded directly from their publishers at pinned hashes. FFmpeg is a separate GPL executable; its included license and build provenance are retained. Edge TTS uses an online Microsoft service via the LGPL edge-tts client and requires connectivity; no paid speech API is used. Python PSF license and dependency licenses remain beside their packages. Font: Noto Sans SC, SIL Open Font License. Music: generated locally by FutureStaff Video, no stock music license needed.\n'
const MARKER='runtime-manifest.json',HASH=/^[a-f0-9]{64}$/
function invalid(code:string):never{throw Error(code)}
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const onlyKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).every(key=>keys.includes(key))&&keys.every(key=>Object.hasOwn(value,key))
async function checksum(file:string,signal?:AbortSignal){
  signal?.throwIfAborted();const hash=createHash('sha256')
  for await(const chunk of createReadStream(file)){signal?.throwIfAborted();hash.update(chunk)}
  return hash.digest('hex')
}
/** No linked ancestor may redirect creation, extraction, or cleanup. */
export async function checkedVideoRuntimeTree(directory:string,create=true):Promise<void>{
  if(!path.isAbsolute(directory))invalid('VIDEO_RUNTIME_PATH_INVALID')
  const parent=path.dirname(directory);if(parent!==directory)await checkedVideoRuntimeTree(parent,create)
  try{const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())invalid('VIDEO_RUNTIME_PATH_INVALID')}
  catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT'||!create)throw error
    try{await mkdir(directory)}catch(cause){if((cause as NodeJS.ErrnoException).code!=='EEXIST')throw cause}
    const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())invalid('VIDEO_RUNTIME_PATH_INVALID')
  }
}
export function validateVideoRuntimeLock(raw:unknown):VideoRuntimeLock {
  if(!record(raw)||!onlyKeys(raw,['schemaVersion','version','platform','sources'])||raw.schemaVersion!==1||typeof raw.version!=='string'||!/^\d{8}\.\d+$/.test(raw.version)||raw.platform!=='win32-x64'||!Array.isArray(raw.sources)||raw.sources.length>32)invalid('VIDEO_RUNTIME_LOCK_INVALID')
  let total=0;const names=new Set<string>()
  for(const item of raw.sources){
    if(!record(item)||!onlyKeys(item,['url','name','kind','destination','sha256','size']))invalid('VIDEO_RUNTIME_LOCK_INVALID')
    let url:URL;try{url=new URL(String(item.url))}catch{return invalid('VIDEO_RUNTIME_LOCK_INVALID')}
    if(typeof item.url!=='string'||url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!['www.python.org','www.gyan.dev','raw.githubusercontent.com','files.pythonhosted.org'].includes(url.hostname)
      ||typeof item.name!=='string'||!/^[A-Za-z0-9_.-]+$/.test(item.name)||names.has(item.name.toLowerCase())
      ||typeof item.kind!=='string'||!['python','ffmpeg','wheel','file'].includes(item.kind)
      ||typeof item.destination!=='string'||!['python','bin','python/Lib/site-packages','fonts/NotoSansSC.ttf','fonts/OFL.txt'].includes(item.destination)
      ||typeof item.size!=='number'||!Number.isSafeInteger(item.size)||item.size<1||item.size>150*1024*1024||typeof item.sha256!=='string'||!HASH.test(item.sha256))invalid('VIDEO_RUNTIME_LOCK_INVALID')
    const destinations:Record<string,string[]>={python:['python'],ffmpeg:['bin'],wheel:['python/Lib/site-packages'],file:['fonts/NotoSansSC.ttf','fonts/OFL.txt']}
    if(!destinations[item.kind].includes(item.destination))invalid('VIDEO_RUNTIME_LOCK_INVALID')
    names.add(item.name.toLowerCase());total+=item.size
  }
  if(total>200*1024*1024||raw.sources.filter(s=>s.kind==='python').length!==1||raw.sources.filter(s=>s.kind==='ffmpeg').length!==1)invalid('VIDEO_RUNTIME_LOCK_INVALID')
  return raw as unknown as VideoRuntimeLock
}
function safeRelative(relative:string):boolean {
  return relative.length<=300&&/^[A-Za-z0-9_./+-]+$/.test(relative)&&!relative.split('/').some(part=>!part||part==='.'||part==='..'||part.endsWith('.')||/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))
}
export function validateVideoRuntimeFiles(raw:unknown):VideoRuntimeFiles {
  if(!record(raw)||!onlyKeys(raw,['schemaVersion','version','platform','files'])||raw.schemaVersion!==1||typeof raw.version!=='string'||!/^\d{8}\.\d+$/.test(raw.version)||raw.platform!=='win32-x64'||!record(raw.files))invalid('VIDEO_RUNTIME_FILES_INVALID')
  const entries=Object.entries(raw.files),names=new Set<string>()
  if(entries.length<4||entries.length>4096)invalid('VIDEO_RUNTIME_FILES_INVALID')
  for(const [relative,hash] of entries){
    if(!safeRelative(relative)||relative===MARKER||relative.split('/').includes('__pycache__')||/\.py[co]$/i.test(relative)||names.has(relative.toLowerCase())||typeof hash!=='string'||!HASH.test(hash))invalid('VIDEO_RUNTIME_FILES_INVALID')
    names.add(relative.toLowerCase())
  }
  for(const required of ['bin/ffmpeg.exe','bin/ffprobe.exe','python/python.exe','fonts/NotoSansSC.ttf'])if(!raw.files[required])invalid('VIDEO_RUNTIME_FILES_INVALID')
  return raw as unknown as VideoRuntimeFiles
}
const filesDigest=(files:Record<string,string>)=>createHash('sha256').update(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))).digest('hex')
const markerFor=(expected:VideoRuntimeFiles)=>({schemaVersion:1,version:expected.version,platform:expected.platform,filesSha256:filesDigest(expected.files)})

/** Packaged expected hashes are authoritative; the cache manifest is only a completion marker. */
export async function validateInstalledVideoRuntime(root:string,expectedRaw?:unknown,signal?:AbortSignal):Promise<void>{
  signal?.throwIfAborted()
  const expected=validateVideoRuntimeFiles(expectedRaw??JSON.parse(await readFile(new URL('./runtime-files.json',import.meta.url),'utf8')))
  await checkedVideoRuntimeTree(root,false)
  const markerFile=path.join(root,MARKER),markerInfo=await lstat(markerFile)
  if(!markerInfo.isFile()||markerInfo.isSymbolicLink()||markerInfo.size>2048)invalid('VIDEO_RUNTIME_INVALID')
  const marker=JSON.parse(await readFile(markerFile,'utf8'))
  if(!record(marker)||!onlyKeys(marker,['schemaVersion','version','platform','filesSha256'])||JSON.stringify(marker)!==JSON.stringify(markerFor(expected)))invalid('VIDEO_RUNTIME_INVALID')
  const directories=new Set<string>()
  for(const relative of Object.keys(expected.files)){let parent=path.posix.dirname(relative);while(parent!=='.'){directories.add(parent);parent=path.posix.dirname(parent)}}
  const seen=new Set<string>()
  async function walk(current:string,relative=''):Promise<void>{
    for(const entry of await readdir(current,{withFileTypes:true})){
      signal?.throwIfAborted()
      const child=path.join(current,entry.name),name=relative?relative+'/'+entry.name:entry.name,info=await lstat(child)
      if(info.isSymbolicLink())invalid('VIDEO_RUNTIME_PATH_INVALID')
      if(info.isDirectory()){if(!directories.has(name))invalid('VIDEO_RUNTIME_UNEXPECTED_FILE');await walk(child,name)}
      else if(info.isFile()){
        if(name===MARKER)continue
        if(!Object.hasOwn(expected.files,name)||seen.has(name))invalid('VIDEO_RUNTIME_UNEXPECTED_FILE')
        if(await checksum(child,signal)!==expected.files[name])invalid('VIDEO_RUNTIME_INTEGRITY_FAILED')
        seen.add(name)
      }else invalid('VIDEO_RUNTIME_PATH_INVALID')
    }
  }
  await walk(root)
  if(seen.size!==Object.keys(expected.files).length)invalid('VIDEO_RUNTIME_INTEGRITY_FAILED')
}
async function extract(archive:string,target:string,signal:AbortSignal){
  await checkedVideoRuntimeTree(target)
  const executable=path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')
  const command='Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:FUTURESTAFF_VIDEO_ARCHIVE, $env:FUTURESTAFF_VIDEO_EXTRACT)'
  signal.throwIfAborted()
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:'ignore',env:{...process.env,FUTURESTAFF_VIDEO_ARCHIVE:archive,FUTURESTAFF_VIDEO_EXTRACT:target},signal})
    child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('VIDEO_RUNTIME_EXTRACTION_FAILED')))
  })
}
async function pause(ms:number,signal:AbortSignal){
  signal.throwIfAborted()
  await new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason)}
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)
    signal.addEventListener('abort',abort,{once:true})
  })
}
/** Remove only our generated stage after checking the real absolute target stays inside cacheRoot. */
async function cleanStage(cacheRoot:string,stage:string){
  if(path.dirname(stage)!==cacheRoot||!/^\.preparing-[a-f0-9-]{36}$/.test(path.basename(stage)))invalid('VIDEO_RUNTIME_CLEANUP_UNSAFE')
  await checkedVideoRuntimeTree(cacheRoot,false)
  let info;try{info=await lstat(stage)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error}
  if(!info.isDirectory()||info.isSymbolicLink())invalid('VIDEO_RUNTIME_CLEANUP_UNSAFE')
  const resolvedStage=await realpath(stage),resolvedCache=await realpath(cacheRoot)
  if(path.relative(resolvedCache,resolvedStage)!==path.basename(stage))invalid('VIDEO_RUNTIME_CLEANUP_UNSAFE')
  await rm(resolvedStage,{recursive:true,force:false,maxRetries:3,retryDelay:100})
}
interface RuntimePreparationOptions {
  lock:unknown;files:unknown
  /** Native-only test injection; never exposed as a model tool argument. */
  download?:(source:VideoRuntimeSource,signal:AbortSignal)=>Promise<Response>
  extractArchive?:(archive:string,target:string,signal:AbortSignal)=>Promise<void>
  platform?:string;architecture?:string;lockPollMs?:number;lockTimeoutMs?:number
}
interface ActivePreparation {controller:AbortController;promise:Promise<RuntimeResult>;waiters:number;settled:boolean}

/** Python extension lookup and Windows ZIP extraction still use MAX_PATH APIs.
 * Budget the generated stage too, before creating directories or downloading.
 */
export function assertVideoRuntimePathBudget(cacheRoot:string,version:string,files:Record<string,string>,platform:string=process.platform):void {
  if(platform!=='win32')return
  const native=path.win32,relatives=Object.keys(files)
  const installed=native.join(cacheRoot,version),stage=native.join(cacheRoot,'.preparing-'+'0'.repeat(36),'runtime')
  const longest=(base:string)=>Math.max(...relatives.map(relative=>native.join(base,relative).length))
  // Keep extension suffix lookup below 240 and extraction below MAX_PATH.
  if(longest(installed)>200||longest(stage)>248)invalid('VIDEO_RUNTIME_PATH_TOO_LONG')
}

/** Independent instances coordinate through the same filesystem lock, including separate processes. */
export function createVideoRuntimePreparer(options:RuntimePreparationOptions){
  const lock=validateVideoRuntimeLock(options.lock),expected=validateVideoRuntimeFiles(options.files)
  if(lock.version!==expected.version||lock.platform!==expected.platform)invalid('VIDEO_RUNTIME_LOCK_MISMATCH')
  const active=new Map<string,ActivePreparation>()
  const download=options.download??((source,signal)=>fetch(source.url,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(180000)])}))
  const unpack=options.extractArchive??extract
  async function existing(root:string,signal:AbortSignal){
    try{await lstat(root)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error}
    await validateInstalledVideoRuntime(root,expected,signal);return true
  }
  async function acquire(cacheRoot:string,runtimeRoot:string,signal:AbortSignal){
    const directory=path.join(cacheRoot,`.prepare-${lock.version}.lock`),nonce=randomUUID(),started=Date.now()
    while(true){
      signal.throwIfAborted()
      if(await existing(runtimeRoot,signal))return {ready:true,release:async()=>{}}
      try{await mkdir(directory);break}catch(error){
        if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error
        await checkedVideoRuntimeTree(directory,false)
        if(Date.now()-started>=(options.lockTimeoutMs??600000))invalid('VIDEO_RUNTIME_LOCK_TIMEOUT')
        await pause(options.lockPollMs??200,signal)
      }
    }
    const owner=path.join(directory,'owner.json')
    try{await writeFile(owner,JSON.stringify({pid:process.pid,nonce}),{flag:'wx'})}catch(error){await rmdir(directory).catch(()=>{});throw error}
    return {ready:false,release:async()=>{
      await checkedVideoRuntimeTree(directory,false)
      const info=await lstat(owner)
      if(!info.isFile()||info.isSymbolicLink()||JSON.parse(await readFile(owner,'utf8')).nonce!==nonce)invalid('VIDEO_RUNTIME_LOCK_OWNER_CHANGED')
      await unlink(owner);await rmdir(directory)
    }}
  }
  async function prepare(cacheRoot:string,signal:AbortSignal):Promise<RuntimeResult>{
    signal.throwIfAborted()
    if((options.platform??process.platform)!=='win32'||(options.architecture??process.arch)!=='x64')invalid('VIDEO_RUNTIME_PLATFORM_UNSUPPORTED')
    assertVideoRuntimePathBudget(cacheRoot,lock.version,expected.files,options.platform??process.platform)
    await checkedVideoRuntimeTree(cacheRoot)
    const runtimeRoot=path.join(cacheRoot,lock.version),guard=await acquire(cacheRoot,runtimeRoot,signal)
    if(guard.ready)return {runtimeRoot}
    let stage:string|undefined
    try{
      if(await existing(runtimeRoot,signal))return {runtimeRoot}
      stage=path.join(cacheRoot,'.preparing-'+randomUUID())
      const downloads=path.join(stage,'downloads'),target=path.join(stage,'runtime')
      await checkedVideoRuntimeTree(downloads);await checkedVideoRuntimeTree(target)
      for(const source of lock.sources){
        signal.throwIfAborted();const response=await download(source,signal)
        if(!response.ok||!response.body)invalid('VIDEO_RUNTIME_DOWNLOAD_FAILED')
        const archive=path.join(downloads,source.name),file=await open(archive,'wx'),hash=createHash('sha256'),reader=response.body.getReader()
        let received=0
        try{
          while(true){
            signal.throwIfAborted();const chunk=await reader.read();if(chunk.done)break
            const bytes=chunk.value;received+=bytes.length;if(received>source.size)invalid('VIDEO_RUNTIME_DOWNLOAD_LIMIT')
            hash.update(bytes);await file.writeFile(bytes)
          }
        }finally{await reader.cancel().catch(()=>{});await file.close()}
        if(received!==source.size||hash.digest('hex')!==source.sha256)invalid('VIDEO_RUNTIME_DOWNLOAD_INTEGRITY')
        if(source.kind==='file'){
          const destination=path.join(target,source.destination);await checkedVideoRuntimeTree(path.dirname(destination));await rename(archive,destination)
        }else if(source.kind==='ffmpeg'){
          const directory=path.join(stage,'ffmpeg');await unpack(archive,directory,signal)
          const entries=await readdir(directory,{withFileTypes:true}),folders=entries.filter(e=>e.isDirectory()&&e.name.startsWith('ffmpeg-'))
          if(folders.length!==1)invalid('VIDEO_RUNTIME_EXTRACTION_FAILED')
          const vendor=path.join(directory,folders[0].name);await rename(path.join(vendor,'bin'),path.join(target,'bin'))
          await checkedVideoRuntimeTree(path.join(target,'licenses','ffmpeg'))
          for(const entry of await readdir(vendor,{withFileTypes:true}))if(entry.isFile()&&/^(LICENSE|README)/i.test(entry.name))await rename(path.join(vendor,entry.name),path.join(target,'licenses','ffmpeg',entry.name))
        }else await unpack(archive,path.join(target,source.destination),signal)
      }
      signal.throwIfAborted()
      await writeFile(path.join(target,'python','python311._pth'),'python311.zip\n.\nLib/site-packages\n')
      await checkedVideoRuntimeTree(path.join(target,'licenses'))
      const provenance={schemaVersion:lock.schemaVersion,version:lock.version,platform:lock.platform,sources:lock.sources}
      await writeFile(path.join(target,'licenses','PROVENANCE.json'),JSON.stringify(provenance,null,2))
      await writeFile(path.join(target,'licenses','NOTICE.txt'),NOTICE)
      await writeFile(path.join(target,MARKER),JSON.stringify(markerFor(expected),null,2))
      await validateInstalledVideoRuntime(target,expected,signal);signal.throwIfAborted()
      try{await lstat(runtimeRoot);invalid('VIDEO_RUNTIME_ALREADY_EXISTS')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
      await rename(target,runtimeRoot);return {runtimeRoot}
    }finally{try{if(stage)await cleanStage(cacheRoot,stage)}finally{await guard.release()}}
  }
  return async function ensure(cacheRoot:string,signal?:AbortSignal):Promise<RuntimeResult>{
    signal?.throwIfAborted();if(!path.isAbsolute(cacheRoot))invalid('VIDEO_RUNTIME_PATH_INVALID')
    const root=path.resolve(cacheRoot),key=process.platform==='win32'?root.toLowerCase():root
    let operation=active.get(key)
    if(operation?.controller.signal.aborted){
      await waitFor(operation,signal).catch(()=>{signal?.throwIfAborted()})
      return ensure(root,signal)
    }
    if(!operation){
      const controller=new AbortController()
      operation={controller,promise:Promise.resolve().then(()=>prepare(root,controller.signal)),waiters:0,settled:false}
      const current=operation
      current.promise=current.promise.finally(()=>{current.settled=true;if(active.get(key)===current)active.delete(key)})
      void current.promise.catch(()=>{});active.set(key,current)
    }
    return waitFor(operation,signal)
  }
}
async function waitFor(operation:ActivePreparation,signal?:AbortSignal):Promise<RuntimeResult>{
  signal?.throwIfAborted();operation.waiters++
  try{return await new Promise<RuntimeResult>((resolve,reject)=>{
    const abort=()=>{signal?.removeEventListener('abort',abort);reject(signal?.reason??new DOMException('Aborted','AbortError'))}
    signal?.addEventListener('abort',abort,{once:true})
    operation.promise.then(value=>{signal?.removeEventListener('abort',abort);resolve(value)},error=>{signal?.removeEventListener('abort',abort);reject(error)})
  })}finally{operation.waiters--;if(!operation.waiters&&!operation.settled)operation.controller.abort(new DOMException('All callers cancelled','AbortError'))}
}
let bundled:Promise<ReturnType<typeof createVideoRuntimePreparer>>|undefined
/** Only called after native render approval; no model-authored sources or executable paths. */
export async function ensureVideoRuntime(cacheRoot:string,signal?:AbortSignal):Promise<RuntimeResult>{
  signal?.throwIfAborted()
  bundled??=Promise.all([readFile(new URL('./runtime-lock.json',import.meta.url),'utf8'),readFile(new URL('./runtime-files.json',import.meta.url),'utf8')]).then(([lock,files])=>createVideoRuntimePreparer({lock:JSON.parse(lock),files:JSON.parse(files)}))
  return (await bundled)(cacheRoot,signal)
}
