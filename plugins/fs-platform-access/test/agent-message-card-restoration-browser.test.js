import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {existsSync} from 'node:fs'
import {mkdtemp,readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Cdp} from '@futurestaff/douyin-dm-mcp/browser'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))

test('card restoration waits for identity and safely displays only Host-authorized historical answers', {skip:!executable,timeout:30000}, async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-card-restore-'))
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';
 import{AgentMessageCard}from'./plugins/fs-platform-access/src/client/agent-message-cards.tsx';
 let owner='',listeners=new Set();
 const authorization={current:()=>owner,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};
 window.changeOwner=value=>{owner=value;listeners.forEach(fn=>fn())};
 const card=()=>({schemaVersion:1,module:'agent-card',kind:'message',viewId:'00000000-0000-4000-8000-000000000001',sessionId:'restored-original-session',title:'历史卡片',expiresAt:Date.now()+600000,data:{title:'历史卡片',description:'仅属于原成员的历史摘要',facts:[{label:'状态',value:'原成员资料'}],fields:[{id:'note',label:'备注',type:'text',required:true}],actions:[{id:'confirm',label:'确认收到',variant:'primary'}]}});
 window.mode='live';window.requests=[];window.pending=[];
 window.fetch=async(_url,init)=>{
   const request={...JSON.parse(init.body),owner};window.requests.push(request);
   if(owner!=='tenant-a:user-a')return Response.json({error:'AGENT_CARD_FORBIDDEN'},{status:403});
   if(window.mode==='deferred-view')return new Promise(resolve=>window.pending.push(()=>resolve(Response.json(card()))));
   if(window.mode==='missing')return Response.json({error:'AGENT_CARD_SESSION_REQUIRED'},{status:400});
   const view=card();
   if(window.mode==='history'){
     view.expiresAt=Date.now()-1000;
     view.response={eventId:'00000000-0000-4000-8000-000000000002',actionId:'confirm',actionLabel:'确认收到',values:{note:'持久化的合成备注'}};
     view.conversationUpdated=true;
   }
   return Response.json(view);
 };
 function App(){const[key,setKey]=useState(0);window.remount=mode=>{window.mode=mode;window.requests=[];setKey(n=>n+1)};const snapshot=card();return <AgentMessageCard key={key} meta={{kind:'futurestaff.agent-card',viewId:snapshot.viewId,sessionId:snapshot.sessionId,title:snapshot.title,snapshot}} authorization={authorization}/>}
 createRoot(document.getElementById('root')).render(<App/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic'})
 const server=createServer((request,response)=>{response.setHeader('content-type',request.url==='/app.js'?'text/javascript':'text/html;charset=utf-8');response.end(request.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>')})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${directory}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let portFile
  for(let i=0;i<100;i++){try{portFile=await readFile(path.join(directory,'browser/DevToolsActivePort'),'utf8');break}catch{await pause(50)}}
  assert.ok(portFile)
  const targets=await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()
  cdp=await Cdp.connect(targets.find(target=>target.type==='page').webSocketDebuggerUrl)
  const wait=async(predicate,label)=>{for(let i=0;i<120;i++){if(await cdp.evaluate(predicate,null))return;await pause(25)}throw Error('CARD_RESTORATION_TIMEOUT: '+label)}
  await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  await wait(()=>typeof window.changeOwner==='function','fixture ready')
  await pause(80)
  assert.deepEqual(await cdp.evaluate(()=>window.requests,null),[],'restoring identity sends no card request')
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('原成员资料'),null),false,'restoring does not use a renderer snapshot')
  await cdp.evaluate(()=>{window.changeOwner('tenant-a:user-a');return true},null)
  await wait(()=>!!document.querySelector('[data-agent-card-action="confirm"]:not(:disabled)'),'first ready loads the current card')
  assert.deepEqual(await cdp.evaluate(()=>window.requests.map(request=>request.action),null),['view'],'first ready is read-only')

  await cdp.evaluate(()=>{window.changeOwner('');return true},null)
  await wait(()=>!document.body.textContent.includes('原成员资料'),'restoring clears earlier content')
  const requestsBeforeRestore=await cdp.evaluate(()=>window.requests.length,null)
  await pause(80)
  assert.equal(await cdp.evaluate(()=>window.requests.length,null),requestsBeforeRestore,'no request is made without a ready identity')
  await cdp.evaluate(()=>{window.changeOwner('tenant-b:user-b');return true},null)
  await wait(()=>document.body.textContent.includes('不可访问'),'a different member is denied by Host')
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('原成员资料'),null),false,'denied identity never shows snapshot or old values')
  assert.equal(await cdp.evaluate(()=>window.requests.at(-1).owner,null),'tenant-b:user-b')

  await cdp.evaluate(()=>{window.changeOwner('tenant-a:user-a');return true},null)
  await wait(()=>!!document.querySelector('[data-agent-card-action="confirm"]:not(:disabled)'),'original member is reauthorized')
  await cdp.evaluate(()=>{window.remount('deferred-view');return true},null)
  await wait(()=>window.pending.length===1,'original member view is pending')
  await cdp.evaluate(()=>{window.changeOwner('tenant-b:user-b');window.pending.shift()();return true},null)
  await wait(()=>document.body.textContent.includes('不可访问'),'late view cannot cross identity')
  await pause(60)
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('原成员资料')||!!document.querySelector('[name="note"]'),null),false)

  await cdp.evaluate(()=>{window.mode='deferred-view';window.changeOwner('tenant-a:user-a');return true},null)
  await wait(()=>window.pending.length===1,'another old principal read is pending')
  await cdp.evaluate(()=>{window.mode='history';window.changeOwner('');window.changeOwner('tenant-a:user-a');return true},null)
  await wait(()=>document.querySelector('[name="note"]')?.value==='持久化的合成备注','a rapid restore cycle still gets a fresh Host read')
  await cdp.evaluate(()=>{window.pending.shift()();return true},null)
  await pause(60)
  assert.equal(await cdp.evaluate(()=>document.querySelector('[name="note"]')?.value,null),'持久化的合成备注','late response from the earlier same-member epoch is ignored')

  await cdp.evaluate(()=>{window.mode='history';window.changeOwner('tenant-a:user-a');return true},null)
  await wait(()=>document.querySelector('[name="note"]')?.value==='持久化的合成备注','authorized history restores the stored answer')
  assert.match(await cdp.evaluate(()=>document.body.textContent,null),/已选择：确认收到/)
  assert.equal(await cdp.evaluate(()=>Array.from(document.querySelectorAll('[data-agent-card-action],input,select,textarea')).every(element=>element.matches(':disabled')),null),true,'historical controls are always read-only, including inherited disabled fieldsets')
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('等待回答')||document.body.textContent.includes('卡片暂时不可用')||document.body.textContent.includes('这张卡片已过期'),null),false,'accepted historical answer is not presented as a failed active card')
  assert.deepEqual(await cdp.evaluate(()=>[...new Set(window.requests.map(request=>request.action))],null),['view'],'identity transitions and history rendering never respond or retry')

  await cdp.evaluate(()=>{window.remount('missing');return true},null)
  await wait(()=>document.body.textContent.includes('原会话不存在或尚未加载'),'missing session has accurate guidance')
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('原成员资料'),null),false,'missing session never falls back to unverified snapshot')
 }finally{cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
