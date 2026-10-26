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
test('ERP draft prefills, explains missing price, preserves edits and only saves after confirmation',{skip:!executable,timeout:30000},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fs-erp-draft-')),calls=[]
 const data={partners:[{id:'customer',name:'测试客户',code:'K002'}],items:[{id:'product',name:'测试产品',unit:'套',stock_qty:0,unit_price:null}],draft:{customer_id:'customer',items:[{product_id:'product',quantity:200}]}}
 const form={viewId:'form-1',sessionId:'fixture',kind:'form',resource:'sales-orders',title:'销售订单',data}
 let preparedPreview
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
  import React from'react';import{createRoot}from'react-dom/client';import{applyErpClient}from'./plugins/fs-platform-access/src/client/erp.tsx';import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
  const entries=[];applyErpClient({effect:()=>{},slots:{inject:(_n,cb)=>cb(),register:(options,component)=>{entries.push({options,component});return()=>{}}}});
  for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
  window.dark=()=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.dark)};
  const Window=entries.find(e=>e.options.id==='futurestaff-erp-window').component,Card=entries.find(e=>e.options.key==='erp_order_form').component;
  createRoot(document.getElementById('root')).render(<><Card block={{kind:'tool-result',meta:{kind:'futurestaff.erp',viewId:'form-1',sessionId:'fixture',title:'销售订单'},content:[]}}/><Window/></>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic'})
 const server=createServer(async(req,res)=>{
  if(req.url==='/_futurestaff/erp'){let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);calls.push(body);res.setHeader('content-type','application/json');
   if(body.action==='prepare'){await pause(40);preparedPreview={...form,viewId:'preview-1',kind:'preview',data:{operation:'sales.create',body:body.input.body,references:[{id:'customer',name:'测试客户'},{id:'product',name:'测试产品'}]}};return res.end(JSON.stringify(preparedPreview))}
   if(body.action==='confirm')return res.end(JSON.stringify({...form,kind:'entity',data:{order_no:'fixture-order',status:'草稿',items:[]},conversationUpdated:true}))
   return res.end(JSON.stringify(body.viewId==='preview-1'&&preparedPreview?preparedPreview:form))
  }
  res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html;charset=utf-8');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;font:14px Segoe UI}*{box-sizing:border-box}</style><div id="root"></div><script src="/app.js"></script></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${dir}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let portFile;for(let i=0;i<100;i++){try{portFile=await readFile(path.join(dir,'browser','DevToolsActivePort'),'utf8');break}catch{await pause(50)}}assert.ok(portFile)
  const port=portFile.split('\n')[0],target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page')
  cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  await cdp.call('Page.navigate',{url})
  const waitFor=async(fn)=>{for(let i=0;i<100;i++){if(await cdp.evaluate(fn,null))return;await pause(30)}throw Error('ERP_UI_TIMEOUT')}
  await waitFor(()=>!!document.querySelector('.fs-erp-card button'))
  await cdp.evaluate(()=>document.querySelector('.fs-erp-card button').click()||true,null)
  await waitFor(()=>!!document.querySelector('.fs-erp-form'))
  assert.equal(await cdp.evaluate(()=>document.querySelector('select').value,null),'customer')
  assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-erp-line select').value,null),'product')
  assert.deepEqual(await cdp.evaluate(()=>[...document.querySelectorAll('input[type=number]')].map(input=>input.value),null),['200',''])
  await cdp.evaluate(()=>document.querySelector('button[type=submit]').click()||true,null)
  await waitFor(()=>!!document.querySelector('[role=alert]'))
  assert.match(await cdp.evaluate(()=>document.querySelector('[role=alert]').textContent,null),/第 1 项.*单价/)
  assert.equal(calls.some(call=>call.action==='prepare'||call.action==='confirm'),false)
  await cdp.evaluate(()=>{const input=document.querySelectorAll('input[type=number]')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'26.5');input.dispatchEvent(new Event('input',{bubbles:true}));return true},null)
  assert.match(await cdp.evaluate(()=>document.querySelector('.fs-erp-line-context').textContent,null),/5300.00/)
  assert.match(await cdp.evaluate(()=>document.querySelector('.fs-erp-warning').textContent,null),/库存/)
  const output=path.join(root,'work','erp-order-assistant');await mkdir(output,{recursive:true})
  await writeFile(path.join(output,'draft.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.evaluate(()=>document.querySelector('button[type=submit]').click()||true,null)
  await waitFor(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='返回修改'))
  assert.equal(calls.find(call=>call.action==='prepare').input.body.items[0].quantity,200)
  assert.equal(calls.some(call=>call.action==='confirm'),false)
  await cdp.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='返回修改').click()||true,null)
  await waitFor(()=>!!document.querySelector('.fs-erp-form'))
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('input[type=number]')[1].value,null),'26.5')
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cdp.evaluate(()=>{window.dark();return true},null)
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.fs-erp-window').scrollWidth<=390,null),true)
  await writeFile(path.join(output,'draft-narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.evaluate(()=>document.querySelector('button[type=submit]').click()||true,null)
  await waitFor(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='确认执行'))
  await cdp.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='确认执行').click()||true,null)
  await waitFor(()=>!!document.querySelector('[role=status]'))
  assert.equal(calls.filter(call=>call.action==='confirm').length,1)
 }finally{cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
