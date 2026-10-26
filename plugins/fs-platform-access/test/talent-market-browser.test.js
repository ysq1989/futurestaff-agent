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
test('Home displays the template directory, installs locally and opens exact Host sessions while Picker stays installed-only',{skip:!executable,timeout:35000},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fs-local-talent-ui-')),requests=[]
 const template=(n,name,category)=>({templateId:`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,version:'a'.repeat(64),name,description:'Platform talent',icon:'AI',category,capabilityBullets:[],compatible:category!=='erp-system',unavailableReason:category==='erp-system'?'需要平台专有工具':null,requiredApplications:category==='erp-system'?['erp']:[]})
 const templates=[template(1,'Private Assistant','personal'),template(2,'Frontend Developer','engineering'),template(3,'ERP 库存助理','erp-system')]
 let installed={...templates[0],presetId:'fs-'+templates[0].templateId+'-'+templates[0].version,path:'/fixture/local-role/workspace'}
 let enabled=false,failInstall=true,slowOpen=false,slowInstall=false,sessionNumber=0,orphan=false
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';import{createAgentCenter}from'./plugins/fs-platform-access/src/client/agent-center.tsx';import{createAgentHome,createAgentPicker}from'./plugins/fs-platform-access/src/client/agents.tsx';import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
 const listeners=new Set();const apps=[{appId:'erp',tenantId:'tenant',capabilities:['erp.read']},{appId:'vietnam_immigration',tenantId:'tenant',capabilities:['visa.read']}];let state={phase:'ready',activeTenantId:'tenant',user:{userId:'member'},applications:apps};const controller={getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};window.apps=apps;window.setApplications=applications=>{state={...state,applications};listeners.forEach(fn=>fn())};
 window.theme=mode=>{for(const[k,v]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(k,v[mode])};window.theme('light');window.logout=()=>{state={phase:'signed_out',applications:[]};listeners.forEach(fn=>fn())};window.opened=[];window.changedEvents=0;window.addEventListener('futurestaff:installed-talents-changed',()=>window.changedEvents++);
 const openSession=id=>{window.closedBeforeOpen=window.settingsClosed===true;window.opened.push(id)},Center=createAgentCenter(controller,()=>{throw Error('Generic chooser must not replace exact session')},openSession),Home=createAgentHome(controller,undefined,openSession),Picker=createAgentPicker(controller,undefined,openSession);
 const forbidden=()=>{throw Error('Must not create another workspace/session')};function Choose(){const[open,setOpen]=useState(true);return <Picker open={open} onClose={()=>setOpen(false)} onPick={forbidden} createWorkspace={forbidden}/>}
 const root=createRoot(document.getElementById('root'));window.showCenter=()=>root.render(<React.StrictMode><Center embedded beforeNewSession={()=>{window.settingsClosed=true}}/></React.StrictMode>);window.showHome=()=>root.render(<Home createWorkspace={forbidden} onPick={forbidden}/>);window.showPicker=()=>root.render(<Choose/>);window.showCenter();
 `},bundle:true,write:false,format:'iife',jsx:'automatic',platform:'browser'})
 const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/_futurestaff/')){
   let body='';for await(const chunk of req)body+=chunk
   requests.push({path:req.url,method:req.method,body:body?JSON.parse(body):null,authorization:req.headers.authorization,market:req.headers['x-futurestaff-market']})
   res.setHeader('content-type','application/json')
   if(req.url==='/_futurestaff/agent-market/catalog')return res.end(JSON.stringify({items:templates}))
   if(req.url==='/_futurestaff/agent-market/mine')return res.end(JSON.stringify({items:enabled?[installed,...(orphan?[{...installed,templateId:'10000000-0000-4000-8000-000000000099',presetId:'retired-preset',name:'Retired talent'}]:[])]:[]}))
   if(req.url==='/_futurestaff/agent-market/install'){if(failInstall){res.statusCode=409;return res.end('{}')}if(slowInstall)await pause(400);installed={...installed,...templates[0],presetId:'fs-'+templates[0].templateId+'-'+templates[0].version};enabled=true;return res.end(JSON.stringify({presetId:installed.presetId}))}
   if(req.url==='/_futurestaff/agent-market/uninstall'){enabled=false;return res.end(JSON.stringify({ok:true}))}
   if(req.url==='/_futurestaff/agent-market/open'){if(slowOpen)await pause(400);return res.end(JSON.stringify({...installed,sessionId:'host-session-'+(++sessionNumber)}))}
   if(req.url==='/_futurestaff/agents/catalog')return res.end(JSON.stringify({items:Array.from({length:9},(_,n)=>({agentId:'platform-'+n,name:'未安装平台人才'+n,description:'不能自动显示',available:true,unavailableReason:null,path:'/platform/'+n})),dataDirectory:'/fixture'}))
   if(req.url==='/_futurestaff/agents/distribution')return res.end(JSON.stringify({items:[],dataDirectory:'/fixture'}))
   res.statusCode=404;return res.end('{}')
  }
  res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<html><body style="margin:0;font-family:Segoe UI;height:100vh"><div id="root" style="height:100vh"></div><script src="/app.js"></script></body></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${dir}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let port;for(let i=0;i<100;i++){try{port=(await readFile(path.join(dir,'browser/DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await pause(50)}}assert.ok(port)
  const target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item=>item.type==='page');cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  const wait=async fn=>{for(let i=0;i<120;i++){if(await cdp.evaluate(fn,null))return;await pause(30)}throw Error('Local talent UI did not settle: '+String(fn))}
  const click=async text=>{await cdp.evaluate(text=>{const button=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text||el.textContent.startsWith(text+' ·'));if(!button||button.disabled)throw Error('Button unavailable: '+text);button.click();return true},text)}
  await wait(()=>!!document.querySelector('[data-agent-center-root]'))
  assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='发布包管理'),null),false)
  assert.deepEqual(await cdp.evaluate(()=>[...document.querySelectorAll('[aria-label="助手分类"] button')].map(el=>el.textContent),null),['全部助手','系统助手','通用助手'])
  await wait(()=>document.querySelectorAll('[data-template-id]').length===3)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-template-id]').length,null),3)
  await cdp.evaluate(()=>{window.setApplications([]);return true},null)
  await wait(()=>document.querySelectorAll('[data-template-id]').length===2)
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('ERP 库存助理'),null),false,'same-member application revocation hides the system assistant')
  await cdp.evaluate(()=>{window.setApplications([{appId:'erp',tenantId:'other',capabilities:['erp.read']}]);return true},null)
  await wait(()=>!document.querySelector('[role=status]'));assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-template-id]').length,null),2)
  await cdp.evaluate(()=>{window.setApplications(window.apps);return true},null);await wait(()=>document.querySelectorAll('[data-template-id]').length===3)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('a').length,null),0)
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('聘用')||document.body.textContent.includes('在平台创建'),null),false)
  await cdp.evaluate(()=>{window.showHome();return true},null);await wait(()=>document.querySelectorAll('.fs-agent-home [data-template-id]').length===3&&!document.querySelector('[role=status]'))
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-home [data-preset-id]').length,null),0,'Home shows uninstalled templates immediately')
  assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('.fs-agent-home [data-template-id] button')].some(button=>button.textContent==='开始对话'),null),false,'uninstalled Home cards offer installation without starting a session')
  await click('下载并安装');await wait(()=>!!document.querySelector('[role=alert]'));assert.equal(enabled,false)
  failInstall=false;await click('下载并安装');await wait(()=>!!document.querySelector('[data-preset-id]')||[...document.querySelectorAll('button')].some(el=>el.textContent==='开始对话'))
  const installRequest=requests.findLast(row=>row.path.endsWith('/install'));assert.deepEqual(installRequest.body,{templateId:templates[0].templateId,version:templates[0].version});assert.equal(installRequest.market,'1')
  assert.equal(await cdp.evaluate(()=>window.opened.length,null),0,'installing from Home does not silently create a session')
  await cdp.evaluate(()=>{window.showCenter();return true},null);await wait(()=>document.querySelectorAll('[data-template-id]').length===3&&!document.querySelector('[role=status]'))
  orphan=true;await click('检查更新');await wait(()=>!document.querySelector('[data-agent-center-root] [role=status]'))
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-template-id]').length,null),3,'retired installations missing from the current catalog never re-enter the center')
  templates[0].version='b'.repeat(64);await click('检查更新');await wait(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='可更新 · 1'))
  await click('可更新');await wait(()=>document.querySelectorAll('[data-template-id]').length===1);await click('更新安装')
  await wait(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='可更新 · 0'));assert.equal(installed.version,'b'.repeat(64))
  await click('已安装');await wait(()=>document.querySelectorAll('[data-preset-id]').length===1)
  await click('开始对话');await wait(()=>window.opened.length===1)
  assert.deepEqual(await cdp.evaluate(()=>({opened:window.opened,closed:window.closedBeforeOpen}),null),{opened:['host-session-1'],closed:true})
  await click('全部');await click('系统助手');await wait(()=>document.querySelectorAll('[data-template-id]').length===1)
  assert.match(await cdp.evaluate(()=>document.querySelector('[data-template-id]').textContent,null),/需要平台专有工具/)
  assert.equal(await cdp.evaluate(()=>document.querySelector('[data-template-id] button').disabled,null),true)
  await cdp.evaluate(()=>{window.showHome();return true},null);await wait(()=>document.querySelectorAll('.fs-agent-home [data-preset-id]').length===1)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-home [data-template-id]').length,null),3,'installed and uninstalled templates share the new-conversation directory')
  assert.match(await cdp.evaluate(()=>document.querySelector('.fs-agent-home [data-preset-id]').textContent,null),/私人助理/)
  await cdp.evaluate(()=>{[...document.querySelector('.fs-agent-home [data-preset-id]').querySelectorAll('button')].find(button=>button.textContent==='开始对话').click();return true},null);await wait(()=>window.opened.length===2)
  await cdp.evaluate(()=>{window.showPicker();return true},null);await wait(()=>document.querySelectorAll('.fs-agent-choice').length===1)
  await cdp.evaluate(()=>{document.querySelector('.fs-agent-choice').click();return true},null);await wait(()=>window.opened.length===3)
  assert.deepEqual(await cdp.evaluate(()=>window.opened,null),['host-session-1','host-session-2','host-session-3'])
  await cdp.evaluate(()=>{window.showCenter();return true},null);await wait(()=>document.querySelectorAll('[data-template-id]').length===3);await click('已安装');await wait(()=>document.querySelectorAll('[data-preset-id]').length===1)
  const out=path.join(root,'output/system-assistant-access-20261023/market');await mkdir(out,{recursive:true})
  for(const[mode,width]of[['light',1440],['dark',1440],['light',520]]){await cdp.evaluate(mode=>{window.theme(mode);return true},mode);await cdp.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(80);assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true);await writeFile(path.join(out,`${mode}-${width}.png`),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))}
  await click('全部');await click('卸载');await click('确认卸载');await wait(()=>document.querySelectorAll('[data-preset-id]').length===0)
  await click('下载并安装');await wait(()=>document.querySelectorAll('[data-preset-id]').length===1)
  assert.equal(await cdp.evaluate(()=>!!document.querySelector('.fs-agent-confirm'),null),false,'Reinstalling a template must not restore a completed uninstall confirmation')
  await click('卸载');await click('确认卸载');await wait(()=>document.querySelectorAll('[data-preset-id]').length===0)
  await cdp.evaluate(()=>{window.showHome();return true},null);await wait(()=>document.querySelectorAll('.fs-agent-home [data-template-id]').length===3&&!document.querySelector('[role=status]'));assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-home [data-preset-id]').length,null),0,'uninstall keeps the Home directory available for reinstall')
  templates[0].requiredApplications=['erp'];installed={...installed,requiredApplications:['erp']};slowInstall=true
  await cdp.evaluate(()=>{window.showCenter();return true},null);await wait(()=>document.querySelectorAll('[data-template-id]').length===3)
  await click('下载并安装');await cdp.evaluate(()=>{window.changedEvents=0;window.setApplications([]);return true},null);await pause(500)
  assert.equal(await cdp.evaluate(()=>window.changedEvents,null),0,'a late install response cannot publish state into a same-owner replacement authorization')
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-template-id]').length,null),1)
  await cdp.evaluate(()=>{window.setApplications(window.apps);return true},null)
  enabled=true;slowOpen=true;await cdp.evaluate(()=>{window.showHome();return true},null);await wait(()=>document.querySelectorAll('.fs-agent-home [data-preset-id]').length===1)
  await cdp.evaluate(()=>{[...document.querySelector('.fs-agent-home [data-preset-id]').querySelectorAll('button')].find(button=>button.textContent==='开始对话').click();window.setApplications([]);return true},null);await pause(500)
  assert.equal(await cdp.evaluate(()=>window.opened.length,null),3,'same-owner applications changes cancel a late native-session response')
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-home [data-preset-id]').length,null),0,'revoked installed system talents are hidden from Home')
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-home [data-template-id]').length,null),1,'revocation leaves unrelated general templates available')
  await cdp.evaluate(()=>{window.setApplications(window.apps);window.showPicker();return true},null);await wait(()=>document.querySelectorAll('.fs-agent-choice').length===1)
  await cdp.evaluate(()=>{document.querySelector('.fs-agent-choice').click();window.setApplications([]);return true},null);await pause(500)
  assert.equal(await cdp.evaluate(()=>window.opened.length,null),3)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-choice').length,null),0,'revoked installed system talents are hidden from Picker')
  for(const[appId,allowed,denied]of[['web','web.manage','web.access'],['agent','agent.admin','agent.read']]){
   templates[0].requiredApplications=[appId];installed={...installed,requiredApplications:[appId]}
   await cdp.evaluate(({appId,allowed})=>{window.setApplications([{appId,tenantId:'tenant',capabilities:[allowed]}]);window.showCenter();return true},{appId,allowed})
   await wait(()=>!!document.querySelector('[data-preset-id]')&&!document.querySelector('[role=status]'))
   await click('开始对话');await cdp.evaluate(({appId,denied})=>{window.setApplications([{appId,tenantId:'tenant',capabilities:[denied]}]);return true},{appId,denied});await pause(500)
   assert.equal(await cdp.evaluate(()=>window.opened.length,null),3,appId+' capability downgrade cancels a late center open')
   assert.equal(await cdp.evaluate(id=>!!document.querySelector('[data-template-id="'+id+'"]'),templates[0].templateId),false,appId+' access-only grants hide the installed center card')
   for(const surface of ['showHome','showPicker']){
    await cdp.evaluate(surface=>{window[surface]();return true},surface);await wait(()=>!!document.querySelector('.fs-agent-home,[role=dialog]'))
    assert.equal(await cdp.evaluate(surface=>document.querySelectorAll(surface==='showHome'?'.fs-agent-home [data-preset-id]':'[role=dialog] .fs-agent-choice').length,surface),0,appId+' access-only grants hide installed choices in '+surface)
    if(surface==='showHome')assert.equal(await cdp.evaluate(id=>!!document.querySelector('.fs-agent-home [data-template-id="'+id+'"]'),templates[0].templateId),false,appId+' access-only grants hide the uninstalled Home projection too')
   }
   await cdp.evaluate(({appId,allowed})=>{window.setApplications([{appId,tenantId:'tenant',capabilities:[allowed]}]);window.showPicker();return true},{appId,allowed})
   await wait(()=>document.querySelectorAll('.fs-agent-choice').length===1)
   await cdp.evaluate(({appId,denied})=>{document.querySelector('.fs-agent-choice').click();window.setApplications([{appId,tenantId:'tenant',capabilities:[denied]}]);return true},{appId,denied});await pause(500)
   assert.equal(await cdp.evaluate(()=>window.opened.length,null),3,appId+' capability downgrade cancels a late picker open')
  }
  templates[0].requiredApplications=['erp'];installed={...installed,requiredApplications:['erp']}
  await cdp.evaluate(()=>{window.setApplications(window.apps);return true},null)
  enabled=true;slowOpen=true;await cdp.evaluate(()=>{window.showPicker();return true},null);await wait(()=>document.querySelectorAll('.fs-agent-choice').length===1);await cdp.evaluate(()=>{document.querySelector('.fs-agent-choice').click();window.logout();return true},null);await pause(500)
  assert.equal(await cdp.evaluate(()=>window.opened.length,null),3)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-choice').length,null),0)
  assert.equal(requests.some(row=>row.path.includes('environment')||row.path==='/_futurestaff/agents/select'),false)
  assert.ok(requests.every(row=>row.authorization===undefined))
 }finally{if(cdp)await cdp.call('Browser.close').catch(()=>{});cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
