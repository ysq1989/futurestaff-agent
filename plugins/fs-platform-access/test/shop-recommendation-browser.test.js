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
const root=fileURLToPath(new URL('../../../',import.meta.url)),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
test('visual Shop cards show genuine image fields, accessible zoom, bounded selection, narrow/dark and identity clearing',{skip:!executable,timeout:30000},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fs-shop-cards-')),calls=[]
 const view={schemaVersion:1,module:'shop',kind:'recommendations',viewId:'recommendations',sessionId:'fixture',title:'为你推荐的商品',data:{kind:'shop.products.recommendations',source:'shop',selectionOnly:true,readOnly:true,products:[
  {id:134,name:'蓝色衬衫',image:'https://cdn.example.com/product.svg',price:'828.00',stock:1,onSale:true,reason:'符合已确认的价格与本店渠道要求。'},
  {id:131,name:'无图商品 <script>unsafe=true</script>',price:null,stock:0,onSale:false,reason:'价格待核实，不虚构利润。'},
  {id:127,name:'图片失效商品',image:'https://cdn.example.com/broken.svg',price:'950.00',stock:2,onSale:true,reason:'作为备选，图片需补充。'}]}}
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
  import React from'react';import{createRoot}from'react-dom/client';import{applyShopOperationClient}from'./plugins/fs-platform-access/src/client/shop-operations.tsx';import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';import{messageCardCss}from'./plugins/fs-platform-access/src/client/message-card.tsx';
  const entries=[],listeners=[];let snapshot={phase:'ready',activeTenantId:'test',user:{userId:'member'}};
  applyShopOperationClient({inject:(_names,fn)=>fn({effect:fn=>fn(),uiConversation:{events:{register:()=>()=>{}}}}),effect:fn=>fn(),platformClientSession:{getSnapshot:()=>snapshot,subscribe:fn=>{listeners.push(fn);return()=>{}}},slots:{inject:(_n,cb)=>cb(),register:(options,component)=>{entries.push({options,component});return()=>{}}}});
  for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
  const cardStyle=document.createElement('style');cardStyle.textContent=messageCardCss;document.head.append(cardStyle);
  window.dark=()=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.dark)};
  window.logout=()=>{snapshot={phase:'signed_out'};listeners.forEach(fn=>fn())};
  const Card=entries.find(e=>e.options.name==='conversation.chat.turnTail').component;
  const root=createRoot(document.getElementById('root'));
  root.render(<Card matched={{kind:'futurestaff.shop',viewId:'recommendations',sessionId:'fixture',title:'推荐'}}/>);
  window.showHistorical=(data,id='historical')=>root.render(<Card key={id} matched={{kind:'futurestaff.shop',viewId:id,sessionId:'fixture',title:'历史商品推荐',snapshot:data}}/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic'})
 let rejectSelection=true,expiredView=false,deliveryConfirmed=false,forbiddenView=false
 const server=createServer(async(req,res)=>{
  if(req.url==='/_futurestaff/shop/operation'){let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);calls.push(body);res.setHeader('content-type','application/json');
   if(body.action==='select'){await pause(180);if(rejectSelection){res.statusCode=400;return res.end(JSON.stringify({error:'DSH_BUSY'}))}view.data.selectedProductId=body.productId;return res.end(JSON.stringify({...view,conversationUpdated:deliveryConfirmed}))}
   if(forbiddenView){res.statusCode=403;return res.end(JSON.stringify({error:'DSH_FORBIDDEN'}))}
   if(expiredView){res.statusCode=400;return res.end(JSON.stringify({error:'SHOP_VIEW_EXPIRED'}))}
   return res.end(JSON.stringify(view))
  }
  res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html;charset=utf-8');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0 auto;max-width:1000px;padding:20px;font:14px Segoe UI;background:var(--bg-primary)}*{box-sizing:border-box}</style><div id="root"></div><script src="/app.js"></script></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${dir}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let portFile;for(let i=0;i<100;i++){try{portFile=await readFile(path.join(dir,'browser','DevToolsActivePort'),'utf8');break}catch{await pause(50)}}assert.ok(portFile)
  const target=(await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()).find(t=>t.type==='page');cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  cdp.on('Fetch.requestPaused',event=>{void cdp.call('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:event.request.url.includes('broken')?404:200,responseHeaders:[{name:'content-type',value:'image/svg+xml'}],body:Buffer.from(event.request.url.includes('broken')?'unavailable':'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#edf2f8"/><path d="M150 55L100 90L70 150L110 165L130 130L130 260L270 260L270 130L290 165L330 150L300 90L250 55L225 80L175 80Z" fill="#3474bd"/></svg>').toString('base64')})})
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'https://cdn.example.com/*'}]})
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1200,height:950,deviceScaleFactor:1,mobile:false})
  await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  const waitFor=async(fn)=>{for(let i=0;i<120;i++){if(await cdp.evaluate(fn,null))return;await pause(30)}throw Error('SHOP_CARDS_TIMEOUT')}
  await waitFor(()=>document.querySelector('.fs-shop-product img')?.naturalWidth>0&&document.body.textContent.includes('图片加载失败'))
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-shop-product').length,null),3)
  assert.equal(calls.some(call=>['confirm','select'].includes(call.action)),false)
  assert.equal(await cdp.evaluate(()=>!!window.unsafe,null),false)
  assert.match(await cdp.evaluate(()=>document.body.textContent,null),/暂无商品图片.*价格待核实/s)
  const output=path.join(root,'work/shop-recommendation-cards');await mkdir(output,{recursive:true})
  await writeFile(path.join(output,'desktop-light.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.evaluate(()=>{const button=document.querySelector('.fs-shop-product-photo');button.focus();button.click();return true},null)
  await waitFor(()=>!!document.querySelector('[role=dialog]'))
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'})
  await waitFor(()=>!document.querySelector('[role=dialog]'))
  assert.equal(await cdp.evaluate(()=>document.activeElement.className,null),'fs-shop-product-photo')
  await cdp.evaluate(()=>{const button=document.querySelector('.fs-shop-product-select');button.click();button.click();return true},null)
  await waitFor(()=>document.querySelector('.fs-shop-card')?.getAttribute('data-status')==='running')
  assert.equal(await cdp.evaluate(()=>Array.from(document.querySelectorAll('.fs-shop-product-select')).every(button=>button.disabled),null),true)
  await waitFor(()=>!!document.querySelector('.fs-shop-recommendations [role=alert]'))
  assert.equal(calls.filter(call=>call.action==='select').length,1)
  assert.equal(await cdp.evaluate(()=>!!document.querySelector('[data-selected=true]'),null),false)
  rejectSelection=false;await cdp.evaluate(()=>document.querySelector('.fs-shop-product-select').click()||true,null)
  await waitFor(()=>!!document.querySelector('[data-selected=true]'))
  assert.match(await cdp.evaluate(()=>document.querySelector('.fs-shop-selection-status').textContent,null),/已选.*134.*无需导入/)
  assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-shop-card').getAttribute('data-status'),null),'unconfirmed')
  assert.match(await cdp.evaluate(()=>document.querySelector('.fs-shop-product-select').textContent,null),/重试返回选择/)
  deliveryConfirmed=true
  await cdp.evaluate(()=>{document.querySelector('.fs-shop-product-select').click();return true},null)
  await waitFor(()=>document.querySelector('.fs-shop-card')?.getAttribute('data-status')==='succeeded')
  assert.equal(calls.some(call=>call.action==='confirm'),false)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cdp.evaluate(()=>{window.dark();return true},null)
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&getComputedStyle(document.querySelector('.fs-shop-product-grid')).gridTemplateColumns.split(' ').length===1,null),true)
  await writeFile(path.join(output,'narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  expiredView=true
  await cdp.evaluate(data=>{window.showHistorical(data);return true},view.data)
  await waitFor(()=>document.body.textContent.includes('过期'))
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-shop-product').length,null),3,'expired recommendations retain the recorded product facts')
  assert.match(await cdp.evaluate(()=>document.body.textContent,null),/历史.*重新查询/s)
  assert.equal(await cdp.evaluate(()=>Array.from(document.querySelectorAll('.fs-shop-product-select')).every(button=>button.disabled),null),true)
  const selectedBefore=calls.filter(call=>call.action==='select').length
  await cdp.evaluate(()=>{document.querySelector('.fs-shop-product-select').click();return true},null)
  await pause(100)
  assert.equal(calls.filter(call=>call.action==='select').length,selectedBefore,'a historical card cannot select through an expired view')
  await writeFile(path.join(output,'expired-narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.evaluate(()=>{document.querySelector('.fs-shop-product-photo').click();return true},null)
  await waitFor(()=>!!document.querySelector('[role=dialog]'))
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'})
  await waitFor(()=>!document.querySelector('[role=dialog]'))
  forbiddenView=true
  await cdp.evaluate(data=>{window.showHistorical(data,'forbidden-history');return true},view.data)
  await waitFor(()=>document.body.textContent.includes('无权'))
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-shop-product').length,null),0,'access rejection never falls back to recorded products')
  forbiddenView=false
  await cdp.evaluate(data=>{window.showHistorical(data,'last-history');return true},view.data)
  await waitFor(()=>document.querySelectorAll('.fs-shop-product').length===3)
  await cdp.evaluate(()=>{document.querySelector('.fs-shop-product-photo').click();window.logout();return true},null)
  await waitFor(()=>!document.querySelector('.fs-shop-product')&&!document.querySelector('[role=dialog]'))
 }finally{cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
