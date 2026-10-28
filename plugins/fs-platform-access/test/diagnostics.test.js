import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, readFile, writeFile, mkdir, rm, symlink} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {FutureStaffDiagnostics, sanitizeDiagnosticInput, safeCode} from '../src/diagnostics.ts'

const identity={environment:'dev',tenantId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000001'}
const input={category:'llm',code:'FUTURESTAFF_PROVIDER',operation:'chat',httpStatus:503,requestBytes:540000}
async function fixture(t, extra={}) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'fs-diagnostics-'))
  const identityAbort=new AbortController(), sent=[]
  let clock=Date.parse('2026-10-28T06:00:00Z')
  const options={directory,identity,origin:'https://dev.fsstory.net',appVersion:'3.3.2',platform:'win32',autoFlush:false,now:()=>clock,
    authorize:async()=>({...identity,accessToken:'fixture-token-not-for-persistence',signal:identityAbort.signal}),
    fetcher:async(_url,init)=>{const body=JSON.parse(init.body);sent.push(body);return Response.json({contractVersion:'1.0.0',acceptedEventIds:body.events.map(e=>e.eventId),duplicateEventIds:[]})},...extra}
  const collector=new FutureStaffDiagnostics(options)
  t.after(async()=>{await collector.dispose();await rm(directory,{recursive:true,force:true})})
  await collector.ready
  return {collector,options,sent,identityAbort,advance:ms=>{clock+=ms},directory}
}

test('sanitizer retains only bounded public metadata, never exception text, stack or arbitrary codes',()=>{
  const value=sanitizeDiagnosticInput({...input,code:'SECRET_CUSTOMER_NAME',message:'private',stack:'private stack',password:'private',
    requestId:'not-uuid',sessionId:'10000000-0000-4000-8000-000000000002',durationMs:3600001,turn:-1,toolName:'customer-secret',exceptionType:'SensitiveName',stackHash:'a'.repeat(64)})
  assert.equal(value.code,'UNCLASSIFIED');assert.equal(safeCode('FUTURESTAFF_PROVIDER'),'FUTURESTAFF_PROVIDER')
  assert.deepEqual(Object.keys(value).sort(),['category','code','exceptionType','httpStatus','operation','requestBytes','sessionId','severity','stackHash'].sort())
  assert.equal(value.exceptionType,'other');assert.equal(value.requestBytes,540000)
  assert.doesNotMatch(JSON.stringify(value),/private|SECRET_CUSTOMER|SensitiveName/)
  assert.doesNotThrow(()=>sanitizeDiagnosticInput(new Proxy({},{get(){throw Error('private')}})))
})

test('only the native session UUID prefix is normalized; request IDs remain strict UUIDs',()=>{
  const value='10000000-0000-4000-8000-000000000002'
  assert.equal(sanitizeDiagnosticInput({sessionId:'session-'+value}).sessionId,value)
  assert.equal(sanitizeDiagnosticInput({sessionId:'session-'+value.toUpperCase()}).sessionId,value)
  assert.equal(sanitizeDiagnosticInput({requestId:'session-'+value}).requestId,undefined)
  assert.equal(sanitizeDiagnosticInput({sessionId:'session-1'}).sessionId,undefined)
  assert.equal(sanitizeDiagnosticInput({sessionId:'other-'+value}).sessionId,undefined)
})

test('native renderer lifecycle codes remain fixed public diagnostics',()=>{
  for(const code of ['NATIVE_RENDERER_PROCESS_GONE','NATIVE_RENDERER_LOAD_FAILED','NATIVE_RENDERER_BOOT_FAILED']){
    assert.equal(safeCode(code),code)
    assert.equal(sanitizeDiagnosticInput({category:'crash',operation:'bootstrap',severity:'fatal',code}).code,code)
  }
  assert.equal(safeCode('NATIVE_RENDERER_PRIVATE_CUSTOMER_DATA'),'UNCLASSIFIED')
})

