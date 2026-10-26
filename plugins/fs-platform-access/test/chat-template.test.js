import assert from 'node:assert/strict'
import test from 'node:test'
import { FutureStaffChatAdapter } from '../lib/chat.js'
import * as scope from '../lib/business-scope.js'

const modelId = '10000000-0000-4000-8000-000000000001'
const secondModelId = '10000000-0000-4000-8000-000000000002'
const options = () => ({ provider: 'futurestaff', model: 'default', sessionId: 'local-template-session',
  system: 'Installed immutable role instructions.',
  messages: [{ id: 'message-a', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] }] })
const collect = async stream => { const result = []; for await (const chunk of stream) result.push(chunk); return result }

function setup({ binding: changeBinding, identitySnapshot = true, models = [modelId, secondModelId], onFetch } = {}) {
  const signal = new AbortController().signal
  const credentials = { accessToken: 'host-only-template-token', userId: 'user-a', tenantId: 'tenant-a', modelId, signal }
  const template = { kind: 'local-template', templateId: '20000000-0000-4000-8000-000000000001', version: 'a'.repeat(64),
    businessSystems: [], identity: { userId: credentials.userId, tenantId: credentials.tenantId }, signal }
  const data = new Map(), calls = [], selections = []
  const adapter = new FutureStaffChatAdapter(async selected => {
    selections.push(selected)
    return { ...credentials, modelId: selected ?? modelId }
  }, { read: async key => data.get(key), write: async (key, value) => { data.set(key, value) } }, async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), signal: init.signal })
    if (onFetch) return onFetch(url, init)
    return new Response(JSON.stringify({ type: 'result', content: '您好', toolCalls: [], finishReason: 'stop' }) + '\n',
      { headers: { 'content-type': 'application/x-ndjson', 'x-futurestaff-chat-contract': '0.1.0' } })
  }, 'https://dev.fsstory.net', async () => models.map(id => ({ modelId: id, displayName: id,
    provider: 'fixture', model: id, supportsVision: false, isDefault: id === modelId })),
  async () => typeof changeBinding === 'function' ? changeBinding(template) : template,
  undefined, identitySnapshot ? async () => credentials : undefined)
  return { adapter, calls, selections, data }
}

test('generic local template preserves native file, skill and research tools while hiding all controlled system tools', async () => {
  const bench = setup()
  const tools = ['read_file', 'Read', 'skill', 'pwsh', 'erp_query', 'shop_query', 'geo_collect', 'visa_submit', 'website_edit', 'product_hub_search', 'call_agent_admin_api', 'agent_admin_list', 'call_unknown_api', 'mcp__unknown__query']
    .map(name => ({ name, description: name, parameters: { type: 'object' } }))
  const chunks = await collect(bench.adapter.stream({ ...options(), tools }))
  assert.equal(chunks.at(-1).type, 'finish')
  assert.deepEqual(bench.selections, [undefined], 'default must resolve through the current Platform active model')
  assert.equal(bench.calls.length, 1)
  const { url, body } = bench.calls[0]
  assert.equal(url, 'https://dev.fsstory.net/desktop/v1/chat')
  assert.equal(body.modelId, modelId)
  assert.equal(body.messages[0].content, options().system)
  assert.deepEqual(body.tools.map(tool => tool.name), ['read_file', 'Read', 'skill', 'pwsh'])
  for (const key of ['agentId', 'agentVersion', 'agentContractVersion', 'agentReleaseVersion', 'modelSelection', 'templateId']) {
    assert.equal(Object.hasOwn(body, key), false, `generic template chat must omit ${key}`)
  }
  assert.equal(bench.data.size, 1, 'existing protected session ownership remains enforced')
})

test('local template honors an explicitly selected authorized model without Platform Agent metadata', async () => {
  const bench = setup()
  await collect(bench.adapter.stream({ ...options(), model: secondModelId }))
  assert.deepEqual(bench.selections, [secondModelId])
  assert.equal(bench.calls[0].body.modelId, secondModelId)
  assert.equal(Object.hasOwn(bench.calls[0].body, 'agentId'), false)
})

test('local template default does not fall back to the first catalog model when current authorization points elsewhere', async () => {
  const bench = setup({ models: [secondModelId] })
  await assert.rejects(collect(bench.adapter.stream(options())), error => error.code === 'FUTURESTAFF_AUTH')
  assert.equal(bench.calls.length, 0)
})

test('local template requires the trusted current identity snapshot before transmitting any messages', async () => {
  const bench = setup({ identitySnapshot: false })
  await assert.rejects(collect(bench.adapter.stream(options())), error => error.code === 'FUTURESTAFF_AUTH')
  assert.equal(bench.calls.length, 0)
})

