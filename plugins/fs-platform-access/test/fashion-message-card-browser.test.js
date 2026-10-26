import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {existsSync} from 'node:fs'
import {mkdtemp,readFile,mkdir,writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Cdp} from '@futurestaff/douyin-dm-mcp/browser'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))

test('fashion message cards keep authorized images, source comparison and original download in a durable turn gallery',{skip:!executable,timeout:30000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-fashion-card-browser-')),exports=[]
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
  import React from 'react';import{createRoot}from'react-dom/client';
  import{mountFashionPreviews}from'./plugins/fs-platform-access/src/client/fashion-preview.tsx';
  import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
  import{messageCardCss}from'./plugins/fs-platform-access/src/client/message-card.tsx';
  const entries=[];window.imageReads=[];window.openedFiles=[];
  mountFashionPreviews({inject:(_names,fn)=>fn({effect:fn=>fn(),uiConversation:{events:{register:()=>()=>{}},imageUrl:async(sessionId,attachment)=>{window.imageReads.push({sessionId,id:attachment.attachmentId});if(attachment.attachmentId==='unavailable')throw Error('not available');return '/image.svg?'+attachment.attachmentId}}}),slots:{inject:(_name,fn)=>fn(),register:(settings,component)=>{entries.push({settings,component});return()=>{}}}});
  const style=document.createElement('style');style.textContent=messageCardCss;document.head.append(style);
  const theme=dark=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,dark?value.dark:value.light)};theme(false);window.dark=()=>theme(true);
  const Tail=entries.find(entry=>entry.settings.name==='conversation.chat.turnTail').component;
  const receipt={status:'succeeded',requestId:'original-request',imagePath:'fashion-output/original.png',fidelityMode:'reference-generation',label:'连衣裙素材 · 原文件待人工审核'};
  const attachment=id=>({type:'image',attachment:{attachmentId:id,width:800,height:1200}});
  const items=[{seq:1,callId:'generated',content:[{type:'text',text:JSON.stringify(receipt)},attachment('generated'),attachment('source')]},{seq:2,callId:'missing',content:[{type:'text',text:JSON.stringify({...receipt,requestId:'missing-request'})},attachment('unavailable')]}];
  const reactRoot=createRoot(document.getElementById('root'));
  window.render=()=>reactRoot.render(<Tail sessionId="original-session" openFile={file=>window.openedFiles.push(file)} matched={items}/>);window.render();
 `},bundle:true,write:false,format:'iife',jsx:'automatic'})
 const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/image.svg')){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#f8fafc"/><path d="M160 90h80l40 100-40 20 40 290H120l40-290-40-20z" fill="#c78b7d"/></svg>')}
  if(req.url==='/_futurestaff/fashion/export'){
   let raw='';for await(const chunk of req)raw+=chunk
   exports.push({body:JSON.parse(raw),header:req.headers['x-futurestaff-fashion']});await pause(80)
   res.setHeader('content-type','application/json');return res.end(JSON.stringify({path:'Downloads/original.png'}))
  }
  res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html;charset=utf-8')
  res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;padding:20px;font:14px Segoe UI;background:var(--bg-primary)}*{box-sizing:border-box}#root{max-width:720px;margin:auto}</style><div id="root"></div><script src="/app.js"></script></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${directory}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 browser.unref()
 let cdp
 try{
  let portFile;for(let i=0;i<100;i++){try{portFile=await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8');break}catch{await pause(40)}}assert.ok(portFile)
  const target=(await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()).find(item=>item.type==='page')
  cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  const waitFor=async(fn)=>{for(let i=0;i<100;i++){if(await cdp.evaluate(fn,null))return;await pause(30)}throw Error('FASHION_CARD_UI_TIMEOUT')}
  await waitFor(()=>document.querySelectorAll('[data-fashion-gallery] [data-message-card]').length===2&&Boolean(document.querySelector('[data-fashion-preview] img')))
  assert.equal(exports.length,0,'rendering a durable gallery never downloads or regenerates')
  assert.equal(await cdp.evaluate(()=>window.imageReads.every(item=>item.sessionId==='original-session'),null),true)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-fashion-preview]')[0].textContent.includes('待审核'),null),true)
  await cdp.evaluate(()=>{[...document.querySelectorAll('button')].find(button=>button.textContent==='原图对照').click();return true},null)
  await waitFor(()=>Boolean(document.querySelector('dialog[open]')))
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('dialog[open] img').length,null),2)
  assert.equal(await cdp.evaluate(()=>document.querySelector('dialog[open]').textContent.includes('尺寸检查不能代替商品保真审核'),null),true)
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await waitFor(()=>!document.querySelector('dialog[open]'))
  await cdp.evaluate(()=>{document.querySelector('[aria-label="下载原图"]').click();return true},null)
  await waitFor(()=>document.querySelector('[aria-label="下载原图"]').disabled)
  await waitFor(()=>document.body.textContent.includes('已下载原图：Downloads/original.png'))
  assert.deepEqual(exports,[{body:{sessionId:'original-session',requestId:'original-request'},header:'1'}])
  await cdp.evaluate(()=>{[...document.querySelectorAll('button')].find(button=>button.textContent==='打开文件').click();return true},null)
  assert.deepEqual(await cdp.evaluate(()=>window.openedFiles,null),['fashion-output/original.png'])
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('预览暂不可用，原文件已保留'),null),true)
  const output=path.join(root,'output/interactive-message-cards-20261025/implementation')
  await mkdir(output,{recursive:true})
  await writeFile(path.join(output,'fashion-desktop-light.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  await cdp.evaluate(()=>{window.dark();return true},null)
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=390,null),true)
  assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('.fs-fashion-action')].every(button=>button.getBoundingClientRect().height>=44),null),true)
  await writeFile(path.join(output,'fashion-narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.evaluate(()=>{window.render();return true},null)
  assert.equal(exports.length,1,'replaying or rerendering the gallery does not repeat file actions')
 }catch(error){
  console.error(error)
  throw error
 }finally{
  cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
 }
})
