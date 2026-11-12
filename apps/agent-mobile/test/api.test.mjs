import test from 'node:test'
import assert from 'node:assert/strict'
import {request,systemEntryLink} from '../src/api.ts'

test('private requests carry the captured system and upload context without putting them in identity storage', async t => {
  const original=globalThis.fetch,seen=[]
  globalThis.fetch=async(url,options)=>{seen.push({url,options});return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}})}
  t.after(()=>globalThis.fetch=original)
  await request('/sessions/example',{method:'POST',systemId:'erp',contextVersion:'server-version',csrf:'synthetic-csrf',body:{contextVersion:'server-version'}})
  assert.equal(seen[0].options.headers.get('x-fs-system'),'erp')
  assert.equal(seen[0].options.headers.get('x-fs-context'),'server-version')
  assert.equal(seen[0].options.credentials,'same-origin')
  assert.equal(seen[0].options.cache,'no-store')
  assert.equal(seen[0].options.redirect,'error')
})

test('AIGC entry accepts only the fixed independent workbench URL without transferred state', () => {
  const url='https://aigc.fsstory.net/create'
  assert.equal(systemEntryLink({systemId:'aigc',entryUrl:url}),url)
  for(const entryUrl of [url+'?token=private',url+'#context',url+'/',url.replace('https:','http:'),'https://evil.test/mobile/fs-assistant','https://aigc.fsstory.net.evil.test/mobile/fs-assistant'])assert.equal(systemEntryLink({systemId:'aigc',entryUrl}),undefined)
  assert.equal(systemEntryLink({systemId:'erp',entryUrl:url}),undefined)
})
