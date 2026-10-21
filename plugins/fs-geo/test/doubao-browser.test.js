import {test} from 'node:test';import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {observeDoubao,visibleQuestionEqual,DoubaoBrowser,appendEvidenceScreenshots,evidenceVisible} from '../lib/doubao-browser.js';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
test('question verification tolerates product CJK auto spacing while preserving English word boundaries and punctuation',()=>{
 assert.equal(visibleQuestionEqual('不超过150字','不超过 150 字'),true);
 assert.equal(visibleQuestionEqual('New API 有什么功能？','NewAPI 有什么功能？'),false);
 assert.equal(visibleQuestionEqual('有什么功能？','有什么功能。'),false);
});
test('screenshot budget fails with an uploadable partial result, including an extra source frame',()=>{
 const frames=Array.from({length:16},()=>({role:'ANSWER',base64:'YWJj'}));
 assert.throws(()=>appendEvidenceScreenshots(frames,[{role:'SOURCES',base64:'YWJj'}]),/SCREENSHOT_COVERAGE_LIMIT/);assert.equal(frames.length,16);
 const large=[{role:'ANSWER',base64:'a'.repeat(4_100_000)}];
 assert.throws(()=>appendEvidenceScreenshots(large,[{...large[0],role:'SOURCES'}]),/SCREENSHOT_COVERAGE_LIMIT/);assert.equal(large.length,1);
});
test('browser driver captures one full turn and binds a native citation popup without loading its destination',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'geo-driver-'));let submitted=0,externalLoaded=0;
 const html=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"></head><body style="margin:0;padding-left:300px"><nav data-testid="flow_chat_sidebar" style="position:fixed;left:0;top:0;width:300px;height:100vh">私有历史<button data-testid="sidebar_footer_setting_entry">设置</button></nav><button data-testid="chat_input_action_model">豆包 快速</button><button id="fresh">新对话</button><div id="messages" data-testid="message-list"></div><div contenteditable="true" style="min-height:40px"></div><button data-testid="chat_input_send_button" id="send">发送</button><script>
 const messages=document.getElementById('messages'),input=document.querySelector('[contenteditable]');
 document.getElementById('fresh').onclick=()=>{messages.innerHTML='';history.pushState({},'', '/chat/');};
 document.getElementById('send').onclick=()=>{const question=input.innerText;messages.innerHTML='<div data-testid="send_message"><div data-testid="message_text_content"></div></div><div data-testid="receive_message"><div data-copy-ignore id="sources">搜索 1 个关键词，参考 1 篇资料</div><div hidden id="links"><a href="https://reference.example/article">资料</a></div><div data-testid="message_text_content">完整回答<span class="container-sWvQla" id="cite">参考原文</span></div><div data-testid="message_action_bar" style="opacity:1"><button data-testid="message_action_copy">复制</button></div></div>';messages.querySelector('[data-testid="send_message"] [data-testid="message_text_content"]').innerText=question;document.getElementById('sources').onclick=()=>document.getElementById('links').hidden=false;document.getElementById('cite').onclick=()=>window.open('https://reference.example/article?native=1');history.pushState({},'', '/chat/123');};
 </script></body></html>`;
 let context;const driver=new DoubaoBrowser(root,async()=>{context=await chromium.launchPersistentContext(root,{channel:'chrome',headless:true,viewport:{width:1280,height:900}});await context.route('https://www.doubao.com/**',route=>route.fulfill({contentType:'text/html',body:html}));context.on('request',r=>{if(r.url().startsWith('https://reference.example')&&!r.isNavigationRequest())externalLoaded++;});return context;});
 try{const result=await driver.collect({id:'fixture-job',question:'原始测试问题',state:'RUNNING',conditions:{mode:'豆包 快速',language:'zh-CN',memoryState:'UNKNOWN'}},async()=>{submitted++;},new AbortController().signal);
 assert.equal(result.state,'SUCCEEDED');assert.equal(submitted,1);assert.equal(result.citationState,'COMPLETE');assert.equal(result.sources.filter(s=>s.role==='CITED')[0].url,'https://reference.example/article?native=1');assert.ok(result.screenshots.length>=2);assert.equal(externalLoaded,0);
 for(const frame of result.screenshots)assert.equal(Buffer.from(frame.base64,'base64').readUInt32BE(16),980,'private sidebar must be outside the raw browser capture');
 }finally{await driver.close();await rm(root,{recursive:true,force:true});}
});
test('DOM capture binds one turn and excludes collapsed source links',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.setContent('<div data-testid="chat_input_action_model">豆包 快速</div><div data-testid="send_message"><div data-testid="message_text_content">原题</div></div><div data-testid="receive_message"><div data-copy-ignore>搜索 1 个关键词，参考 1 篇资料</div><div hidden><a href="https://source.example/">隐藏来源</a></div><div data-testid="message_text_content">回答<a href="https://body.example/">正文网址</a></div><div data-testid="message_action_bar" style="opacity:1"><button data-testid="message_action_copy"></button></div></div><button data-testid="chat_input_send_button"></button>');
 const state=await page.evaluate(observeDoubao);assert.equal(state.question,'原题');assert.equal(state.completed,true);assert.equal(state.links.length,1);assert.equal(state.links[0].body,true);
 await page.locator('[hidden]').evaluate(e=>e.removeAttribute('hidden'));assert.equal((await page.evaluate(observeDoubao)).links.length,2);
 await page.locator('[data-testid="message_action_bar"]').evaluate(e=>e.style.opacity='0');assert.equal((await page.evaluate(observeDoubao)).completed,false);
  await page.locator('[data-testid="receive_message"] [data-testid="message_text_content"]').evaluate(e=>e.style.marginTop='100px');assert.equal(await page.evaluate(evidenceVisible,'ANSWER'),true);
  await page.evaluate(()=>{const overlay=document.createElement('div');overlay.id='fixture-overlay';overlay.style.cssText='position:fixed;inset:0;background:white;z-index:9999';document.body.append(overlay);});assert.equal(await page.evaluate(evidenceVisible,'ANSWER'),false,'visible text behind a blocking popup is not acceptable screenshot evidence');
 }finally{await browser.close();}
});
