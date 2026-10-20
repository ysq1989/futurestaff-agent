import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,copyFile,rm,mkdir,writeFile,readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {videoRuntimeCacheRoot} from '../lib/cache.js'
import {videoProcessFilePath,videoProcessFailure,command} from '../lib/runtime.js'
import {assertVideoRuntimePathBudget,validateInstalledVideoRuntime} from '../lib/bootstrap.js'

test('native cache preserves the full owner identity outside long project paths',()=>{
 const owner='a1'.repeat(32),other='a1'.repeat(31)+'a2'
 const root=videoRuntimeCacheRoot(owner,'C:\\Users\\Example\\AppData\\Local')
 const id=path.win32.basename(root)
 assert.equal(id.length,50)
 assert.match(id,/^[a-z0-9]{50}$/)
 let recovered=0n;for(const digit of id)recovered=recovered*36n+BigInt(parseInt(digit,36))
 assert.equal(recovered.toString(16).padStart(64,'0'),owner)
 assert.notEqual(root,videoRuntimeCacheRoot(other,'C:\\Users\\Example\\AppData\\Local'))
 assert.equal(path.win32.relative('C:\\Users\\Example\\AppData\\Local\\FutureStaff\\v',root),id)
 assert.throws(()=>videoRuntimeCacheRoot('../outside','C:\\Users\\Example\\AppData\\Local'),{code:'VIDEO_SCOPE_INVALID'})
 assert.throws(()=>videoRuntimeCacheRoot(owner,'relative'),{code:'VIDEO_RUNTIME_PATH_INVALID'})
})

test('runtime path budget includes extraction and Python extension lookup, rejecting before download',()=>{
 const files={'python/Lib/site-packages/aiohttp/_websocket/reader_c.cp311-win_amd64.pyd':'x','python/python.exe':'x'}
 const root=videoRuntimeCacheRoot('a'.repeat(64),'C:\\Users\\Administrator\\AppData\\Local')
 assert.doesNotThrow(()=>assertVideoRuntimePathBudget(root,'20261020.1',files,'win32'))
 assert.throws(()=>assertVideoRuntimePathBudget('C:\\'+('long-directory\\'.repeat(15)),'20261020.1',files,'win32'),/VIDEO_RUNTIME_PATH_TOO_LONG/)
})

test('Windows subprocess file arguments preserve long paths without rewriting relative arguments',()=>{
 const long='C:\\Members\\'+('nested\\'.repeat(40))+'scene-01.mp3'
 assert.equal(videoProcessFilePath(long,'win32'),'\\\\?\\'+long)
 assert.equal(videoProcessFilePath('\\\\?\\'+long,'win32'),'\\\\?\\'+long)
 assert.equal(videoProcessFilePath('scene-01.mp3','win32'),'scene-01.mp3')
 assert.equal(videoProcessFilePath('/tmp/scene.mp3','linux'),'/tmp/scene.mp3')
})

test('Python import failures remain distinct from network failures and do not expose paths',()=>{
 const raw='Traceback (most recent call last):\n  File "C:\\private-member\\voice.py", line 2\nImportError: DLL load failed while importing _overlapped: filename or extension is too long'
 const error=videoProcessFailure(raw)
 assert.equal(error.code,'VIDEO_RUNTIME_IMPORT_FAILED')
 assert.doesNotMatch(error.message,/private-member|voice\.py|C:\\/)
 assert.match(error.stack,/private-member/)
 assert.equal(videoProcessFailure('aiohttp.client_exceptions.ClientConnectorError: Cannot connect to host speech.platform.bing.com').code,'VIDEO_VOICE_SERVICE_UNAVAILABLE')
 assert.equal(videoProcessFailure('private C:\\file.mp4 bad input').code,'VIDEO_PROCESS_FAILED')
})

test('Windows embedded Python imports and voice-style long output arguments work from a short private fixture',{
 skip:process.platform!=='win32'||!process.env.FUTURESTAFF_VIDEO_TEST_RUNTIME_ROOT
},async t=>{
 const fixture=await mkdtemp(path.join(os.tmpdir(),'fv-'))
 t.after(()=>rm(fixture,{recursive:true,force:true}))
 const cache=videoRuntimeCacheRoot('b'.repeat(64),fixture),runtime=path.join(cache,'20261020.1')
 // Copy only packaged, pinned files from the dev fixture; never use its extras
 // or touch the actual member cache. Validation below checks all copied bytes.
 const expected=JSON.parse(await readFile(new URL('../lib/runtime-files.json',import.meta.url),'utf8'))
 for(const relative of [...Object.keys(expected.files),'runtime-manifest.json']){
  const target=path.join(runtime,relative);await mkdir(path.dirname(target),{recursive:true})
  await copyFile(path.join(process.env.FUTURESTAFF_VIDEO_TEST_RUNTIME_ROOT,relative),target)
 }
 await validateInstalledVideoRuntime(runtime)
 const directory=path.join(fixture,'member-workspace',...Array(10).fill('long-member-output-directory'))
 await mkdir(directory,{recursive:true})
 const request=path.join(directory,'request.json'),output=path.join(directory,'voice-output.json'),script=path.join(directory,'voice-style-fixture.py')
 await writeFile(request,JSON.stringify({text:'长路径语音参数检查'}))
 await writeFile(script,'import asyncio, edge_tts, pathlib, json, sys\nvalue=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf8"))\npathlib.Path(sys.argv[2]).write_text(json.dumps({"text":value["text"],"imports":True}),encoding="utf8")\nprint("IMPORTS_OK")\n')
 assert.ok(output.length>260)
 const result=await command(path.join(runtime,'python','python.exe'),[script,request,output].map(p=>videoProcessFilePath(p)),{timeoutMs:30000})
 assert.match(result.toString(),/IMPORTS_OK/)
 assert.deepEqual(JSON.parse(await readFile(output,'utf8')),{text:'长路径语音参数检查',imports:true})
})
