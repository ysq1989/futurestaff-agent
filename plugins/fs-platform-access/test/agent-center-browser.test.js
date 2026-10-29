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
test('unified center installs, updates and uninstalls published agents, refreshes mounted choices and preserves projects',{skip:!executable,timeout:40000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-center-ui-')),id='10000000-0000-4000-8000-000000000001',userId='20000000-0000-4000-8000-000000000001'
 const identity={environment:'dev',tenantId:id,userId},signal=new AbortController().signal
 function release(text,caps){const payload={contractVersion:'2.0.0',snapshot:{agentId:id,name:'项目助手',description:'整理项目资料，保留工程与会话。',version:createHash('sha256').update(text).digest('hex'),legacyVersion:'b'.repeat(64),modelPolicy:{primaryModelId:id,fallbackModelId:null},files:[{path:'soul.md',content:text}]},notes:text,requirements:{minClientVersion:'3.2.0',capabilities:caps}};const raw=Buffer.from(JSON.stringify(payload));return{payload,raw,version:createHash('sha256').update(raw).digest('hex')}}
 const first=release('第一版',['core.chat']),second=release('第二版新增文件能力',['core.chat','local.files'])
 let current=first,enabled=true,distributionReads=0
 const releases=new Map([first,second].map(r=>[r.version,r]))
 const routes=[],credentials={...identity,accessToken:'fixture-only',signal}
 const ctx={effect:register=>register(),webServer:{register:route=>{routes.push(route);return()=>{}}},get:name=>name==='workspaceRegistry'?{create:async()=>{}}:undefined}
 const agents=mountAgents(ctx,'https://dev.fsstory.net',identity,path.join(directory,'member'),async()=>credentials,async url=>{
  const pathname=new URL(url).pathname
  if(pathname==='/desktop/v1/platform-assistants')return Response.json({contractVersion:'1.0.0',activeTenantId:id,items:[]})
  if(pathname==='/desktop/v1/agents')return Response.json({contractVersion:'1.0.0',activeTenantId:id,items:[{agentId:id,name:current.payload.snapshot.name,description:current.payload.snapshot.description,available:enabled,unavailableReason:enabled?null:'平台已停用'},...Array.from({length:8},(_,index)=>({agentId:`30000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,name:`未安装平台助手${index+1}`,description:'只有授权，尚未本机安装',available:true,unavailableReason:null}))]})
  if(/^\/desktop\/v1\/agents\/[^/]+\/snapshot$/.test(pathname)){const agentId=pathname.split('/')[4];return Response.json({contractVersion:new URL(url).searchParams.get('contractVersion')??'1.0.0',activeTenantId:id,snapshot:agentId===id?current.payload.snapshot:{agentId,name:'未安装平台助手',description:'只有授权，尚未本机安装',version:'c'.repeat(64),files:[],businessSystems:[]}})}
  if(pathname==='/desktop/v1/agent-distribution'){distributionReads++;return Response.json({contractVersion:'2.0.0',activeTenantId:id,items:[{agentId:id,name:current.payload.snapshot.name,description:current.payload.snapshot.description,version:current.version,sha256:current.version,bytes:current.raw.length,notes:current.payload.notes,requirements:current.payload.requirements,publishedAt:null,available:enabled,unavailableReason:enabled?null:'平台已停用'}]})}
  const item=releases.get(pathname.split('/').at(-1));return item&&enabled?new Response(item.raw):new Response('',{status:403})
 })
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React from'react';import{createRoot}from'react-dom/client';import{createAgentCenter}from'./plugins/fs-platform-access/src/client/agent-center.tsx';import{createAgentHome}from'./plugins/fs-platform-access/src/client/agents.tsx';import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
 const listeners=new Set();let state={phase:'ready',activeTenantId:'tenant',user:{userId:'member'}};const controller={getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};
 window.theme=mode=>{for(const[k,v]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(k,v[mode])};window.theme('light');window.logout=()=>{state={phase:'signed_out'};listeners.forEach(fn=>fn())};const Center=createAgentCenter(controller,()=>{window.started=true;window.closedBeforeStart=window.settingsClosed===true}),Home=createAgentHome(controller);const forbidden=()=>{throw Error('Background choices must never start a session')};function App({embedded=false}){return <><div id="foreground-center"><Center embedded={embedded} {...(embedded?{beforeNewSession:()=>{window.settingsClosed=true}}:{})}/></div><div id="background-home" hidden><Home createWorkspace={forbidden} onPick={forbidden}/></div></>}const root=createRoot(document.getElementById('root'));window.embed=()=>root.render(<App embedded/>);window.standalone=()=>root.render(<App/>);root.render(<App/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic',platform:'browser'})
 const server=createServer((req,res)=>{if(['/_futurestaff/agent-market/catalog','/_futurestaff/agent-market/mine'].includes(req.url)){res.setHeader('content-type','application/json');res.end(JSON.stringify({items:[]}));return}const route=routes.find(r=>r.path===req.url);if(route)return void route.handler(req,res);res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<html><body style="margin:0;font-family:Segoe UI;height:100vh"><div id="root" style="height:100vh"></div><script src="/app.js"></script></body></html>')})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${directory}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let port;for(let i=0;i<100;i++){try{port=(await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await pause(50)}}assert.ok(port)
  const target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  const wait=async(fn,arg=null)=>{for(let i=0;i<150;i++){if(await cdp.evaluate(fn,arg))return;await pause(30)}throw Error('Browser state did not settle: '+String(fn))}
  const click=async text=>{await cdp.evaluate(text=>{const el=[...document.querySelectorAll('#foreground-center [data-agent-center-root] button')].find(el=>el.textContent.trim()===text||el.textContent.startsWith(text+' ·'));if(!el||el.disabled)throw Error('Button unavailable: '+text);el.click();return true},text)}
  const clickCard=async labels=>{await cdp.evaluate(labels=>{const card=document.querySelector('#foreground-center [data-published-agent-id]'),el=[...card.querySelectorAll('button')].find(el=>labels.includes(el.textContent.trim()));if(!el||el.disabled)throw Error('Card button unavailable: '+labels.join('/'));el.click();return true},labels)}
  const status=async text=>{await cdp.evaluate(text=>{const el=[...document.querySelectorAll('#foreground-center nav[aria-label="安装状态"] button')].find(el=>el.textContent.startsWith(text+' ·'));if(!el||el.disabled)throw Error('Status unavailable: '+text);el.click();return true},text)}
  const refresh=async()=>{await click('检查更新')}
  const mountedChoices=async count=>wait(count=>[...document.querySelectorAll('#background-home [data-published-agent-id] button')].filter(button=>button.textContent==='开始对话').length===count,count)
  const refreshedChoices=async(previous,version)=>{for(let i=0;i<150&&distributionReads===previous;i++)await pause(30);assert.ok(distributionReads>previous,'the already-mounted Home reloads the release directory after a version mutation');await wait(version=>document.querySelector('#background-home [data-published-agent-id] details')?.textContent.includes('本机 '+version.slice(0,12)),version);assert.equal(await cdp.evaluate(()=>window.backgroundHome===document.querySelector('#background-home .fs-agent-home'),null),true,'the background Home was not remounted')}
  const counts=async expected=>assert.deepEqual(await cdp.evaluate(()=>[...document.querySelectorAll('#foreground-center nav[aria-label="安装状态"] button')].map(el=>el.textContent.trim()),null),expected)
  await wait(()=>document.querySelector('#foreground-center nav')&&!document.querySelector('#foreground-center [data-agent-center-root] [role=status]'))
  assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('#foreground-center [data-agent-center-root] button')].some(el=>el.textContent.trim()==='发布包管理'),null),false,'the center has no separate release-package management entry')
  assert.deepEqual(await cdp.evaluate(()=>[...document.querySelectorAll('#foreground-center nav[aria-label="助手分类"] button')].map(el=>el.textContent.trim()),null),['全部助手','系统助手','通用助手'])
  assert.equal(await cdp.evaluate(()=>document.querySelector('#foreground-center nav[aria-label="助手分类"] button[aria-pressed=true]').textContent,null),'全部助手')
  await wait(()=>document.querySelector('#foreground-center nav[aria-label="安装状态"] button[aria-pressed=true]')?.textContent.trim()==='全部 · 1')
  assert.equal(await cdp.evaluate(()=>document.querySelector('#foreground-center nav[aria-label="安装状态"] button[aria-pressed=true]').textContent.trim(),null),'全部 · 1')
  await wait(()=>document.querySelectorAll('#foreground-center [data-published-agent-id]').length===1)
  assert.equal(await cdp.evaluate(()=>document.querySelector('#foreground-center [data-published-agent-id]').getAttribute('data-published-agent-id'),null),id)
  await counts(['全部 · 1','已安装 · 0','可更新 · 0'])
  await click('系统助手');assert.equal(await cdp.evaluate(()=>document.querySelectorAll('#foreground-center [data-published-agent-id]').length,null),0)
  await click('通用助手');await wait(()=>document.querySelectorAll('#foreground-center [data-published-agent-id]').length===1)
  await click('全部助手')
  await mountedChoices(0)
  await cdp.evaluate(()=>{window.backgroundHome=document.querySelector('#background-home .fs-agent-home');return true},null)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('#background-home [data-published-agent-id]').length,null),1,'Home directly displays authorized releases before installation');assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('#background-home [data-published-agent-id] button')].some(button=>button.textContent==='开始对话'),null),false,'an uninstalled release offers installation without starting a session')
  await clickCard(['下载并安装','安装'])
  await wait(()=>!document.querySelector('#foreground-center [data-agent-center-root] [role=status]'));assert.equal((await agents.installations.state(id)).activeVersion,first.version)
  await mountedChoices(1)
  await counts(['全部 · 1','已安装 · 1','可更新 · 0'])
  assert.match(await cdp.evaluate(()=>document.querySelector('#background-home [data-published-agent-id]').textContent,null),/项目助手/)
  const project=path.join(await agents.installations.runtime(first.version).workspacePath(id),'my-project.txt');await writeFile(project,'既有工程')
  await status('已安装');await wait(()=>document.querySelectorAll('#foreground-center [data-published-agent-id]').length===1)
  await cdp.evaluate(()=>{window.embed();return true},null);await wait(()=>!!document.querySelector('#foreground-center [data-agent-center-root][data-embedded=true]'))
  assert.deepEqual(await cdp.evaluate(()=>{const el=document.querySelector('#foreground-center .fs-agent-center'),style=getComputedStyle(el);return{overflow:style.overflow,padding:style.padding,duplicateTitle:!!el.querySelector('h1')}},null),{overflow:'visible',padding:'0px',duplicateTitle:false})
  await clickCard(['开始对话']);assert.equal(await cdp.evaluate(()=>window.started&&window.closedBeforeStart,null),true)
  await cdp.evaluate(()=>{window.standalone();return true},null);await wait(()=>!document.querySelector('#foreground-center [data-agent-center-root][data-embedded=true]'))
  current=second;await refresh();await wait(()=>document.querySelector('#foreground-center [data-published-agent-id]').textContent.includes('可更新'));await counts(['全部 · 1','已安装 · 1','可更新 · 1']);await status('可更新');await clickCard(['更新','更新安装'])
  await wait(()=>!!document.querySelector('#foreground-center .fs-agent-confirm'));assert.equal((await agents.installations.state(id)).activeVersion,first.version)
  const readsBeforeUpdate=distributionReads
  await click('确认继续');await wait(()=>!document.querySelector('#foreground-center [data-agent-center-root] [role=status]')&&!document.querySelector('#foreground-center .fs-agent-confirm'))
  assert.equal((await agents.installations.state(id)).activeVersion,second.version)
  await refreshedChoices(readsBeforeUpdate,second.version)
  await mountedChoices(1)
  await counts(['全部 · 1','已安装 · 1','可更新 · 0'])
  await status('已安装');await cdp.evaluate(version=>{const select=document.querySelector('#foreground-center [data-published-agent-id] select');select.value=version;select.dispatchEvent(new Event('change',{bubbles:true}));return true},first.version)
  await wait(()=>!!document.querySelector('#foreground-center .fs-agent-confirm'));const readsBeforeRollback=distributionReads;await click('确认继续');await wait(()=>!document.querySelector('#foreground-center [data-agent-center-root] [role=status]')&&!document.querySelector('#foreground-center .fs-agent-confirm'))
  assert.equal((await agents.installations.state(id)).activeVersion,first.version)
  await refreshedChoices(readsBeforeRollback,first.version)
  await mountedChoices(1)
  const output=path.join(root,'output/agent-distribution');await mkdir(output,{recursive:true})
  for(const[mode,width]of[['light',1440],['dark',1440],['light',520]]){await cdp.evaluate(mode=>{window.theme(mode);return true},mode);await cdp.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(80);assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true);await writeFile(path.join(output,`center-${mode}-${width}.png`),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))}
  await click('卸载');await wait(()=>!!document.querySelector('#foreground-center .fs-agent-confirm'));assert.equal((await agents.installations.state(id)).enabled,true)
  await click('确认卸载');await wait(()=>!document.querySelector('#foreground-center [data-agent-center-root] [role=status]'));assert.equal((await agents.installations.state(id)).enabled,false);assert.equal(await readFile(project,'utf8'),'既有工程')
  await mountedChoices(0)
  await counts(['全部 · 1','已安装 · 0','可更新 · 0'])
  await status('全部');await clickCard(['下载并安装','安装']);await wait(()=>!document.querySelector('#foreground-center [data-agent-center-root] [role=status]'));assert.equal((await agents.installations.state(id)).enabled,true)
  await mountedChoices(1)
  enabled=false;await refresh();await wait(()=>!document.querySelector('#foreground-center [data-agent-center-root] [role=status]'));await status('已安装');assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('#foreground-center [data-published-agent-id] button')].find(el=>el.textContent==='开始对话').disabled,null),true)
  await cdp.evaluate(()=>{window.logout();return true},null);await wait(()=>document.querySelectorAll('article').length===0);await mountedChoices(0)
 }finally{if(cdp)await cdp.call('Browser.close').catch(()=>{});cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
