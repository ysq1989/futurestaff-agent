import type {ConversationNodeDefinition} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {agentMessageCardSnapshot, type AgentMessageCardView} from '../agent-message-card-contract.js'

export interface AgentMessageCardMeta {
  kind: 'futurestaff.agent-card'
  viewId: string
  sessionId: string
  title: string
  snapshot: AgentMessageCardView
}
export interface AgentMessageCardItem {seq: number; meta: AgentMessageCardMeta}
interface State {turn: number; calls: Set<string>; completed: Set<string>; items: AgentMessageCardItem[]}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {'futurestaff-agent-cards': {items: AgentMessageCardItem[]}}
}

/** Only successful results of the exact registered card tool become historical cards. */
export const agentMessageCardDefinition: ConversationNodeDefinition = {
  kind: 'futurestaff-agent-cards',
  match: event => ['turn/start', 'tool/call', 'tool/result'].includes(event.type)
    ? {id: String((event.data as {turn: number}).turn), role: event.type === 'turn/start' ? 'start' : 'update'} : null,
  start: (_context, match) => ({turn: (match.event.data as {turn: number}).turn, calls: new Set(), completed: new Set(), items: []}),
  update: (context, match) => {
    const state = context.state as State
    if (match.event.type === 'tool/call') {
      if (match.event.data.name !== 'agent_message_card') return state
      const id = String(match.event.data.callId)
      return state.calls.has(id) ? state : {...state, calls: new Set([...state.calls, id])}
    }
    if (match.event.type !== 'tool/result') return state
    const message = match.event.data.message, callId = String((message.source as {callId?: string}).callId)
    if (!state.calls.has(callId) || state.completed.has(callId)) return state
    const block = message.content[0]
    if (block?.type !== 'tool-result' || block.isError) return state
    for (const item of block.content) {
      if (item.type !== 'text') continue
      try {
        const snapshot = agentMessageCardSnapshot(JSON.parse(item.text))
        if (!snapshot) continue
        const completed = new Set([...state.completed, callId])
        if (state.items.some(item => item.meta.viewId === snapshot.viewId)) return {...state, completed}
        const meta: AgentMessageCardMeta = {kind: 'futurestaff.agent-card', viewId: snapshot.viewId, sessionId: snapshot.sessionId, title: snapshot.title, snapshot}
        return {...state, completed, items: [...state.items, {seq: match.event.seq, meta}]}
      } catch { /* Untrusted tool text remains text. */ }
    }
    return state
  },
  buildLocationData: (context, scope, previous) => {
    const state = context.state as State | undefined
    if (scope !== 'turn' || !state) return null
    if (previous?.kind === 'turn' && previous.key === 'futurestaff-agent-cards' && previous.value.items === state.items) return previous
    return {kind: 'turn', turn: state.turn, key: 'futurestaff-agent-cards', value: {items: state.items}}
  },
}

export function agentMessageCardsAt(items: readonly AgentMessageCardItem[], seq: number): AgentMessageCardMeta[] {
  return items.filter(item => item.seq <= seq).map(item => item.meta)
}
