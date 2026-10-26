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

test('SHOP current-role card explicitly installs then opens its new version workspace and cancels a late revoked open', { skip: !executable, timeout: 30000 }, async () => {
 const dir = await mkdtemp(path.join(os.tmpdir(), 'fs-shop-snapshot-browser-')), requests = []
 const card = { agentId: '30000000-0000-4000-8000-000000000001', name: 'SHOP 系统助手', description: '当前平台授权的商城角色', version: 'c'.repeat(64), available: true, unavailableReason: null, businessSystems: ['shop'], requiredApplications: ['shop'] }
 let installed = false, slow = false
 const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
 import React from 'react';import {createRoot} from 'react-dom/client';import {createAgentHome,createAgentPicker} from './plugins/fs-platform-access/src/client/agents.tsx';import {appearanceTokens} from './plugins/fs-platform-access/src/client/appearance.ts';
 const listeners=new Set(),apps=[{appId:'shop',tenantId:'tenant',capabilities:['shop.admin']}];let state={phase:'ready',activeTenantId:'tenant',user:{userId:'member'},applications:apps};
 const controller={getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};
 window.native=[];window.logout=()=>{state={phase:'signed_out'};listeners.forEach(fn=>fn())};window.restore=()=>{state={phase:'ready',activeTenantId:'tenant',user:{userId:'member'},applications:apps};listeners.forEach(fn=>fn())};window.revoke=()=>{state={...state,applications:[]};listeners.forEach(fn=>fn())};
 for(const[k,v] of Object.entries(appearanceTokens))document.documentElement.style.setProperty(k,v.light);
 const Home=createAgentHome(controller),Picker=createAgentPicker(controller);const createWorkspace=async({path})=>{window.native.push(['workspace',path]);return{workspaceId:path,path,sessionIds:[]}};const onPick=id=>{window.native.push(['start',id])};
 const root=createRoot(document.getElementById('root'));window.home=()=>root.render(<Home createWorkspace={createWorkspace} onPick={onPick}/>);window.picker=()=>root.render(<Picker open onClose={()=>{}} onPick={onPick} createWorkspace={createWorkspace}/>);window.home();
 ` }, bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser' })
 const server = createServer(async (req, res) => {
  if (req.url.startsWith('/_futurestaff/')) {
   let body = ''; for await (const chunk of req) body += chunk
   const parsed = body ? JSON.parse(body) : null; requests.push({ path: req.url, body: parsed, authorization: req.headers.authorization })
   res.setHeader('content-type', 'application/json')
   if (req.url === '/_futurestaff/agents/current-snapshots') return res.end(JSON.stringify({ items: [{ ...card, installed }] }))
   if (req.url === '/_futurestaff/agents/install-snapshot') { await pause(70); installed = true; return res.end('{"ok":true}') }
   if (req.url === '/_futurestaff/agents/open-snapshot') { if (slow) await pause(350); return res.end(JSON.stringify({ agentId: card.agentId, name: card.name, version: card.version, path: '/fixture/agents/' + card.agentId + '/snapshots/' + card.version + '/workspace' })) }
   if (req.url === '/_futurestaff/agents/catalog' || req.url === '/_futurestaff/agents/distribution' || req.url === '/_futurestaff/agent-market/catalog' || req.url === '/_futurestaff/agent-market/mine') return res.end('{"items":[]}')
   res.statusCode = 404; return res.end('{}')
  }
  res.setHeader('content-type', req.url === '/app.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : '<html><body style="margin:0;height:100vh"><div id="root" style="height:100%"></div><script src="/app.js"></script></body></html>')
 })
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
 const browser = spawn(executable, ['--headless=new', '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${dir}/browser`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
 let cdp
 try {
  let port; for (let i = 0; i < 100; i++) { try { port = (await readFile(path.join(dir, 'browser/DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await pause(50) } } assert.ok(port)
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'); cdp = await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` })
  const wait = async fn => { for (let i = 0; i < 100; i++) { if (await cdp.evaluate(fn, null)) return; await pause(25) } throw Error('SHOP current-role UI did not settle: ' + fn) }
  const click = async text => cdp.evaluate(text => { const button = [...document.querySelectorAll('[data-current-agent-id] button')].find(el => el.textContent === text); if (!button || button.disabled) throw Error('Button unavailable: ' + text); button.click(); return true }, text)
  await wait(() => !!document.querySelector('[data-current-agent-id]'))
  assert.match(await cdp.evaluate(() => document.querySelector('[data-current-agent-id]').textContent, null), /SHOP 系统助手/)
  assert.equal(await cdp.evaluate(() => [...document.querySelectorAll('[data-current-agent-id] button')].some(button => button.textContent === '开始对话'), null), false, 'a directory offer cannot silently count as installed')
  await click('安装当前版本')
  await wait(() => [...document.querySelectorAll('[data-current-agent-id] button')].some(button => button.textContent === '开始对话' && !button.disabled))
  assert.equal(requests.filter(row => row.path.endsWith('/install-snapshot')).length, 1)
  await click('开始对话'); await wait(() => window.native.length === 2)
  assert.deepEqual(requests.find(row => row.path.endsWith('/open-snapshot')).body, { agentId: card.agentId, version: card.version })
  const native = await cdp.evaluate(() => window.native, null)
  assert.equal(native[0][1], '/fixture/agents/' + card.agentId + '/snapshots/' + card.version + '/workspace'); assert.equal(native[1][1], native[0][1])
  await cdp.evaluate(() => { window.picker(); return true }, null); await wait(() => document.querySelectorAll('.fs-agent-choice').length === 1)
  await cdp.evaluate(() => { document.querySelector('.fs-agent-choice').click(); return true }, null); await wait(() => window.native.length === 4)
  slow = true; await cdp.evaluate(() => { window.home(); return true }, null); await wait(() => !!document.querySelector('[data-current-agent-id]'))
  await click('开始对话'); await cdp.evaluate(() => { window.revoke(); return true }, null); await pause(450)
  assert.equal(await cdp.evaluate(() => window.native.length, null), 4, 'late Host response must not create a native workspace under revoked same-owner access')
  assert.equal(await cdp.evaluate(() => !!document.querySelector('[data-current-agent-id]'), null), false)
  assert.ok(requests.every(row => row.authorization === undefined))
  assert.ok(requests.filter(row => row.path.endsWith('/install-snapshot') || row.path.endsWith('/open-snapshot')).every(row => Object.keys(row.body).sort().join() === 'agentId,version'))
 } finally { if (cdp) await cdp.call('Browser.close').catch(() => {}); cdp?.close(); browser.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
