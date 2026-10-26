import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {existsSync} from 'node:fs'
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Cdp} from '@futurestaff/douyin-dm-mcp/browser'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))

test('generic cards validate, deliver once, recover unknown results, preserve readonly history and revoke identity safely', {skip:!executable,timeout:45000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-generic-cards-'))
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';
 import{AgentMessageCard,agentMessageCardCss}from'./plugins/fs-platform-access/src/client/agent-message-cards.tsx';
 import{installMessageCardStyles}from'./plugins/fs-platform-access/src/client/message-card.tsx';
 import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
 installMessageCardStyles({effect:fn=>fn()});const style=document.createElement('style');style.textContent=agentMessageCardCss;document.head.append(style);
 for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
 window.dark=()=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.dark)};
 window.view=()=>({schemaVersion:1,module:'agent-card',kind:'message',viewId:'00000000-0000-4000-8000-000000000001',sessionId:'original-session',title:'请确认接下来的方案',expiresAt:Date.now()+600000,data:{title:'请确认接下来的方案',description:'请补充需求，回答会返回创建此卡片的 Agent。',facts:[{label:'当前阶段',value:'方案比较，尚未执行业务操作'},{label:'普通文本',value:'<script>window.unsafe=true</script>'}],fields:[{id:'brief',label:'本次需求',type:'text',required:true},{id:'style',label:'方案方向',type:'select',required:true,options:[{value:'simple',label:'简洁实用'},{value:'detail',label:'详细分析'}]},{id:'note',label:'其他说明',type:'textarea'}],actions:[{id:'continue',label:'提交补充信息',variant:'primary'},{id:'later',label:'稍后再说',submit:false}]}});
 let owner='tenant-a:user-a',listeners=new Set();const authorization={current:()=>owner,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};
 window.switchOwner=()=>{owner='tenant-b:user-b';listeners.forEach(fn=>fn())};
 window.requests=[];window.submitCount=0;window.mode='normal';window.recorded=undefined;
 const receive=request=>{const next=structuredClone(window.live);if(window.recorded){next.response=window.recorded;next.conversationUpdated=window.returned===true}return next};
 const ordinaryFetch=window.fetch;window.fetch=async(url,init)=>{
  if(url!=='/_futurestaff/message-card')return ordinaryFetch(url,init);
  const request=JSON.parse(init.body);window.requests.push(request);
  if(owner!=='tenant-a:user-a')return Response.json({error:'AGENT_CARD_FORBIDDEN'},{status:403});
  if(window.mode==='forbidden')return Response.json({error:'AGENT_CARD_FORBIDDEN'},{status:403});
  if(window.mode==='expired')return Response.json({error:'AGENT_CARD_EXPIRED'},{status:400});
  if(window.mode==='invalid'&&request.action==='respond')return Response.json({error:'AGENT_CARD_RESPONSE_INVALID'},{status:400});
  if(window.mode==='deferred'&&request.action==='respond')return new Promise(resolve=>{window.releaseResponse=()=>{window.recorded={eventId:'00000000-0000-4000-8000-000000000002',actionId:request.actionId,actionLabel:window.live.data.actions.find(x=>x.id===request.actionId).label,values:request.values};window.returned=true;resolve(Response.json(receive(request)))}});
  if(request.action==='respond'){
   if(window.mode==='unreceived')throw TypeError('connection lost');
   window.recorded={eventId:'00000000-0000-4000-8000-000000000002',actionId:request.actionId,actionLabel:window.live.data.actions.find(x=>x.id===request.actionId).label,values:request.values};
   window.returned=window.mode!=='lost';if(window.mode==='lost')throw TypeError('reply lost');
  }
  if(request.action==='retry')window.returned=true;
  return Response.json(receive(request));
 };
 window.setInput=(id,value)=>{const element=document.querySelector('[name="'+id+'"]');const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new Event(element instanceof HTMLSelectElement?'change':'input',{bubbles:true}))};
 function App(){const[version,setVersion]=useState(0);window.mountCard=(mode,info=false)=>{owner='tenant-a:user-a';window.mode=mode;window.recorded=undefined;window.returned=false;window.requests=[];window.live=window.view();window.live.data.facts[1]={label:'保留内容',value:'当前账号、会话、工程与原文件'};window.live.data.description='测试演示：补充需求后回答会返回原 Agent，不执行任何业务操作。';if(info){delete window.live.data.fields;delete window.live.data.actions}setVersion(v=>v+1)};window.live??=window.view();const snapshot=structuredClone(window.live);return <form onSubmit={e=>{e.preventDefault();window.submitCount++}}><AgentMessageCard key={version} meta={{kind:'futurestaff.agent-card',viewId:snapshot.viewId,sessionId:snapshot.sessionId,title:snapshot.title,snapshot}} authorization={authorization}/></form>}
 createRoot(document.getElementById('root')).render(<App/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic'})
 const server=createServer((request,response)=>{response.setHeader('content-type',request.url==='/app.js'?'text/javascript':'text/html;charset=utf-8');response.end(request.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{margin:0;padding:20px;font:14px Segoe UI;background:var(--bg-primary);color:var(--text-primary)}form{max-width:860px;margin:auto}</style><div id="root"></div><script src="/app.js"></script></html>')})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${directory}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let portFile
  for(let i=0;i<100;i++){try{portFile=await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8');break}catch{await pause(50)}}
  assert.ok(portFile)
  const targets=await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()
  cdp=await Cdp.connect(targets.find(target=>target.type==='page').webSocketDebuggerUrl)
  const wait=async predicate=>{for(let i=0;i<150;i++){if(await cdp.evaluate(predicate,null))return;await pause(25)}throw Error('AGENT_MESSAGE_CARD_TIMEOUT')}
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1200,height:1050,deviceScaleFactor:1,mobile:false})
  await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  await wait(()=>!!document.querySelector('[data-agent-card-action="continue"]:not(:disabled)'))
  assert.deepEqual(await cdp.evaluate(()=>window.requests.map(x=>x.action),null),['view'],'mount is read-only')
  assert.equal(await cdp.evaluate(()=>!!window.unsafe,null),false,'all card content remains plain text')
  assert.match(await cdp.evaluate(()=>document.querySelector('[data-message-card]').textContent,null),/<script>window.unsafe=true<\/script>/)
  await cdp.evaluate(()=>{window.mountCard('normal');return true},null)
  await wait(()=>!!document.querySelector('[data-agent-card-action="continue"]:not(:disabled)'))
  await cdp.evaluate(()=>{document.querySelector('[data-agent-card-action="continue"]').click();return true},null)
  assert.equal(await cdp.evaluate(()=>window.requests.length,null),1,'missing required input never sends a response')
  assert.equal(await cdp.evaluate(()=>document.activeElement.getAttribute('name'),null),'brief')
  await cdp.evaluate(()=>{window.setInput('brief','保留现有流程，比较两个方案');window.setInput('style','simple');window.setInput('note','窄屏也要方便填写');return true},null)
  await pause(30)
  const output=path.join(root,'output/agent-message-cards-20261026/client')
  await mkdir(output,{recursive:true})
  await writeFile(path.join(output,'generic-card-desktop.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.evaluate(()=>{document.querySelector('[name="brief"]').focus();return true},null)
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  assert.equal(await cdp.evaluate(()=>window.submitCount,null),0,'Enter never submits an enclosing composer form')
  await cdp.evaluate(()=>{const button=document.querySelector('[data-agent-card-action="continue"]');button.click();button.click();return true},null)
  await wait(()=>document.querySelector('[data-message-card]').textContent.includes('已记录回答'))
  assert.equal(await cdp.evaluate(()=>window.requests.filter(x=>x.action==='respond').length,null),1,'same-tick double click has one response')
  assert.deepEqual(await cdp.evaluate(()=>window.requests.find(x=>x.action==='respond'),null),{action:'respond',sessionId:'original-session',viewId:'00000000-0000-4000-8000-000000000001',actionId:'continue',values:{brief:'保留现有流程，比较两个方案',style:'simple',note:'窄屏也要方便填写'}})
  assert.equal(await cdp.evaluate(()=>Array.from(document.querySelectorAll('[data-agent-card-action]')).every(x=>x.disabled),null),true)
  assert.equal(await cdp.evaluate(()=>window.submitCount,null),0)
  await writeFile(path.join(output,'generic-card-answered.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))

  await cdp.evaluate(()=>{window.mountCard('normal');return true},null)
  await wait(()=>!!document.querySelector('[data-agent-card-action="later"]:not(:disabled)'))
  await cdp.evaluate(()=>{document.querySelector('[data-agent-card-action="later"]').click();return true},null)
  await wait(()=>document.querySelector('[data-message-card]').textContent.includes('已选择：稍后再说'))
  assert.deepEqual(await cdp.evaluate(()=>window.requests.find(x=>x.action==='respond').values,null),{},'cancel choice bypasses empty required fields')

  await cdp.evaluate(()=>{window.mountCard('invalid');return true},null)
  await wait(()=>!!document.querySelector('[data-agent-card-action="later"]:not(:disabled)'))
  await cdp.evaluate(()=>{document.querySelector('[data-agent-card-action="later"]').click();return true},null)
  await wait(()=>!!document.querySelector('[role="alert"]')?.textContent.includes('请补全'))
  assert.equal(await cdp.evaluate(()=>!!document.querySelector('[data-agent-card-action="later"]:not(:disabled)'),null),true,'definite Host validation rejection permits correction')
  assert.deepEqual(await cdp.evaluate(()=>window.requests.map(x=>x.action),null),['view','respond'],'validation rejection never enters ambiguous delivery recovery')

  await cdp.evaluate(()=>{window.mountCard('lost');return true},null)
  await wait(()=>!!document.querySelector('[data-agent-card-action="later"]:not(:disabled)'))
  await cdp.evaluate(()=>{document.querySelector('[data-agent-card-action="later"]').click();return true},null)
  await wait(()=>!!document.querySelector('[data-agent-card-retry]'))
  assert.deepEqual(await cdp.evaluate(()=>window.requests.map(x=>x.action),null),['view','respond','view'],'lost reply reads original receipt')
  await cdp.evaluate(()=>{document.querySelector('[data-agent-card-retry]').click();document.querySelector('[data-agent-card-retry]').click();return true},null)
  await wait(()=>document.querySelector('[data-message-card]').textContent.includes('回答已返回原 Agent 会话'))
  assert.deepEqual(await cdp.evaluate(()=>window.requests.filter(x=>x.action==='retry'),null),[{action:'retry',sessionId:'original-session',viewId:'00000000-0000-4000-8000-000000000001'}],'retry sends only original receipt identity')

  await cdp.evaluate(()=>{window.mountCard('unreceived');return true},null)
  await wait(()=>!!document.querySelector('[data-agent-card-action="later"]:not(:disabled)'))
  await cdp.evaluate(()=>{document.querySelector('[data-agent-card-action="later"]').click();return true},null)
  await wait(()=>!!document.querySelector('[data-agent-card-check]'))
  await cdp.evaluate(()=>{document.querySelector('[data-agent-card-check]').click();return true},null)
  await wait(()=>window.requests.filter(x=>x.action==='view').length===3)
  assert.equal(await cdp.evaluate(()=>Array.from(document.querySelectorAll('[data-agent-card-action]')).every(x=>x.disabled),null),true,'unresolved receipt stays frozen after another read')

  await cdp.evaluate(()=>{window.mountCard('expired');return true},null)
  await wait(()=>document.querySelector('[data-message-card]').textContent.includes('已过期'))
  assert.match(await cdp.evaluate(()=>document.querySelector('[data-message-card]').textContent,null),/方案比较，尚未执行业务操作/)
  assert.equal(await cdp.evaluate(()=>Array.from(document.querySelectorAll('[data-agent-card-action]')).every(x=>x.disabled),null),true)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true})
  await cdp.evaluate(()=>{window.dark();return true},null)
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true)
  await writeFile(path.join(output,'generic-card-history-narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))

  await cdp.evaluate(()=>{window.mountCard('forbidden');return true},null)
  await wait(()=>document.querySelector('[data-message-card]').textContent.includes('不可访问'))
  assert.equal(await cdp.evaluate(()=>document.querySelector('[data-message-card]').textContent.includes('方案比较，尚未执行业务操作'),null),false,'forbidden never reveals history snapshot')
  await cdp.evaluate(()=>{window.mountCard('deferred');return true},null)
  await wait(()=>!!document.querySelector('[data-agent-card-action="later"]:not(:disabled)'))
  await cdp.evaluate(()=>{document.querySelector('[data-agent-card-action="later"]').click();return true},null)
  await wait(()=>typeof window.releaseResponse==='function')
  await cdp.evaluate(()=>{window.switchOwner();window.releaseResponse();return true},null)
  await wait(()=>document.querySelector('[data-message-card]').textContent.includes('不可访问'))
  await pause(50)
  assert.equal(await cdp.evaluate(()=>!!document.querySelector('[name="brief"]')||document.querySelector('[data-message-card]').textContent.includes('已选择'),null),false,'late response cannot reintroduce previous member data')
  await cdp.evaluate(()=>{window.mountCard('normal',true);return true},null)
  await wait(()=>document.querySelector('[data-message-card]').getAttribute('data-status')==='ready')
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-agent-card-action]').length,null),0,'information-only cards are readable without fake actions')
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-message-card__actions,.fs-message-card__footer').length,null),0,'information-only cards have no empty action or footer surfaces')
  assert.deepEqual(await cdp.evaluate(()=>window.requests.map(x=>x.action),null),['view'])
 }finally{cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
