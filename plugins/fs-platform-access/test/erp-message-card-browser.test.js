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
const root=fileURLToPath(new URL('../../../',import.meta.url)),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)

test('ERP turn-tail card confirms once, preserves unknown outcomes and expires across identity changes',{skip:!executable,timeout:30000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-erp-message-browser-')),calls=[],events=new Set(),saved=new Map(),prepared=new Map()
 const preview=id=>({viewId:id,sessionId:'fixture',kind:'preview',resource:'sales-orders',title:'销售状态核对',data:{operation:'sales.status',body:{new_status:'已确认',notes:'<script>unsafe=true</script>'},references:[{id:'order',name:'销售订单 SO-001'}]}})
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
  import React from'react';import{createRoot}from'react-dom/client';import{applyErpClient}from'./plugins/fs-platform-access/src/client/erp.tsx';import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';import{messageCardCss}from'./plugins/fs-platform-access/src/client/message-card.tsx';
  const style=document.createElement('style');style.textContent=messageCardCss;document.head.append(style);
  const entries=[],listeners=[];let snapshot={phase:'ready',activeTenantId:'tenant',user:{userId:'member'}};
  applyErpClient({effect:fn=>fn(),inject:(_names,fn)=>fn({effect:fn=>fn(),uiConversation:{events:{register:()=>()=>{}}}}),platformClientSession:{getSnapshot:()=>snapshot,subscribe:fn=>{listeners.push(fn);return()=>{}}},slots:{inject:(_name,callback)=>callback(),register:(options,component)=>{entries.push({options,component});return()=>{}}}});
  for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
  const root=createRoot(document.getElementById('root')),Tail=entries.find(entry=>entry.options.name==='conversation.chat.turnTail')?.component,Window=entries.find(entry=>entry.options.id==='futurestaff-erp-window').component,LiveBridge=entries.find(entry=>entry.options.id==='futurestaff-erp-view-events').component;
  window.show=id=>root.render(Tail?<><Tail key={id} matched={{kind:'futurestaff.erp',viewId:id,sessionId:'fixture',title:'销售状态核对'}}/><Window/><LiveBridge/></>:<p>ERP_TURN_TAIL_MISSING</p>);
  window.logout=()=>{snapshot={phase:'signed_out'};listeners.forEach(listener=>listener())};
  window.login=()=>{snapshot={phase:'ready',activeTenantId:'tenant',user:{userId:'another-member'}};listeners.forEach(listener=>listener())};
  window.dark=()=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.dark)};
  window.show('preview');
 `},bundle:true,write:false,format:'iife',jsx:'automatic'})
 const server=createServer(async(request,response)=>{
  if(request.url==='/_futurestaff/erp/events'){response.setHeader('content-type','text/event-stream');response.write(': connected\n\n');events.add(response);response.once('close',()=>events.delete(response));return}
  if(request.url==='/_futurestaff/erp'){let raw='';for await(const chunk of request)raw+=chunk;const input=JSON.parse(raw);calls.push(input);response.setHeader('content-type','application/json')
   if(input.action==='prepare'){await pause(140);const value={...preview('prepared-'+(prepared.size+1)),data:{operation:'sales.create',body:input.input.body,references:[]}};prepared.set(value.viewId,value);return response.end(JSON.stringify(value))}
   if(input.viewId==='expired'){response.statusCode=409;return response.end(JSON.stringify({error:'ERP_VIEW_EXPIRED'}))}
   if(input.action==='confirm'){await pause(140);if(input.viewId==='unknown'){response.statusCode=503;return response.end(JSON.stringify({error:'ERP_UNAVAILABLE'}))}
    const attempts=calls.filter(call=>call.action==='confirm'&&call.viewId===input.viewId).length
    const entity={...preview('saved-'+input.viewId),kind:'entity',data:{order_no:'SO-001',status:'已确认'}}
    saved.set(input.viewId,entity)
    return response.end(JSON.stringify({...entity,confirmationViewId:input.viewId,conversationUpdated:attempts>1}))
   }
   if(saved.has(input.viewId))return response.end(JSON.stringify(saved.get(input.viewId)))
   if(prepared.has(input.viewId))return response.end(JSON.stringify(prepared.get(input.viewId)))
   if(input.viewId.startsWith('form-'))return response.end(JSON.stringify({...preview(input.viewId),kind:'form',data:{partners:[{id:'customer',name:'客户'}],items:[{id:'product',name:'产品',unit_price:2}],draft:{customer_id:'customer',items:[{product_id:'product',quantity:1,unit_price:2}]}}}))
   return response.end(JSON.stringify(preview(input.viewId)))
  }
  response.setHeader('content-type',request.url==='/app.js'?'text/javascript':'text/html;charset=utf-8');response.end(request.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0 auto;max-width:900px;padding:20px;font:14px Segoe UI;background:var(--bg-primary);color:var(--text-primary)}*{box-sizing:border-box}</style><div id="root"></div><script src="/app.js"></script></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${directory}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let port;for(let i=0;i<100;i++){try{port=(await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await pause(40)}}assert.ok(port)
  const target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(target=>target.type==='page');cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  const command=cdp.call.bind(cdp);cdp.call=async(method,params)=>{try{return await command(method,params)}catch(error){throw new Error(method+': '+error.message)}}
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false});await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  const waitFor=async(fn)=>{for(let i=0;i<120;i++){if(await cdp.evaluate(fn,null))return;await pause(25)}throw Error('ERP_MESSAGE_UI_TIMEOUT: '+await cdp.evaluate(()=>document.body.textContent,null))}
  await waitFor(()=>!!document.querySelector('.fs-erp-card')||document.body.textContent.includes('ERP_TURN_TAIL_MISSING'))
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('ERP_TURN_TAIL_MISSING'),null),false,'ERP result must remain in turnTail')
  await waitFor(()=>[...document.querySelectorAll('.fs-erp-card button')].some(button=>button.textContent==='确认执行'))
  const output=path.join(root,'work/message-card-erp');await mkdir(output,{recursive:true})
  await writeFile(path.join(output,'pending-light.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  for(let attempt=0;attempt<100&&!events.size;attempt++)await pause(20)
  assert.ok(events.size,'ERP view event connection')
  for(const response of events)response.write('data: '+JSON.stringify({kind:'futurestaff.erp',viewId:'event-preview',sessionId:'fixture',title:'新的业务预览'})+'\n\n')
  await pause(150)
  assert.equal(await cdp.evaluate(()=>!!document.querySelector('[role=dialog]'),null),false,'a new business event must not cover the inline card with an automatic drawer')
  assert.equal(calls.some(call=>call.action==='confirm'),false);assert.equal(await cdp.evaluate(()=>!!window.unsafe,null),false)
  await cdp.evaluate(()=>{const button=[...document.querySelectorAll('.fs-erp-card button')].find(button=>button.textContent==='确认执行');button.click();button.click();return true},null)
  await waitFor(()=>document.querySelector('.fs-erp-card')?.textContent.includes('正在执行'))
  assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('.fs-erp-card button')].every(button=>button.disabled),null),true)
  await waitFor(()=>document.querySelector('.fs-erp-card')?.textContent.includes('重试返回结果'))
  assert.equal(calls.filter(call=>call.action==='confirm').length,1)
  await cdp.evaluate(()=>[...document.querySelectorAll('.fs-erp-card button')].find(button=>button.textContent==='查看详情').click()||true,null)
  await waitFor(()=>!!document.querySelector('.fs-erp-window'))
  assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-erp-card')?.getAttribute('data-status'),null),'succeeded','opening an entity readback must preserve saved receipt state')
  assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-erp-card')?.textContent.includes('重试返回结果'),null),true)
  await cdp.evaluate(()=>document.querySelector('[aria-label="关闭业务窗口"]').click()||true,null)
  await cdp.evaluate(()=>[...document.querySelectorAll('.fs-erp-card button')].find(button=>button.textContent==='重试返回结果').click()||true,null)
  await waitFor(()=>document.querySelector('.fs-erp-card')?.textContent.includes('已返回原 Agent 会话'))
  assert.equal(calls.filter(call=>call.action==='confirm').length,2)
  await writeFile(path.join(output,'completed-light.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.evaluate(()=>window.show('unknown')||true,null);await waitFor(()=>[...document.querySelectorAll('.fs-erp-card button')].some(button=>button.textContent==='确认执行'))
  await cdp.evaluate(()=>[...document.querySelectorAll('.fs-erp-card button')].find(button=>button.textContent==='确认执行').click()||true,null)
  await waitFor(()=>document.querySelector('.fs-erp-card')?.textContent.includes('结果待核实'))
  assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('.fs-erp-card button')].some(button=>button.textContent==='确认执行'),null),false)
  await cdp.evaluate(()=>[...document.querySelectorAll('.fs-erp-card button')].find(button=>button.textContent==='查询原操作').click()||true,null);await pause(80)
  assert.equal(calls.filter(call=>call.action==='confirm'&&call.viewId==='unknown').length,1)
  assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-erp-card')?.textContent.includes('结果待核实'),null),true)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cdp.evaluate(()=>window.dark()||true,null)
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true)
  await writeFile(path.join(output,'unknown-narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.evaluate(()=>window.show('expired')||true,null);await waitFor(()=>document.querySelector('.fs-erp-card')?.textContent.includes('已过期'))
  assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-erp-card')?.textContent.includes('SO-001'),null),false)
  await cdp.evaluate(()=>window.show('form-edit')||true,null);await waitFor(()=>[...document.querySelectorAll('.fs-erp-card button')].some(button=>button.textContent==='打开开单窗口'))
  await cdp.evaluate(()=>document.querySelector('.fs-erp-card button').click()||true,null);await waitFor(()=>!!document.querySelector('.fs-erp-form'))
  await cdp.evaluate(()=>{const input=document.querySelector('input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'3');input.dispatchEvent(new Event('input',{bubbles:true}));return true},null)
  await cdp.evaluate(()=>document.querySelector('button[type=submit]').click()||true,null)
  await waitFor(()=>[...document.querySelectorAll('.fs-erp-card button')].some(button=>button.textContent==='返回修改'))
  await cdp.evaluate(()=>[...document.querySelectorAll('.fs-erp-card button')].find(button=>button.textContent==='返回修改').click()||true,null)
  await waitFor(()=>!!document.querySelector('.fs-erp-form'))
  assert.equal(await cdp.evaluate(()=>document.querySelector('input[type=number]')?.value,null),'3','inline return-to-edit preserves the last prepared draft')
  await cdp.evaluate(()=>[...document.querySelectorAll('.fs-erp-card button')].find(button=>button.textContent==='确认执行').click()||true,null)
  await waitFor(()=>document.querySelector('.fs-erp-card')?.getAttribute('data-status')==='running')
  assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-erp-form input')?.matches(':disabled'),null),true,'execution from the card locks the related edit form')
  await waitFor(()=>document.querySelector('.fs-erp-card')?.getAttribute('data-status')==='succeeded')
  await cdp.evaluate(()=>document.querySelector('[aria-label="关闭业务窗口"]').click()||true,null)
  await cdp.evaluate(()=>window.show('form-late')||true,null);await waitFor(()=>[...document.querySelectorAll('.fs-erp-card button')].some(button=>button.textContent==='打开开单窗口'))
  await cdp.evaluate(()=>document.querySelector('.fs-erp-card button').click()||true,null);await waitFor(()=>!!document.querySelector('.fs-erp-form'))
  await cdp.evaluate(()=>{document.querySelector('button[type=submit]').click();window.logout();return true},null);await pause(250)
  assert.equal(await cdp.evaluate(()=>!!document.querySelector('[role=dialog]'),null),false,'late form preview must not reopen a drawer after logout')
  await cdp.evaluate(()=>window.login()||true,null)
  await cdp.evaluate(()=>window.show('late')||true,null);await waitFor(()=>[...document.querySelectorAll('.fs-erp-card button')].some(button=>button.textContent==='确认执行'))
  await cdp.evaluate(()=>{[...document.querySelectorAll('.fs-erp-card button')].find(button=>button.textContent==='确认执行').click();window.logout();return true},null);await pause(250)
  assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-erp-card')?.textContent.includes('SO-001'),null),false)
  assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-erp-card')?.textContent.includes('已过期'),null),true)
 }finally{cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
