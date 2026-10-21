import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AgentInstallationStore, decodeRelease, compatibleRequirements } from '../lib/agent-distribution.js'
const id='10000000-0000-4000-8000-000000000001'
const identity={environment:'dev',tenantId:id,userId:'20000000-0000-4000-8000-000000000001'}
function release(text,capabilities=['core.chat']){const raw=Buffer.from(JSON.stringify({contractVersion:'2.0.0',notes:text,requirements:{minClientVersion:'3.1.1',capabilities},snapshot:{agentId:id,name:'Test',description:'',version:'a'.repeat(64),legacyVersion:'b'.repeat(64),modelPolicy:{primaryModelId:id,fallbackModelId:null},files:[{path:'soul.md',content:text}]}}));return{raw,version:createHash('sha256').update(raw).digest('hex')}}
test('runtime requirement negotiation matches the desktop candidate and rejects unknown capabilities',async()=>{
 const desktop=JSON.parse(await readFile(new URL('../../../desktop-shell/dsh-plugin-desktop/package.json',import.meta.url),'utf8'))
 assert.equal(compatibleRequirements({minClientVersion:desktop.version,capabilities:['core.chat']}),true)
 assert.equal(compatibleRequirements({minClientVersion:'99.0.0',capabilities:['core.chat']}),false)
 assert.equal(compatibleRequirements({minClientVersion:'3.2.0',capabilities:['untrusted.plugin']}),false)
 assert.equal(compatibleRequirements({minClientVersion:'3.3.0',capabilities:['core.chat','geo.collection','local.files']},'3.2.1'),false)
 assert.equal(compatibleRequirements({minClientVersion:'3.3.0',capabilities:['core.chat','geo.collection','local.files']},'3.3.0'),true)
})
test('install, update, rollback, uninstall and reinstall preserve pinned sessions and both projects',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-install-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new AgentInstallationStore(root,identity),a=release('one'),b=release('two'),signal=new AbortController().signal
 await store.install(id,a.version,a.raw,signal);const old=store.runtime(a.version);await writeFile(path.join(await old.workspacePath(id),'project.txt'),'keep first');await old.bind('old-session',id)
 await store.install(id,b.version,b.raw,signal);await store.runtime(b.version).bind('new-session',id)
 assert.equal((await old.binding('old-session')).releaseVersion,a.version);assert.equal((await old.binding('new-session')).releaseVersion,b.version)
 await assert.rejects(store.runtime(b.version).bind('old-session',id),/SESSION_MISMATCH/)
 assert.equal(await readFile(path.join(await old.workspacePath(id),'project.txt'),'utf8'),'keep first')
 await store.activate(id,a.version,signal);assert.equal((await store.state(id)).activeVersion,a.version)
 await store.uninstall(id);assert.equal((await store.state(id)).enabled,false);assert.equal((await store.read(id,b.version)).notes,'two')
 await store.install(id,a.version,a.raw,signal);assert.equal(await readFile(path.join(await old.workspacePath(id),'project.txt'),'utf8'),'keep first')
})
test('unsafe resources and preparation failure cannot activate a new release or overwrite a project',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-install-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new AgentInstallationStore(root,identity),a=release('one'),b=release('two'),signal=new AbortController().signal
 await store.install(id,a.version,a.raw,signal)
 const bad=JSON.parse(b.raw);bad.snapshot.files=[{path:'skills/../../credentials.json',content:'unsafe'}]
 const raw=Buffer.from(JSON.stringify(bad)),version=createHash('sha256').update(raw).digest('hex')
 await assert.rejects(store.install(id,version,raw,signal),/CONTRACT/)
 const target=path.join(store.runtime(b.version).directory(id),'workspace','.futurestaff-agent','definition','soul.md')
 await mkdir(target,{recursive:true}) // An occupied file path models a disk preparation failure.
 await assert.rejects(store.install(id,b.version,b.raw,signal))
 assert.equal((await store.state(id)).activeVersion,a.version)
 await rm(target,{recursive:true});await store.install(id,b.version,b.raw,signal)
 assert.equal((await store.state(id)).activeVersion,b.version)
})
test('parallel updates serialize complete installations and keep both retained versions',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-install-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new AgentInstallationStore(root,identity),a=release('one'),b=release('two'),signal=new AbortController().signal
 await Promise.all([store.install(id,a.version,a.raw,signal),store.install(id,b.version,b.raw,signal)])
 assert.deepEqual((await store.state(id)).versions,[a.version,b.version]);assert.equal((await store.state(id)).activeVersion,b.version)
})
test('corruption, foreign identity, unsafe resource, cancellation and new capabilities preserve the active version',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fs-install-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new AgentInstallationStore(root,identity),a=release('one'),b=release('two',['core.chat','video.production']),signal=new AbortController().signal
 await store.install(id,a.version,a.raw,signal)
 await assert.rejects(store.install(id,b.version,Buffer.from('tampered'),signal),/INTEGRITY/)
 await assert.rejects(store.install(id,b.version,b.raw,signal),/CONFIRMATION/)
 const abort=new AbortController();abort.abort();await assert.rejects(store.install(id,b.version,b.raw,abort.signal,true))
 assert.equal((await store.state(id)).activeVersion,a.version)
 assert.throws(()=>decodeRelease(a.raw,'30000000-0000-4000-8000-000000000001',a.version))
 await store.install(id,b.version,b.raw,signal,true);assert.equal((await store.state(id)).activeVersion,b.version)
})