test('local template binding rejects foreign identity, malformed tool grants, business scopes and immutable references', async () => {
  for (const change of [
    template => ({ ...template, identity: { ...template.identity, tenantId: 'tenant-b' } }),
    template => ({ ...template, identity: { ...template.identity, userId: 'user-b' } }),
    template => ({ ...template, identity: undefined }),
    template => ({ ...template, businessSystems: ['unknown'] }),
    template => ({ ...template, businessSystems: ['erp', 'erp'] }),
    template => ({ ...template, businessSystems: undefined }),
    template => ({ ...template, templateId: 'foreign' }),
    template => ({ ...template, version: 'not-an-immutable-version' }),
    template => ({ ...template, agentId: '30000000-0000-4000-8000-000000000001' }),
    template => ({ ...template, modelPolicy: { primaryModelId: modelId, fallbackModelId: null } }),
    template => ({ ...template, signal: undefined }),
    template => ({ ...template, tools: 'read_file' }),
    template => ({ ...template, tools: ['read_file', 'read_file'] }),
    template => ({ ...template, tools: [''] }),
    template => ({ ...template, tools: [42] }),
  ]) {
    const bench = setup({ binding: change })
    await assert.rejects(collect(bench.adapter.stream(options())))
    assert.equal(bench.calls.length, 0)
  }
})

const offeredTools = names => names.map(name => ({ name, description: name, parameters: { type: 'object' } }))

test('new pure local roles receive message card guidance without recipe grants or business permissions', async () => {
  const bench = setup()
  await collect(bench.adapter.stream({ ...options(), tools: offeredTools(['agent_message_card', 'erp_prepare_action', 'read_file']) }))
  const body = bench.calls[0].body
  assert.deepEqual(body.tools.map(tool => tool.name), ['agent_message_card', 'read_file'])
  assert.ok(body.messages[0].content.startsWith(options().system))
  assert.match(body.messages[0].content, /agent_message_card/)
  assert.match(body.messages[0].content, /信息.*选择.*字段/)
  assert.match(body.messages[0].content, /原会话/)
  assert.match(body.messages[0].content, /不.*业务写入权限/)
  assert.match(body.messages[0].content, /商品.*ERP.*图片/)
  assert.match(body.messages[0].content, /HTML/)
  assert.equal(scope.templateToolAllowed('agent_message_card', undefined, []), true)
  assert.equal(scope.templateToolAllowed('agent_message_card', [], []), true)
  assert.equal(scope.businessToolAllowed('agent_message_card', []), true)
  assert.equal(scope.templateToolAllowed('futurestaff_unknown_card', ['futurestaff_unknown_card'], []), false)
  assert.equal(scope.templateToolAllowed('fs_unknown_card', ['fs_unknown_card'], []), false)
  assert.equal(scope.templateToolAllowed('erp_prepare_action', [], []), false)
})

test('Platform Agent cards are a default interface capability and preserve its model metadata and business scope', async () => {
  const bench = setup({ binding: template => ({ agentId: '30000000-0000-4000-8000-000000000001', version: template.version,
    businessSystems: [], modelPolicy: { primaryModelId: modelId, fallbackModelId: null }, identity: template.identity, signal: template.signal }) })
  await collect(bench.adapter.stream({ ...options(), tools: offeredTools(['agent_message_card', 'shop_call', 'erp_query']) }))
  const body = bench.calls[0].body
  assert.deepEqual(body.tools.map(tool => tool.name), ['agent_message_card'])
  assert.match(body.messages[0].content, /agent_message_card/)
  assert.equal(body.agentId, '30000000-0000-4000-8000-000000000001')
  assert.equal(body.modelSelection, 'agent-default')
})

test('card instructions are absent from title requests and chats without the exact offered tool', async () => {
  for (const change of [
    { purpose: 'session-title', tools: offeredTools(['agent_message_card']) },
    { tools: offeredTools(['agent_message_cards', 'futurestaff_message_card', 'read_file']) },
    {},
  ]) {
    const bench = setup()
    await collect(bench.adapter.stream({ ...options(), ...change }))
    assert.equal(bench.calls[0].body.messages[0].content, options().system)
  }
})

test('controlled local template tools intersect exact immutable grants, offered tools and business scope without removing native tools', async () => {
  const bench = setup({ binding: template => ({ ...template, businessSystems: ['erp'],
    tools: ['read_file', 'erp_query', 'website_tools'] }) })
  await collect(bench.adapter.stream({ ...options(), tools: offeredTools(['read_file', 'pwsh', 'erp_query', 'erp_prepare_action', 'website_tools', 'call_agent_admin_api']) }))
  assert.deepEqual(bench.calls[0].body.tools.map(tool => tool.name), ['read_file', 'pwsh', 'erp_query'])
  assert.equal(Object.hasOwn(bench.calls[0].body, 'agentId'), false)
  assert.equal(Object.hasOwn(bench.calls[0].body, 'modelSelection'), false)
})

test('local template explicit tools cannot grant an absent business scope or synthesize an unoffered tool', async () => {
  const bench = setup({ binding: template => ({ ...template, tools: ['erp_query', 'website_tools', 'unoffered_tool'] }) })
  await collect(bench.adapter.stream({ ...options(), tools: offeredTools(['erp_query', 'website_tools', 'pwsh']) }))
  assert.deepEqual(bench.calls[0].body.tools.map(tool => tool.name), ['pwsh'])
})

