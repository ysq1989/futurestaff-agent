import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cdp } from '@futurestaff/douyin-dm-mcp/browser'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const executable = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
test('published card starts and updates once, recovers after failure and preserves the legacy entry', { skip: !executable, timeout: 20000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fs-published-card-'))
  const mutations = []
  const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import {PublishedTalentCard} from './plugins/fs-platform-access/src/client/published-talent-card.tsx';
    const card={agentId:'10000000-0000-4000-8000-000000000001',name:'项目助手',description:'整理项目资料。',version:'b'.repeat(64),sha256:'b'.repeat(64),bytes:10,notes:'新增文件能力',available:true,unavailableReason:null,publishedAt:null,requirements:{minClientVersion:'3.3.0',capabilities:['core.chat','local.files']},installedVersion:'a'.repeat(64),versions:['a'.repeat(64),'b'.repeat(64)],updateAvailable:true};
    const operation=new AbortController();window.selected=[];window.settingsClosed=0;window.fallback=0;let pending;const onStart=selected=>{window.selected.push(selected.agentId);return new Promise((resolve,reject)=>{pending={resolve,reject}})};window.resolveStart=()=>pending.resolve();window.rejectStart=()=>pending.reject(Error('private-error'));const root=createRoot(document.getElementById('root'));window.renderCard=(exact=true)=>root.render(<PublishedTalentCard card={card} signal={operation.signal} onChanged={()=>{}} onNewSession={()=>{window.fallback++}} beforeNewSession={()=>{window.settingsClosed++}} {...(exact?{onStart}:{})}/>);window.renderCard();
  ` }, bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser' })
  const server = createServer(async (req, res) => {
    if (req.url === '/_futurestaff/agents/install') {
      let body = ''; for await (const chunk of req) body += chunk
      mutations.push(JSON.parse(body)); await pause(150)
      res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true }))
    }
    res.setHeader('content-type', req.url === '/app.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : '<html><body><div id="root"></div><script src="/app.js"></script></body></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = spawn(executable, ['--headless=new', '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${directory}/browser`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let cdp
  try {
    let port; for (let i = 0; i < 100; i++) { try { port = (await readFile(path.join(directory, 'browser', 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await pause(30) } }
    assert.ok(port)
    const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(row => row.type === 'page'); cdp = await Cdp.connect(target.webSocketDebuggerUrl)
    await cdp.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` })
    const wait = async fn => { for (let i = 0; i < 100; i++) { if (await cdp.evaluate(fn, null)) return; await pause(30) } throw Error('Published card did not settle: ' + String(fn)) }
    await wait(() => !!document.querySelector('[data-published-agent-id]'))
    assert.deepEqual(await cdp.evaluate(() => ({ details: document.querySelector('details')?.open, label: document.querySelector('details summary')?.textContent, primary: [...document.querySelectorAll('button')].find(el => el.textContent === '开始对话').classList.contains('fs-agent-primary') }), null), { details: false, label: '智能体详情', primary: true })
    await cdp.evaluate(() => { const button = [...document.querySelectorAll('button')].find(el => el.textContent === '开始对话'); button.click(); button.click(); return true }, null)
    await wait(() => window.selected.length === 1)
    assert.deepEqual(await cdp.evaluate(() => ({ selected: window.selected, fallback: window.fallback, closed: window.settingsClosed, blocked: [...document.querySelectorAll('button')].every(el => el.disabled) }), null), { selected: ['10000000-0000-4000-8000-000000000001'], fallback: 0, closed: 1, blocked: true })
    await cdp.evaluate(() => { window.rejectStart(); return true }, null); await wait(() => !!document.querySelector('[role=alert]'))
    assert.equal(await cdp.evaluate(() => document.querySelector('[role=alert]').textContent, null), '会话入口暂不可用，请重试。')
    await cdp.evaluate(() => { [...document.querySelectorAll('button')].find(el => el.textContent === '开始对话').click(); return true }, null); await wait(() => window.selected.length === 2)
    await cdp.evaluate(() => { window.resolveStart(); return true }, null); await wait(() => !document.querySelector('[role=status]') && !document.querySelector('[role=alert]'))
    await cdp.evaluate(() => { window.renderCard(false); return true }, null); await pause(50)
    await cdp.evaluate(() => { [...document.querySelectorAll('button')].find(el => el.textContent === '开始对话').click(); return true }, null); await wait(() => window.fallback === 1)
    assert.equal(await cdp.evaluate(() => window.selected.length, null), 2)
    await cdp.evaluate(() => { const button = [...document.querySelectorAll('button')].find(el => el.textContent === '更新安装'); button.click(); button.click(); return true }, null)
    await wait(() => !!document.querySelector('[role=status]')); await wait(() => !document.querySelector('[role=status]'))
    assert.deepEqual(mutations, [{ agentId: '10000000-0000-4000-8000-000000000001', version: 'b'.repeat(64) }], 'repeated clicks in the same event turn must issue one installation')
  } finally { if (cdp) await cdp.call('Browser.close').catch(() => {}); cdp?.close(); browser.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
