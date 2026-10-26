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
const output=process.env.FUTURESTAFF_GOVERNANCE_TASK_TEST_OUTPUT??path.join(root,'output/governance-task-events-20261025/ui')
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))

test('isolated current-task events create merged local suggestions without replay, identity leaks or network',{skip:!executable,timeout:60000},async()=>{
 await mkdir(output,{recursive:true})
 await writeFile(path.join(output,'ui-result.json'),JSON.stringify({status:'running',synthetic:true})+'\n')
 const directory=await mkdtemp(path.join(os.tmpdir(),'fs-governance-task-browser-'))
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:
  "import React from'react';import{createRoot}from'react-dom/client';"+
  "import{CandidateWorkbench}from'./plugins/fs-platform-access/src/client/governance-candidates.tsx';"+
  "import{createSyntheticTaskCandidateController}from'./plugins/fs-platform-access/src/governance-task-events.ts';"+
  "import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';"+
  "import{messageCardCss}from'./plugins/fs-platform-access/src/client/message-card.tsx';"+
  "const style=document.createElement('style');style.textContent=messageCardCss;document.head.append(style);"+
  "for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);"+
  "window.dark=()=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.dark)};"+
  "window.fetchCalls=0;window.fetch=async()=>{window.fetchCalls++;throw Error('NETWORK_DISABLED_IN_SYNTHETIC_TASK')};"+
  "const root=createRoot(document.getElementById('root'));let owner={tenantId:'task-tenant',actorId:'task-member'},sessionId='task-session',taskId='task-1',turn=1,authorizationVersion='fixture-auth-v1',seq=1;"+
  "let source;window.mountDefault=()=>root.render(<CandidateWorkbench owner={owner} sessionId={sessionId} storage={localStorage}/>);"+
  "const binding=()=>({owner,sessionId,taskId,turn,authorizationVersion,firstLiveSeq:seq});"+
  "window.start=async(next={})=>{owner=next.owner??owner;sessionId=next.sessionId??sessionId;taskId=next.taskId??taskId;turn=next.turn??turn;source=createSyntheticTaskCandidateController(binding());window.taskSource=source;root.render(<CandidateWorkbench owner={owner} sessionId={sessionId} storage={localStorage} taskSource={source}/>);return true};"+
  "window.feed=async(kind,text)=>{const current=seq++;const base={seq:current,eventId:'fixture-event-'+current,version:String(current),turn};const event=kind==='assistant_question'?{...base,type:'assistant_message',text,interrupted:false}:{...base,type:'user_statement',source:'user',text};window.lastTaskEvent=event;await source.accept(event);return true};"+
  "window.repeat=async()=>{await source.accept(window.lastTaskEvent);return true};"+
  "window.complete=async()=>{const current=seq++;await source.accept({seq:current,eventId:'fixture-end-'+current,version:String(current),turn,type:'task_end',outcome:'completed'});await source.end();await source.flush();return true};"+
  "window.cancelTask=async()=>{source.cancel();return true};window.revokeTask=async()=>{source.revoke();return true};"+
  "window.rebind=async(next={})=>{owner=next.owner??owner;sessionId=next.sessionId??sessionId;taskId=next.taskId??taskId;turn=next.turn??turn;source.setBinding(binding());root.render(<CandidateWorkbench owner={owner} sessionId={sessionId} storage={localStorage} taskSource={source}/>);return true};"+
  "window.viewOnly=next=>{root.render(<CandidateWorkbench owner={next.owner??owner} sessionId={next.sessionId??sessionId} storage={localStorage} taskSource={source}/>);return true};"+
  "window.storageSnapshot=()=>JSON.stringify(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]));window.mountDefault();"
 },bundle:true,write:false,format:'iife',jsx:'automatic'})
 const server=createServer((request,response)=>{
  response.setHeader('content-type',request.url==='/app.js'?'text/javascript':'text/html;charset=utf-8')
  response.end(request.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{margin:0 auto;max-width:980px;padding:20px;font:14px Segoe UI;background:var(--bg-primary);color:var(--text-primary)}</style><div id="root"></div><script src="/app.js"></script></html>')
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+directory+'/browser','about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let port
  for(let i=0;i<100;i++){try{port=(await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await pause(50)}}
  assert.ok(port,'synthetic task uses a fresh browser profile')
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()
  cdp=await Cdp.connect(targets.find(target=>target.type==='page').webSocketDebuggerUrl)
  const waitFor=async predicate=>{for(let i=0;i<150;i++){if(await cdp.evaluate(predicate,null))return;await pause(25)}throw Error('TASK_CANDIDATE_UI_TIMEOUT: '+await cdp.evaluate(()=>document.body.textContent,null))}
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1100,height:1200,deviceScaleFactor:1,mobile:false})
  await cdp.call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port})
  await waitFor(()=>document.body.textContent.includes('当前任务建议未开启，可信事件桥未连接。'))
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-governance-domain]').length,null),0)
  assert.equal(await cdp.evaluate(()=>window.fetchCalls,null),0)
  assert.equal(await cdp.evaluate(()=>localStorage.length,null),0)

  await cdp.evaluate(()=>window.start({taskId:'one-time-ratio-preference',turn:1}),null)
  await waitFor(()=>document.querySelector('[data-task-suggestions-status]')?.dataset.taskSuggestionsStatus==='listening')
  await cdp.evaluate(()=>window.feed('assistant_question','海报需要什么比例？'),null)
  await cdp.evaluate(()=>window.feed('user_message','2:3 就行。'),null)
  await cdp.evaluate(()=>window.feed('user_message','希望这次海报做成2:3就行。'),null)
  await cdp.evaluate(()=>window.complete(),null)
  await waitFor(()=>document.querySelector('[data-task-suggestions-status]')?.dataset.taskSuggestionsStatus==='ready')
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-governance-domain]').length,null),0,'a one-time task preference is neither a system requirement nor enterprise knowledge')
  assert.equal(await cdp.evaluate(()=>window.taskSource.getSnapshot().candidates.length,null),0)
  assert.equal(await cdp.evaluate(()=>localStorage.length,null),0,'one-time size selection does not persist anything')

  await cdp.evaluate(()=>window.start({taskId:'unsupported-ratio-request',turn:2}),null)
  await cdp.evaluate(()=>window.feed('user_message','实际：图片制作无法生成2:3，入口没有对应比例选项。'),null)
  await cdp.evaluate(()=>window.complete(),null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===1)
  assert.equal(await cdp.evaluate(()=>document.querySelector('[data-governance-domain]').dataset.governanceDomain,null),'platform_product_feedback','reported inability remains a feedback request')
  const reportedFeedback=await cdp.evaluate(()=>window.taskSource.getSnapshot().candidates[0],null)
  assert.ok(['reported','unverified'].includes(reportedFeedback.draft.verification),'reported behavior is not independently verified')
  assert.ok(reportedFeedback.draft.content.includes('无法生成2:3'))
  assert.ok((await cdp.evaluate(()=>document.querySelector('[data-governance-domain]').textContent,null)).includes('不直接判为缺陷'))
  assert.equal(await cdp.evaluate(()=>localStorage.length,null),0)

  await cdp.evaluate(()=>window.start({taskId:'explicit-feedback-and-company-standard',turn:3}),null)
  await waitFor(()=>document.querySelector('[data-task-suggestions-status]')?.dataset.taskSuggestionsStatus==='listening')
  await cdp.evaluate(()=>{const details=document.querySelector('details');if(!details.open)document.querySelector('summary').click();return true},null)
  await cdp.evaluate(()=>window.feed('user_message','实际：图片制作没有比例选项。'),null)
  await cdp.evaluate(()=>window.feed('assistant_question','这张海报需要什么比例？'),null)
  await cdp.evaluate(()=>window.feed('user_message','2:3就行。'),null)
  await cdp.evaluate(()=>window.feed('user_message','更正：我们公司的长期品牌标准规定，正式物料必须经过双人复核。'),null)
  await cdp.evaluate(()=>window.feed('user_message','希望图片制作支持这个比例。'),null)
  await cdp.evaluate(()=>window.feed('user_message','还是没有对应比例选项，找起来很麻烦。<script>window.unsafe=true</script>'),null)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-governance-domain]').length,null),0,'individual messages do not interrupt with cards')
  assert.equal(await cdp.evaluate(()=>localStorage.length,null),0,'task observation alone never persists candidates')
  await cdp.evaluate(()=>window.complete(),null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===2)
  const domains=await cdp.evaluate(()=>[...document.querySelectorAll('[data-governance-domain]')].map(card=>card.dataset.governanceDomain).sort(),null)
  assert.deepEqual(domains,['enterprise_knowledge','platform_product_feedback'],'task end coalesces into at most one candidate per domain')
  const knowledgeText=await cdp.evaluate(()=>document.querySelector('[data-governance-domain=enterprise_knowledge]').textContent,null)
  const feedbackText=await cdp.evaluate(()=>document.querySelector('[data-governance-domain=platform_product_feedback]').textContent,null)
  assert.ok(knowledgeText.includes('双人复核'))
  assert.ok(feedbackText.includes('2:3'))
  assert.ok(feedbackText.includes('规则摘要'),'short answers are presented as deterministic summaries')
  assert.match(feedbackText,/未核实|未经独立核实|待核对/)
  assert.doesNotMatch(feedbackText,/AI能力|AI 能力|智能分析已验证/)
  const taskFeedback=await cdp.evaluate(()=>window.taskSource.getSnapshot().candidates.find(item=>item.draft.domain==='platform_product_feedback'),null)
  assert.equal(taskFeedback.origin,'rule_summary')
  assert.equal(taskFeedback.draft.basis,'rule_summary')
  assert.equal(taskFeedback.draft.verification,'unverified','rule summaries never become verified facts')
  assert.ok(taskFeedback.draft.evidence.every(item=>!item.excerpt.includes('这张海报需要什么比例')),'assistant clarification does not become user evidence')
  assert.ok(taskFeedback.draft.evidence.some(item=>item.excerpt.includes('图片制作没有比例选项')),'short answer keeps the preceding explicit feedback as a necessary source')
  assert.ok(taskFeedback.draft.evidence.some(item=>item.excerpt.includes('2:3')),'short answer remains a necessary user source')
  assert.ok(taskFeedback.draft.evidence.every(item=>!item.excerpt.includes('长期品牌标准')&&!item.excerpt.includes('双人复核')),'feedback evidence excludes enterprise-domain facts')
  const taskKnowledge=await cdp.evaluate(()=>window.taskSource.getSnapshot().candidates.find(item=>item.draft.domain==='enterprise_knowledge'),null)
  assert.ok(taskKnowledge.draft.content.includes('长期品牌标准'),'an explicit long-term company standard may become knowledge')
  assert.ok(!taskKnowledge.draft.content.includes('没有比例选项'),'knowledge content does not absorb the product limitation')
  assert.ok(taskKnowledge.draft.evidence.every(item=>!item.excerpt.includes('没有比例选项')&&!item.excerpt.includes('希望图片制作')),'knowledge evidence excludes the feedback domain')
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-task-candidate-source]').length>=2,null),true)
  for(const label of ['当前获授权任务','触发原因','本地事件序号'])assert.ok((knowledgeText+feedbackText).includes(label),'task cards explain '+label)
  assert.equal(await cdp.evaluate(()=>window.unsafe===true,null),false)
  assert.equal(await cdp.evaluate(()=>localStorage.length,null),0)
  const previewSize=(await cdp.call('Page.getLayoutMetrics')).cssContentSize
  await writeFile(path.join(output,'merged-task-light.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:previewSize.width,height:previewSize.height,scale:1}})).data,'base64'))

  await cdp.evaluate(()=>{[...document.querySelectorAll('[data-governance-domain=enterprise_knowledge] label')].find(label=>label.textContent.includes('允许在本机保存企业知识候选')).querySelector('input').click();return true},null)
  assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('[data-governance-domain=platform_product_feedback] button')].find(button=>button.textContent==='保存候选到本机').disabled,null),true,'knowledge permission does not authorize task feedback')
  await cdp.evaluate(()=>{const button=[...document.querySelectorAll('[data-governance-domain=enterprise_knowledge] button')].find(button=>button.textContent==='保存候选到本机');button.click();button.click();return true},null)
  await waitFor(()=>!!document.querySelector('[data-governance-queued=enterprise_knowledge]'))
  const saved=await cdp.evaluate(()=>JSON.parse(localStorage.getItem('futurestaff.governance.local.v1:'+JSON.stringify(['task-tenant','task-member']))),null)
  assert.equal(saved.entries.length,1)
  assert.ok(saved.entries[0].draft.content.includes('双人复核'))
  await cdp.evaluate(()=>{[...document.querySelectorAll('[data-governance-domain=platform_product_feedback] button')].find(button=>button.textContent==='仅本次').click();return true},null)
  await waitFor(()=>!document.querySelector('[data-governance-domain=platform_product_feedback]'))
  await cdp.evaluate(async()=>{await window.repeat();await window.complete();return true},null)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-governance-domain=platform_product_feedback]').length,null),0,'dismissed domain does not return after duplicate event or end')
  assert.equal(await cdp.evaluate(()=>JSON.parse(localStorage.getItem('futurestaff.governance.local.v1:'+JSON.stringify(['task-tenant','task-member']))).entries.length,null),1)
  assert.equal(await cdp.evaluate(()=>window.fetchCalls,null),0)

  await cdp.evaluate(async()=>{await window.start({taskId:'cancelled-task',turn:2});await window.feed('user_message','更正：我们公司的长期验收规定要求材料双人复核。');await window.cancelTask();await window.complete();return true},null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===0)
  await cdp.evaluate(async()=>{await window.start({taskId:'revoked-task',turn:3});await window.feed('user_message','实际：图片制作无法生成2:3，没有对应选项。');await window.revokeTask();await window.complete();return true},null)
  assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[data-governance-domain]').length,null),0)

  await cdp.evaluate(async()=>{await window.start({taskId:'binding-task',turn:4});await window.feed('user_message','更正：我们公司的长期交接规定仍需双人复核。');await window.complete();return true},null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===1)
  await cdp.evaluate(()=>window.cancelTask(),null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===0)
  await cdp.evaluate(async()=>{await window.start({taskId:'ready-revoke-task',turn:5});await window.feed('user_message','实际：图片制作无法生成2:3，没有对应选项。');await window.complete();return true},null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===1)
  await cdp.evaluate(()=>window.revokeTask(),null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===0)
  await cdp.evaluate(async()=>{await window.start({taskId:'ready-binding-task',turn:6});await window.feed('user_message','更正：我们公司的长期交接规定仍需双人复核。');await window.complete();return true},null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===1)
  await cdp.evaluate(()=>window.rebind({owner:{tenantId:'another-task-tenant',actorId:'another-task-member'},sessionId:'another-task-session',taskId:'new-binding-task',turn:7}),null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===0)
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('我们公司的长期交接规定仍需双人复核'),null),false)
  await cdp.evaluate(async()=>{await window.feed('user_message','更正：我们公司的长期材料规定要求复核。');await window.complete();return true},null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===1)
  await cdp.evaluate(()=>window.rebind({sessionId:'same-owner-new-session'}),null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===0)
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('我们公司的长期材料规定要求复核'),null),false,'changing only the session removes prior suggestions')
  await cdp.evaluate(async()=>{await window.feed('user_message','更正：我们公司的长期质量规定要求复核。');await window.complete();return true},null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===1)
  await cdp.evaluate(()=>window.rebind({taskId:'next-task',turn:8}),null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===0)
  assert.equal(await cdp.evaluate(()=>document.body.textContent.includes('我们公司的长期质量规定要求复核'),null),false,'changing the task removes prior suggestions')

  await cdp.evaluate(async()=>{await window.feed('user_message','实际：图片制作入口没有比例选项。');await window.feed('assistant_question','图片需要什么比例？');await window.feed('user_message','2:3。');await window.feed('user_message','希望入口中直接显示这个比例。');await window.complete();return true},null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===1)
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true})
  await cdp.evaluate(()=>{window.dark();const details=document.querySelector('details');if(!details.open)document.querySelector('summary').click();[...document.querySelectorAll('[data-governance-domain] .fs-message-card__actions button')].find(button=>button.textContent==='修改内容'&&!button.disabled).focus();window.keyboardStart=document.activeElement;return true},null)
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true,'task summaries fit a narrow dark screen')
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  assert.equal(await cdp.evaluate(()=>document.activeElement!==window.keyboardStart&&document.activeElement?.tagName==='BUTTON'&&document.activeElement.textContent==='仅本次',null),true,'Tab moves between the local edit and dismiss actions')
  await cdp.evaluate(()=>{document.querySelector('[data-governance-domain] [data-desktop-draft-compatibility] summary').focus();return true},null)
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  assert.equal(await cdp.evaluate(()=>document.activeElement?.tagName==='BUTTON'&&document.activeElement.textContent==='检查本次确认窗口'&&!!document.activeElement.closest('[data-candidate-window]'),null),true,'Tab reaches the dedicated confirmation action after the compatibility disclosure')
  await writeFile(path.join(output,'merged-task-narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
  assert.equal(await cdp.evaluate(()=>window.fetchCalls,null),0)
  await cdp.evaluate(()=>window.viewOnly({owner:{tenantId:'view-only-tenant',actorId:'view-only-member'}}),null)
  await waitFor(()=>window.taskSource.getSnapshot().status==='disabled'&&document.querySelectorAll('[data-governance-domain]').length===0)
  assert.equal(await cdp.evaluate(()=>window.taskSource.getSnapshot().candidates.length,null),0,'renderer owner change revokes a source that remains bound to the old owner')
  await cdp.evaluate(async()=>{await window.start({taskId:'renderer-session-boundary',turn:9});await window.feed('user_message','实际：图片制作无法生成2:3，入口没有对应比例选项。');await window.complete();return true},null)
  await waitFor(()=>document.querySelectorAll('[data-governance-domain]').length===1)
  await cdp.evaluate(()=>window.viewOnly({sessionId:'renderer-only-session'}),null)
  await waitFor(()=>window.taskSource.getSnapshot().status==='disabled'&&document.querySelectorAll('[data-governance-domain]').length===0)
  assert.equal(await cdp.evaluate(()=>window.taskSource.getSnapshot().candidates.length,null),0,'renderer session change revokes a source that remains bound to the old session')
  assert.equal(await cdp.evaluate(()=>window.fetchCalls,null),0)
  await cdp.evaluate(()=>{window.mountDefault();return true},null)
  await waitFor(()=>window.taskSource.getSnapshot().status==='disabled'&&document.querySelectorAll('[data-governance-domain]').length===0)
  await writeFile(path.join(output,'ui-result.json'),JSON.stringify({status:'passed',synthetic:true,fetchCalls:0,checks:['default closed','one-time task preference is not enterprise knowledge or product demand','reported unsupported ratio remains unverified feedback','long-term company standard with domain-minimized sources','explicit synthetic task binding','no cards per message','task-end domain coalescing','short answer rule summary remains unverified','local event evidence disclosure','unconfirmed not persisted','independent domain permission','confirmed candidate uses local outbox','dismissal survives duplicate event and end','cancel and revoke before and after suggestion creation','owner session and task isolation','view-only owner/session changes revoke stale task sources','escaped text','390px dark and Tab navigation']},null,2)+'\n')
 }catch(error){
  await writeFile(path.join(output,'ui-result.json'),JSON.stringify({status:'failed',synthetic:true,message:error instanceof Error?error.message:'TASK_UI_FAILED'},null,2)+'\n')
  throw error
 }finally{cdp?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
