import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cdp } from '@futurestaff/douyin-dm-mcp/browser'
import { AgentWorkspaceStore } from '../lib/agents.js'
import { resolveSessionAgent } from '../lib/agent-host.js'
import { loadDesktopAgentCatalog } from '../lib/client/agents.js'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const publication=(card,changes={})=>({version:'a'.repeat(64),sha256:'a'.repeat(64),bytes:256,notes:'',requirements:{minClientVersion:'3.2.0',capabilities:['core.chat']},publishedAt:null,installedVersion:'a'.repeat(64),versions:['a'.repeat(64)],updateAvailable:false,...card,...changes})
test('modal conversation choices contain only enabled local templates and installed published versions',async()=>{
  const originalFetch=globalThis.fetch
  const cards=[1,2,3].map(n=>({agentId:`30000000-0000-4000-8000-00000000000${n}`,name:`助手${n}`,description:'平台已聘用',available:n!==3,unavailableReason:n===3?'平台不可用':null,path:`/authorized/${n}`}))
  let published=[],local=[]
  const talent={templateId:'10000000-0000-4000-8000-000000000001',version:'a'.repeat(64),name:'Private Assistant',description:'Local',icon:'AI',category:'personal',capabilityBullets:[],compatible:true,unavailableReason:null,presetId:'preset-a',path:'/local',requiredApplications:[]}
  const mock=async url=>Response.json(String(url).endsWith('/agent-market/catalog')?{items:local}:String(url).endsWith('/mine')?{items:local}:String(url).endsWith('/catalog')?{items:cards,dataDirectory:'/member'}:{items:published,dataDirectory:'/member'})
  globalThis.fetch=mock
  try{
    let catalog=await loadDesktopAgentCatalog()
    assert.equal(catalog.items.length,0,'nine or any other authorized but uninstalled Agents must never enter choices')
    local=[talent]
    catalog=await loadDesktopAgentCatalog()
    assert.deepEqual(catalog.items.map(card=>[card.kind,card.selectionRoute,card.key]),[['template','open-template','preset-a']])
    published=[publication(cards[0],{available:false,unavailableReason:'发布已停用'}),
      publication(cards[1],{installedVersion:'b'.repeat(64),versions:['a'.repeat(64),'b'.repeat(64)],updateAvailable:true}),
      publication(cards[2],{available:true,unavailableReason:null,installedVersion:'c'.repeat(64),versions:['c'.repeat(64)]}),
      publication(cards[0],{agentId:'40000000-0000-4000-8000-000000000001',installedVersion:'d'.repeat(64),versions:['d'.repeat(64)]})]
    catalog=await loadDesktopAgentCatalog()
    assert.deepEqual(catalog.items.filter(card=>card.kind==='published').map(card=>[card.agentId,card.available,card.selectionRoute]),[
      [cards[0].agentId,false,'open-installed'],[cards[1].agentId,true,'open-installed'],[cards[2].agentId,false,'open-installed'],
    ])
    assert.equal(catalog.items[1].unavailableReason,'发布已停用')
    assert.equal(catalog.items[3].unavailableReason,'平台不可用')
    assert.equal(catalog.items[2].installedVersion,'b'.repeat(64))
    assert.deepEqual(catalog.items[2].versions,['a'.repeat(64),'b'.repeat(64)])
    assert.equal(catalog.items[2].updateAvailable,true)
    assert.equal(catalog.items[2].path,cards[1].path)
    for(const [available,versions] of [[true,['a'.repeat(64)]],[true,[]],[false,[]]]){
      published=[publication(cards[0],{available,unavailableReason:available?null:'发布已停用',installedVersion:null,versions})]
      const uninstalled=await loadDesktopAgentCatalog()
      assert.equal(uninstalled.items.length,1,'uninstalled publications and other platform Agents stay absent')
      assert.equal(uninstalled.items[0].kind,'template')
    }
    for(const status of [404,503]){
      globalThis.fetch=async url=>String(url).includes('/agent-market/')?Response.json({items:local}):new Response('',{status})
      const uncertain=await loadDesktopAgentCatalog()
      assert.equal(uncertain.items.length,1,'local template selection does not depend on published-Agent services')
      assert.equal(uncertain.items[0].kind,'template')
    }
    globalThis.fetch=mock;local=[talent,{...talent,presetId:'preset-b',version:'b'.repeat(64)}]
    await assert.rejects(loadDesktopAgentCatalog(),/格式不兼容/,'multiple active versions of one template are rejected')
  }finally{globalThis.fetch=originalFetch}
})
test('real browser selects persistent agents, isolates sessions, preserves files, and cancels stale selection',{skip:!executable,timeout:30000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'fs-agent-ui-'))
  const identity={environment:'dev',tenantId:'10000000-0000-4000-8000-000000000001',userId:'20000000-0000-4000-8000-000000000001'}
  const store=new AgentWorkspaceStore(path.join(dir,'member'),identity)
  const cards=[1,2].map(n=>({agentId:`30000000-0000-4000-8000-00000000000${n}`,name:`助手${n}`,description:`知识${n} ${'Long role description for a persistent agent. '.repeat(12)}`,available:true,unavailableReason:null}))
  const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
    import React,{useState,useSyncExternalStore}from'react';import{createRoot}from'react-dom/client';
    import{createAgentBrowser,createAgentPicker,createAgentConversation,createAgentNavigation}from'./plugins/fs-platform-access/src/client/agents.tsx';
    import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
    const listeners=new Set();let identity={phase:'ready',activeTenantId:'tenant',user:{userId:'user'}};
    const controller={subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},getSnapshot:()=>identity};
    const navigation=createAgentNavigation(),Browser=createAgentBrowser(controller,()=> <p>原工作区资料</p>,navigation),Picker=createAgentPicker(controller);
    const nativeListeners=new Set();let sessions={ids:[],byId:{},current:undefined},workspaces={items:[],archivedSessionIds:[]};
    const update=()=>nativeListeners.forEach(fn=>fn());let number=0;
    const createWorkspace=async({path})=>{let item=workspaces.items.find(w=>w.path===path);if(!item){item={path,workspaceId:path,sessionIds:[]};workspaces={...workspaces,items:[...workspaces.items,item]};update()}return item};
    const startSession=id=>{const w=workspaces.items.find(w=>w.workspaceId===id),sessionId='session-'+(++number);sessions={...sessions,current:sessionId,ids:[...sessions.ids,sessionId],byId:{...sessions.byId,[sessionId]:{title:'测试会话'+number,cwd:w.path}}};workspaces={...workspaces,items:workspaces.items.map(item=>item===w?{...w,sessionIds:[...w.sessionIds,sessionId]}:item)};update()};
    window.fixture={get:()=>({sessions,workspaces}),logout:()=>{identity={phase:'signed_out'};listeners.forEach(fn=>fn())}};
    const useSessions=select=>select(useSyncExternalStore(fn=>{nativeListeners.add(fn);return()=>nativeListeners.delete(fn)},()=>sessions));
    const useWorkspaces=select=>select(useSyncExternalStore(fn=>{nativeListeners.add(fn);return()=>nativeListeners.delete(fn)},()=>workspaces));
    const archiveSession=async id=>{if(window.fixture.archiveFailure)throw Error('fixture');workspaces={...workspaces,archivedSessionIds:[...workspaces.archivedSessionIds,id]};update()};
    for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
    const Managed=createAgentConversation(controller,navigation,createWorkspace,()=> <section id="active-chat">会话内容</section>);
    function App(){const[open,setOpen]=useState(false);return <div style={{display:'flex',height:'100vh'}}><aside style={{width:220,flexShrink:0,padding:12,display:'flex',flexDirection:'column'}}><button id="new-session" onClick={()=>{navigation.begin();sessions={...sessions,current:undefined};update()}}>新会话</button><Browser useSessions={useSessions} useWorkspaces={useWorkspaces} createWorkspace={createWorkspace} startSession={startSession} open={id=>{sessions={...sessions,current:id};update()}} archiveSession={archiveSession} wide={true}/></aside><main style={{flex:1,minWidth:0}}><button id="open-picker" onClick={()=>setOpen(true)}>选择</button><div style={{height:'calc(100% - 32px)',minHeight:0}}><Managed useSessions={useSessions} selectWorkspace={async id=>startSession(id)}/></div><Picker open={open} onClose={()=>setOpen(false)} onPick={startSession} createWorkspace={createWorkspace}/></main></div>}
    createRoot(document.getElementById('root')).render(<App/>);
  `},bundle:true,write:false,format:'iife',jsx:'automatic'})
  let slow=false,published=true
  const selections=[]
  const server=createServer(async(req,res)=>{
    try{
      if(req.url==='/_futurestaff/agent-market/mine'||req.url==='/_futurestaff/agent-market/catalog'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({items:[]}))}
      if(req.url==='/_futurestaff/agents/catalog'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({items:cards.map(c=>({...c,path:path.join(store.directory(c.agentId),'workspace')})),dataDirectory:store.root}))}
      if(req.url==='/_futurestaff/agents/distribution'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({items:published?cards.map(card=>publication(card)):[],dataDirectory:store.root}))}
      if(req.url==='/_futurestaff/agents/open-installed'||req.url==='/_futurestaff/agents/select'){
        selections.push(req.url.split('/').at(-1))
        let body='';for await(const chunk of req)body+=chunk
        const card=cards.find(c=>c.agentId===JSON.parse(body).agentId)
        if(slow)await sleep(500)
        const directory=await store.materialize({agentId:card.agentId,name:card.name,description:card.description,version:'a'.repeat(64),files:[{path:'soul.md',content:card.description}]},new AbortController().signal)
        res.setHeader('content-type','application/json');return res.end(JSON.stringify({path:path.join(directory,'workspace')}))
      }
      res.setHeader('content-type',req.url==='/fixture.js'?'application/javascript':'text/html; charset=utf-8')
      res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><div id="root"></div><script src="/fixture.js"></script></html>')
    }catch{res.statusCode=409;res.end('{}')}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const child=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${dir}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
  let cdp
  try{
    let portFile;for(let i=0;i<80;i++){try{portFile=await readFile(path.join(dir,'browser','DevToolsActivePort'),'utf8');break}catch{await sleep(100)}}
    assert.ok(portFile)
    const targets=await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()
    cdp=await Cdp.connect(targets.find(item=>item.type==='page').webSocketDebuggerUrl)
    await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`})
    const waitFor=async(fn)=>{for(let i=0;i<80;i++){if(await cdp.evaluate(fn,null))return;await sleep(50)}assert.fail('browser state did not settle')}
    await waitFor(()=>document.querySelectorAll('.fs-agent-home [data-published-agent-id]').length===2)
    const searchStyle=await cdp.evaluate(()=>{const input=document.querySelector('.fs-agent-search');input.focus();const parent=getComputedStyle(input.parentElement),field=getComputedStyle(input);return {parentBorder:parent.borderTopWidth,inputBorder:field.borderTopWidth,outlineStyle:field.outlineStyle,height:input.parentElement.getBoundingClientRect().height}},null)
    assert.equal(searchStyle.parentBorder,'1px');assert.equal(searchStyle.inputBorder,'0px');assert.equal(searchStyle.outlineStyle,'none');assert.equal(searchStyle.height,36)
    assert.equal(await cdp.evaluate(()=>document.querySelector('aside .fs-agent-choice')===null,null),true)
    assert.equal(await cdp.evaluate(()=>document.querySelector('aside').innerText.includes('本机数据位置'),null),false)
    assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('.fs-agent-home [data-published-agent-id]')].every(card=>{
      const box=card.getBoundingClientRect(),description=card.querySelector('.fs-talent-description').getBoundingClientRect()
      return description.bottom<=box.bottom&&card.scrollWidth<=card.clientWidth
    }),null),true)
    await cdp.evaluate(()=>[...document.querySelectorAll('.fs-agent-home [data-published-agent-id]')[0].querySelectorAll('button')].find(button=>button.textContent==='开始对话').click()||true,null)
    await waitFor(()=>window.fixture.get().sessions.ids.length===1)
    assert.deepEqual(selections,['open-installed'],'only the installed published route opens a workspace')
    let native=await cdp.evaluate(()=>window.fixture.get(),null)
    const first=native.sessions.current,cwd=native.sessions.byId[first].cwd
    assert.equal((await resolveSessionAgent(store,first,cwd)).agentId,cards[0].agentId)
    await writeFile(path.join(cwd,'local.txt'),'preserved work')
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-agent-home')===null&&!!document.querySelector('#active-chat'),null),true)
    published=true
    await cdp.evaluate(()=>document.querySelector('#new-session').click()||true,null)
    await waitFor(()=>document.querySelectorAll('.fs-agent-home [data-published-agent-id]').length===2)
    await cdp.evaluate(()=>[...document.querySelectorAll('.fs-agent-home [data-published-agent-id]')[1].querySelectorAll('button')].find(button=>button.textContent==='开始对话').click()||true,null)
    await waitFor(()=>window.fixture.get().sessions.ids.length===2)
    assert.deepEqual(selections,['open-installed','open-installed'],'installed published agents retain their released selection route')
    assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-session').length,null),2)
    native=await cdp.evaluate(()=>window.fixture.get(),null)
    assert.equal((await resolveSessionAgent(store,native.sessions.current,native.sessions.byId[native.sessions.current].cwd)).agentId,cards[1].agentId)
    await cdp.evaluate(()=>document.querySelector('#new-session').click()||true,null)
    await waitFor(()=>document.querySelectorAll('.fs-agent-home [data-published-agent-id]').length===2)
    await cdp.evaluate(()=>[...document.querySelectorAll('.fs-agent-home [data-published-agent-id]')[0].querySelectorAll('button')].find(button=>button.textContent==='开始对话').click()||true,null)
    await waitFor(()=>window.fixture.get().sessions.ids.length===3)
    assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-session').length,null),3)
    // Validate the real list layout, rather than matching its CSS source text.
    for(const theme of ['light','dark']){
      await cdp.evaluate(theme=>{
        document.documentElement.style.setProperty('--bg-primary',theme==='dark'?'#16181c':'#ffffff');
        document.documentElement.style.setProperty('--bg-hover',theme==='dark'?'#262a30':'#eef0f4');
        document.documentElement.style.setProperty('--bg-active',theme==='dark'?'#223456':'#e8efff');
        document.documentElement.style.setProperty('--text-primary',theme==='dark'?'#e9edf4':'#222936');
        document.documentElement.style.setProperty('--text-secondary',theme==='dark'?'#a0aabb':'#667085');
        document.body.style.background='var(--bg-primary)';return true
      },theme)
      const layout=await cdp.evaluate(()=>{
        const row=document.querySelector('.fs-agent-session-row'),button=row.querySelector('.fs-agent-session'),archive=row.querySelector('.fs-agent-archive');
        button.querySelector('span').textContent='这是一个需要保持单行并且不挤压归档操作的超长中文会话标题';
        const a=row.getBoundingClientRect(),b=button.getBoundingClientRect(),c=archive.getBoundingClientRect();
        archive.focus();return {border:getComputedStyle(button).borderTopWidth,height:a.height,overflow:row.scrollWidth>row.clientWidth,
          reserved:b.right-parseFloat(getComputedStyle(button).paddingRight)<=c.left,icon:!!archive.querySelector('svg'),focused:document.activeElement===archive}
      },null)
      assert.equal(layout.border,'0px');assert.ok(layout.height<=58);assert.equal(layout.overflow,false);assert.equal(layout.reserved,true);assert.equal(layout.icon,true);assert.equal(layout.focused,true)
      const output=path.join(root,'output','sidebar-design-20261015');await mkdir(output,{recursive:true})
      await writeFile(path.join(output,`sessions-${theme}.png`),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
    }
    assert.equal(await readFile(path.join(cwd,'local.txt'),'utf8'),'preserved work')
    assert.equal((await new AgentWorkspaceStore(store.root,identity).binding(first)).agentId,cards[0].agentId)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-agent-legacy')===null,null),true)
    await cdp.evaluate(()=>document.querySelector('#new-session').click()||true,null)
    await waitFor(()=>!!document.querySelector('.fs-agent-home'))
    await cdp.evaluate(()=>document.querySelector('.fs-agent-session').click()||true,null)
    await waitFor(()=>!!document.querySelector('#active-chat')&&!document.querySelector('.fs-agent-home'))
    await cdp.evaluate(()=>document.querySelector('.fs-agent-archive').click()||true,null)
    await waitFor(()=>document.querySelectorAll('.fs-agent-session').length===2)
    assert.equal(await cdp.evaluate(()=>window.fixture.get().sessions.ids.length,null),3)
    assert.equal(await readFile(path.join(cwd,'local.txt'),'utf8'),'preserved work')
    await cdp.evaluate(()=>{window.fixture.archiveFailure=true;document.querySelector('.fs-agent-archive').click();return true},null)
    await waitFor(()=>!!document.querySelector('.fs-agent-browser [role=alert]'))
    assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-session').length,null),2)
    await cdp.evaluate(()=>{window.fixture.archiveFailure=false;document.querySelector('.fs-agent-archive').click();return true},null)
    await waitFor(()=>document.querySelectorAll('.fs-agent-session').length===1)
    await cdp.evaluate(()=>document.getElementById('open-picker').click()||true,null)
    assert.equal(await cdp.evaluate(()=>document.activeElement.textContent,null),'关闭')
    await cdp.evaluate(()=>{const dialog=document.querySelector('[role=dialog]'),last=[...dialog.querySelectorAll('button')].at(-1);last.focus();last.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));return true},null)
    assert.equal(await cdp.evaluate(()=>document.activeElement.textContent,null),'关闭')
    await cdp.evaluate(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})),null)
    assert.equal(await cdp.evaluate(()=>document.querySelector('[role=dialog]')===null,null),true)
    await cdp.evaluate(()=>document.querySelector('#new-session').click()||true,null)
    await waitFor(()=>document.querySelectorAll('.fs-agent-home [data-published-agent-id]').length===2)
    await cdp.evaluate(()=>{document.querySelector('aside').style.display='none';return true},null)
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true)
    const output=path.join(root,'work','persistent-agents-v3');await mkdir(output,{recursive:true})
    await writeFile(path.join(output,'selector-narrow.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
    slow=true
    await cdp.evaluate(()=>{[...document.querySelectorAll('.fs-agent-home [data-published-agent-id]')[1].querySelectorAll('button')].find(button=>button.textContent==='开始对话').click();window.fixture.logout();return true},null)
    await sleep(650)
    assert.equal(await cdp.evaluate(()=>window.fixture.get().sessions.ids.length,null),3)
    assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-agent-home [data-published-agent-id]').length,null),0)
  }finally{cdp?.close();child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})

