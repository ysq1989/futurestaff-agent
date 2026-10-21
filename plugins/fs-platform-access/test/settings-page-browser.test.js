import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cdp } from '@futurestaff/douyin-dm-mcp/browser'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const executable = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

test('settings is a full page with section search, independent scrolling, return focus and preserved onboarding', { skip: !executable, timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fs-settings-page-'))
  const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{FutureStaffSettingsRoot}from'./plugins/fs-platform-access/src/client/settings-page.tsx';
    import{appearanceTokens}from'./plugins/fs-platform-access/src/client/appearance.ts';
    const rows=[{id:'futurestaff-access',label:'FutureStaff',order:-10},{id:'futurestaff-agent-market',label:'Agent 市场',order:-9},{id:'general',label:'通用设置',order:0},{id:'agent-presets',label:'Agent 预设',order:1}];
    function App(){const[items,setItems]=useState(rows);window.removeGeneral=()=>setItems(rows.filter(r=>r.id!=='general'));
      window.theme=mode=>{for(const[k,v]of Object.entries(appearanceTokens))document.body.style.setProperty(k,v[mode])};
      return <aside className="fs-sidebar"><header className="fs-sidebar-brand" id="old-brand">工作台品牌和折叠按钮</header><button id="chat">原有聊天</button><FutureStaffSettingsRoot wide reconnect={()=>{window.reconnected=true}}
       useConnectionState={s=>s('connected')} useSections={s=>s(items)} useOnboardingSteps={s=>s([{id:'welcome',order:0}])}
       useSessions={s=>s({phase:'ready',current:undefined,byId:{}})} t={key=>key}
       renderSlot={(name,props,options)=>name==='settings.trigger'?'设置':name==='settings.header'?'设置':name==='settings.action'?<button>导出诊断信息</button>:
        name==='settings.onboarding'?<button id="onboarding" onClick={()=>props.openSection('general')}>引导打开设置</button>:
        name==='settings.section'?<div><p>现有设置内容：{options.only}</p><label>设置值<input id="setting-value" defaultValue="保留值"/></label>{Array.from({length:28},(_,i)=><p key={i}>设置内容 {i}</p>)}</div>:null}/></aside>}
    createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic' })
  const server = createServer((request, response) => {
    response.setHeader('content-type', request.url === '/app.js' ? 'text/javascript' : 'text/html')
    response.end(request.url === '/app.js' ? bundle.outputFiles[0].text : '<html><body style="margin:0;font-family:Segoe UI"><div class="dshDesktopWindowsCaptionRow" style="height:32px">FutureStaff Agent</div><div id="root"></div><script src="/app.js"></script></body></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = spawn(executable, ['--headless=new', '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${dir}/browser`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let cdp
  try {
    let portFile
    for (let i = 0; i < 100; i++) { try { portFile = await readFile(path.join(dir, 'browser', 'DevToolsActivePort'), 'utf8'); break } catch { await pause(50) } }
    assert.ok(portFile)
    const target = (await (await fetch(`http://127.0.0.1:${portFile.split('\n')[0]}/json/list`)).json()).find(v => v.type === 'page')
    cdp = await Cdp.connect(target.webSocketDebuggerUrl)
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await cdp.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` })
    for (let i = 0; i < 100; i++) { if (await cdp.evaluate(() => !!document.querySelector('[data-settings-trigger]'), null)) break; await pause(50) }
    await cdp.evaluate(() => { window.theme('light'); document.querySelector('[data-settings-trigger]').click(); return true }, null)
    await pause(100)
    assert.deepEqual(await cdp.evaluate(() => { const el = document.querySelector('.fs-settings-page'), r = el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,modal:!!document.querySelector('[aria-modal=true]'),inert:document.getElementById('chat').inert } }, null), { x:0,y:32,width:1440,height:868,modal:false,inert:true })
    assert.equal(await cdp.evaluate(() => document.activeElement.getAttribute('aria-label'), null), '返回工作台')
    assert.equal(await cdp.evaluate(() => document.querySelectorAll('[data-settings-section="agent-presets"]').length, null), 0)
    assert.deepEqual(await cdp.evaluate(() => { const brand=document.querySelector('.fs-settings-brand'),r=brand.getBoundingClientRect(),logo=brand.querySelector('img').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,logoFits:logo.top>=r.top&&logo.bottom<=r.bottom,oldHidden:getComputedStyle(document.getElementById('old-brand')).visibility==='hidden',buttons:brand.querySelectorAll('button').length} }, null), {x:0,y:0,width:264,height:32,logoFits:true,oldHidden:true,buttons:0})
    await cdp.evaluate(() => { document.querySelector('[data-settings-section="general"]').click(); return true }, null); await pause(50)
    assert.equal(await cdp.evaluate(() => document.querySelector('h2').textContent, null), '通用设置')
    assert.equal(await cdp.evaluate(() => document.querySelector('#setting-value').value, null), '保留值')
    await cdp.evaluate(() => { const el=document.querySelector('input[type=search]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,'Agent');el.dispatchEvent(new Event('input',{bubbles:true})); return true }, null); await pause(50)
    assert.equal(await cdp.evaluate(() => document.querySelectorAll('[data-settings-section]').length, null), 1)
    assert.equal(await cdp.evaluate(() => document.querySelector('h2').textContent, null), '通用设置')
    await cdp.evaluate(() => { window.removeGeneral(); return true }, null); await pause(50)
    assert.equal(await cdp.evaluate(() => document.querySelector('h2').textContent, null), 'FutureStaff')
    const output = path.join(root, 'output/settings-page'); await mkdir(output, { recursive:true })
    for (const [mode,width] of [['light',1440],['dark',1440],['light',520]]) {
      await cdp.evaluate(mode => { window.theme(mode); return true }, mode)
      await cdp.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(50)
      assert.equal(await cdp.evaluate(() => document.documentElement.scrollWidth <= innerWidth, null), true)
      const shot=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,`${mode}-${width}.png`),Buffer.from(shot.data,'base64'))
    }
    await cdp.evaluate(() => { document.querySelector('[aria-label="返回工作台"]').click(); return true }, null); await pause(50)
    assert.equal(await cdp.evaluate(() => !!document.querySelector('.fs-settings-page'), null), false)
    assert.equal(await cdp.evaluate(() => document.getElementById('root').inert, null), false)
    assert.equal(await cdp.evaluate(() => getComputedStyle(document.getElementById('old-brand')).visibility, null), 'visible')
    assert.equal(await cdp.evaluate(() => document.activeElement.hasAttribute('data-settings-trigger'), null), true)
    await cdp.evaluate(() => { document.querySelector('#onboarding').click(); return true }, null);await pause(50)
    assert.equal(await cdp.evaluate(() => !!document.querySelector('.fs-settings-page'), null), true)
  } finally { cdp?.close(); browser.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
