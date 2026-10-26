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
import {identifyCandidates} from '../lib/governance-candidates.js'
import {boundPayloadHash,canonicalContractJson,hashContractText} from '../lib/governance-desktop-contract.js'
import {mountCandidateConsent} from '../lib/governance-desktop-window-host.js'
const root=fileURLToPath(new URL('../../../',import.meta.url))
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const output=process.env.FUTURESTAFF_GOVERNANCE_WINDOW_TEST_OUTPUT??path.join(root,'output/governance-sixth-window-ui')
test('candidate UI uses the renderer-gated local Host route and preserves original handle across unknown outcomes',{timeout:60000},async()=>{
 assert.ok(executable,'an existing browser is required')
 await mkdir(output,{recursive:true});const directory=await mkdtemp(path.join(os.tmpdir(),'futurestaff-window-ui-'))
 const sample=JSON.parse(await readFile(path.join(root,'plugins/fs-platform-access/test/fixtures/governance-desktop-consent-v1.json'),'utf8')).goldens.cases[0]
 const owner={tenantId:'00000000-0000-4000-8000-000000000001',actorId:'00000000-0000-4000-8000-000000000002'},handle='00000000-0000-4000-8000-000000000009',sessionId='window-test-session',token='s'.repeat(43),now=Math.floor(Date.now()/1000)*1000
 const iso=t=>new Date(t).toISOString().replace('.000Z','Z'),draft=(await identifyCandidates({owner,activeConversationId:sessionId,conversationId:sessionId,sourceId:'fixture',sourceVersion:'1',text:'公司规定：交接双人复核。',authorized:true}))[0],prepare=structuredClone(sample.prepare_metadata_only),payload=structuredClone(sample.human_confirm_payload)
 prepare.manifest.scope.valid_until=iso(now+120000);payload.scope=structuredClone(prepare.manifest.scope);prepare.manifest.payload_hash=await boundPayloadHash(prepare.manifest,payload)
 Object.assign(draft,{title:payload.title,content:payload.proposed_content,basis:payload.basis,knowledgeKind:payload.kind,scope:{policyId:payload.scope.policy_id,policyVersion:String(payload.scope.policy_version),audiences:payload.scope.audiences,purpose:payload.scope.purpose,validUntil:now+120000},evidence:await Promise.all(payload.evidence.map(async e=>({sourceId:e.source.source_id,sourceVersion:e.source.version,sourceHash:await hashContractText(e.excerpt),excerpt:e.excerpt,redacted:e.redaction_status==='redacted',kind:'user_statement'})))})
 const auth=new AbortController(),task=new AbortController(),context={...owner,sessionId,taskBinding:'host-owned-agent-task',signal:auth.signal}
 const grant={handle,draft,taskBinding:context.taskBinding,sessionId,prepare,payloadJson:canonicalContractJson(payload),server:{request_id:prepare.request_id,domain:prepare.manifest.domain,payload_hash:prepare.manifest.payload_hash,server_task_id:handle,task_authorization_revision:1,authority_source:'none',action:'desktop.intake.consent',target_hash:'a'.repeat(64),status:'pending',expires_at:iso(now+180000).replace('Z','+00:00'),receipt:null,formal_knowledge_permission:false,agent_query_permission:false},signal:task.signal}
 let phase='awaiting_web',opens=0,cancels=0;const routes=[]
 const runtime={openCandidateConsent:(request,onState)=>{opens++;assert.equal(request.payloadJson,grant.payloadJson);onState('awaiting_web');return{state:()=>phase,cancel:()=>{cancels++;phase='cancelled';onState('cancelled')}}}}
 const provider={authoritySignal:new AbortController().signal,nativeWindowPolicy:()=>({platformOrigin:'https://platform.invalid',handoffOrigin:'http://127.0.0.1:43120'}),list:async()=>[grant]}
 const ctx={get:key=>key==='futurestaffGovernanceCandidateProvider'?provider:key==='desktopRuntime'?runtime:key==='desktopBrowserAccess'?{rendererHeader:{name:'x-dsh-desktop-renderer',value:token}}:undefined,provide(){},effect:fn=>{fn()},webServer:{port:0,register:r=>{routes.push(r);return()=>{}}}}
 const host=mountCandidateConsent(ctx,{authorize:async()=>context})
 const bundle=await build({absWorkingDir:root,stdin:{resolveDir:root,loader:'tsx',contents:
 "import React from 'react';import{createRoot}from'react-dom/client';import{CandidateWorkbench}from'./plugins/fs-platform-access/src/client/governance-candidates.tsx';import{CandidateConsentClient}from'./plugins/fs-platform-access/src/governance-desktop-window-client.ts';import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';import{messageCardCss}from'./plugins/fs-platform-access/src/client/message-card.tsx';"+
 "const draft="+JSON.stringify(draft)+",owner="+JSON.stringify(owner)+",sessionId="+JSON.stringify(sessionId)+";const style=document.createElement('style');style.textContent=messageCardCss;document.head.append(style);for(const[k,v]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(k,v.light);window.dark=()=>{for(const[k,v]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(k,v.dark)};"+
 "window.calls=[];const originalFetch=window.fetch.bind(window);const client=new CandidateConsentClient(sessionId,(url,init)=>{window.calls.push(JSON.parse(init.body));return originalFetch(url,{...init,headers:{...init.headers,'x-dsh-desktop-renderer':"+JSON.stringify(token)+"}})});const listeners=new Set();let snapshot={epoch:1,binding:{owner,sessionId,taskId:'host-task'},candidates:[{draft,origin:'explicit_user',summary:'合成当前任务候选',reason:'明确来源',sourceEventIds:['1']}],status:'ready'};const taskSource={getSnapshot:()=>snapshot,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},revoke:()=>{snapshot={...snapshot,epoch:snapshot.epoch+1,binding:null,candidates:[],status:'not_connected'};listeners.forEach(l=>l())}};const root=createRoot(document.getElementById('root'));root.render(<CandidateWorkbench owner={owner} sessionId={sessionId} taskSource={taskSource} windowSource={client}/>);window.unmount=()=>root.unmount();"
 },bundle:true,write:false,format:'iife',jsx:'automatic'})
 const server=createServer((req,res)=>{if(req.url==='/_futurestaff/governance/candidate-window')return void routes[0].handler(req,res);res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html;charset=utf-8');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{margin:0 auto;max-width:900px;padding:20px;font:14px Segoe UI;background:var(--bg-primary);color:var(--text-primary)}</style><div id="root"></div><script src="/app.js"></script></html>')})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));ctx.webServer.port=server.address().port
 const browser=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--remote-debugging-port=0','--user-data-dir='+directory+'/browser','about:blank'],{windowsHide:true,stdio:'ignore'})
 let cdp
 try{
  let port;for(let i=0;i<100;i++){try{port=(await readFile(path.join(directory,'browser','DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await pause(50)}}assert.ok(port)
  cdp=await Cdp.connect((await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page').webSocketDebuggerUrl)
  const wait=async p=>{for(let i=0;i<150;i++){if(await cdp.evaluate(p,null))return;await pause(25)}throw Error('WINDOW_UI_TIMEOUT:'+await cdp.evaluate(()=>document.body.textContent,null))}
  const click=async text=>cdp.evaluate(t=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===t);if(!b)throw Error(t);b.click();return true},text)
  await cdp.call('Page.navigate',{url:'http://127.0.0.1:'+ctx.webServer.port});await wait(()=>document.body.textContent.includes('候选草稿'));await cdp.evaluate(()=>{document.querySelector('summary').click();return true},null)
  await wait(()=>!!document.querySelector('[data-governance-domain]'));assert.equal(await cdp.evaluate(()=>window.calls.length,null),0,'nothing calls the Host before an explicit action')
  await click('检查本次确认窗口');await wait(()=>document.body.textContent.includes('在平台确认此候选'));assert.equal(opens,0)
  assert.equal(await cdp.evaluate(()=>localStorage.length,null),0)
  await click('在平台确认此候选');await wait(()=>document.querySelector('[data-candidate-window]')?.dataset.candidateWindow==='awaiting_web');assert.equal(opens,1)
  const wireCalls=await cdp.evaluate(()=>window.calls,null);assert.deepEqual(wireCalls[1],{action:'open',sessionId,handle});assert.equal(JSON.stringify(wireCalls).includes(payload.proposed_content),false)
  phase='transferred';await click('检查原请求状态');await wait(()=>document.querySelector('[data-candidate-window]')?.dataset.candidateWindow==='transferred');assert.match(await cdp.evaluate(()=>document.body.textContent,null),/尚未取得平台入箱回执/)
  phase='closed';await click('检查原请求状态');await wait(()=>document.querySelector('[data-candidate-window]')?.dataset.candidateWindow==='unknown');await click('检查原请求状态');assert.equal(opens,1,'unknown never reopens a body transfer')
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});await cdp.evaluate(()=>{window.dark();return true},null)
  assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth,null),true)
  await writeFile(path.join(output,'unknown-narrow-dark.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'))
  await click('修改内容');await wait(()=>!!document.querySelector('textarea[aria-label="候选内容"]'));for(let i=0;i<100&&cancels===0;i++)await pause(20);assert.ok(cancels>0)
  assert.equal(opens,1);await cdp.evaluate(()=>{window.unmount();return true},null)
  await writeFile(path.join(output,'ui-result.json'),JSON.stringify({status:'passed',synthetic:true,actualLocalRoute:true,nativeAdapter:'isolated_fake_only; separate Electron evidence required',opens,cancels,checks:['no automatic request','launcher-gated same-origin metadata route','matching Host candidate handle','one explicit native open','no body or identity in renderer request','transferred is not received','unknown queries original handle','edit clears pending native view','390px dark layout']},null,2)+'\n')
 }finally{host.dispose();cdp?.close();browser.kill();server.closeAllConnections();await new Promise(r=>server.close(r))}
})
