import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { AgentWorkspaceStore, fetchAgentData, type AgentCard, type AgentCredentials, type AgentSnapshot } from './agents.js'
import { requireSystemScope, systemScopeAllowed } from './system-assistant-access.js'

/** A member-visible current role is selectable without pretending it is a published release. */
export interface CurrentSnapshotCard extends AgentCard {
  version: string
  installed: boolean
  businessSystems: ['shop']
  requiredApplications: ['shop']
}

export function mountAgentSnapshots(ctx: Context, origin: string, runtime: (version: string) => AgentWorkspaceStore,
  identity: { tenantId: string; userId: string }, authorize: () => Promise<AgentCredentials>, fetcher = globalThis.fetch) {
  let queue: Promise<unknown> = Promise.resolve()
  const credentials = async () => {
    const value = await authorize(); value.signal.throwIfAborted()
    if (value.tenantId !== identity.tenantId || value.userId !== identity.userId) throw Error('AGENT_IDENTITY_MISMATCH')
    return value
  }
  const check = async (value: AgentCredentials, requireShop = false) => {
    value.signal.throwIfAborted(); const fresh = await credentials(); value.signal.throwIfAborted()
    if (requireShop) await requireSystemScope(origin, fresh, ['shop'], fetcher)
    return fresh
  }
  async function current(agentId: string, c: AgentCredentials): Promise<AgentSnapshot> {
    const snapshot = await fetchAgentData(origin, c, agentId, fetcher, '1.1.0') as AgentSnapshot
    // This additive path serves the existing SHOP role only. Other systems retain
    // their own managed template/release lifecycle and capability confirmation.
    if (snapshot.businessSystems?.length !== 1 || snapshot.businessSystems[0] !== 'shop' || !snapshot.modelPolicy?.primaryModelId) throw Error('AGENT_UNAVAILABLE')
    await requireSystemScope(origin, c, snapshot.businessSystems, fetcher)
    return snapshot
  }
  const offered = async (agentId: string, version: string, c: AgentCredentials) => {
    const card = (await fetchAgentData(origin, c, undefined, fetcher) as AgentCard[]).find(item => item.agentId === agentId && item.available)
    if (!card) throw Error('AGENT_UNAVAILABLE')
    const snapshot = await current(agentId, c)
    if (snapshot.version !== version) throw Error('AGENT_SNAPSHOT_CHANGED')
    return snapshot
  }
  async function catalog() {
    const c = await credentials(), cards = await fetchAgentData(origin, c, undefined, fetcher) as AgentCard[]
    const items: CurrentSnapshotCard[] = []
    // A small bounded fan-out keeps current-role discovery from flooding Platform.
    let offset = 0
    await Promise.all(Array.from({ length: Math.min(4, cards.length) }, async () => {
      while (offset < cards.length) {
        const card = cards[offset++]!; if (!card.available) continue
        try {
          const snapshot = await current(card.agentId, c), store = runtime(snapshot.version)
          let installed = false
          try { installed = JSON.stringify(await store.snapshot(card.agentId)) === JSON.stringify(snapshot) }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
          items.push({ ...card, version: snapshot.version, installed, businessSystems: ['shop'], requiredApplications: ['shop'] })
        } catch { c.signal.throwIfAborted() }
      }
    }))
    const fresh = await check(c)
    if (!await systemScopeAllowed(origin, fresh, ['shop'], fetcher)) return { items: [] }
    const order = new Map(cards.map((card, index) => [card.agentId, index]))
    return { items: items.sort((a, b) => order.get(a.agentId)! - order.get(b.agentId)!) }
  }
  for (const [suffix, method] of [['current-snapshots', 'GET'], ['install-snapshot', 'POST'], ['open-snapshot', 'POST']] as const) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/_futurestaff/agents/' + suffix, handler: async (request, response) => {
      const send = (status: number, value: unknown) => {
        response.statusCode = status; response.setHeader('content-type', 'application/json; charset=utf-8')
        response.setHeader('cache-control', 'no-store'); response.setHeader('x-content-type-options', 'nosniff'); response.end(JSON.stringify(value))
      }
      if (request.method !== method || request.headers['x-futurestaff-agent'] !== '1'
        || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
        || (request.headers.origin && request.headers.origin !== 'http://' + request.headers.host)) return send(403, { error: 'LOCAL_REQUEST_REQUIRED' })
      try {
        if (suffix === 'current-snapshots') return send(200, await catalog())
        const c = await credentials(); let raw = ''
        for await (const chunk of request) { raw += String(chunk); if (Buffer.byteLength(raw) > 2048) throw Error('AGENT_REQUEST_INVALID') }
        const body: unknown = JSON.parse(raw)
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== 'agentId,version') throw Error('AGENT_REQUEST_INVALID')
        const input = body as Record<string, unknown>
        if (typeof input.agentId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.agentId)
          || typeof input.version !== 'string' || !/^[a-f0-9]{64}$/.test(input.version)) throw Error('AGENT_REQUEST_INVALID')
        const agentId = input.agentId, version = input.version
        const run = async () => {
          const fresh = await check(c, true)
          const snapshot = await offered(agentId, version, fresh), store = runtime(version)
          if (suffix === 'install-snapshot') {
            await store.materialize(snapshot, c.signal, async () => {
              const latest = await check(c, true)
              const live = await offered(agentId, version, latest)
              if (JSON.stringify(live) !== JSON.stringify(snapshot)) throw Error('AGENT_SNAPSHOT_CHANGED')
              await check(c, true)
            })
            return { ok: true }
          }
          if (JSON.stringify(await store.snapshot(agentId)) !== JSON.stringify(snapshot)) throw Error('AGENT_SNAPSHOT_CHANGED')
          const latest = await check(c, true)
          // A server update during the local install cannot open a stale session.
          const live = await offered(agentId, version, latest)
          if (JSON.stringify(live) !== JSON.stringify(snapshot)) throw Error('AGENT_SNAPSHOT_CHANGED')
          const workspace = await store.workspacePath(agentId)
          const registry = ctx.get('workspaceRegistry') as unknown as { create(path: string, title?: string): Promise<unknown> } | undefined
          if (!registry) throw Error('AGENT_WORKSPACE_SERVICE_REQUIRED')
          await check(c, true)
          await registry.create(workspace, snapshot.name); await check(c, true)
          return { agentId, name: snapshot.name, version, path: workspace }
        }
        const pending = queue.then(run, run); queue = pending.catch(() => {})
        return send(200, await pending)
      } catch (error) {
        const allowed = ['AGENT_SNAPSHOT_CHANGED', 'AGENT_UNAVAILABLE', 'AGENT_APPLICATION_REQUIRED', 'AGENT_SNAPSHOT_LOCAL_CONFLICT']
        return send(409, { error: error instanceof Error && allowed.includes(error.message) ? error.message : 'AGENT_SNAPSHOT_UNAVAILABLE' })
      }
    } }), 'futurestaff current role ' + suffix)
  }
}
