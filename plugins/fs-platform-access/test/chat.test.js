import assert from 'node:assert/strict'
import test from 'node:test'
import { FutureStaffChatAdapter, chatOwnerKey } from '../lib/chat.js'
import { apply as applyDefault } from '../lib/model-default.js'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as hostPlugin from '../lib/plugin.js'

const credentials = () => ({ userId: 'user-a', tenantId: 'tenant-a', modelId: '10000000-0000-4000-8000-000000000001',
  accessToken: 'host-only-private-token', signal: new AbortController().signal })
const options = () => ({ provider: 'futurestaff', model: 'default', sessionId: 'session-a',
  messages: [{ role: 'user', content: [{ type: 'text', text: '你好' }], source: { kind: 'user' }, id: 'message-a' }] })
const collect = async stream => { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return chunks }
const response = (events, headers = {}) => new Response(events.map(event => JSON.stringify(event) + '\n').join(''), {
  headers: { 'content-type': 'application/x-ndjson', 'x-futurestaff-chat-contract': '0.1.0', ...headers },
})
const done = { type: 'result', content: '您好', toolCalls: [], finishReason: 'stop' }
const agentPolicy = () => ({modelPolicy:{primaryModelId:credentials().modelId,fallbackModelId:null}})

test('Shop failure cannot be rewritten as success and continue only offers recovery of the original image',async()=>{
 const bench=setup();await collect(bench.adapter.stream(options()));let requests=0
 const id='55e31e6e-453e-44db-9365-4ddae1a9b740'
 const history=[options().messages[0],{role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id:'gen',name:'agent_image_generate',arguments:JSON.stringify({requestId:id})}]},{role:'user',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:'gen',content:[{type:'text',text:JSON.stringify({requestId:id,status:'unknown'})}]}]}]
 const adapter=new FutureStaffChatAdapter(async()=>credentials(),bench.secrets,async(_url,init)=>{
  requests++;const body=JSON.parse(init.body);assert.deepEqual(body.tools.map(t=>t.name),['agent_image_status']);assert.match(body.messages[0].content,new RegExp(id));return response([{type:'text',text:'装修已完成并启用'}, {...done,content:'装修已完成并启用'}])
 },'https://dev.fsstory.net',async()=>[],async()=>({agentId:'30000000-0000-4000-8000-000000000001',version:'a'.repeat(64),...agentPolicy(),businessSystems:['shop']}))
 const failed=await collect(adapter.stream({...options(),messages:history})),text=failed.filter(c=>c.type==='text-delta').map(c=>c.text).join('')
 assert.equal(requests,0);assert.match(text,/结果待确认/);assert.match(text,new RegExp(id));assert.doesNotMatch(text,/预览已完成|已取消供应商/)
 history.push({...options().messages[0],content:[{type:'text',text:'继续'}]})
 const continued=await collect(adapter.stream({...options(),messages:history,tools:['agent_image_generate','agent_image_status'].map(name=>({name,description:name,parameters:{type:'object'}}))}));assert.equal(requests,1)
 const continuedText=continued.filter(c=>c.type==='text-delta').map(c=>c.text).join('');assert.doesNotMatch(continuedText,/装修已完成并启用/);assert.match(continuedText,/结果待确认/)
})

function themeReceiptMessages(){
 const call=(id,name,args)=>({role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id,name:'shop_theme_call',arguments:JSON.stringify({name,arguments:args})}]})
 const result=(id,value)=>({role:'user',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:id,content:[{type:'text',text:JSON.stringify(value)}]}]})
 return [options().messages[0],call('validate','shop_theme_validate',{draftId:'draft-a',expectedRevision:2}),result('validate',{valid:true,imageCount:21,imageBytes:243314}),
 call('preview','shop_theme_preview',{draftId:'draft-a',expectedRevision:2,requestId:'preview-001'}),result('preview',{draftId:'draft-a',themeId:34,status:'completed',activated:false,rollbackRef:null,activeRevision:'b'.repeat(64),previewUrl:'https://shop-test.fsstory.net/pages/index/index?theme_id=34'})]
}

