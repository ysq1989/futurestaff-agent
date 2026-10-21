import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {existsSync} from 'node:fs'
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Cdp} from '@futurestaff/douyin-dm-mcp/browser'
const root=fileURLToPath(new URL('../../../',import.meta.url)),platform=process.env.AGENT_PLATFORM_WORKSPACE
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
test('platform publication UI respects unsaved configuration, publishes and confirms stop',{skip:!platform||!executable,timeout:30000},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fs-publish-ui-')),frontend=path.join(platform,'frontend'),calls=[]
 const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Publication from'./src/pages/agent-detail/tabs/DesktopPublication.tsx';
 localStorage.setItem('token','isolated-ui-fixture');const client=new QueryClient({defaultOptions:{queries:{retry:false}}});function App(){const[dirty,setDirty]=useState(false),[manage,setManage]=useState(true);window.fixture={dirty:setDirty,manage:setManage};return <QueryClientProvider client={client}><main style={{maxWidth:900,margin:'32px auto',padding:16}}><Publication agentId="10000000-0000-4000-8000-000000000001" canManage={manage} hasUnsavedChanges={dirty}/></main></QueryClientProvider>}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'iife',jsx:'automatic'})
 const state={agentId:'10000000-0000-4000-8000-000000000001',draftVersion:'a'.repeat(64),enabled:false,current:null,releases:[]}
 const css=await readFile(path.join(frontend,'src/index.css'),'utf8')
 const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/api/agents/')){let raw='';for await(const chunk of req)raw+=chunk;calls.push({method:req.method,body:raw?JSON.parse(raw):null});res.setHeader('content-type','application/json')
   if(req.method==='POST'){assert.equal(req.headers.authorization,'Bearer isolated-ui-fixture');const body=JSON.parse(raw);assert.equal(body.expectedDraftVersion,state.draftVersion);state.current={version:'b'.repeat(64),sha256:'b'.repeat(64),bytes:500,name:'验收助手',notes:body.notes,requirements:{minClientVersion:'3.2.0',capabilities:['core.chat',...body.capabilities]},publishedAt:new Date().toISOString()};state.releases=[state.current];state.enabled=true;return res.end(JSON.stringify(state.current))}
   if(req.method==='DELETE'){state.enabled=false;return res.end(JSON.stringify({enabled:false}))}return res.end(JSON.stringify(state))
  }
  res.setHeader('content-type',req.url==='/app.js'?'text/javascript':req.url==='/app.css'?'text/css':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:req.url==='/app.css'?css:'<html data-theme="light"><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${dir}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let port;for(let i=0;i<100;i++){try{port=(await readFile(path.join(dir,'browser','DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await pause(50)}}assert.ok(port)
  const target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  const wait=async fn=>{for(let i=0;i<150;i++){if(await cdp.evaluate(fn,null))return;await pause(30)}throw Error('Publication state did not settle: '+String(fn))}
  const click=async text=>cdp.evaluate(text=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent===text);if(!el||el.disabled)throw Error('Button unavailable: '+text);el.click();return true},text)
  await wait(()=>!!document.querySelector('textarea'))
  await cdp.evaluate(()=>{window.fixture.dirty(true);return true},null);await pause(30);assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='发布当前草稿').disabled,null),true)
  assert.equal(calls.some(c=>c.method==='POST'),false)
  await cdp.evaluate(()=>{window.fixture.dirty(false);const el=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'第一版业务助手');el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('input[type=checkbox]').click();return true},null)
  await pause(30);await click('发布当前草稿');await wait(()=>document.body.textContent.includes('已开放下载与使用'))
  assert.equal(calls.find(c=>c.method==='POST').body.notes,'第一版业务助手');assert.ok(calls.find(c=>c.method==='POST').body.capabilities.includes('video.production'))
  await click('停用客户端版本');await wait(()=>document.body.textContent.includes('确认停用'));assert.equal(calls.some(c=>c.method==='DELETE'),false);await click('取消');assert.equal(calls.some(c=>c.method==='DELETE'),false)
  const output=path.join(root,'output/agent-distribution');await mkdir(output,{recursive:true})
  for(const[mode,width]of[['light',1440],['dark',1440],['light',520]]){await cdp.evaluate(mode=>{document.documentElement.dataset.theme=mode;return true},mode);await cdp.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(80);assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true);await writeFile(path.join(output,`publication-${mode}-${width}.png`),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))}
  await click('停用客户端版本');await wait(()=>document.body.textContent.includes('确认停用'));await click('确认停用');await wait(()=>document.body.textContent.includes('状态：已停用'))
  const before=calls.length;await cdp.evaluate(()=>{window.fixture.manage(false);return true},null);await wait(()=>!document.querySelector('[aria-label="客户端发布"]'));assert.equal(calls.length,before)
 }finally{cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
