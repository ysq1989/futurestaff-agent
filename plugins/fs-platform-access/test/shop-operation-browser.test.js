import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {existsSync} from 'node:fs'
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Cdp} from '@futurestaff/douyin-dm-mcp/browser'
const root=fileURLToPath(new URL('../../../',import.meta.url))
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))

test('Shop native preview requires a click, submits once, escapes data, and clears on identity change',{skip:!executable,timeout:30000},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fs-shop-operation-')),calls=[]
 const preview={schemaVersion:1,module:'shop',sessionId:'fixture',viewId:'preview',title:'新增测试商品',kind:'preview',data:{state:'prepared',arguments:{body:{store_name:'<img src=x onerror=window.unsafe=true>',is_show:0,items:[],attrs:[{price:10,stock:0,pic:'https://shop-test.fsstory.net/'+('long-public-image/'.repeat(30))}]}}}}
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
  import React from'react';import{createRoot}from'react-dom/client';import{applyShopOperationClient}from'./plugins/fs-platform-access/src/client/shop-operations.tsx';import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';import{messageCardCss}from'./plugins/fs-platform-access/src/client/message-card.tsx';
  const entries=[],listeners=[];let snapshot={phase:'ready',activeTenantId:'test',user:{userId:'member'}};
  applyShopOperationClient({inject:(_names,fn)=>fn({effect:fn=>fn(),uiConversation:{events:{register:()=>()=>{}}}}),effect:fn=>fn(),platformClientSession:{getSnapshot:()=>snapshot,subscribe:fn=>{listeners.push(fn);return()=>{}}},slots:{inject:(_n,cb)=>cb(),register:(options,component)=>{entries.push({options,component});return()=>{}}}});
  for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
  const cardStyle=document.createElement('style');cardStyle.textContent=messageCardCss;document.head.append(cardStyle);
  window.dark=()=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.dark)};
  window.logout=()=>{snapshot={phase:'signed_out'};listeners.forEach(fn=>fn())};
  const Window=entries.find(e=>e.options.id==='futurestaff-shop-operation').component,Card=entries.find(e=>e.options.key==='shop_call').component;
  createRoot(document.getElementById('root')).render(<><Card block={{kind:'tool-result',meta:{kind:'futurestaff.shop',viewId:'preview',sessionId:'fixture',title:'新增测试商品'},content:[]}}/><Window/></>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic'})
 let delay=80
 const server=createServer(async(req,res)=>{
  if(req.url==='/_futurestaff/shop/operation'){let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);calls.push(body);res.setHeader('content-type','application/json');
   if(body.action==='confirm'){await pause(delay);return res.end(JSON.stringify({...preview,viewId:'result',kind:'entity',conversationUpdated:true,data:{state:'completed',data:{status:200,data:{id:123}}}}))}
   return res.end(JSON.stringify(preview))
  }
  res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html;charset=utf-8');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;font:14px Segoe UI}*{box-sizing:border-box}</style><div id="root"></div><script src="/app.js"></script></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${dir}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let portFile;for(let i=0;i<100;i++){try{portFile=await readFile(path.join(dir,'browser','DevToolsActivePort'),'utf8');break}catch{await pause(50)}}assert.ok(portFile)
  const target=(await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()).find(t=>t.type==='page');cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  const waitFor=async(fn)=>{for(let i=0;i<100;i++){if(await cdp.evaluate(fn,null))return;await pause(30)}throw Error('SHOP_UI_TIMEOUT')}
  await waitFor(()=>!!document.querySelector('.fs-shop-card button'))
  assert.equal(calls.some(call=>call.action==='confirm'),false)
  await cdp.evaluate(()=>document.querySelector('.fs-shop-card button').click()||true,null)
  await waitFor(()=>!!document.querySelector('.fs-shop-confirm'))
  assert.match(await cdp.evaluate(()=>document.querySelector('.fs-shop-window').textContent,null),/尚未执行/)
  assert.match(await cdp.evaluate(()=>document.querySelector('.fs-shop-window').textContent,null),/<img src=x onerror=window.unsafe=true>/)
  assert.match(await cdp.evaluate(()=>document.querySelector('.fs-shop-window table').textContent,null),/价格.*库存/)
  assert.equal(await cdp.evaluate(()=>!!window.unsafe||!!document.querySelector('.fs-shop-window img'),null),false)
  const output=path.join(root,'work','shop-operation-assistant');await mkdir(output,{recursive:true})
  await writeFile(path.join(output,'preview.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cdp.evaluate(()=>{window.dark();return true},null)
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.fs-shop-window').scrollWidth<=390,null),true)
  await writeFile(path.join(output,'preview-narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.evaluate(()=>{const button=document.querySelector('.fs-shop-confirm');button.click();button.click();return true},null)
  await waitFor(()=>!!document.querySelector('.fs-shop-window [role=status]'))
  assert.equal(calls.filter(call=>call.action==='confirm').length,1)
  await waitFor(()=>document.querySelector('.fs-shop-window button[aria-label="关闭业务窗口"]')?.disabled===false)
  await cdp.evaluate(()=>document.querySelector('.fs-shop-window button[aria-label="关闭业务窗口"]').click()||true,null)
  await waitFor(()=>!document.querySelector('.fs-shop-window'))
  await cdp.evaluate(()=>document.querySelector('.fs-shop-card button').click()||true,null)
  await waitFor(()=>!!document.querySelector('.fs-shop-confirm'))
  delay=200;await cdp.evaluate(()=>{document.querySelector('.fs-shop-confirm').click();window.logout();return true},null)
  await pause(350)
  assert.equal(await cdp.evaluate(()=>!!document.querySelector('.fs-shop-window'),null),false)
 }finally{cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
