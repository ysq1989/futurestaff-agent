import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const publicDir=new URL('../public/',import.meta.url)
test('service worker only intercepts explicit public static files',async()=>{
  const handlers={},intercepted=[],self={location:{origin:'https://agent.fsstory.net'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn}
  vm.runInNewContext(await readFile(new URL('sw.js',publicDir),'utf8'),{self,URL,Set,caches:{open:async()=>({match:async()=>({cached:true})})},fetch:async()=>({network:true})})
  for(const pathname of ['/api/v1/me','/api/v1/sessions/abc/attachments/123','/api/v1/sessions','/private.json','/icon.svg?private=yes'])handlers.fetch({request:{url:'https://agent.fsstory.net'+pathname,method:'GET'},respondWith:()=>intercepted.push(pathname)})
  handlers.fetch({request:{url:'https://elsewhere.test/icon.svg',method:'GET'},respondWith:()=>intercepted.push('cross-origin')})
  handlers.fetch({request:{url:'https://agent.fsstory.net/',method:'POST'},respondWith:()=>intercepted.push('post')})
  assert.deepEqual(intercepted,[])
  handlers.fetch({request:{url:'https://agent.fsstory.net/icon.svg',method:'GET'},respondWith:()=>intercepted.push('icon')});assert.deepEqual(intercepted,['icon'])
})
test('install metadata includes standalone launch and mobile icons',async()=>{
  const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',publicDir),'utf8')),html=await readFile(new URL('index.html',publicDir),'utf8')
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));assert.match(html,/apple-touch-icon/);assert.match(html,/viewport-fit=cover/)
})