test('offline errors survive restart under the same owner without persisting bearer or business fields',async t=>{
  const f=await fixture(t,{fetcher:async()=>{throw Error('private-network-detail')}})
  f.collector.capture({...input,message:'business payload',arguments:'secret'});await f.collector.flush();await f.collector.dispose()
  const disk=await readFile(path.join(f.directory,'outbox.json'),'utf8')
  assert.doesNotMatch(disk,/fixture-token|business payload|private-network|secret|arguments/)
  f.advance(60001)
  const sent=[];const next=new FutureStaffDiagnostics({...f.options,fetcher:async(_url,init)=>{const body=JSON.parse(init.body);sent.push(body);return Response.json({contractVersion:'1.0.0',acceptedEventIds:body.events.map(e=>e.eventId),duplicateEventIds:[]})}})
  t.after(()=>next.dispose());await next.ready;await next.flush()
  assert.equal(sent.length,1);assert.equal(sent[0].events[0].code,'FUTURESTAFF_PROVIDER')
  assert.equal(JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8')).records.length,0)
})

test('pending repetitions merge counts, but a submitted event remains immutable across acknowledgement loss',async t=>{
  let release, entered;const gate=new Promise(r=>{release=r}), started=new Promise(r=>{entered=r});const sent=[]
  const f=await fixture(t,{fetcher:async(_url,init)=>{const body=JSON.parse(init.body);sent.push(body);entered();await gate;throw Error('lost acknowledgement')}})
  f.collector.capture(input);f.collector.capture(input)
  const flush=f.collector.flush();await started
  f.collector.capture(input);release();await flush
  const state=JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8'))
  assert.equal(sent[0].events[0].count,2);assert.equal(state.records.length,2)
  assert.equal(state.records[0].event.count,2);assert.equal(state.records[0].sealed,true)
  assert.equal(state.records[1].event.count,1);assert.notEqual(state.records[0].event.eventId,state.records[1].event.eventId)
})

test('owner mismatch never sends or overwrites another owner queue',async t=>{
  const f=await fixture(t);f.collector.capture(input);await f.collector.dispose()
  const before=await readFile(path.join(f.directory,'outbox.json'),'utf8');let calls=0
  const next=new FutureStaffDiagnostics({...f.options,identity:{...identity,userId:'20000000-0000-4000-8000-000000000002'},fetcher:async()=>{calls++;throw Error('must not send')}})
  t.after(()=>next.dispose());await next.ready;next.capture(input);await next.flush();await next.dispose()
  assert.equal(calls,0);assert.equal(await readFile(path.join(f.directory,'outbox.json'),'utf8'),before)
})

test('live bearer identity mismatch prevents delivery',async t=>{
  let calls=0;const f=await fixture(t,{authorize:async()=>({...identity,userId:'20000000-0000-4000-8000-000000000002',accessToken:'private',signal:new AbortController().signal}),fetcher:async()=>{calls++;throw Error('must not send')}})
  f.collector.capture(input);await f.collector.flush();assert.equal(calls,0)
})

test('logout aborts upload and late acknowledgement cannot remove pending events',async t=>{
  let release, entered, signal;const gate=new Promise(r=>{release=r}), started=new Promise(r=>{entered=r})
  const f=await fixture(t,{fetcher:async(_url,init)=>{signal=init.signal;const body=JSON.parse(init.body);entered();await gate;return Response.json({contractVersion:'1.0.0',acceptedEventIds:body.events.map(e=>e.eventId),duplicateEventIds:[]})}})
  f.collector.capture(input);const pending=f.collector.flush();await started;f.identityAbort.abort();release();await pending
  assert.equal(signal.aborted,true);assert.equal(JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8')).records.length,1)
})

test('queue drops expired events and caps its count and bytes; every batch is at most 20 events and 32 KiB',async t=>{
  const f=await fixture(t)
  for(let i=0;i<230;i++)f.collector.capture({...input,step:i,stackHash:String(i).padStart(64,'0')})
  await f.collector.flush()
  let state=JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8'))
  assert.equal(state.records.length,180);assert.ok(Buffer.byteLength(JSON.stringify(state))<=256*1024)
  assert.equal(f.sent[0].events.length,20);assert.ok(Buffer.byteLength(JSON.stringify(f.sent[0]))<=32*1024)
  f.advance(7*24*60*60*1000+1);await f.collector.flush()
  state=JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8'));assert.equal(state.records.length,0)
})

test('429 honors Retry-After without recursive diagnostics and deduplicates repeated flushes',async t=>{
  let calls=0;const f=await fixture(t,{fetcher:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}})}})
  f.collector.capture(input);await Promise.all([f.collector.flush(),f.collector.flush()]);assert.equal(calls,1)
  await f.collector.flush();assert.equal(calls,1);f.advance(119999);await f.collector.flush();assert.equal(calls,1)
  f.advance(1);await f.collector.flush();assert.equal(calls,2)
  assert.equal(JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8')).records.length,1)
})

