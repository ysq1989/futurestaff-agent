import {randomUUID} from 'node:crypto'
import {InteractionRegistry, type OwnedView} from './interaction.js'
import {parseAgentCardContent, parseAgentCardValues, type AgentMessageCardView} from './agent-message-card-contract.js'

export interface AgentCardIdentity { owner: string; policy: string; signal: AbortSignal }
type Saved = OwnedView<AgentMessageCardView> & { delivery?: Promise<boolean> }

/** Generic cards collect user input only. Business adapters retain all mutation authority. */
export class AgentMessageCards {
  private registry: InteractionRegistry<AgentMessageCardView, Saved>
  private now: () => number
  private ttlMs: number
  private owners = new Map<string, {owner: string; policy: string; expires: number}>()
  constructor(
    private authorize: (sessionId: string) => Promise<AgentCardIdentity>,
    private deliver: (view: AgentMessageCardView, owner: string) => Promise<boolean>,
    options: {now?: () => number; ttlMs?: number} = {},
  ) {
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? 600000
    this.registry = new InteractionRegistry('agent-card', {...options, invalidError: 'AGENT_CARD_EXPIRED'})
  }
  private async identity(sessionId: string): Promise<AgentCardIdentity> {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 128) throw Error('AGENT_CARD_SESSION_REQUIRED')
    const identity = await this.authorize(sessionId)
    identity.signal.throwIfAborted()
    return identity
  }
  private checked(viewId: string, sessionId: string, identity: AgentCardIdentity): Saved {
    const original = this.owners.get(viewId)
    // Identity failures must not be misread by the client as permission to show
    // the historical snapshot. Only genuine expiry permits that fallback.
    if (original && (original.owner !== identity.owner || original.policy !== identity.policy)) throw Error('AGENT_CARD_FORBIDDEN')
    return this.registry.checked(viewId, sessionId, identity.owner, identity.policy)
  }
  async present(input: unknown, sessionId: string): Promise<AgentMessageCardView> {
    const identity = await this.identity(sessionId), data = parseAgentCardContent(input)
    const view: AgentMessageCardView = {schemaVersion: 1, module: 'agent-card', kind: 'message', viewId: randomUUID(), sessionId, title: data.title, data, expiresAt: this.now() + this.ttlMs}
    this.registry.put({view, owner: identity.owner, policy: identity.policy, signal: identity.signal})
    for (const [id, entry] of this.owners) if (entry.expires <= this.now()) this.owners.delete(id)
    if (this.owners.size >= 100) this.owners.delete(this.owners.keys().next().value!)
    this.owners.set(view.viewId, {owner: identity.owner, policy: identity.policy, expires: view.expiresAt})
    return structuredClone(view)
  }
  async view(viewId: string, sessionId: string): Promise<AgentMessageCardView> {
    return structuredClone(this.checked(viewId, sessionId, await this.identity(sessionId)).view)
  }
  async respond(viewId: string, sessionId: string, actionId: unknown, values: unknown): Promise<AgentMessageCardView> {
    const identity = await this.identity(sessionId), saved = this.checked(viewId, sessionId, identity)
    const parsed = parseAgentCardValues(saved.view.data, actionId, values)
    if (saved.view.response) {
      if (saved.view.response.actionId !== actionId || JSON.stringify(saved.view.response.values) !== JSON.stringify(parsed)) throw Error('AGENT_CARD_ALREADY_ANSWERED')
    } else {
      const action = saved.view.data.actions!.find(action => action.id === actionId)!
      // Synchronous first-answer ownership before any callback or await.
      saved.view = {...saved.view, response: {eventId: randomUUID(), actionId: action.id, actionLabel: action.label, values: parsed}, conversationUpdated: false}
    }
    return this.send(saved, identity)
  }
  async retry(viewId: string, sessionId: string): Promise<AgentMessageCardView> {
    const identity = await this.identity(sessionId), saved = this.checked(viewId, sessionId, identity)
    if (!saved.view.response) throw Error('AGENT_CARD_RESPONSE_REQUIRED')
    return this.send(saved, identity)
  }
  private async send(saved: Saved, identity: AgentCardIdentity): Promise<AgentMessageCardView> {
    if (saved.view.conversationUpdated) return structuredClone(saved.view)
    if (!saved.delivery) {
      saved.delivery = Promise.resolve().then(async () => {
        identity.signal.throwIfAborted()
        const fresh = await this.identity(saved.view.sessionId)
        this.checked(saved.view.viewId, saved.view.sessionId, fresh)
        try { return await this.deliver(structuredClone(saved.view), fresh.owner) } catch { return false }
      })
    }
    const pending = saved.delivery
    try {
      const delivered = await pending
      identity.signal.throwIfAborted()
      const fresh = await this.identity(saved.view.sessionId)
      this.checked(saved.view.viewId, saved.view.sessionId, fresh)
      saved.view = {...saved.view, conversationUpdated: delivered}
      return structuredClone(saved.view)
    } finally { if (saved.delivery === pending) delete saved.delivery }
  }
  dispose(): void { this.registry.clear(); this.owners.clear() }
}
