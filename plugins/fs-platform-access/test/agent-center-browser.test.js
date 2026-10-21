import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {existsSync} from 'node:fs'
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Cdp} from '@futurestaff/douyin-dm-mcp/browser'
import {mountAgents} from '../lib/agent-host.js'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
test('real browser installs, confirms new capabilities, updates, rolls back and uninstalls without deleting projects',{skip:!executable,timeout:40000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-center-ui-')),id='10000000-0000-4000-8000-000000000001',userId='20000000-0000-4000-8000-000000000001'
 const identity={environment:'dev',tenantId:id,userId},signal=new AbortController().signal
 function release(text,caps){const payload={contractVersion:'2.0.0',snapshot:{agentId:id,name:'项目助手',description:'整理项目资料，保留工程与会话。',version:createHash('sha256').update(text).digest('hex'),legacyVersion:'b'.repeat(64),modelPolicy:{primaryModelId:id,fallbackModelId:null},files:[{path:'soul.md',content:text}]},notes:text,requirements:{minClientVersion:'3.2.0',capabilities:caps}};const raw=Buffer.from(JSON.stringify(payload));return{payload,raw,version:createHash('sha256').update(raw).digest('hex')}}
 const first=release('第一版',['core.chat']),second=release('第二版新增文件能力',['core.chat','local.files'])
 let current=first,enabled=true
 const releases=new Map([first,second].map(r=>[r.version,r]))
 const routes=[],credentials={...identity,accessToken:'fixture-only',signal}
 const ctx={effect:register=>register(),webServer:{register:route=>{routes.push(route);return()=>{}}},get:name=>name==='workspaceRegistry'?{create:async()=>{}}:undefined}
 const agents=mountAgents(ctx,'https://dev.fsstory.net',identity,path.join(directory,'member'),async()=>credentials,async url=>{
  const pathname=new URL(url).pathname
  if(pathname==='/desktop/v1/agent-distribution')return Response.json({contractVersion:'2.0.0',activeTenantId:id,items:[{agentId:id,name:current.payload.snapshot.name,description:current.payload.snapshot.description,version:current.version,sha256:current.version,bytes:current.raw.length,notes:current.payload.notes,requirements:current.payload.requirements,publishedAt:null,available:enabled,unavailableReason:enabled?null:'平台已停用'}]})
  const item=releases.get(pathname.split('/').at(-1));return item&&enabled?new Response(item.raw):new Response('',{status:403})
 })
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React from'react';import{createRoot}from'react-dom/client';import{createAgentCenter}from'./plugins/fs-platform-access/src/client/agent-center.tsx';import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
 const listeners=new Set();let state={phase:'ready',activeTenantId:'tenant',user:{userId:'member'}};const controller={getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};
 window.theme=mode=>{for(const[k,v]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(k,v[mode])};window.theme('light');window.logout=()=>{state={phase:'signed_out'};listeners.forEach(fn=>fn())};const Center=createAgentCenter(controller,()=>{window.started=true});createRoot(document.getElementById('root')).render(<Center/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic',platform:'browser'})
 const server=createServer((req,res)=>{const route=routes.find(r=>r.path===req.url);if(route)return void route.handler(req,res);res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<html><body style="margin:0;font-family:Segoe UI;height:100vh"><div id="root" style="height:100vh"></div><script src="/app.js"></script></body></html>')})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${directory}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let port;for(let i=0;i<100;i++){try{port=(await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await pause(50)}}assert.ok(port)
  const target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  const wait=async fn=>{for(let i=0;i<150;i++){if(await cdp.evaluate(fn,null))return;await pause(30)}throw Error('Browser state did not settle: '+String(fn))}
  const click=async text=>{await cdp.evaluate(text=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text||el.textContent.startsWith(text+' ·'));if(!el||el.disabled)throw Error('Button unavailable: '+text);el.click();return true},text)}
  await wait(()=>document.querySelector('nav')&&!document.querySelector('[role=status]'))
  await click('可安装');await wait(()=>document.querySelectorAll('article').length===1);await click('安装')
  await wait(()=>!document.querySelector('[role=status]'));assert.equal((await agents.installations.state(id)).activeVersion,first.version)
  const project=path.join(await agents.installations.runtime(first.version).workspacePath(id),'my-project.txt');await writeFile(project,'既有工程')
  await click('已安装');await wait(()=>document.querySelectorAll('article').length===1);await click('前往新会话');assert.equal(await cdp.evaluate(()=>window.started,null),true)
  current=second;await click('检查更新');await wait(()=>document.querySelector('article').textContent.includes('有新版本'));await click('可更新');await click('更新')
  await wait(()=>!!document.querySelector('.fs-agent-confirm'));assert.equal((await agents.installations.state(id)).activeVersion,first.version)
  await click('确认继续');await wait(()=>!document.querySelector('[role=status]')&&!document.querySelector('.fs-agent-confirm'))
  assert.equal((await agents.installations.state(id)).activeVersion,second.version)
  await click('已安装');await cdp.evaluate(version=>{const select=document.querySelector('select');select.value=version;select.dispatchEvent(new Event('change',{bubbles:true}));return true},first.version)
  await wait(()=>!!document.querySelector('.fs-agent-confirm'));await click('确认继续');await wait(()=>!document.querySelector('[role=status]')&&!document.querySelector('.fs-agent-confirm'))
  assert.equal((await agents.installations.state(id)).activeVersion,first.version)
  const output=path.join(root,'output/agent-distribution');await mkdir(output,{recursive:true})
  for(const[mode,width]of[['light',1440],['dark',1440],['light',520]]){await cdp.evaluate(mode=>{window.theme(mode);return true},mode);await cdp.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(80);assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true);await writeFile(path.join(output,`center-${mode}-${width}.png`),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))}
  await click('卸载');await wait(()=>!!document.querySelector('.fs-agent-confirm'));assert.equal((await agents.installations.state(id)).enabled,true)
  await click('确认卸载');await wait(()=>!document.querySelector('[role=status]'));assert.equal((await agents.installations.state(id)).enabled,false);assert.equal(await readFile(project,'utf8'),'既有工程')
  await click('可安装');await click('安装');await wait(()=>!document.querySelector('[role=status]'));assert.equal((await agents.installations.state(id)).enabled,true)
  enabled=false;await click('检查更新');await wait(()=>!document.querySelector('[role=status]'));await click('已安装');assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('article button')].find(el=>el.textContent==='前往新会话').disabled,null),true)
  await cdp.evaluate(()=>{window.logout();return true},null);await wait(()=>document.querySelectorAll('article').length===0)
 }finally{cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