test('local system-role descriptions stay accurate in the real Home and modal picker',{skip:!executable,timeout:30000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'fs-system-role-copy-'))
  const talent=(n,name,description,requiredApplications,tools,changes={})=>({templateId:`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,version:'a'.repeat(64),name,description,icon:'AI',category:'personal',capabilityBullets:[],compatible:true,unavailableReason:null,requiredApplications,presetId:'local-'+n,path:'/fixture/'+n,...(tools===undefined?{}:{tools}),...changes})
  const local=[
    talent(1,'Product Selection Specialist','Publishes H5 automatically and changes every pool.',['product_hub'],['call_product_hub_api'],{category:'marketing'}),
    talent(2,'Agent管理员','管理所有员工并修改所有智能体。',['agent'],['call_agent_admin_api'],{category:'my-talent'}),
    talent(3,'Vietnam Visa Assistant','Submit applications and pay for visas online.',['vietnam_immigration'],['visa_query'],{category:'vietnam-visa-system'}),
    talent(4,'ERP 系统助手','旧系统能力描述。',['erp'],['erp_query'],{category:'erp-system'}),
    talent(5,'Project Manager','Original PM recipe description.',[],[],{category:'office'}),
    talent(6,'Legacy scoped role','保留旧路径原说明。',['erp'],undefined),
    talent(7,'Unavailable System','不能代替禁用原因。',['erp'],['erp_query'],{compatible:false,unavailableReason:'当前系统工具不可用。'}),
  ]
  const published=publication({agentId:'30000000-0000-4000-8000-000000000001',name:'Published role',description:'保留发布包原说明。',path:'/fixture/published',requiredApplications:['erp'],available:true,unavailableReason:null},{installedVersion:'b'.repeat(64),versions:['b'.repeat(64)]})
  const original=JSON.stringify(local),mutations=[]
  const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
    import React,{useState}from'react';import{createRoot}from'react-dom/client';
    import{createAgentHome,createAgentPicker}from'./plugins/fs-platform-access/src/client/agents.tsx';
    import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
    const state={phase:'ready',activeTenantId:'tenant',user:{userId:'member'},applications:['product_hub','agent','vietnam_immigration','erp'].map(appId=>({appId,tenantId:'tenant',capabilities:[appId==='agent'?'agent.admin':appId==='vietnam_immigration'?'visa.read':appId+'.read']}))};
    const controller={subscribe:()=>()=>{},getSnapshot:()=>state},Home=createAgentHome(controller),Picker=createAgentPicker(controller);
    for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
    const createWorkspace=async()=>{throw Error('No workspace mutation expected')};
    function App(){const[open,setOpen]=useState(false);return <><button id="open-picker" onClick={()=>setOpen(true)}>打开选择器</button><Home createWorkspace={createWorkspace} onPick={()=>{throw Error('No session mutation expected')}}/><Picker open={open} onClose={()=>setOpen(false)} onPick={()=>{throw Error('No session mutation expected')}} createWorkspace={createWorkspace}/></>}
    createRoot(document.getElementById('root')).render(<App/>);
  `},bundle:true,write:false,format:'iife',jsx:'automatic'})
  const server=createServer((req,res)=>{
    if(req.method!=='GET')mutations.push(req.url)
    const data=req.url==='/_futurestaff/agent-market/mine'||req.url==='/_futurestaff/agent-market/catalog'?{items:local}
      :req.url==='/_futurestaff/agents/distribution'||req.url==='/_futurestaff/agents/catalog'?{items:[published],dataDirectory:'/fixture'}:undefined
    res.setHeader('content-type',data?'application/json':req.url==='/fixture.js'?'application/javascript':'text/html; charset=utf-8')
    res.end(data?JSON.stringify(data):req.url==='/fixture.js'?bundle.outputFiles[0].text:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script></html>')
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const child=spawn(executable,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${dir}/browser`,'about:blank'],{windowsHide:true,stdio:'ignore'})
  let cdp
  try{
    let portFile;for(let i=0;i<80;i++){try{portFile=await readFile(path.join(dir,'browser','DevToolsActivePort'),'utf8');break}catch{await sleep(100)}}
    assert.ok(portFile)
    const targets=await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()
    cdp=await Cdp.connect(targets.find(item=>item.type==='page').webSocketDebuggerUrl)
    await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`})
    const waitFor=async fn=>{for(let i=0;i<80;i++){if(await cdp.evaluate(fn,null))return;await sleep(50)}assert.fail('browser state did not settle')}
    await waitFor(()=>document.querySelectorAll('.fs-agent-home [data-template-id],.fs-agent-home [data-published-agent-id]').length===8)
    const expectedNames=['选品顾问','Agent管理员','Vietnam Visa Assistant','ERP 系统助手','项目经理','Legacy scoped role','Unavailable System','Published role']
    const accurate='使用已适配的本机工具处理系统业务；能力以当前成员授权和人工确认为准。'
    const output=path.join(root,'output/system-assistant-access-20261023/picker');await mkdir(output,{recursive:true})
    for(const surface of ['home','modal']){
      if(surface==='modal'){await cdp.evaluate(()=>document.getElementById('open-picker').click()||true,null);await waitFor(()=>document.querySelectorAll('[role=dialog] .fs-agent-choice').length===8)}
      const rows=await cdp.evaluate(surface=>[...document.querySelectorAll(surface==='home'?'.fs-agent-home [data-template-id],.fs-agent-home [data-published-agent-id]':'[role=dialog] .fs-agent-choice')].map(card=>({name:card.querySelector(surface==='home'?'h2':'strong').textContent,description:surface==='home'?card.querySelector('.fs-talent-description').textContent:card.querySelector('small').textContent,disabled:surface==='home'?[...card.querySelectorAll('button')].find(button=>button.textContent==='开始对话').disabled:card.disabled,text:card.textContent})),surface)
      assert.deepEqual(rows.map(row=>row.name),expectedNames,surface+' preserves translated names')
      assert.deepEqual(rows.slice(0,4).map(row=>row.description),Array(4).fill(accurate),surface+' limits system-role capability claims')
      assert.equal(rows[4].description,'管理项目时间线、任务派发、跨团队协调和进度汇报。',surface+' keeps the existing PM description')
      assert.equal(rows[5].description,'保留旧路径原说明。')
      assert.equal(rows[6].description,surface==='home'?accurate:'当前系统工具不可用。');assert.match(rows[6].text,/当前系统工具不可用。/);assert.equal(rows[6].disabled,true)
      assert.equal(rows[7].description,'保留发布包原说明。')
      assert.doesNotMatch(rows.map(row=>row.description).join('\n'),/Publishes H5|管理所有员工|修改所有智能体|Submit applications|pay for visas/)
      await writeFile(path.join(output,`browser-${surface}.png`),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
    }
    assert.equal(JSON.stringify(local),original,'immutable recipes are not rewritten')
    assert.deepEqual(mutations,[],'display correction does not write or create a session')
  }finally{
    try{await cdp?.call('Browser.close',{})}catch{}
    cdp?.close();if(child.exitCode===null)child.kill()
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
  }
})