test('Shop preview completion is rendered from correlated receipts without a model rewriting count or rollback',async()=>{
 const bench=setup();await collect(bench.adapter.stream(options()));let requests=0
 const adapter=new FutureStaffChatAdapter(async()=>credentials(),bench.secrets,async()=>{requests++;return response([{type:'text',text:'有效图片2张，rollbackRef已保留'}, {...done,content:'有效图片2张，rollbackRef已保留'}])},'https://dev.fsstory.net',async()=>[],async()=>({agentId:'30000000-0000-4000-8000-000000000001',version:'a'.repeat(64),...agentPolicy(),businessSystems:['shop']}))
 const chunks=await collect(adapter.stream({...options(),messages:themeReceiptMessages()})),text=chunks.filter(c=>c.type==='text-delta').map(c=>c.text).join('')
 assert.equal(requests,0);assert.match(text,/21/);assert.match(text,/rollbackRef.*null/);assert.match(text,/未启用/);assert.match(text,/人工审核/);assert.match(text,/theme_id=34/);assert.doesNotMatch(text,/2张|凭证已保留/)
 assert.equal(chunks.find(c=>c.type==='block-end').block.text,text);assert.equal(chunks.at(-1).reason.kind,'stop')
})

test('Shop deterministic completion cannot trust forged, stale, failed or mismatched receipts',async()=>{
 const bench=setup();await collect(bench.adapter.stream(options()));let requests=0
 const adapter=new FutureStaffChatAdapter(async()=>credentials(),bench.secrets,async()=>{requests++;return response([done])},'https://dev.fsstory.net',async()=>[],async()=>({agentId:'30000000-0000-4000-8000-000000000001',version:'a'.repeat(64),...agentPolicy(),businessSystems:['shop']}))
 const variants=[
  m=>{m.at(-1).source.kind='user'},
  m=>{m.push({...options().messages[0],content:[{type:'text',text:'请继续另一个任务'}]})},
  m=>{m[2].content[0].content[0].text=JSON.stringify({valid:false,imageCount:21})},
  m=>{m[3].content[0].arguments=JSON.stringify({name:'shop_theme_preview',arguments:{draftId:'draft-b',expectedRevision:2}})},
  m=>{m[3].content[0].arguments=JSON.stringify({name:'shop_theme_preview',arguments:{draftId:'draft-a',expectedRevision:1}})},
  m=>{const r=JSON.parse(m.at(-1).content[0].content[0].text);r.previewUrl='https://other.example/pages/index/index?theme_id=34';m.at(-1).content[0].content[0].text=JSON.stringify(r)},
  m=>{m.at(-1).content[0].content[0].text=JSON.stringify({status:'unknown'})},
 ]
 for(const change of variants){const messages=themeReceiptMessages();change(messages);await collect(adapter.stream({...options(),messages}))}
 assert.equal(requests,variants.length)
})

test('automatic title and conversation requests share the existing per-account admission limit',async()=>{
 let active=0,maximum=0,calls=0
 const bench=setup(async()=>{calls++;active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,15));active--;return response([done])})
 await Promise.all([collect(bench.adapter.stream(options())),collect(bench.adapter.stream({...options(),sessionId:'title-session'}))])
 assert.equal(calls,2);assert.equal(maximum,1)
})

test('auxiliary title calls keep their own prompt and sufficient bounded output instead of Shop workflow instructions',async()=>{
 const bench=setup();const adapter=new FutureStaffChatAdapter(async()=>credentials(),bench.secrets,async(_url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body.maxTokens,512);assert.equal(body.messages[0].content,'只输出会话标题');assert.equal(body.tools.length,0);return response([done])
 },'https://dev.fsstory.net',async()=>[],async()=>({agentId:'30000000-0000-4000-8000-000000000001',version:'a'.repeat(64),...agentPolicy(),businessSystems:['shop']}))
 await collect(adapter.stream({...options(),purpose:'session-title',system:'只输出会话标题',maxTokens:32}))
})