test('local template can offer multiple explicitly authorized systems while unrelated tools stay hidden', async () => {
  const bench = setup({ binding: template => ({ ...template, businessSystems: ['erp', 'web'], tools: ['erp_query', 'website_tools'] }) })
  await collect(bench.adapter.stream({ ...options(), tools: offeredTools(['erp_query', 'website_tools', 'shop_query', 'geo_collect']) }))
  assert.deepEqual(bench.calls[0].body.tools.map(tool => tool.name), ['erp_query', 'website_tools'])
})

test('Agent Admin is a controlled system tool and requires its exact Host grant without widening business scopes', async () => {
  assert.equal(scope.toolSystem('call_agent_admin_api'), 'agent')
  assert.equal(scope.templateToolAllowed('call_agent_admin_api', undefined, []), false)
  assert.equal(scope.templateToolAllowed('call_agent_admin_api', [], []), false)
  assert.equal(scope.templateToolAllowed('call_agent_admin_api', ['call_agent_admin_api'], []), true)
  assert.equal(scope.toolSystem('agent_admin_list'), 'agent')
  assert.equal(scope.templateToolAllowed('agent_admin_list', undefined, []), false)
  const bench = setup({ binding: template => ({ ...template, tools: ['call_agent_admin_api'] }) })
  await collect(bench.adapter.stream({ ...options(), tools: offeredTools(['call_agent_admin_api', 'erp_query', 'read_file']) }))
  assert.deepEqual(bench.calls[0].body.tools.map(tool => tool.name), ['call_agent_admin_api', 'read_file'])
})

test('ERP template exposes only its four precise ERP grants and native skills, never unrelated ERP or unknown modules', async () => {
  const tools = ['call_erp_api', 'erp_query', 'erp_order_form', 'erp_prepare_action']
  const bench = setup({ binding: template => ({ ...template, businessSystems: ['erp'], tools: [...tools, 'call_unknown_api'] }) })
  await collect(bench.adapter.stream({ ...options(), tools: offeredTools([...tools, 'skill', 'read_file', 'erp_unlisted', 'visa_query', 'agent_admin_list', 'call_agent_admin_api', 'call_unknown_api', 'module_unknown_query']) }))
  assert.deepEqual(bench.calls[0].body.tools.map(tool => tool.name), [...tools, 'skill', 'read_file'])
  assert.equal(scope.templateToolAllowed('call_unknown_api', ['call_unknown_api'], []), false)
})

test('provider cannot return a controlled tool removed from the local template offer', async () => {
  const bench = setup({ binding: template => ({ ...template, tools: ['read_file'] }), onFetch: async () => new Response(JSON.stringify({
    type: 'result', content: '', finishReason: 'tool-calls', toolCalls: [{ id: 'denied-admin', name: 'call_agent_admin_api', arguments: '{}' }],
  }) + '\n', { headers: { 'content-type': 'application/x-ndjson', 'x-futurestaff-chat-contract': '0.1.0' } }) })
  await assert.rejects(collect(bench.adapter.stream({ ...options(), tools: offeredTools(['read_file', 'call_agent_admin_api']) })), error => error.code === 'FUTURESTAFF_CONTRACT')
  assert.deepEqual(bench.calls[0].body.tools.map(tool => tool.name), ['read_file'])
})

test('existing Platform Agent bindings keep their established scope and model policy behavior', async () => {
  const bench = setup({ binding: template => ({ agentId: '30000000-0000-4000-8000-000000000001', version: template.version,
    businessSystems: ['erp'], modelPolicy: { primaryModelId: modelId, fallbackModelId: null }, identity: template.identity, signal: template.signal }) })
  await collect(bench.adapter.stream({ ...options(), tools: offeredTools(['read_file', 'erp_query', 'shop_query', 'call_agent_admin_api']) }))
  assert.deepEqual(bench.calls[0].body.tools.map(tool => tool.name), ['read_file', 'erp_query', 'call_agent_admin_api'])
  assert.equal(bench.calls[0].body.agentId, '30000000-0000-4000-8000-000000000001')
  assert.equal(bench.calls[0].body.modelSelection, 'agent-default')
})

test('a missing or cancelled local-template binding cannot bypass the existing mandatory session binding', async () => {
  const absent = setup({ binding: () => undefined })
  await assert.rejects(collect(absent.adapter.stream(options())), error => error.code === 'FUTURESTAFF_AGENT_REQUIRED')
  assert.equal(absent.calls.length, 0)
  const cancelled = setup({ binding: template => ({ ...template, signal: AbortSignal.abort() }) })
  await assert.rejects(collect(cancelled.adapter.stream(options())))
  assert.equal(cancelled.calls.length, 0)
})

test('revoking the Host local-template binding cancels its in-flight model request', async () => {
  const lifetime = new AbortController()
  let entered
  const started = new Promise(resolve => { entered = resolve })
  const bench = setup({ binding: template => ({ ...template, signal: lifetime.signal }), onFetch: async (_url, init) => {
    entered()
    return new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }) })
  } })
  const cancelled = assert.rejects(collect(bench.adapter.stream(options())))
  await started
  lifetime.abort()
  await cancelled
  assert.equal(bench.calls.length, 1)
  assert.equal(bench.calls[0].signal.aborted, true)
})
