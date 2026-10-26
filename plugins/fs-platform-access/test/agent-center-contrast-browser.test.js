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
function rgb(color){return color.match(/[\d.]+/g).slice(0,3).map(Number)}
function ratio({color,background,canvas,opacity}){
 const blend=(front,back)=>front.map((value,index)=>Number(opacity)*value+(1-Number(opacity))*back[index])
 const luminance=values=>values.map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0)
 const foreground=luminance(blend(rgb(color),rgb(canvas))),back=luminance(blend(rgb(background),rgb(canvas)))
 return (Math.max(foreground,back)+.05)/(Math.min(foreground,back)+.05)
}

test('center button text remains readable for hover, selected, disabled and keyboard focus in both themes',{skip:!executable,timeout:30000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-center-contrast-'))
 const template=(number,name,category,compatible)=>({templateId:`10000000-0000-4000-8000-${String(number).padStart(12,'0')}`,version:'a'.repeat(64),name,description:'Fixture assistant',icon:'AI',category,capabilityBullets:[],compatible,unavailableReason:compatible?null:'当前系统材料暂不支持安装。',requiredApplications:category==='erp-system'?['erp']:[]})
 const templates=[template(1,'Project Manager','office',true),template(2,'ERP 系统助手','erp-system',false),template(3,'Private Assistant','office',true)]
 const installed={...templates[2],presetId:'fixture-installed',path:'/fixture/workspace'}
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React from'react';import{createRoot}from'react-dom/client';import{createAgentCenter}from'./plugins/fs-platform-access/src/client/agent-center.tsx';import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
 const snapshot={phase:'ready',activeTenantId:'tenant',user:{userId:'member'},applications:[{appId:'erp',tenantId:'tenant',capabilities:['erp.read']}]};const controller={getSnapshot:()=>snapshot,subscribe:()=>()=>{}};
 window.theme=mode=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value[mode]);document.body.style.background='var(--bg-primary)'};window.theme('light');
 const Center=createAgentCenter(controller,()=>{});createRoot(document.getElementById('root')).render(<Center/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic',platform:'browser'})
 const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':req.url.startsWith('/_futurestaff/')?'application/json':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:req.url==='/_futurestaff/agent-market/catalog'?JSON.stringify({items:templates}):req.url==='/_futurestaff/agent-market/mine'?JSON.stringify({items:[installed]}):req.url.startsWith('/_futurestaff/')?JSON.stringify({items:[]}):'<html><body style="margin:0;font-family:Segoe UI"><div id="root" style="height:100vh"></div><script src="/app.js"></script></body></html>')})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${directory}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let port;for(let attempt=0;attempt<100;attempt++){try{port=(await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await pause(50)}}assert.ok(port)
  const target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item=>item.type==='page');cdp=await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.call('DOM.enable');await cdp.call('CSS.enable');await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  for(let attempt=0;attempt<120;attempt++){if(await cdp.evaluate(()=>document.querySelectorAll('[data-template-id]').length===3&&!document.querySelector('[role=status]'),null))break;await pause(30)}
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-template-id]').length,null),3)
  const output=path.join(root,'output/agent-center-contrast-20261022',process.env.FUTURESTAFF_CONTRAST_PHASE??'green');await mkdir(output,{recursive:true})
  const observations=[],failures=[]
  const force=async(selector,pseudo)=>{const document=await cdp.call('DOM.getDocument',{depth:0}),{nodeId}=await cdp.call('DOM.querySelector',{nodeId:document.root.nodeId,selector});assert.ok(nodeId,selector);await cdp.call('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:pseudo})}
  const check=async(mode,label,selector,pseudo=[])=>{
   await force(selector,pseudo)
   const style=await cdp.evaluate(selector=>{const element=document.querySelector(selector),style=getComputedStyle(element);let ancestor=element.parentElement;while(ancestor&&getComputedStyle(ancestor).backgroundColor==='rgba(0, 0, 0, 0)')ancestor=ancestor.parentElement;return{color:style.color,background:style.backgroundColor,canvas:getComputedStyle(ancestor||document.body).backgroundColor,opacity:style.opacity,pressed:element.getAttribute('aria-pressed'),disabled:element.disabled,outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth)}},selector)
   if(label.includes('selected'))assert.equal(style.pressed,'true',`${mode} ${label} is selected`)
   if(label.startsWith('disabled'))assert.equal(style.disabled,true,`${mode} ${label} is disabled`)
   const contrast=ratio(style);observations.push({mode,label,pseudo,...style,contrast})
   if(contrast<4.5)failures.push({mode,label,pseudo,contrast:Number(contrast.toFixed(2)),color:style.color,background:style.background,opacity:style.opacity})
   if(pseudo.includes('focus-visible'))assert.ok(style.outline!=='none'&&style.outlineWidth>=2,`${mode} ${label} has visible keyboard focus`)
   await force(selector,[])
  }
  for(const mode of ['light','dark']){
   await cdp.evaluate(mode=>{window.theme(mode);return true},mode)
   for(const navigation of ['助手分类','安装状态']){
    for(let index=1;index<=3;index++){
     const selector=`nav[aria-label="${navigation}"] button:nth-of-type(${index})`
     await cdp.evaluate(selector=>{document.querySelector(selector).click();return true},selector)
     await check(mode,`${navigation} ${index} selected`,selector)
     await check(mode,`${navigation} ${index} selected hover`,selector,['hover'])
     await check(mode,`${navigation} ${index} selected focus`,selector,['focus-visible'])
    }
    await cdp.evaluate(navigation=>{document.querySelector('nav[aria-label="'+navigation+'"] button').click();return true},navigation)
   }
   const primary=`[data-template-id="${templates[0].templateId}"] .fs-agent-primary`,disabled=`[data-template-id="${templates[1].templateId}"] button:disabled`,secondary=`[data-template-id="${templates[2].templateId}"] button`
   for(const[label,selector]of[['primary',primary],['secondary',secondary]]){await check(mode,label,selector);await check(mode,label+' hover',selector,['hover']);await check(mode,label+' focus',selector,['focus-visible'])}
   await check(mode,'disabled primary',disabled);await check(mode,'disabled primary hover',disabled,['hover'])
   await cdp.evaluate(selector=>{document.querySelector(selector).disabled=true;return true},secondary);await check(mode,'disabled secondary',secondary);await check(mode,'disabled secondary hover',secondary,['hover']);await cdp.evaluate(selector=>{document.querySelector(selector).disabled=false;return true},secondary)
   await force(disabled,['hover']);await writeFile(path.join(output,`${mode}-1440.png`),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'));await force(disabled,[])
  }
  await cdp.evaluate(()=>{window.theme('light');return true},null);await cdp.call('Emulation.setDeviceMetricsOverride',{width:520,height:1000,deviceScaleFactor:1,mobile:false})
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true)
  await writeFile(path.join(output,'light-520.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await writeFile(path.join(output,'states.json'),JSON.stringify({observations,failures},null,2))
  assert.deepEqual(failures,[],'Every center button state keeps text contrast >= 4.5:1, including disabled labels')
 }finally{if(cdp)await cdp.call('Browser.close').catch(()=>{});cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