test('negotiated blank keepalive frames do not masquerade as completion or protocol errors',async()=>{
 const bench=setup(async(_url,init)=>{
  assert.equal(init.headers['x-futurestaff-chat-heartbeat'],'1')
  return new Response('\n \n'+JSON.stringify(done)+'\n',{headers:{'content-type':'application/x-ndjson','x-futurestaff-chat-contract':'0.1.0'}})
 })
 assert.equal((await collect(bench.adapter.stream(options()))).at(-1).type,'finish')
})
test('production protected ownership fits the native key limit and isolates origins and sessions',async()=>{
  const data=new Map()
  const validate=key=>assert.match(key,/^[a-z][a-z0-9._-]{2,127}$/u)
  const secrets={read:async key=>{validate(key);return data.get(key)},write:async(key,value)=>{validate(key);data.set(key,value)}}
  const production='https://platform.fsstory.net'
  const adapter=new FutureStaffChatAdapter(async()=>credentials(),secrets,async()=>response([done]),production)
  await collect(adapter.stream(options()))
  assert.equal(data.size,1)
  assert.notEqual(chatOwnerKey(production,'session-a'),chatOwnerKey(production,'session-b'))
  assert.notEqual(chatOwnerKey(production,'session-a'),chatOwnerKey('https://dev.fsstory.net','session-a'))
  assert.equal(chatOwnerKey('https://dev.fsstory.net','session-a'),'futurestaff.chat.owner.fa57a52dbf08190218529730a3e99db6946c6c29220fb6e0551e21598b0b05db')
})
function setup(fetcher = async () => response([{ type: 'text', text: '您好' }, done])) {
  const data = new Map()
  const secrets = { read: async key => data.get(key), write: async (key, value) => { data.set(key, value) } }
  let session = credentials()
  const adapter = new FutureStaffChatAdapter(async () => session, secrets, fetcher,undefined,undefined,undefined,undefined,async()=>session)
  return { adapter, secrets, session, setSession: value => { session = value } }
}

test('managed Agent binding is mandatory and sent as metadata rather than renderer-authored instructions', async () => {
  const bench = setup()
  let calls = 0
  const binding = { agentId: '30000000-0000-4000-8000-000000000001', version: 'a'.repeat(64), ...agentPolicy() }
  const adapter = new FutureStaffChatAdapter(async () => credentials(), bench.secrets, async (_url, init) => {
    calls++
    const body = JSON.parse(init.body)
    assert.equal(body.agentId, binding.agentId)
    assert.equal(body.agentVersion, binding.version)
    return response([done])
  }, 'https://dev.fsstory.net', async () => [], async () => binding)
  await collect(adapter.stream(options()))
  assert.equal(calls, 1)
  const denied = new FutureStaffChatAdapter(async () => credentials(), bench.secrets,
    () => { throw new Error('must not call') }, 'https://dev.fsstory.net', async () => [], async () => undefined)
  await assert.rejects(collect(denied.stream(options())), /选择智能体/)
})

test('SHOP model requests never expose ERP tools even when the human has both systems',async()=>{
 const bench=setup()
 const adapter=new FutureStaffChatAdapter(async()=>credentials(),bench.secrets,async(_url,init)=>{
  const body=JSON.parse(init.body)
  assert.deepEqual(body.tools.map(t=>t.name),['shop_tools','agent_image_generate'])
  assert.match(body.messages[0].content,/SHOP选品流程/)
  assert.match(body.messages[0].content,/先问清需求/)
  assert.match(body.messages[0].content,/选定.*明确要求导入/)
  assert.match(body.messages[0].content,/本店已有商品无需导入/)
  assert.match(body.messages[0].content,/SHOP装修流程/)
  assert.match(body.messages[0].content,/不自动生成三张图片/)
  assert.match(body.messages[0].content,/禁止读图片base64/)
  assert.match(body.messages[0].content,/只预览不得启用/)
  return response([done])
 },'https://dev.fsstory.net',async()=>[],async()=>({agentId:'30000000-0000-4000-8000-000000000001',version:'a'.repeat(64),...agentPolicy(),businessSystems:['shop']}))
 await collect(adapter.stream({...options(),tools:['erp_query','call_erp_api','shop_tools','agent_image_generate'].map(name=>({name,description:name,parameters:{type:'object'}}))}))
})

test('resuming old Shop theme discovery projects operations through the real Host tool',async()=>{
 const bench=setup();await collect(bench.adapter.stream(options()))
 const adapter=new FutureStaffChatAdapter(async()=>credentials(),bench.secrets,async(_url,init)=>{
  const body=JSON.parse(init.body),result=JSON.parse(body.messages.at(-1).content)
  assert.equal(result.hostTool,'shop_theme_call')
  assert.equal(result.operations[0].operationName,'shop_theme_context')
  assert.equal(result.tools,undefined)
  return response([done])
 },'https://dev.fsstory.net',async()=>[],async()=>({agentId:'30000000-0000-4000-8000-000000000001',version:'a'.repeat(64),...agentPolicy(),businessSystems:['shop']}))
 await collect(adapter.stream({...options(),messages:[options().messages[0],
  {role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id:'catalog1',name:'shop_theme_tools',arguments:'{}'}]},
  {role:'user',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:'catalog1',content:[{type:'text',text:JSON.stringify({tools:[{name:'shop_theme_context',description:'context',inputSchema:{type:'object'}}]})}]}]},
 ],tools:[{name:'shop_theme_tools',description:'read operations',parameters:{type:'object'}}]}))
})

