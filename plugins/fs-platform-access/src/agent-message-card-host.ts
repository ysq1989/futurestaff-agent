import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {InteractionReturnChannel} from './interaction.js'
import {AgentMessageCards, type AgentCardIdentity} from './agent-message-cards.js'
import {agentMessageCardParameters, type AgentMessageCardView} from './agent-message-card-contract.js'
import {agentCardResponseNotice} from './agent-message-card-history.js'

/** Mounted once for the member Profile, independent of Agent business systems. */
export function mountAgentMessageCards(ctx: Context, authorize: (sessionId: string) => Promise<AgentCardIdentity>, readHistory?: (viewId: string, sessionId: string) => Promise<AgentMessageCardView>) {
  const returns = new InteractionReturnChannel<AgentMessageCardView>()
  const cards = new AgentMessageCards(authorize, (view, owner) => returns.deliver(view.response!.eventId, view, owner), readHistory ? {readHistory} : {})
  ctx.on('agent/disposed', ({agent}) => returns.unbind(agent.id))
  ctx.effect(() => () => { cards.dispose(); returns.clear() }, 'Agent message cards lifecycle')
  ctx.inject(['tools'], scope => scope.effect(() => scope.tools.register({
    name: 'agent_message_card',
    description: '向当前对话展示原生交互卡片：说明、facts摘要、简单fields文本/多行/下拉信息、actions按钮选择。需要用户选择方案、补充信息或整理结果时使用；不要输出HTML。title必填。字段id和按钮id唯一；有字段须有提交按钮。submit:false按钮跳过字段验证，只回传选择。只收集用户回答，不执行业务；商品推荐、ERP确认、图片成果优先用专用工具。不得收集密码、令牌或付款信息。有按钮时等待用户点击或提交，不轮询、不代替用户回答；点击会自动回传原会话。纯信息卡无需等待点击，可直接总结。',
    parameters: agentMessageCardParameters,
    output: {schema: {type: 'object', additionalProperties: true}, render: (_args, value) => [{type: 'text', text: JSON.stringify(value)}],
      presentationMeta: (_args, value) => { const view = value as unknown as AgentMessageCardView; return {kind: 'futurestaff.agent-card', viewId: view.viewId, sessionId: view.sessionId, title: view.title, snapshot: value} }},
    execute: async (input, execution) => {
      const agent = execution.agent
      if (!agent || ctx.get('agents')?.get(agent.id) !== agent) throw Error('AGENT_CARD_SESSION_REQUIRED')
      execution.signal.throwIfAborted()
      const identity = await authorize(agent.id)
      identity.signal.throwIfAborted(); execution.signal.throwIfAborted()
      returns.bind(agent.id, identity.owner, async (view, sourceId) => {
        const fresh = await authorize(agent.id)
        identity.signal.throwIfAborted(); fresh.signal.throwIfAborted()
        if (fresh.owner !== identity.owner || fresh.policy !== identity.policy || ctx.get('agents')?.get(agent.id) !== agent) throw Error('AGENT_CARD_FORBIDDEN')
        agent.followup({id: ('futurestaff-card-response-' + sourceId) as Parameters<typeof agent.followup>[0]['id'], role: 'user',
          source: {kind: 'plugin', plugin: 'futurestaff-message-card', form: 'notice', summary: '用户已在原生卡片中提交回答，仅记录输入。'},
          content: [{type: 'text', text: JSON.stringify({kind: 'futurestaff.card.response', schemaVersion: 1, viewId: view.viewId, sessionId: view.sessionId, title: view.title, ...view.response})},
            {type: 'text', text: agentCardResponseNotice}]})
      }, identity.signal)
      return cards.present(input, agent.id)
    }, timeoutMs: 30000,
  }), 'Default Agent interactive message card tool'))

  ctx.effect(() => ctx.webServer.register({kind: 'exact', path: '/_futurestaff/message-card', handler: async (request, response) => {
    const send = (status: number, body: unknown) => {
      response.statusCode = status; response.setHeader('content-type', 'application/json; charset=utf-8')
      response.setHeader('cache-control', 'no-store'); response.setHeader('x-content-type-options', 'nosniff'); response.end(JSON.stringify(body))
    }
    if (request.method !== 'POST' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
      || request.headers['x-futurestaff-card'] !== '1' || request.headers.origin && request.headers.origin !== 'http://' + request.headers.host) return send(403, {error: 'AGENT_CARD_LOCAL_REQUEST_REQUIRED'})
    try {
      const chunks: Buffer[] = []; let length = 0
      for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        length += bytes.length
        if (length > 65536) throw Error('AGENT_CARD_INPUT_INVALID')
        chunks.push(bytes)
      }
      const input: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('AGENT_CARD_INPUT_INVALID')
      const body = input as Record<string, unknown>
      if (Object.keys(body).some(key => !['action', 'sessionId', 'viewId', 'actionId', 'values'].includes(key))
        || !['view', 'respond', 'retry'].includes(String(body.action)) || typeof body.sessionId !== 'string' || typeof body.viewId !== 'string'
        || body.action !== 'respond' && (body.actionId !== undefined || body.values !== undefined)
        || body.action === 'respond' && typeof body.actionId !== 'string') throw Error('AGENT_CARD_INPUT_INVALID')
      const view = body.action === 'view' ? await cards.view(body.viewId, body.sessionId)
        : body.action === 'retry' ? await cards.retry(body.viewId, body.sessionId) : await cards.respond(body.viewId, body.sessionId, body.actionId, body.values)
      return send(200, view)
    } catch (reason) {
      const code = (reason as Error).message
      const known = /^AGENT_CARD_[A-Z_]+$/.test(code) ? code : 'AGENT_CARD_FORBIDDEN'
      return send(known === 'AGENT_CARD_FORBIDDEN' ? 403 : known === 'AGENT_CARD_ALREADY_ANSWERED' ? 409 : 400, {error: known})
    }
  }}), 'Same-origin Agent card response route')
  return cards
}
