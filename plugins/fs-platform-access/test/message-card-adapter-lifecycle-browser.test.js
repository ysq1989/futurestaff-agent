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

async function fixture(contents,run){
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-card-adapter-lifecycle-')),exports=[]
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents},bundle:true,write:false,format:'iife',jsx:'automatic'})
 let release
 const exportGate=new Promise(resolve=>{release=resolve})
 const server=createServer(async(req,res)=>{
  if(req.url==='/_futurestaff/fashion/export'){
   let raw='';for await(const chunk of req)raw+=chunk
   exports.push(JSON.parse(raw));await exportGate
   res.setHeader('content-type','application/json');return res.end(JSON.stringify({path:'Downloads/original-owner.png'}))
  }
  if(req.url==='/image.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="blue"/></svg>')}
  res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html;charset=utf-8')
  res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${directory}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let portFile;for(let i=0;i<100;i++){try{portFile=await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8');break}catch{await pause(40)}}
  assert.ok(portFile,'isolated browser started')
  const target=(await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()).find(item=>item.type==='page')
  cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  const waitFor=async predicate=>{for(let i=0;i<120;i++){if(await cdp.evaluate(predicate,null))return;await pause(25)}throw Error('CARD_ADAPTER_TIMEOUT')}
  await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  await waitFor(()=>window.fixtureReady===true)
  await run({cdp,waitFor,exports,release})
 }finally{release();cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}

const fashionFixture=`
 import React from 'react';import{createRoot}from'react-dom/client';
 import{mountFashionPreviews}from'./plugins/fs-platform-access/src/client/fashion-preview.tsx';
 const entries=[],listeners=new Set();let owner='original-owner';
 const nativeFetch=window.fetch.bind(window);window.exportSignals=[];
 window.fetch=(input,options)=>{if(input==='/_futurestaff/fashion/export'){window.exportSignals.push(options.signal);if(window.ignoreAbort){const{signal,...rest}=options;return nativeFetch(input,rest)}}return nativeFetch(input,options)};
 const session={getSnapshot:()=>({phase:'ready',activeTenantId:owner,user:{userId:'user'}}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};
 window.switchOwner=()=>{owner='new-owner';for(const listener of listeners)listener()};
 mountFashionPreviews({platformClientSession:session,inject:(_names,fn)=>fn({effect:fn=>fn(),uiConversation:{events:{register:()=>()=>{}},imageUrl:async()=>'/image.svg'}}),slots:{inject:(_name,fn)=>fn(),register:(settings,component)=>{entries.push({settings,component});return()=>{}}}});
 const Card=entries.find(entry=>entry.settings.key==='fashion_image_generate').component;
 const block={kind:'tool-result',content:[{type:'text',text:JSON.stringify({status:'succeeded',requestId:'original-request',imagePath:'fashion-output/original.png'})},{type:'image',attachment:{attachmentId:'image',width:4,height:4}}]};
 const reactRoot=createRoot(document.getElementById('root'));window.unmount=()=>reactRoot.unmount();
 reactRoot.render(<Card sessionId="original-session" openFile={()=>{}} block={block}/>);window.fixtureReady=true;
`

test('native card image, detail and close controls never submit an enclosing form',{skip:!executable,timeout:30000},async()=>fixture(`
 import React from 'react';import{createRoot}from'react-dom/client';
 import{ShopRecommendations}from'./plugins/fs-platform-access/src/client/shop-recommendations.tsx';
 import{InteractionWindow,InteractionTable}from'./plugins/fs-platform-access/src/client/interaction.tsx';
 window.submitted=0;const products=[{id:1,name:'真实商品',reason:'符合条件',price:'1',stock:1,onSale:false}];
 createRoot(document.getElementById('root')).render(<form onSubmit={event=>{event.preventDefault();window.submitted++}}>
  <ShopRecommendations data={{kind:'shop.products.recommendations',source:'shop',readOnly:true,selectionOnly:true,products}} onSelect={async()=>true}/>
  <InteractionTable rows={[{id:'detail',name:'真实记录'}]} columns={[{key:'name',label:'名称'}]} onDetail={()=>{}}/>
  <InteractionWindow title="核对窗口" onClose={()=>{}}>真实内容</InteractionWindow>
 </form>);window.fixtureReady=true;
`,async({cdp,waitFor})=>{
 await waitFor(()=>document.querySelectorAll('button').length>=4)
 const controls=await cdp.evaluate(()=>[...document.querySelectorAll('button')].map(button=>({label:button.textContent||button.getAttribute('aria-label'),type:button.type})),null)
 assert.equal(controls.every(control=>control.type==='button'),true,JSON.stringify(controls))
 await cdp.evaluate(()=>{for(const button of [...document.querySelectorAll('button')])button.click();return true},null)
 assert.equal(await cdp.evaluate(()=>window.submitted,null),0)
}))

test('same-tick repeated download clicks own only one original-file export',{skip:!executable,timeout:30000},async()=>fixture(fashionFixture,async({cdp,waitFor,exports,release})=>{
 await waitFor(()=>!!document.querySelector('[aria-label="下载原图"]'))
 await cdp.evaluate(()=>{const button=document.querySelector('[aria-label="下载原图"]');button.click();button.click();return true},null)
 await waitFor(()=>document.querySelector('[aria-label="下载原图"]').disabled)
 release();await waitFor(()=>document.body.textContent.includes('已下载原图：'))
 assert.deepEqual(exports,[{sessionId:'original-session',requestId:'original-request'}])
}))

test('identity changes hide image previews and discard a late export response',{skip:!executable,timeout:30000},async()=>fixture(fashionFixture,async({cdp,waitFor,exports,release})=>{
 await waitFor(()=>!!document.querySelector('[data-fashion-preview] img'))
 await cdp.evaluate(()=>{document.querySelector('.fs-fashion-card__media').click();return true},null)
 await waitFor(()=>!!document.querySelector('dialog[open]'))
 await cdp.evaluate(()=>{window.ignoreAbort=true;document.querySelector('[aria-label="下载原图"]').click();return true},null)
 await waitFor(()=>document.querySelector('[aria-label="下载原图"]').disabled)
 await cdp.evaluate(()=>{window.switchOwner();return true},null)
 release();await pause(120)
 assert.equal(exports.length,1)
 assert.equal(await cdp.evaluate(()=>!!document.querySelector('[data-fashion-preview] img,dialog[open]'),null),false)
 assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('Downloads/original-owner.png'),null),false)
 assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('身份已变化'),null),true)
 assert.equal(await cdp.evaluate(()=>!!document.querySelector('[aria-label="下载原图"]'),null),false)
}))