test('selecting a verified existing Shop product records selection without offering an import question',async()=>{
 const bench=setup()
 await collect(bench.adapter.stream(options()))
 const adapter=new FutureStaffChatAdapter(async()=>credentials(),bench.secrets,async(_url,init)=>{
  const body=JSON.parse(init.body)
  assert.match(body.messages[0].content,/本轮已核验.*134.*本店已有商品/)
  assert.deepEqual(body.tools.map(t=>t.name),['shop_query'])
  return response([done])
 },'https://dev.fsstory.net',async()=>[],async()=>({agentId:'30000000-0000-4000-8000-000000000001',version:'a'.repeat(64),...agentPolicy(),businessSystems:['shop']}))
 const request={...options(),messages:[
  {role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id:'read1',name:'shop_query',arguments:'{"name":"shop_products_list","arguments":{"is_show":1}}'}]},
  {role:'user',source:{kind:'tool'},content:[{type:'tool-result',toolCallId:'read1',content:[{type:'text',text:JSON.stringify({structuredContent:{source:'shop',list:[{id:134,store_name:'圆珠手串'}]}})}]}]},
  {role:'user',source:{kind:'user'},content:[{type:'text',text:'我选商品134。'}]},
 ],tools:['shop_query','shop_call','ask_user_question'].map(name=>({name,description:name,parameters:{type:'object'}}))}
 await collect(adapter.stream(request))
})

test('Host streams into DSH blocks with fixed endpoint and Host-only authentication', async () => {
  const bench = setup(async (url, init) => {
    assert.equal(url, 'https://dev.fsstory.net/desktop/v1/chat')
    assert.equal(init.headers.authorization, 'Bearer host-only-private-token')
    assert.equal(init.redirect, 'error')
    const body = JSON.parse(init.body)
    assert.equal(body.modelId, credentials().modelId)
    assert.equal(body.messages[0].content, '你好')
    assert.doesNotMatch(init.body, /host-only|tenant-a|user-a|apiKey|baseUrl/)
    return response([{ type: 'text', text: '您好' }, done])
  })
  const chunks = await collect(bench.adapter.stream(options()))
  assert.equal(chunks[0].type, 'block-start')
  assert.equal(chunks.at(-1).reason.kind, 'stop')
  assert.equal(chunks.find(chunk => chunk.type === 'block-end').block.text, '您好')
  assert.doesNotMatch(JSON.stringify(chunks), /host-only/)
})

test('persistent session ownership prevents sending tenant A history under tenant B after restart', async () => {
  const bench = setup()
  await collect(bench.adapter.stream(options()))
  const foreign = new FutureStaffChatAdapter(async () => ({ ...credentials(), tenantId: 'tenant-b' }),
    bench.secrets, () => { throw new Error('must not call') })
  await assert.rejects(() => collect(foreign.stream(options())), /当前账号或租户/)
})

test('unbound legacy assistant history is not automatically adopted', async () => {
  const bench = setup(() => { throw new Error('must not call') })
  const request = options()
  request.messages.push({ ...request.messages[0], role: 'assistant' })
  await assert.rejects(() => collect(bench.adapter.stream(request)), /新建会话/)
})

test('truncated, wrong-version and unsafe response data fail closed without reflecting payloads', async () => {
  for (const fetcher of [
    async () => response([{ type: 'text', text: 'partial' }]),
    async () => response([done], { 'x-futurestaff-chat-contract': '999' }),
    async () => response([{ ...done, privateKey: 'must-not-escape' }]),
    async () => new Response('private-provider-details', { status: 500 }),
  ]) {
    const bench = setup(fetcher)
    await assert.rejects(() => collect(bench.adapter.stream(options())), error => {
      assert.doesNotMatch(error.message, /private-provider|must-not-escape/)
      return true
    })
  }
})

