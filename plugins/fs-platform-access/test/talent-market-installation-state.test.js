import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createServer} from 'node:http'
import {mkdtemp,rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {chromium} from 'playwright-core'
const executable=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)

test('pending or failed installation lookup never offers reinstall for an existing assistant',{skip:!executable,timeout:30000},async()=>{
 const root=path.resolve(import.meta.dirname,'../../..'),profile=await mkdtemp(path.join(os.tmpdir(),'fs-catalog-state-'))
 const card={templateId:'10000000-0000-4000-8000-000000000001',version:'a'.repeat(64),name:'Web Agent 网站设计师',description:'Website',icon:'WD',category:'software-development',capabilityBullets:[],compatible:true,unavailableReason:null,requiredApplications:[]}
 let release,fail=false
 const gate=new Promise(resolve=>{release=resolve})
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{createTalentMarket}from'./plugins/fs-platform-access/src/client/talent-market.tsx';const state={phase:'ready',activeTenantId:'tenant',user:{userId:'member'},applications:[{appId:'web',tenantId:'tenant',capabilities:['web.manage']}]};const View=createTalentMarket({getSnapshot:()=>state,subscribe:()=>()=>{}},()=>{});createRoot(document.getElementById('root')).render(<View/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',platform:'browser'})
 const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json')
  if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles[0].contents)}
  if(req.url==='/'){res.setHeader('content-type','text/html');return res.end('<div id="root"></div><script src="/app.js"></script>')}
  if(req.url.includes('/catalog'))return res.end(JSON.stringify({items:[card]}))
  if(req.url.includes('/mine')){await gate;if(fail){res.statusCode=503;return res.end('{}')}return res.end(JSON.stringify({items:[{...card,presetId:'existing',path:'/existing'}]}))}
  res.end(JSON.stringify({items:[]}))
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:true})
 try{
  const page=browser.pages()[0];await page.goto('http://127.0.0.1:'+server.address().port)
  await page.getByRole('heading',{name:card.name}).waitFor()
  assert.equal(await page.getByRole('button',{name:'下载并安装',exact:true}).count(),0)
  assert.equal(await page.getByText('未安装',{exact:true}).count(),0)
  release();await page.getByRole('button',{name:'开始对话',exact:true}).waitFor()
  fail=true;await page.getByRole('button',{name:'检查更新',exact:true}).click()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByRole('button',{name:'下载并安装',exact:true}).count(),0)
  assert.equal(await page.getByText('未安装',{exact:true}).count(),0)
  fail=false;await page.getByRole('button',{name:'重新加载',exact:true}).click()
  await page.getByRole('button',{name:'开始对话',exact:true}).waitFor()
 }finally{release();await browser.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true})}
})

