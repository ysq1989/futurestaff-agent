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
const hostBundle=await build({entryPoints:[fileURLToPath(new URL('../src/agent-message-card-host.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm'})
const {mountAgentMessageCards}=await import(`data:text/javascript;base64,${Buffer.from(hostBundle.outputFiles[0].text).toString('base64')}`)

test('production client slots and real Host HTTP route return the selected card answer to its original Agent', {skip:!executable,timeout:45000},async()=>{
 const cleanups=[],received=[],foreignReceived=[],requests=[]
 let route,tool
 const agent={id:'fixture-original-agent-session',followup:message=>received.push(message)}
 const foreign={id:'fixture-other-agent-session',followup:message=>foreignReceived.push(message)}
 const active=new Map([[agent.id,agent],[foreign.id,foreign]]),identity=new AbortController()
 const ctx={on:()=>{},get:name=>name==='agents'?active:undefined,effect:factory=>{const cleanup=factory();if(typeof cleanup==='function')cleanups.push(cleanup)},webServer:{register:value=>{route=value;return()=>{}}},inject:(_deps,callback)=>callback({effect:ctx.effect,tools:{register:value=>{tool=value;return()=>{}}}})}
 mountAgentMessageCards(ctx,async sessionId=>{if(!active.has(sessionId))throw Error('AGENT_CARD_FORBIDDEN');return {owner:'fixture-tenant:fixture-user',policy:'fixture-profile',signal:identity.signal}})
 const original={title:'请选择下一步方案',description:'测试演示：补充的信息仅返回原 Agent，不执行任何业务操作。',facts:[{label:'当前阶段',value:'比较方案，等待你的选择'},{label:'保留内容',value:'账号、会话、工程与原文件'}],fields:[{id:'brief',label:'本次需求',type:'text',required:true},{id:'direction',label:'方案方向',type:'select',required:true,options:[{value:'simple',label:'简洁实用'},{value:'detail',label:'详细分析'}]}],actions:[{id:'compare',label:'开始比较',variant:'primary'},{id:'later',label:'稍后再说',submit:false}]}
 const info={title:'后续处理步骤',description:'测试演示：同一轮中多个卡片各自保留。',facts:[{label:'第一步',value:'确认需求与比较方向'},{label:'第二步',value:'由原 Agent 继续说明结果'}]}
 const execute=input=>tool.execute(input,{agent,signal:new AbortController().signal})
 const views=[await execute(original),await execute(info)]
 const projection=views.map((view,index)=>({callId:`fixture-card-${index+1}`,view,content:tool.output.render({},view),meta:tool.output.presentationMeta({},view)}))
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-real-host-cards-'))
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React from'react';import{createRoot}from'react-dom/client';
 import{applyAgentMessageCardClient}from'./plugins/fs-platform-access/src/client/agent-message-cards.tsx';
 import{installMessageCardStyles}from'./plugins/fs-platform-access/src/client/message-card.tsx';
 import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
 const definitions=[],slots=[];const effect=fn=>fn();const snapshot={phase:'ready',activeTenantId:'fixture-tenant',user:{userId:'fixture-user'}};
 const ctx={effect,platformClientSession:{getSnapshot:()=>snapshot,subscribe:()=>()=>{}},slots:{inject:(_name,fn)=>fn(),register:(options,component)=>{slots.push({options,component});return()=>{}}},inject:(_deps,fn)=>fn({effect,uiConversation:{events:{register:definition=>{definitions.push(definition);return()=>{}}}}})};
 installMessageCardStyles(ctx);applyAgentMessageCardClient(ctx);
 for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
 window.dark=()=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.dark)};
 const data=${JSON.stringify(projection)};const definition=definitions.find(x=>x.kind==='futurestaff-agent-cards');
 let state=definition.start({}, {event:{type:'turn/start',data:{turn:1}}});let seq=1;
 for(const card of data){state=definition.update({state},{event:{type:'tool/call',seq:seq++,data:{turn:1,name:'agent_message_card',callId:card.callId}}});state=definition.update({state},{event:{type:'tool/result',seq:seq++,data:{turn:1,message:{source:{callId:card.callId},content:[{type:'tool-result',content:card.content,meta:card.meta}]}}}})}
 const location=definition.buildLocationData({state},'turn');const slot=slots.find(x=>x.options.name==='conversation.chat.turnTail'&&x.options.priority===-80);const matched=slot.options.select({turn:{data:{get:()=>location.value}},seq:100});const Tail=slot.component;
 window.setInput=(name,value)=>{const element=document.querySelector('[name="'+name+'"]');const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new Event(element instanceof HTMLSelectElement?'change':'input',{bubbles:true}))};
 createRoot(document.getElementById('root')).render(<Tail matched={matched}/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic'})
 const server=createServer((request,response)=>{
  if(request.url===route.path){requests.push(request.method);return void route.handler(request,response)}
  response.setHeader('content-type',request.url==='/app.js'?'text/javascript':'text/html;charset=utf-8')
  response.end(request.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{margin:0;padding:20px;font:14px Segoe UI;background:var(--bg-primary);color:var(--text-primary)}#root{max-width:860px;margin:auto}</style><div id="root"></div><script src="/app.js"></script></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${directory}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let portFile
  for(let i=0;i<150;i++){try{portFile=await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8');break}catch{await pause(50)}}
  assert.ok(portFile,'isolated test browser started')
  const targets=await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()
  cdp=await Cdp.connect(targets.find(target=>target.type==='page').webSocketDebuggerUrl)
  const wait=async predicate=>{for(let i=0;i<200;i++){if(await cdp.evaluate(predicate,null))return;await pause(25)}throw Error('REAL_HOST_CARD_BROWSER_TIMEOUT')}
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false})
  await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  await wait(()=>document.querySelectorAll('[data-message-card]').length===2&&!!document.querySelector('[data-agent-card-action="compare"]:not(:disabled)'))
  assert.equal(received.length,0,'projecting cards and reading live views never sends a user answer')
  assert.equal(requests.length,2,'both projected cards independently read their original Host views')
  const output=path.join(root,'output/agent-message-cards-20261026/client')
  await mkdir(output,{recursive:true})
  await writeFile(path.join(output,'real-host-cards-desktop.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.evaluate(()=>{window.setInput('brief','请比较两种方案的工作量');window.setInput('direction','detail');return true},null)
  await pause(30)
  await cdp.evaluate(()=>{const button=document.querySelector('[data-agent-card-action="compare"]');button.click();button.click();return true},null)
  await wait(()=>document.querySelector('[data-message-card]').textContent.includes('回答已返回原 Agent 会话'))
  assert.equal(received.length,1,'one actual Agent followup for a double click')
  assert.equal(foreignReceived.length,0,'the adjacent runtime never receives the card answer')
  const answer=JSON.parse(received[0].content[0].text)
  assert.equal(answer.kind,'futurestaff.card.response');assert.equal(answer.sessionId,agent.id);assert.equal(answer.viewId,views[0].viewId);assert.equal(answer.actionId,'compare')
  assert.deepEqual(answer.values,{brief:'请比较两种方案的工作量',direction:'detail'})
  assert.match(received[0].id,/^futurestaff-card-response-/)
  assert.equal((await tool.output.presentationMeta({},views[0])).snapshot.viewId,answer.viewId)
  assert.match(received[0].content[1].text,/不授予业务写权限/)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-message-card]').length,null),2,'answering one card retains the other card')
  await writeFile(path.join(output,'real-host-cards-answered.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:1100,deviceScaleFactor:1,mobile:true})
  await cdp.evaluate(()=>{window.dark();return true},null)
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true)
  await writeFile(path.join(output,'real-host-cards-narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await writeFile(path.join(output,'real-host-browser-receipt.json'),JSON.stringify({testOnly:true,loopbackOnly:true,productionClientSlots:true,productionHostRoute:true,cardsDisplayed:2,originalSessionId:agent.id,followups:received.length,foreignFollowups:foreignReceived.length,actualResponse:answer,businessOperations:0},null,2)+'\n')
 }finally{cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));for(const cleanup of cleanups.reverse())cleanup()}
})