test('unmounting a card aborts its pending file-export request',{skip:!executable,timeout:30000},async()=>fixture(fashionFixture,async({cdp,waitFor,release})=>{
 await waitFor(()=>!!document.querySelector('[aria-label="下载原图"]'))
 await cdp.evaluate(()=>{document.querySelector('[aria-label="下载原图"]').click();return true},null)
 await waitFor(()=>window.exportSignals.length===1)
 await cdp.evaluate(()=>{window.unmount();return true},null)
 assert.equal(await cdp.evaluate(()=>window.exportSignals[0].aborted,null),true)
 release();await pause(80)
 assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('original-owner.png'),null),false)
}))

test('a late authorized-image read cannot repopulate a card after an identity change',{skip:!executable,timeout:30000},async()=>fixture(fashionFixture.replace("imageUrl:async()=>'/image.svg'","imageUrl:()=>new Promise(resolve=>{window.releaseImage=()=>resolve('/image.svg')})"),async({cdp,waitFor})=>{
 await waitFor(()=>typeof window.releaseImage==='function')
 await cdp.evaluate(()=>{window.switchOwner();window.releaseImage();return true},null)
 await waitFor(()=>document.body.textContent.includes('身份已变化'))
 assert.equal(await cdp.evaluate(()=>!!document.querySelector('[data-fashion-preview] img,[aria-label="下载原图"]'),null),false)
}))
