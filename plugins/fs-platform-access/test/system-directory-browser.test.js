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

const root = fileURLToPath(new URL('../../../', import.meta.url))
const executable = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
test('neutral system navigation works in a real browser at desktop and narrow widths', { skip: !executable, timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fs-system-ui-'))
  const output = path.join(root, 'work', 'workbench-ui-refinement')
  await mkdir(output, { recursive: true })
  const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{createAccountSidebar}from'./plugins/fs-platform-access/src/client/sidebar.tsx';
    import{SystemPages,SystemMain}from'./plugins/fs-platform-access/src/client/system-pages.tsx';
    import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
    const pages=new SystemPages(),listeners=new Set();let snapshot={phase:'ready',user:{userId:'fixture-user',displayName:'测试用户'},activeTenantId:'a',tenants:[{tenantId:'a',displayName:'系统体验'}],applications:[{appId:'erp',tenantId:'a',displayName:'ERP',baseUrl:'https://erp-dev.fsstory.net',deepLinks:{home:'/erp'},capabilities:['erp.read']}],models:[]};
    snapshot.applications.push(...['agent','wecom_album','vietnam_immigration','product_hub','futurestaff_ai','geo'].map(appId=>({...snapshot.applications[0],appId,displayName:appId,baseUrl:appId==='vietnam_immigration'?'https://visa.fsstory.net':'https://product.fsstory.net',deepLinks:{home:'/'}})));
    snapshot.applications.push({...snapshot.applications[0],appId:'web',baseUrl:'https://web.fsstory.net',deepLinks:{home:'/'},capabilities:['web.manage']});
    window.nativeRequests=[];window.externalOpens=0;
    window.futurestaffSystems={request:async input=>{window.nativeRequests.push(input);return{ok:true}}};
    const hiddenDialog=document.createElement('div');hiddenDialog.setAttribute('role','dialog');hiddenDialog.setAttribute('aria-modal','true');hiddenDialog.style.display='none';document.body.append(hiddenDialog);
    window.open=()=>{window.externalOpens++;return null};
    const controller={getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},logout:async()=>{snapshot={...snapshot,phase:'signed_out'};listeners.forEach(fn=>fn())}};
    pages.register({id:'douyin',title:'抖音获客',component:()=> <section style={{padding:24}}><h1>抖音获客</h1><p>隔离界面验收 · 不执行业务操作</p><label>目标画像<input defaultValue="越南签证办理需求"/></label></section>});
    pages.register({id:'geo',title:'GEO 品牌运营',component:()=> <section style={{padding:24}}><h1>GEO 品牌运营</h1></section>});
    const Sidebar=createAccountSidebar(controller,pages);
    for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
    window.fixture={pages,controller,setDark:()=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.dark)}};
    function App(){const[collapsed,setCollapsed]=useState(false);return <div style={{display:'flex',height:'100vh',minWidth:0}}><div className="dshDesktopSidebarSurface" style={{width:collapsed?72:264,flexShrink:0}}><Sidebar collapsed={collapsed} width={264} toggleSidebar={()=>setCollapsed(x=>!x)} startSession={()=>{}} renderSlot={name=>name==='sidebar.settings'?<div><button>账号设置</button></div>:<div><p>最近会话</p><input type="search" aria-label="搜索会话" defaultValue="保留搜索"/><p>很长的会话标题也不应该挤进收起的侧栏</p></div>}/></div><main style={{flex:1,minWidth:0}}><SystemMain pages={pages} chat={<section style={{padding:24}}><h1>FutureStaff Agent</h1><textarea aria-label="会话输入" defaultValue="保留的会话草稿"/></section>}/></main></div>}
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, write: false, format: 'iife', jsx: 'automatic' })
  const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FutureStaff UI review</title><style>*{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Microsoft YaHei,sans-serif;background:var(--bg-primary);color:var(--text-primary)}input,textarea{display:block;max-width:100%;padding:10px;border:1px solid var(--border-default);border-radius:6px;font:inherit}h1{font-size:24px}.dshDesktopSidebarSurface{overflow:hidden}</style><div id="root"></div><script src="/fixture.js"></script></html>'
  const server = createServer((req, res) => { res.setHeader('content-type', req.url === '/fixture.js' ? 'application/javascript' : 'text/html; charset=utf-8');res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : html) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const child = spawn(executable, ['--headless=new', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${dir}/browser`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let cdp
  try {
    let portFile
    for (let i=0;i<80;i++) { try { portFile = await readFile(path.join(dir,'browser','DevToolsActivePort'),'utf8');break } catch { await sleep(100) } }
    assert.ok(portFile)
    const targets=await(await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()
    cdp=await Cdp.connect(targets.find(item=>item.type==='page').webSocketDebuggerUrl)
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
    await cdp.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?dsh-desktop-version=2.0.22`})
    for(let i=0;i<80;i++){if(await cdp.evaluate(()=>!!document.getElementById('fs-menu-tab'),null))break;await sleep(100)}
    await cdp.evaluate(()=>document.getElementById('fs-menu-tab').click()||true,null)
    assert.equal(await cdp.evaluate(()=>getComputedStyle(document.querySelector('.fs-sidebar')).backgroundColor,null),'rgb(247, 248, 250)')
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar-version')===null,null),true)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar-subject').hidden,null),true)
    assert.equal(await cdp.evaluate(()=>document.querySelector('header').nextElementSibling.className,null),'fs-sidebar-tabs')
    assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-sidebar-system').length,null),7)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar').textContent.includes('选品中心'),null),false)
    await cdp.evaluate(()=>document.querySelector('[aria-label="打开抖音获客"]').click()||true,null)
    await cdp.evaluate(()=>document.querySelector('[aria-label="打开进销存系统"]').click()||true,null)
    await cdp.evaluate(()=>document.querySelector('[aria-label="打开抖音获客"]').click()||true,null)
    assert.equal(await cdp.evaluate(()=>document.querySelectorAll('.fs-system-tab').length,null),2)
    await cdp.evaluate(()=>{const tab=document.querySelector('.fs-system-tab [aria-selected=true]');tab.focus();tab.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return true},null)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-system-tab [aria-selected=true]').textContent,null),'进销存系统')
    assert.equal(await cdp.evaluate(()=>document.activeElement.id,null),'fs-system-tab-cloud:erp')
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-system-toolbar').getBoundingClientRect().height,null),46)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar').textContent.includes('FutureStaff.Agent'),null),true)
    assert.equal(await cdp.evaluate(()=>!!document.querySelector('.fs-system-icon svg'),null),true)
    await cdp.evaluate(()=>document.querySelector('[aria-label="刷新进销存系统"]').click()||true,null)
    assert.equal(await cdp.evaluate(()=>window.nativeRequests.some(r=>r.action==='reload'&&r.appId==='erp'),null),true)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-embedded-tools').getBoundingClientRect().bottom<=document.querySelector('.fs-system-toolbar').getBoundingClientRect().bottom,null),true)
    await cdp.evaluate(()=>document.querySelector('[aria-label="打开抖音获客"]').click()||true,null)
    const image=await cdp.call('Page.captureScreenshot',{format:'png'})
    await writeFile(path.join(output,'desktop.png'),Buffer.from(image.data,'base64'))
    assert.equal(await cdp.evaluate(()=>document.querySelectorAll('[aria-label="打开越南签证"]').length,null),1)
    await cdp.evaluate(()=>document.querySelector('[aria-label="打开越南签证"]').click()||true,null)
    await sleep(50)
    assert.equal(await cdp.evaluate(()=>window.nativeRequests.some(input=>input.action==='show'&&input.appId==='immigration'&&!('url'in input)&&input.bounds.width>0),null),true)
    assert.equal(await cdp.evaluate(()=>window.externalOpens,null),0)
    await cdp.evaluate(()=>document.querySelector('[aria-label="打开品牌运营系统"]').click()||true,null)
    assert.equal(await cdp.evaluate(()=>document.getElementById('fs-system-tab-cloud:geo').textContent,null),'品牌运营系统')
    await cdp.evaluate(()=>document.getElementById('fs-sessions-tab').click()||true,null)
    assert.equal(await cdp.evaluate(()=>document.querySelector('[aria-label="会话输入"]').value,null),'保留的会话草稿')
    await cdp.evaluate(()=>document.getElementById('fs-menu-tab').click()||true,null)
    await cdp.evaluate(()=>document.querySelector('[aria-label="测试用户，用户菜单"]').click()||true,null)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar-account').getAttribute('data-open'),null),'true')
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar-subject').hidden,null),false)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar-subject').nextElementSibling.className,null),'fs-sidebar-settings')
    await writeFile(path.join(output,'account-subject.png'),Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar-account .fs-sidebar-version').textContent,null),'客户端版本 · v2.0.22')
    await sleep(80)
    assert.equal(await cdp.evaluate(()=>window.nativeRequests.filter(r=>r.appId==='geo').at(-1)?.action??'none',null),'show')
    await cdp.evaluate(()=>{const page=document.createElement('section');page.className='fs-settings-page';page.style.cssText='position:fixed;inset:32px 0 0;background:white';document.body.append(page);return true},null)
    await sleep(120)
    assert.equal(await cdp.evaluate(()=>window.nativeRequests.filter(r=>r.appId==='geo').at(-1)?.action??'none',null),'hide')
    await cdp.evaluate(()=>{document.querySelector('.fs-settings-page').remove();return true},null)
    await sleep(120)
    assert.equal(await cdp.evaluate(()=>window.nativeRequests.filter(r=>r.appId==='geo').at(-1)?.action??'none',null),'show')
    await cdp.evaluate(()=>{window.originalFrame={request:requestAnimationFrame,cancel:cancelAnimationFrame};window.requestAnimationFrame=()=>0;window.cancelAnimationFrame=()=>{};window.nativeRequests=[];window.dispatchEvent(new Event('resize'));return true},null)
    await sleep(180)
    assert.equal(await cdp.evaluate(()=>window.nativeRequests.filter(r=>r.appId==='geo').at(-1)?.action??'none',null),'show')
    await cdp.evaluate(()=>{window.requestAnimationFrame=window.originalFrame.request;window.cancelAnimationFrame=window.originalFrame.cancel;return true},null)
    await cdp.evaluate(()=>{const dialog=document.createElement('div');dialog.id='modal-fixture';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.style.cssText='position:fixed;inset:80px;z-index:100;background:white';document.body.append(dialog);return true},null)
    await sleep(80)
    assert.equal(await cdp.evaluate(()=>window.nativeRequests.filter(r=>r.appId==='geo').at(-1)?.action??'none',null),'hide')
    await cdp.evaluate(()=>{document.getElementById('modal-fixture').remove();return true},null)
    await sleep(80)
    assert.equal(await cdp.evaluate(()=>window.nativeRequests.filter(r=>r.appId==='geo').at(-1)?.action??'none',null),'show')
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    await cdp.evaluate(()=>document.querySelector('[aria-label="收起侧栏"]').click()||true,null)
    await cdp.evaluate(()=>document.querySelector('.fs-sidebar').parentElement.style.width='54px',null)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar-workspaces')?.hidden,null),true)
    assert.equal(await cdp.evaluate(()=>!!document.querySelector('#fs-sessions-panel button[aria-label="搜索会话"]'),null),true)
    assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('.fs-sidebar-tabs button')].every(b=>b.textContent===''&&!!b.querySelector('svg')&&!!b.getAttribute('aria-label')),null),true)
    assert.equal(await cdp.evaluate(()=>[...document.querySelectorAll('.fs-sidebar-system')].every(b=>b.getBoundingClientRect().height===36),null),true)
    await cdp.evaluate(()=>document.getElementById('fs-sessions-tab').click()||true,null)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar').dataset.collapsed,null),'true')
    await cdp.evaluate(()=>document.getElementById('fs-menu-tab').click()||true,null)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar').dataset.collapsed,null),'true')
    assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true)
    assert.ok(await cdp.evaluate(()=>document.querySelector('.fs-sidebar-account').getBoundingClientRect().width>=200,null));assert.equal(await cdp.evaluate(()=>getComputedStyle(document.querySelector('.dshDesktopSidebarSurface')).overflow,null),'visible')
    assert.equal(await cdp.evaluate(()=>getComputedStyle(document.querySelector('.fs-sidebar-subject .fs-sidebar-name')).display,null),'block')
    await sleep(80)
    assert.equal(await cdp.evaluate(()=>{const r=window.nativeRequests.filter(r=>r.appId==='geo').at(-1),popup=document.querySelector('.fs-sidebar-account').getBoundingClientRect();return r?.action==='show'&&r.bounds.x>=popup.right&&r.bounds.width>0},null),true)
    await cdp.evaluate(()=>document.querySelector('[aria-label="测试用户，用户菜单"]').click()||true,null)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar').dataset.collapsed,null),'true')
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar-version')===null,null),true)
    const rail=await cdp.call('Page.captureScreenshot',{format:'png'})
    await writeFile(path.join(output,'collapsed-light.png'),Buffer.from(rail.data,'base64'))
    await cdp.evaluate(()=>document.querySelector('[aria-label="测试用户，用户菜单"]').click()||true,null)
    await cdp.evaluate(()=>{window.fixture.setDark();return true},null)
    assert.equal(await cdp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth,null),true)
    assert.equal(await cdp.evaluate(()=>getComputedStyle(document.querySelector('.fs-sidebar')).backgroundColor,null),'rgb(23, 24, 28)')
    const narrow=await cdp.call('Page.captureScreenshot',{format:'png'})
    await writeFile(path.join(output,'narrow-dark.png'),Buffer.from(narrow.data,'base64'))
    await cdp.evaluate(()=>document.querySelector('[aria-label="测试用户，用户菜单"]').click()||true,null)
    await cdp.evaluate(()=>document.getElementById('fs-sessions-tab').click()||true,null)
    assert.equal(await cdp.evaluate(()=>document.querySelector('input[aria-label="搜索会话"]').getBoundingClientRect().width,null),0)
    const sessionsRail=await cdp.call('Page.captureScreenshot',{format:'png'})
    await writeFile(path.join(output,'collapsed-sessions.png'),Buffer.from(sessionsRail.data,'base64'))
    await cdp.evaluate(()=>{document.querySelector('.fs-sidebar').parentElement.style.width='264px';document.querySelector('#fs-sessions-panel button[aria-label="搜索会话"]').click();return true},null)
    await sleep(80)
    assert.equal(await cdp.evaluate(()=>document.querySelector('.fs-sidebar').dataset.collapsed,null),'false')
    assert.equal(await cdp.evaluate(()=>document.activeElement===document.querySelector('input[aria-label="搜索会话"]'),null),true)
    assert.equal(await cdp.evaluate(()=>document.querySelector('input[aria-label="搜索会话"]').value,null),'保留搜索')
    await cdp.evaluate(()=>document.querySelector('[aria-label="打开Web 系统"]').click()||true,null)
    await sleep(100)
    assert.equal(await cdp.evaluate(()=>window.nativeRequests.filter(r=>r.appId==='web').at(-1)?.action,null),'show')
    assert.equal(await cdp.evaluate(()=>window.externalOpens,null),0)
    await cdp.evaluate(async()=>{await window.fixture.controller.logout();return true},null)
    assert.equal(await cdp.evaluate(()=>window.fixture.pages.getSnapshot().tabs.length,null),0)
  } finally { cdp?.close();child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve)) }
})