test('five-second upload deadline cancels even a transport that ignores its AbortSignal',async t=>{
  const timers=[];let signal,entered;const started=new Promise(r=>{entered=r})
  const f=await fixture(t,{setTimer:(fn,ms)=>{const handle={fn,ms};timers.push(handle);return handle},clearTimer:()=>{},fetcher:async(_url,init)=>{signal=init.signal;entered();return new Promise(()=>{})}})
  f.collector.capture(input);const pending=f.collector.flush();await started
  const deadline=timers.find(x=>x.ms===5000);assert.ok(deadline);deadline.fn();await pending
  assert.equal(signal.aborted,true);assert.equal(JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8')).records.length,1)
})

test('unexpected ACK identities or fields do not delete queued diagnostics',async t=>{
  const f=await fixture(t,{fetcher:async()=>Response.json({contractVersion:'1.0.0',acceptedEventIds:['10000000-0000-4000-8000-000000000099'],duplicateEventIds:[],private:'must ignore'})})
  f.collector.capture(input);await f.collector.flush();assert.equal(JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8')).records.length,1)
})

test('collector rejects origin/environment mismatch and fails closed on corrupt state',async t=>{
  assert.throws(()=>new FutureStaffDiagnostics({directory:os.tmpdir(),identity,origin:'https://platform.fsstory.net',appVersion:'3.3.2',platform:'win32',authorize:async()=>{throw Error('no')}}))
  const f=await fixture(t);await f.collector.dispose();await writeFile(path.join(f.directory,'outbox.json'),'not json')
  const next=new FutureStaffDiagnostics(f.options);t.after(()=>next.dispose());await next.ready
  assert.doesNotThrow(()=>next.capture(input));await next.flush();await next.dispose()
  assert.equal(await readFile(path.join(f.directory,'outbox.json'),'utf8'),'not json')
})

test('burst collection has bounded pending records and occurrence counts stop at 1000',async t=>{
  const f=await fixture(t)
  for(let i=0;i<1001;i++)f.collector.capture(input)
  await f.collector.dispose()
  const state=JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8'))
  assert.deepEqual(state.records.map(r=>r.event.count),[1000,1])
})

test('dispose cancels a stalled authorizer without waiting for it to resolve',async t=>{
  let enter;const entered=new Promise(r=>{enter=r})
  const f=await fixture(t,{authorize:async()=>{enter();return new Promise(()=>{})}})
  f.collector.capture(input);const pending=f.collector.flush();await entered
  await f.collector.dispose();await pending
  assert.equal(JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8')).records.length,1)
})

test('a linked queue directory refuses writes and preserves the external target',async t=>{
  const f=await fixture(t);await f.collector.dispose()
  const external=path.join(f.directory,'external');await mkdir(external)
  const target=path.join(external,'keep.json');await writeFile(target,'preserve')
  const link=path.join(f.directory,'linked')
  await symlink(external,link,process.platform==='win32'?'junction':'dir')
  const next=new FutureStaffDiagnostics({...f.options,directory:link});t.after(()=>next.dispose());await next.ready
  next.capture(input);await next.flush();await next.dispose()
  assert.equal(await readFile(target,'utf8'),'preserve')
})

test('an invalidated owner pauses automatic timers instead of spinning zero-delay retries',async t=>{
  const timers=[]
  const f=await fixture(t,{autoFlush:true,setTimer:(fn,ms)=>{const handle={fn,ms};timers.push(handle);return handle},clearTimer:()=>{},
    authorize:async()=>({...identity,userId:'20000000-0000-4000-8000-000000000002',accessToken:'private',signal:new AbortController().signal})})
  f.collector.capture(input)
  await new Promise(resolve=>setTimeout(resolve,20))
  const initial=timers.find(timer=>timer.ms===0);assert.ok(initial)
  initial.fn();await f.collector.flush()
  assert.equal(timers.filter(timer=>timer.ms===0).length,1)
})

test('offline retry probes resume after eight failures and a restart without a new error',async t=>{
  const f=await fixture(t,{fetcher:async()=>{throw Error('offline')}})
  f.collector.capture(input)
  for(let i=0;i<8;i++){await f.collector.flush();f.advance(300001)}
  await f.collector.dispose()
  const timers=[],sent=[]
  const next=new FutureStaffDiagnostics({...f.options,autoFlush:true,setTimer:(fn,ms)=>{const handle={fn,ms};timers.push(handle);return handle},clearTimer:()=>{},
    fetcher:async(_url,init)=>{const body=JSON.parse(init.body);sent.push(body);return Response.json({contractVersion:'1.0.0',acceptedEventIds:body.events.map(e=>e.eventId),duplicateEventIds:[]})}})
  t.after(()=>next.dispose());await next.ready
  const probe=timers.find(timer=>timer.ms===0);assert.ok(probe,'persisted capped attempts must still schedule a recovery probe')
  probe.fn();await next.flush();assert.equal(sent.length,1)
  assert.equal(JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8')).records.length,0)
})

test('401 and 403 pause automatic sends while an explicit ready flush can retry',async t=>{
  for(const status of [401,403]){
    let calls=0,allowed=false;const timers=[]
    const f=await fixture(t,{autoFlush:true,setTimer:(fn,ms)=>{const handle={fn,ms};timers.push(handle);return handle},clearTimer:()=>{},
      fetcher:async(_url,init)=>{calls++;if(!allowed)return new Response('',{status});const body=JSON.parse(init.body);return Response.json({contractVersion:'1.0.0',acceptedEventIds:body.events.map(e=>e.eventId),duplicateEventIds:[]})}})
    f.collector.capture(input);await new Promise(resolve=>setTimeout(resolve,20))
    timers.find(timer=>timer.ms===0).fn();await f.collector.flush()
    assert.equal(calls,1);assert.equal(timers.filter(timer=>timer.ms!==5000).length,1)
    allowed=true;await f.collector.flush();assert.equal(calls,2)
    assert.equal(JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8')).records.length,0)
  }
})

test('permanently rejected batches drop only their submitted records and keep a bounded local counter',async t=>{
  for(const status of [400,409,422]){
    let calls=0;const f=await fixture(t,{fetcher:async()=>{calls++;return new Response('',{status})}})
    for(let i=0;i<21;i++)f.collector.capture({...input,step:i})
    await f.collector.flush()
    let state=JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8'))
    assert.equal(state.records.length,1);assert.equal(state.localCounters.rejectedEvents,20)
    await f.collector.flush();state=JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8'))
    assert.equal(state.records.length,0);assert.equal(state.localCounters.rejectedEvents,21);assert.equal(calls,2)
  }
})

test('ACK bodies enforce 64 KiB even when Content-Length is absent or forged',async t=>{
  for(const contentLength of [undefined,'1','70000']){
    let cancelled=false,produced=0
    const f=await fixture(t,{fetcher:async()=>new Response(new ReadableStream({pull(controller){if(produced>=8){controller.close();return}produced++;controller.enqueue(new Uint8Array(16384).fill(32))},cancel(){cancelled=true}}),
      {headers:contentLength?{'content-length':contentLength}:{}})})
    f.collector.capture(input);await f.collector.flush()
    assert.equal(cancelled,true);assert.ok(produced<=6,'must stop reading near the hard byte limit')
    assert.equal(JSON.parse(await readFile(path.join(f.directory,'outbox.json'),'utf8')).records.length,1)
  }
})