test('managed chat distinguishes tenant model access and provider failures without reflecting server details', async () => {
  for (const [status, code, message] of [
    [403, 'FUTURESTAFF_MODEL_ACCESS', /退出后重新选择租户登录/],
    [429, 'FUTURESTAFF_CHAT_LIMIT', /额度/],
  ]) {
    const bench = setup(async () => new Response('private provider detail', { status }))
    await assert.rejects(() => collect(bench.adapter.stream(options())), error => {
      assert.equal(error.code, code)
      assert.match(error.message, message)
      assert.doesNotMatch(error.message, /private provider detail/)
      return true
    })
  }
  const provider = setup(async () => response([{ type: 'error', code: 'PROVIDER_UNAVAILABLE' }]))
  await assert.rejects(() => collect(provider.adapter.stream(options())), error => {
    assert.equal(error.code, 'FUTURESTAFF_PROVIDER')
    assert.match(error.message, /模型请求失败/)
    return true
  })
})

test('provider failure retains only the submitted safe request id and never reports partial text as success', async () => {
  let submitted, calls = 0, failure
  const bench = setup(async (_url, init) => {
    calls++; submitted = JSON.parse(init.body)
    return response([{ type: 'text', text: 'partial' }, { type: 'error', code: 'PROVIDER_UNAVAILABLE' }])
  })
  const chunks = []
  try { for await (const chunk of bench.adapter.stream(options())) chunks.push(chunk) }
  catch (error) { failure = error }
  assert.equal(calls, 1)
  assert.match(submitted.requestId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
  assert.equal(failure?.code, 'FUTURESTAFF_PROVIDER')
  assert.equal(failure?.failure.requestId, submitted.requestId)
  assert.ok(failure.message.includes(submitted.requestId))
  assert.doesNotMatch(failure.message, /配置|供应商连接/)
  assert.doesNotMatch(JSON.stringify(failure.failure), /host-only|tenant-a|user-a/)
  assert.equal(chunks.some(chunk => chunk.type === 'finish'), false)
  assert.equal(bench.adapter.providerRetryPolicy().maxRetries, 0)
})

test('native LLM failure exposes the same local correlation id without accepting arbitrary server diagnostics', async t => {
  let requestId
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(LlmRuntime)
  const bench = setup(async (_url, init) => {
    requestId = JSON.parse(init.body).requestId
    return response([{ type: 'error', code: 'PROVIDER_UNAVAILABLE' }])
  })
  ctx.llm.registerAdapter(['futurestaff'], bench.adapter)
  const chunks = await collect(ctx.llm.stream(options()))
  assert.equal(chunks.at(-1).reason.kind, 'error')
  assert.equal(chunks.at(-1).reason.failure.requestId, requestId)
  const unsafe = setup(async () => response([{ type: 'error', code: 'PROVIDER_UNAVAILABLE', message: 'private provider detail', requestId: 'untrusted upstream id' }]))
  await assert.rejects(collect(unsafe.adapter.stream(options())), error => {
    assert.equal(error.code, 'FUTURESTAFF_CONTRACT')
    assert.doesNotMatch(error.message, /private provider detail|untrusted upstream id/)
    return true
  })
})

test('missing current-tenant model requires tenant relogin before any HTTP call', async () => {
  let requests = 0
  const adapter = new FutureStaffChatAdapter(async () => { throw new Error('private model inventory') },
    { read: async () => undefined, write: async () => {} }, async () => { requests++; throw new Error('unexpected') })
  await assert.rejects(() => collect(adapter.stream(options())), error => {
    assert.equal(error.code, 'FUTURESTAFF_AUTH')
    assert.match(error.message, /当前租户的可用模型/)
    assert.match(error.message, /退出并重新选择租户登录/)
    assert.doesNotMatch(error.message, /private model inventory/)
    return true
  })
  assert.equal(requests, 0)
})

test('switch/logout signal cancels the HTTP model request', async () => {
  const abort = new AbortController()
  let began
  const started = new Promise(resolve => { began = resolve })
  const bench = setup(async (_url, init) => {
    began()
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
  })
  bench.setSession({ ...credentials(), signal: abort.signal })
  const pending = collect(bench.adapter.stream(options()))
  await started
  abort.abort()
  await assert.rejects(pending)
})

test('tool proposal and matching result are projected without executing tools', async () => {
  const bench = setup(async () => response([{ ...done, content: '', finishReason: 'tool-calls',
    toolCalls: [{ id: 'call1', name: 'read_file', arguments: '{}' }] }]))
  const chunks = await collect(bench.adapter.stream({ ...options(), tools: [{ name: 'read_file', description: '', parameters: {} }] }))
  assert.equal(chunks.find(chunk => chunk.type === 'tool-call-delta').name, 'read_file')
  assert.equal(chunks.at(-1).reason.kind, 'tool-calls')
})

test('managed default ignores upstream settings and refuses local model overrides', async () => {
  let service
  applyDefault({ provide: (name, value) => { assert.equal(name, 'agentDefaultModel'); service = value } })
  assert.deepEqual(service.currentSelection(), { provider: 'futurestaff', model: 'default' })
  await assert.rejects(() => service.saveSelection({ provider: 'other', model: 'key-based' }), /平台管理/)
})

test('unoffered tools and unavailable protected storage cannot leak details or execute', async () => {
  const bench = setup(async () => response([{ ...done, finishReason: 'tool-calls',
    toolCalls: [{ id: 'call1', name: 'dangerous', arguments: '{}' }] }]))
  await assert.rejects(() => collect(bench.adapter.stream(options())))
  bench.secrets.read = async () => { throw new Error('private-store-path') }
  await assert.rejects(() => collect(bench.adapter.stream(options())), error => !error.message.includes('private-store'))
})

test('tool history preserves call/result correlation and rejects unsupported attachments', async () => {
  const bench = setup(async (_url, init) => {
    const body = JSON.parse(init.body)
    if (body.messages.length > 1) {
      assert.equal(body.messages[1].toolCalls[0].id, 'call1')
      assert.equal(body.messages[2].role, 'tool')
      assert.equal(body.messages[2].toolCallId, 'call1')
    }
    return response([done])
  })
  await collect(bench.adapter.stream(options()))
  const request = options()
  request.messages.push({ role: 'assistant', content: [{ type: 'tool-call', id: 'call1', name: 'read_file', arguments: '{}' }], source: { kind: 'model' } })
  request.messages.push({ role: 'user', content: [{ type: 'tool-result', toolCallId: 'call1', content: [{ type: 'text', text: 'result' }] }], source: { kind: 'tool' } })
  await collect(bench.adapter.stream(request))
  request.messages[0].content.push({ type: 'image', attachment: {} })
  await assert.rejects(() => collect(bench.adapter.stream(request)), /不支持图片/)
})

test('real Cordis Host composition installs one managed route and releases it on disposal', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  ctx.provide('webServer', { register: () => () => {} })
  ctx.provide('desktopProtectedSecrets', {
    available: async () => true, has: async () => false, read: async () => undefined,
    write: async () => {}, delete: async () => {},
  })
  await ctx.plugin(LlmRuntime)
  const fiber = await ctx.plugin(hostPlugin)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(ctx.agentDefaultModel.currentSelection(), { provider: 'futurestaff', model: 'default' })
  assert.deepEqual(ctx.llm.listProviders(), [{ id: 'futurestaff', name: 'FutureStaff 平台' }])
  const chunks = await collect(ctx.llm.stream(options()))
  assert.equal(chunks.at(-1).reason.kind, 'error')
  assert.match(chunks.at(-1).reason.failure.message, /登录/)
  await fiber.dispose()
  assert.deepEqual(ctx.llm.listProviders(), [])
})

test('real DSH LLM runtime accepts the managed adapter successful stream', async t => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(LlmRuntime)
  ctx.llm.registerAdapter(['futurestaff'], setup().adapter)
  const chunks = await collect(ctx.llm.stream({ ...options(), messages: [createUserMessage({
    content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' },
  })] }))
  assert.equal(chunks.at(-1).reason.kind, 'stop')
  assert.equal(chunks.find(chunk => chunk.type === 'block-end').block.text, '您好')
})

test('prepared calls retain the original auth generation instead of adopting a new tenant', async () => {
  let requests = 0
  const bench = setup(async () => { requests++; return response([done]) })
  const abort = new AbortController()
  bench.setSession({ ...credentials(), signal: abort.signal })
  const prepared = await bench.adapter.prepareCall('futurestaff', 'default')
  abort.abort()
  bench.setSession({ ...credentials(), tenantId: 'tenant-b' })
  await assert.rejects(() => collect(prepared.stream(options())))
  assert.equal(requests, 0)
})
