import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {existsSync} from 'node:fs'
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Cdp} from '@futurestaff/douyin-dm-mcp/browser'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const executable = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const output = process.env.FUTURESTAFF_GOVERNANCE_LAYOUT_TEST_OUTPUT ?? path.join(root, 'output/candidate-dock-ui-20261027/browser')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

test('candidate dock stays within the conversation column and preserves chat, composer and keyboard draft access', {skip: !executable, timeout: 60000}, async () => {
  await mkdir(output, {recursive: true})
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fs-candidate-layout-'))
  // Use the upstream conversation shell's real CSS and DOM geometry. There is
  // deliberately no global box-sizing reset: the installed host has none.
  const conversationCss = await readFile(path.join(root, 'desktop-shell/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css'), 'utf8')
  const bundle = await build({stdin: {resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {CandidateWorkbench} from './plugins/fs-platform-access/src/client/governance-candidates.tsx';
    import {identifyCandidates} from './plugins/fs-platform-access/src/governance-candidates.ts';
    import {LocalCandidateOutbox} from './plugins/fs-platform-access/src/governance-outbox.ts';
    import {appearanceTokens} from './plugins/fs-platform-access/src/client/appearance.ts';
    import {messageCardCss} from './plugins/fs-platform-access/src/client/message-card.tsx';
    const style=document.createElement('style');style.textContent=messageCardCss;document.head.append(style);
    for(const [key,value] of Object.entries(appearanceTokens))document.documentElement.style.setProperty(key,value.light);
    window.fetchCalls=0;window.fetch=async()=>{window.fetchCalls++;throw Error('NETWORK_DISABLED_LAYOUT_FIXTURE')};
    const owner={tenantId:'layout-fixture-tenant',actorId:'layout-fixture-member'},sessionId='layout-fixture-session';
    const box=new LocalCandidateOutbox(owner);box.setPermission('enterprise_knowledge',true);
    (async()=>{
      for(let i=0;i<5;i++){
        const [draft]=await identifyCandidates({owner,conversationId:sessionId,activeConversationId:sessionId,
          sourceId:'layout-source-'+i,sourceVersion:'1',authorized:true,
          text:'公司规定：第'+i+'份本机合成候选仅供布局验收。'+('这段长摘录用于验证必要内容在卡片内换行和滚动。'.repeat(9))});
        await box.confirm(draft);
      }
      localStorage.setItem('futurestaff.governance.local.v1:'+JSON.stringify([owner.tenantId,owner.actorId]),box.serialize());
      createRoot(document.getElementById('dock-slot')).render(<CandidateWorkbench owner={owner} sessionId={sessionId} storage={localStorage}/>);
    })();
  `}, bundle: true, write: false, format: 'iife', jsx: 'automatic'})
  const server = createServer((request, response) => {
    response.setHeader('content-type', request.url === '/app.js' ? 'text/javascript' : 'text/html;charset=utf-8')
    response.end(request.url === '/app.js' ? bundle.outputFiles[0].text : `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
      ${conversationCss}
      html,body{margin:0;height:100%;font:14px Segoe UI;background:var(--bg-primary);color:var(--text-primary)}
      .fixture-shell{height:100dvh;display:grid;grid-template-columns:240px minmax(0,1fr)}
      .fixture-sidebar{background:var(--bg-secondary);border-right:1px solid var(--border-default);padding:16px}
      .root{--dsh-conversation-column-width:calc(100vw - 240px);--dsw-alias-bg-base:var(--bg-primary);--dsw-alias-border-l3:var(--border-default)}
      .fixture-header{box-sizing:border-box;height:72px;flex:none;padding:20px;border-bottom:1px solid var(--border-default)}
      .viewArea{box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;gap:12px;min-height:180px;padding:20px 32px}
      .viewArea p{margin:0;max-width:720px}.viewArea p:last-child{padding:12px;border:1px solid var(--border-default);border-radius:8px}
      .fixture-composer{box-sizing:border-box;width:min(var(--dsh-composer-card-max-width),calc(100% - 32px));margin:12px auto 16px;padding:16px;border:1px solid var(--border-default);border-radius:12px;background:var(--bg-primary)}
      .fixture-composer textarea{box-sizing:border-box;display:block;width:100%;height:60px;font:inherit;resize:none}.fixture-composer button{margin-top:8px}
      @media(max-width:640px){.fixture-shell{grid-template-columns:minmax(0,1fr)}.fixture-sidebar{display:none}.root{--dsh-conversation-column-width:100vw}.fixture-header{height:64px;padding:16px}.viewArea{padding:12px 24px}}
    </style><div class="fixture-shell"><aside class="fixture-sidebar">FutureStaff.Agent · 会话</aside><main class="root" data-phase="active">
      <header class="fixture-header">合成布局验收 · 对话</header><div class="body"><div class="scrollBody" data-conversation-scroll>
        <section class="viewArea" data-fixture-transcript><p>这是一份隔离浏览器中的合成对话，不使用账号或业务系统。</p><p data-fixture-last-message>Agent 的原回复应继续可见，候选草稿不能将它挤出屏幕。</p></section>
        <div class="composerSeat" data-composer-seat><div class="composerStack"><div id="dock-slot"></div>
          <form class="fixture-composer" onsubmit="return false"><textarea aria-label="发消息"></textarea><button type="button">发送消息</button></form>
        </div></div></div></div></main></div><script src="/app.js"></script></html>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = spawn(executable, ['--headless=new', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--no-proxy-server', '--remote-debugging-port=0', '--user-data-dir=' + directory + '/browser', 'about:blank'], {windowsHide: true, stdio: 'ignore'})
  let cdp
  const measurements = []
  try {
    let port
    for (let i = 0; i < 100; i++) {try {port = (await readFile(path.join(directory, 'browser/DevToolsActivePort'), 'utf8')).split('\n')[0]; break} catch {await pause(50)}}
    assert.ok(port, 'a fresh isolated browser starts')
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
    cdp = await Cdp.connect(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
    const waitFor = async predicate => {for (let i = 0; i < 160; i++) {if (await cdp.evaluate(predicate, null)) return; await pause(25)} throw Error('CANDIDATE_LAYOUT_UI_TIMEOUT')}
    const keyboardSpace = async () => {
      await cdp.call('Input.dispatchKeyEvent', {type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' '})
      await cdp.call('Input.dispatchKeyEvent', {type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32})
    }
    for (const viewport of [{label: 'desktop', width: 1440, height: 850}, {label: 'narrow', width: 390, height: 680}]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', {width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false})
      await cdp.call('Page.navigate', {url: 'http://127.0.0.1:' + server.address().port})
      await waitFor(() => document.querySelectorAll('[data-governance-queued]').length === 5)
      assert.equal(await cdp.evaluate(() => document.querySelector('.fs-candidate-dock').open, null), false)
      await cdp.evaluate(() => {document.querySelector('.fs-candidate-dock > summary').focus(); return true}, null)
      await keyboardSpace()
      await waitFor(() => document.querySelector('.fs-candidate-dock').open)
      await cdp.evaluate(() => {
        const textarea = document.querySelector('textarea[aria-label="当前对话的必要摘录"]')
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, '合成未保存摘录：收起后仍应保留。')
        textarea.dispatchEvent(new Event('input', {bubbles: true}))
        const scroller = document.querySelector('[data-conversation-scroll]'); scroller.scrollTop = scroller.scrollHeight
        return true
      }, null)
      await pause(50)
      const geometry = await cdp.evaluate(() => {
        const box = element => {const rect = element.getBoundingClientRect(); return {top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height}}
        const dock = document.querySelector('.fs-candidate-dock'), scroller = document.querySelector('[data-conversation-scroll]')
        const scrollboxes = [...dock.querySelectorAll('*')].filter(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY) && element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 2)
        const summary = box(dock.querySelector(':scope > summary')), header = box(document.querySelector('.fixture-header')), composer = box(document.querySelector('.fixture-composer')), lastMessage = box(document.querySelector('[data-fixture-last-message]'))
        const visibleMessageHeight = Math.max(0, Math.min(lastMessage.bottom, summary.top) - Math.max(lastMessage.top, header.bottom))
        const overflow = [document.documentElement, document.body, scroller, dock, ...dock.querySelectorAll('textarea,input,select')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({tag: element.tagName, className: element.className, overflow: element.scrollWidth - element.clientWidth}))
        return {dock: box(dock), summary, header, composer, visibleMessageHeight, innerHeight, scrollboxes: scrollboxes.map(element => ({box: box(element), clientHeight: element.clientHeight, scrollHeight: element.scrollHeight})), overflow, fetchCalls: window.fetchCalls}
      }, null)
      await writeFile(path.join(output, viewport.label + '-expanded.png'), Buffer.from((await cdp.call('Page.captureScreenshot', {format: 'png'})).data, 'base64'))
      const independentScroll = await cdp.evaluate(() => {
        const dock = document.querySelector('.fs-candidate-dock'), host = document.querySelector('[data-conversation-scroll]')
        const panel = [...dock.querySelectorAll('*')].find(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY) && element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 2)
        if (!panel) return null
        const summary = dock.querySelector(':scope > summary'), before = {summaryTop: summary.getBoundingClientRect().top, hostTop: host.scrollTop, composerTop: document.querySelector('.fixture-composer').getBoundingClientRect().top}
        panel.scrollTop = panel.scrollHeight
        const lastCard = dock.querySelector('[data-governance-queued]:last-child'), lastCardBottom = lastCard?.getBoundingClientRect().bottom
        return {scrolled: panel.scrollTop > 0, hostStayed: host.scrollTop === before.hostTop,
          summaryStayed: Math.abs(summary.getBoundingClientRect().top - before.summaryTop) < 1,
          composerStayed: Math.abs(document.querySelector('.fixture-composer').getBoundingClientRect().top - before.composerTop) < 1,
          lastCardReachable: typeof lastCardBottom === 'number' && lastCardBottom <= panel.getBoundingClientRect().bottom + 1}
      }, null)
      if (independentScroll) await writeFile(path.join(output, viewport.label + '-candidate-scroll-bottom.png'), Buffer.from((await cdp.call('Page.captureScreenshot', {format: 'png'})).data, 'base64'))
      await cdp.evaluate(() => {document.querySelector('.fs-candidate-dock > summary').focus(); return true}, null)
      await keyboardSpace()
      await waitFor(() => !document.querySelector('.fs-candidate-dock').open)
      assert.equal(await cdp.evaluate(() => document.querySelector('textarea[aria-label="当前对话的必要摘录"]').value, null), '合成未保存摘录：收起后仍应保留。', 'keyboard collapse retains unsaved excerpt')
      await writeFile(path.join(output, viewport.label + '-collapsed.png'), Buffer.from((await cdp.call('Page.captureScreenshot', {format: 'png'})).data, 'base64'))
      await keyboardSpace()
      await waitFor(() => document.querySelector('.fs-candidate-dock').open)
      assert.equal(await cdp.evaluate(() => document.querySelector('textarea[aria-label="当前对话的必要摘录"]').value, null), '合成未保存摘录：收起后仍应保留。', 'keyboard reopen retains unsaved excerpt')
      assert.equal(await cdp.evaluate(() => document.querySelectorAll('[data-governance-queued]').length, null), 5, 'collapse does not clear restored candidates')
      measurements.push({...viewport, ...geometry, independentScroll, keyboardDraftPreserved: true})
    }
    await writeFile(path.join(output, 'layout-measurements.json'), JSON.stringify({synthetic: true, hostCss: 'ConversationRoot.module.css', measurements}, null, 2) + '\n')
    const defects = measurements.flatMap(view => [
      ...view.overflow.map(item => `${view.label}: horizontal overflow ${item.tag} ${item.className} by ${item.overflow}px`),
      ...(view.summary.top < view.header.bottom ? [`${view.label}: dock summary clipped above header (${view.summary.top}px)`] : []),
      ...(view.visibleMessageHeight < 24 ? [`${view.label}: previous Agent reply displaced from visible chat`] : []),
      ...(view.composer.top < view.header.bottom || view.composer.bottom > view.innerHeight + 1 ? [`${view.label}: message composer outside visible column`] : []),
      ...(view.dock.height > view.innerHeight * .5 ? [`${view.label}: expanded candidate dock dominates viewport (${view.dock.height}px)`] : []),
      ...(!view.scrollboxes.length ? [`${view.label}: long candidate queue has no bounded independent vertical scroller`] : []),
      ...(view.independentScroll && !Object.values(view.independentScroll).every(Boolean) ? [`${view.label}: scrolling candidates moves outer chat or hides dock/composer controls`] : []),
      ...(view.fetchCalls !== 0 ? [`${view.label}: unexpected network request`] : []),
    ])
    await writeFile(path.join(output, 'layout-result.json'), JSON.stringify({status: defects.length ? 'failed' : 'passed', synthetic: true, defects, checks: ['real host CSS geometry', 'no global box-sizing reset', 'chat and composer visible', 'independent bounded candidate scroll', 'desktop and narrow no horizontal overflow', 'Space collapse/reopen retains draft and candidates', 'no provider requests']}, null, 2) + '\n')
    assert.deepEqual(defects, [], 'candidate dock must preserve the conversation work surface')
  } finally {
    cdp?.close(); browser.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  }
})
