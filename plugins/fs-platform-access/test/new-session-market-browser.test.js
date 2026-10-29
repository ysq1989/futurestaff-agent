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
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

test('new session shows the authorized market and opens the selected template or published agent directly', { skip: !executable, timeout: 35000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fs-new-session-market-'))
  const requests = []
  const version = 'a'.repeat(64)
  const template = (number, name, category, applications = []) => ({
    templateId: `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    name, description: `${name}的知识与工作技能。`, icon: 'AI', category, version,
    capabilityBullets: ['根据当前资料完成工作', '产出可继续编辑的结果'],
    requiredApplications: applications, compatible: true, unavailableReason: null,
  })
  const templates = [
    template(1, '文案创作助手', 'office'),
    template(2, '代码审查助手', 'engineering'),
    template(3, 'ERP 库存助理', 'erp-system', ['erp']),
    template(4, '网站管理员', 'software-development', ['web']),
  ]
  const publication = (number, name, applications = []) => ({
    agentId: `30000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    name, description: `${name}的正式发布版本。`, version, sha256: version,
    bytes: 100, notes: '', available: true, unavailableReason: null, publishedAt: null,
    installedVersion: version, versions: [version], updateAvailable: false,
    requirements: { minClientVersion: '1.0.0', capabilities: ['core.chat'] },
    category: applications.length ? 'software-development' : 'office', requiredApplications: applications,
  })
  const publications = [publication(1, '团队知识助手'), publication(2, '未授权网站发布助手', ['web'])]
  let installed = [{ ...templates[1], presetId: 'installed-code-reviewer', path: '/fixture/code-reviewer/workspace' }]
  let mode = 'normal', slowCatalog = true, sessionNumber = 0
  const bundle = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {createAgentHome,createAgentBrowser} from './plugins/fs-platform-access/src/client/agents.tsx';
      import {createAccountSidebar} from './plugins/fs-platform-access/src/client/sidebar.tsx';
      import {appearanceTokens} from './plugins/fs-platform-access/src/client/appearance.ts';
      const listeners = new Set();
      let identity = {phase:'ready',activeTenantId:'tenant',user:{userId:'member',displayName:'测试成员'},
        tenants:[{tenantId:'tenant',displayName:'FutureStaff 工作空间'}],models:[],
        applications:[{appId:'erp',tenantId:'tenant',displayName:'进销存系统',baseUrl:'https://erp-dev.fsstory.net',deepLinks:{home:'/'},capabilities:['erp.read']}]};
      const controller = {getSnapshot:()=>identity,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},
        logout:async()=>{identity={...identity,phase:'signed_out',applications:[]};listeners.forEach(listener=>listener())}};
      window.fixture = {opened:[],created:[],picked:[],centerOpens:0,
        applications:applications=>{identity={...identity,applications};listeners.forEach(listener=>listener())},
        theme:mode=>{for(const[key,value]of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value[mode])}};
      window.fixture.theme('light');
      const Home=createAgentHome(controller,()=>window.fixture.centerOpens++,sessionId=>window.fixture.opened.push(sessionId));
      const Browser=createAgentBrowser(controller,()=>null);
      const Sidebar=createAccountSidebar(controller,undefined,()=>window.fixture.remount());
      const createWorkspace=async input=>{window.fixture.created.push(input);return {workspaceId:'published-workspace',path:input.path,sessionIds:[]}};
      const sessions={ids:[],byId:{},current:undefined},workspaces={items:[],archivedSessionIds:[]};
      const browserProps={useSessions:select=>select(sessions),useWorkspaces:select=>select(workspaces),createWorkspace,
        startSession:()=>{},open:()=>{},archiveSession:async()=>{},wide:true};
      function App({generation}){const[collapsed,setCollapsed]=useState(false);return <div className="fixture-shell">
        <div className="fixture-sidebar dshDesktopSidebarSurface" style={{width:collapsed?72:270}}><Sidebar collapsed={collapsed} width={270}
          toggleSidebar={()=>setCollapsed(value=>!value)} startSession={()=>window.fixture.remount()}
          renderSlot={name=>name==='sidebar.workspaces'?<Browser {...browserProps}/>:null}/></div>
        <main className="fixture-main"><Home key={generation} createWorkspace={createWorkspace} onPick={id=>window.fixture.picked.push(id)}/></main>
      </div>}
      const app=createRoot(document.getElementById('root')); let generation=0;
      window.fixture.remount=()=>app.render(<App generation={++generation}/>);
      window.fixture.remount();
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser',
  })
  const server = createServer(async (request, response) => {
    if (request.url.startsWith('/_futurestaff/')) {
      let body = ''
      for await (const chunk of request) body += chunk
      requests.push({ path: request.url, method: request.method, body: body ? JSON.parse(body) : null, authorization: request.headers.authorization })
      response.setHeader('content-type', 'application/json')
      if (request.url === '/_futurestaff/agent-market/catalog') {
        if (slowCatalog) await pause(450)
        if (mode === 'error') { response.statusCode = 503; return response.end('{}') }
        return response.end(JSON.stringify({ items: mode === 'empty' ? [] : templates }))
      }
      if (request.url === '/_futurestaff/agent-market/mine') return response.end(JSON.stringify({ items: mode === 'empty' ? [] : installed }))
      if (request.url === '/_futurestaff/agent-market/install') {
        const selected = templates.find(item => item.templateId === JSON.parse(body).templateId)
        installed = [...installed.filter(item => item.templateId !== selected.templateId), { ...selected, presetId: 'newly-installed-writer', path: '/fixture/writer/workspace' }]
        return response.end(JSON.stringify({ presetId: 'newly-installed-writer' }))
      }
      if (request.url === '/_futurestaff/agent-market/open') {
        const selected = installed.find(item => item.presetId === JSON.parse(body).presetId)
        return response.end(JSON.stringify({ ...selected, sessionId: `exact-host-session-${++sessionNumber}` }))
      }
      if (request.url === '/_futurestaff/agents/distribution') return response.end(JSON.stringify({ items: mode === 'empty' ? [] : publications, dataDirectory: '/fixture' }))
      if (request.url === '/_futurestaff/agents/catalog') return response.end(JSON.stringify({
        items: mode === 'empty' ? [] : publications.map(item => ({ ...item, path: '/fixture/catalog-path-must-not-be-used' })), dataDirectory: '/fixture',
      }))
      if (request.url === '/_futurestaff/agents/open-installed') return response.end(JSON.stringify({ path: '/fixture/published/selected-workspace' }))
      response.statusCode = 404
      return response.end('{}')
    }
    response.setHeader('content-type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html; charset=utf-8')
    response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].text : '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Segoe UI,Microsoft YaHei,sans-serif;background:var(--bg-primary);color:var(--text-primary)}.fixture-shell{display:flex;height:100vh;min-width:0;overflow:hidden}.fixture-sidebar{flex-shrink:0;min-height:0}.fixture-main{flex:1;min-width:0;min-height:0}@media(max-width:699px){.fixture-sidebar{display:none}}</style><div id="root"></div><script src="/fixture.js"></script></body></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = spawn(executable, ['--headless=new', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${directory}/browser`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let cdp
  try {
    let port
    for (let attempt = 0; attempt < 100; attempt++) {
      try { port = (await readFile(path.join(directory, 'browser', 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await pause(50) }
    }
    assert.ok(port, 'the real browser exposes its CDP port')
    const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page')
    cdp = await Cdp.connect(target.webSocketDebuggerUrl)
    const browserErrors = []
    cdp.on('Runtime.exceptionThrown', event => browserErrors.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? 'Uncaught browser exception'))
    cdp.on('Runtime.consoleAPICalled', event => { if (event.type === 'error') browserErrors.push(event.args.map(item => item.value ?? item.description ?? item.type).join(' ')) })
    await cdp.call('Runtime.enable')
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await cdp.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
    const wait = async (condition, message) => {
      for (let attempt = 0; attempt < 120; attempt++) {
        if (await cdp.evaluate(condition, null)) return
        await pause(30)
      }
      assert.fail(message || `browser state did not settle: ${String(condition)}`)
    }
    const click = async (selector, label) => cdp.evaluate(({ selector, label }) => {
      const button = [...document.querySelectorAll(`${selector} button`)].find(item => item.textContent.trim() === label || item.textContent.startsWith(label + ' ·'))
      if (!button || button.disabled) throw Error('Button unavailable: ' + label)
      button.click()
      return true
    }, { selector, label })
    const search = async value => cdp.evaluate(value => {
      const input = document.querySelector('[aria-label="搜索智能体"]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    }, value)
    await wait(() => !!document.querySelector('.fs-agent-home'))
    assert.equal(await cdp.evaluate(() => !!document.querySelector('.fs-sidebar') && !!document.querySelector('.fs-agent-browser') && !document.querySelector('.fs-sidebar-footer').textContent.includes('智能体'), null), true, 'the real sidebar footer must have no second agent entry')
    await wait(() => document.querySelector('.fs-sidebar-logo')?.naturalWidth > 0)
    assert.equal(await cdp.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '打开智能体中心'), null), false, 'new session must not send the member through a second directory')
    await wait(() => document.querySelectorAll('[data-template-id]').length === 3 && document.querySelectorAll('[data-published-agent-id]').length === 1, 'new session must show authorized installed and uninstalled templates plus publications')
    slowCatalog = false
    assert.equal(await cdp.evaluate(() => document.body.textContent.includes('网站管理员') || document.body.textContent.includes('未授权网站发布助手'), null), false)
    assert.equal(await cdp.evaluate(() => !!document.querySelector('[data-template-id="10000000-0000-4000-8000-000000000001"]:not([data-preset-id])'), null), true)
    await search('代码审查')
    await wait(() => document.querySelectorAll('[data-template-id]').length === 1 && document.querySelectorAll('[data-published-agent-id]').length === 0)
    assert.equal(await cdp.evaluate(() => document.querySelector('[data-template-id]').getAttribute('data-template-id'), null), templates[1].templateId)
    await search('')
    await click('[aria-label="助手分类"]', '系统助手')
    await wait(() => document.querySelectorAll('[data-template-id]').length === 1)
    assert.equal(await cdp.evaluate(() => document.querySelector('[data-template-id]').getAttribute('data-template-id'), null), templates[2].templateId)
    await cdp.evaluate(() => { window.fixture.applications([{ appId: 'erp', tenantId: 'another-tenant', capabilities: ['erp.read'] }]); return true }, null)
    await wait(() => !document.querySelector('[data-template-id="10000000-0000-4000-8000-000000000003"]'))
    await cdp.evaluate(() => { window.fixture.applications([{ appId: 'erp', tenantId: 'tenant', capabilities: ['erp.read'] }]); return true }, null)
    await wait(() => document.querySelectorAll('[data-template-id]').length === 3)
    await wait(() => [...document.querySelectorAll('[data-template-id="10000000-0000-4000-8000-000000000001"] button')].some(button => !button.disabled && button.textContent.trim() === '下载并安装'))
    await click('[data-template-id="10000000-0000-4000-8000-000000000001"]', '下载并安装')
    await wait(() => !!document.querySelector('[data-template-id="10000000-0000-4000-8000-000000000001"][data-preset-id]'))
    assert.deepEqual(requests.findLast(item => item.path === '/_futurestaff/agent-market/install').body, { templateId: templates[0].templateId, version })
    await click('[data-template-id="10000000-0000-4000-8000-000000000001"]', '开始对话')
    await wait(() => window.fixture.opened.length === 1)
    assert.deepEqual(await cdp.evaluate(() => ({ opened: window.fixture.opened, created: window.fixture.created, picked: window.fixture.picked }), null), { opened: ['exact-host-session-1'], created: [], picked: [] }, 'templates open the exact Host session and do not create a duplicate workspace')
    assert.deepEqual(requests.findLast(item => item.path === '/_futurestaff/agent-market/open').body, { presetId: 'newly-installed-writer' })
    await click('[data-published-agent-id="30000000-0000-4000-8000-000000000001"]', '开始对话')
    await wait(() => window.fixture.picked.length === 1)
    assert.deepEqual(await cdp.evaluate(() => ({ created: window.fixture.created, picked: window.fixture.picked, centerOpens: window.fixture.centerOpens }), null), { created: [{ path: '/fixture/published/selected-workspace' }], picked: ['published-workspace'], centerOpens: 0 }, 'published selection opens the server-selected workspace without returning to the directory')
    assert.deepEqual(requests.findLast(item => item.path === '/_futurestaff/agents/open-installed').body, { agentId: publications[0].agentId })
    assert.equal(requests.some(item => item.path === '/_futurestaff/agents/select'), false)
    assert.ok(requests.every(item => item.authorization === undefined), 'browser fixture never copies a Platform bearer credential')

    const output = path.join(root, 'output', 'new-session-agents-20261023')
    await mkdir(output, { recursive: true })
    for (const [theme, width] of [['light', 1440], ['dark', 1440], ['light', 390]]) {
      await cdp.evaluate(theme => { window.fixture.theme(theme); return true }, theme)
      await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
      await pause(60)
      assert.equal(await cdp.evaluate(() => getComputedStyle(document.querySelector('.fixture-sidebar')).display === 'none', null), width < 700, 'narrow previews show the content as one independent column')
      assert.equal(await cdp.evaluate(() => !document.querySelector('.fs-sidebar-footer').textContent.includes('智能体'), null), true)
      assert.equal(await cdp.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('article')].every(card => card.getBoundingClientRect().right <= innerWidth), null), true, `${theme} ${width}px must not overflow`)
      await writeFile(path.join(output, `home-${theme}-${width}.png`), Buffer.from((await cdp.call('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    }
    await search('不存在的智能体')
    await wait(() => document.body.textContent.includes('没有匹配的智能体'))
    assert.equal(await cdp.evaluate(() => document.querySelectorAll('article').length, null), 0)
    mode = 'empty'
    await cdp.evaluate(() => { window.fixture.remount(); return true }, null)
    await wait(() => !document.querySelector('.fs-agent-home [role=status]') && document.querySelectorAll('article').length === 0 && /暂无智能体|尚无可用智能体|暂时没有/.test(document.body.textContent))
    assert.match(await cdp.evaluate(() => document.body.textContent, null), /暂无智能体|尚无可用智能体|暂时没有/)
    mode = 'error'
    await cdp.evaluate(() => { window.fixture.remount(); return true }, null)
    await wait(() => !!document.querySelector('[role=alert]'))
    assert.match(await cdp.evaluate(() => document.querySelector('[role=alert]').textContent, null), /目录|读取|连接/)
    mode = 'normal'; slowCatalog = true
    await cdp.evaluate(() => { window.fixture.remount(); return true }, null)
    await wait(() => !!document.querySelector('.fs-agent-home [role=status]'))
    await wait(() => !document.querySelector('.fs-agent-home [role=status]') && document.querySelectorAll('[data-template-id]').length === 3)
    assert.deepEqual(browserErrors, [], 'the complete shell must have no uncaught browser exception or console.error')
  } finally {
    if (cdp) await cdp.call('Browser.close').catch(() => {})
    cdp?.close(); browser.kill(); server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
