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
function contrast(foreground,background){
 const luminance=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(channel=>channel/255).map(channel=>channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4).reduce((sum,channel,index)=>sum+channel*[0.2126,0.7152,0.0722][index],0)
 const a=luminance(foreground),b=luminance(background)
 return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)
}

test('shared message cards isolate action state, prevent implicit submit and preserve accessible narrow/dark results', {skip:!executable,timeout:30000}, async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-message-cards-'))
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
  import React,{useState}from'react';import{createRoot}from'react-dom/client';
  import{MessageCard,MessageCardAction,MessageCardNotice,installMessageCardStyles}from'./plugins/fs-platform-access/src/client/message-card.tsx';
  import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
  const disposers=[];installMessageCardStyles({effect:register=>{const dispose=register();if(typeof dispose==='function')disposers.push(dispose)}});
  window.counts={action:0,submit:0,cancel:0};
  window.dark=()=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.dark)};
  for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
  function App(){const[status,setStatus]=useState('pending');window.setStatus=setStatus;window.disposeStyles=()=>disposers.forEach(fn=>fn());
   return <form onSubmit={event=>{event.preventDefault();window.counts.submit++}}>
    <MessageCard title="待核对的销售草稿" eyebrow="ERP" status={status} description="确认前请核对，历史内容不会自动执行。" actions={<>
     <MessageCardAction id="modify" onClick={()=>window.counts.action++}>返回修改</MessageCardAction>
     <MessageCardAction id="confirm" variant="primary" onClick={()=>window.counts.action++}>确认创建草稿</MessageCardAction>
     <MessageCardAction id="stop" allowWhileBusy onClick={()=>window.counts.cancel++}>停止等待</MessageCardAction>
    </>} footer={<MessageCardNotice kind="info">示例草稿，尚未正式提交。</MessageCardNotice>}>
     <p>{'<script>window.unsafe=true</script>'}</p><p>客户：示例客户，数量：10，金额：1,290.00</p>
    </MessageCard>
    <MessageCard title="另一个 Agent 的查询结果" status="ready" actions={<MessageCardAction id="independent" onClick={()=>window.counts.action++}>查看详情</MessageCardAction>}><p>这张卡片独立可用。</p></MessageCard>
   </form>}
  createRoot(document.getElementById('root')).render(<App/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic'})
 const server=createServer((request,response)=>{
  response.setHeader('content-type',request.url==='/app.js'?'text/javascript':'text/html;charset=utf-8')
  response.end(request.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{margin:0;padding:20px;font:14px Segoe UI;background:var(--bg-primary);color:var(--text-primary)}form{max-width:900px;margin:auto}</style><div id="root"></div><script src="/app.js"></script></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${directory}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let portFile
  for(let i=0;i<100;i++){try{portFile=await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8');break}catch{await pause(50)}}
  assert.ok(portFile,'isolated browser started')
  const targets=await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()
  cdp=await Cdp.connect(targets.find(target=>target.type==='page').webSocketDebuggerUrl)
  const waitFor=async predicate=>{for(let i=0;i<120;i++){if(await cdp.evaluate(predicate,null))return;await pause(25)}throw Error('MESSAGE_CARD_TIMEOUT')}
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false})
  await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`})
  await waitFor(()=>document.querySelectorAll('[data-message-card]').length===2)
  assert.deepEqual(await cdp.evaluate(()=>window.counts,null),{action:0,submit:0,cancel:0},'rendering never executes an action')
  assert.equal(await cdp.evaluate(()=>!!window.unsafe,null),false)
  assert.match(await cdp.evaluate(()=>document.querySelector('[data-message-card]').textContent,null),/待确认/)
  let primary=await cdp.evaluate(()=>{const s=getComputedStyle(document.querySelector('#confirm'));return {color:s.color,background:s.backgroundColor}},null)
  assert.ok(contrast(primary.color,primary.background)>=4.5,'light primary action has readable normal text')
  await cdp.evaluate(()=>{document.querySelector('#confirm').click();window.setStatus('running');return true},null)
  await waitFor(()=>document.querySelector('#confirm').disabled)
  assert.deepEqual(await cdp.evaluate(()=>window.counts,null),{action:1,submit:0,cancel:0},'default action never submits its surrounding form')
  assert.equal(await cdp.evaluate(()=>document.querySelector('#modify').disabled&&!document.querySelector('#independent').disabled&&!document.querySelector('#stop').disabled,null),true)
  assert.equal(await cdp.evaluate(()=>document.querySelector('[data-message-card]').getAttribute('aria-busy'),null),'true')
  await cdp.evaluate(()=>{document.querySelector('#confirm').click();document.querySelector('#independent').click();document.querySelector('#stop').click();return true},null)
  assert.deepEqual(await cdp.evaluate(()=>window.counts,null),{action:2,submit:0,cancel:1},'busy state is scoped to one card')
  await cdp.evaluate(()=>{window.setStatus('unconfirmed');return true},null)
  await waitFor(()=>document.querySelector('[data-message-card]').textContent.includes('结果待核实'))
  await cdp.evaluate(()=>{window.setStatus('expired');return true},null)
  await waitFor(()=>document.querySelector('[data-message-card]').textContent.includes('已过期'))
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  await cdp.evaluate(()=>{window.dark();document.querySelector('#independent').focus();return true},null)
  primary=await cdp.evaluate(()=>{const s=getComputedStyle(document.querySelector('#confirm'));return {color:s.color,background:s.backgroundColor}},null)
  assert.ok(contrast(primary.color,primary.background)>=4.5,'dark primary action has readable normal text')
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true)
  assert.equal(await cdp.evaluate(()=>document.activeElement.id,null),'independent')
  const output=path.join(root,'output/interactive-message-cards-20261025/implementation')
  await mkdir(output,{recursive:true})
  await writeFile(path.join(output,'shared-narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false})
  await cdp.evaluate(()=>{window.setStatus('succeeded');return true},null)
  await waitFor(()=>document.querySelector('[data-message-card]').textContent.includes('已完成'))
  const styles=await cdp.evaluate(()=>document.querySelectorAll('style[data-futurestaff-message-cards]').length,null)
  assert.equal(styles,1)
  await cdp.evaluate(()=>{window.disposeStyles();return true},null)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('style[data-futurestaff-message-cards]').length,null),0,'plugin disposal removes shared styling')
 }finally{
  cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
 }
})
