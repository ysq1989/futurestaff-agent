import {candidateHash, decodeCandidateDraft, type CandidateDomain, type CandidateDraft, type CandidateOwner} from './governance-candidates.js'

export type LocalCandidateStatus = 'queued' | 'sending' | 'unknown' | 'received' | 'cancelled' | 'dismissed' | 'expired' | 'needs_confirmation' | 'revoked'
export interface OutboxEntry {
  draft: CandidateDraft; previewHash: string; confirmedAt: number; expiresAt: number
  status: LocalCandidateStatus; operationId: string; needsQuery: boolean
}
export interface IsolatedCandidateAdapter {
  kind: 'isolated_mock'
  submit(entry: OutboxEntry, signal: AbortSignal): Promise<'received' | 'cancelled' | 'revoked'>
  query(entry: OutboxEntry, signal: AbortSignal): Promise<'received' | 'cancelled' | 'revoked' | null>
}
interface LocalCancellation {owner: CandidateOwner; domain: CandidateDomain; requestId: string; operationId: string; status: 'cancelled' | 'dismissed'}

const domains: CandidateDomain[] = ['enterprise_knowledge', 'platform_product_feedback']
const terminal: LocalCandidateStatus[] = ['cancelled', 'dismissed', 'received', 'revoked']
const sameOwner = (a: CandidateOwner, b: CandidateOwner): boolean => a.actorId === b.actorId && a.tenantId === b.tenantId
const keyOf = (draft: CandidateDraft): string => JSON.stringify([draft.owner.tenantId, draft.owner.actorId, draft.domain, draft.requestId])
const cancellationKey = (owner: CandidateOwner, domain: CandidateDomain, requestId: string): string => JSON.stringify([owner.tenantId, owner.actorId, domain, requestId])
const uuid = (value: unknown): boolean => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value)

/** Local consent staging and isolated mocks only; there is deliberately no HTTP or production adapter. */
export class LocalCandidateOutbox {
  private owner: CandidateOwner | null
  private records = new Map<string, OutboxEntry>()
  private cancellations = new Map<string, LocalCancellation>()
  private permissions = new Set<CandidateDomain>()
  private revision = 0
  private domainRevisions: Record<CandidateDomain, number> = {enterprise_knowledge: 0, platform_product_feedback: 0}
  private controller: AbortController | undefined
  private activeDomain: CandidateDomain | undefined
  private busy = false
  private clock: () => number

  constructor(owner: CandidateOwner | null, options: {clock?: () => number} = {}) {
    this.owner = owner ? {...owner} : null
    this.clock = options.clock ?? Date.now
  }

  get entries(): OutboxEntry[] {
    const owner = this.owner
    return owner ? [...this.records.values()].filter(entry => sameOwner(entry.draft.owner, owner)).map(entry => structuredClone(entry)) : []
  }

  /** Account changes stop pending work and erase all local permission choices. */
  setOwner(owner: CandidateOwner | null): void {
    if (owner && this.owner && sameOwner(owner, this.owner)) return
    this.invalidate()
    this.permissions.clear()
    this.owner = owner ? {...owner} : null
  }

  /** Local save intent / isolated-test permission only; never represents Platform authorization. */
  setPermission(domain: CandidateDomain, allowed: boolean): void {
    if (!domains.includes(domain)) throw Error('INVALID_LOCAL_DOMAIN')
    if (allowed) this.permissions.add(domain)
    else { this.permissions.delete(domain); this.invalidate(domain) }
  }

  /** Bind one user action to the complete local preview. Duplicate clicks cannot renew its lifetime. */
  async confirm(draft: CandidateDraft): Promise<OutboxEntry> {
    const current = this.revision, copy = decodeCandidateDraft(draft), domainRevision = this.domainRevisions[copy.domain], hash = await candidateHash(copy)
    if (current !== this.revision || domainRevision !== this.domainRevisions[copy.domain] || !this.owner || !sameOwner(this.owner, copy.owner)) throw Error('OWNER_CHANGED')
    if (!this.permissions.has(copy.domain)) throw Error('LOCAL_PERMISSION_REQUIRED')
    const key = keyOf(copy), existing = this.records.get(key), now = this.clock()
    if (existing && existing.previewHash !== hash) throw Error('PREVIEW_HASH_CONFLICT')
    if (this.cancellations.has(cancellationKey(copy.owner, copy.domain, copy.requestId))) {
      if (existing) return structuredClone(existing)
      throw Error('CANDIDATE_CANCELLED')
    }
    if (existing && existing.status !== 'needs_confirmation') return structuredClone(existing)
    if (!existing && this.entries.length >= 100) throw Error('LOCAL_QUEUE_FULL')
    if (copy.scope.validUntil <= now) throw Error('CANDIDATE_EXPIRED')
    const entry: OutboxEntry = {draft: copy, previewHash: hash, confirmedAt: now, expiresAt: Math.min(now + 300_000, copy.scope.validUntil), status: existing?.needsQuery ? 'unknown' : 'queued', operationId: existing?.operationId ?? crypto.randomUUID(), needsQuery: existing?.needsQuery ?? false}
    this.records.set(key, entry)
    return structuredClone(entry)
  }

  dismiss(domain: CandidateDomain, requestId: string): void { this.tombstone(domain, requestId, 'dismissed') }
  cancel(domain: CandidateDomain, requestId: string): void { this.tombstone(domain, requestId, 'cancelled') }

  private tombstone(domain: CandidateDomain, requestId: string, state: 'cancelled' | 'dismissed'): void {
    if (!this.owner || !domains.includes(domain) || !uuid(requestId)) throw Error('INVALID_LOCAL_CANCELLATION')
    const key = cancellationKey(this.owner, domain, requestId), existing = this.cancellations.get(key)
    const saved = this.entries.find(entry => entry.draft.domain === domain && entry.draft.requestId === requestId)
    const operationId = existing?.operationId ?? saved?.operationId ?? crypto.randomUUID()
    if (saved) this.cancellations.delete(key)
    else {
      if (!existing && [...this.cancellations.values()].filter(item => this.owner && sameOwner(item.owner, this.owner)).length >= 100) { this.invalidate(); throw Error('LOCAL_QUEUE_FULL') }
      this.cancellations.set(key, {owner: {...this.owner}, domain, requestId, operationId, status: existing?.status ?? state})
    }
    for (const entry of this.records.values()) if (this.owner && sameOwner(entry.draft.owner, this.owner) && entry.draft.domain === domain && entry.draft.requestId === requestId) {
      const sending = entry.status === 'sending'
      entry.status = existing?.status ?? state
      entry.operationId = operationId
      if (sending) this.controller?.abort()
    }
  }

  private invalidate(domain?: CandidateDomain): void {
    if (domain) this.domainRevisions[domain]++
    else this.revision++
    if (!domain || this.activeDomain === domain) this.controller?.abort()
    for (const entry of this.records.values()) if ((!domain || entry.draft.domain === domain) && !terminal.includes(entry.status)) {
      entry.needsQuery ||= entry.status === 'sending' || entry.status === 'unknown'
      entry.status = 'needs_confirmation'
    }
  }

  /** No argument always fails closed. Only explicit synthetic adapters may process the isolated queue. */
  async flush(adapter?: IsolatedCandidateAdapter): Promise<'not_connected' | 'busy' | 'processed'> {
    if (!adapter || adapter.kind !== 'isolated_mock') return 'not_connected'
    if (this.busy) return 'busy'
    this.busy = true
    const revision = this.revision, controller = new AbortController()
    this.controller = controller
    try {
      for (const entry of this.records.values()) {
        if (controller.signal.aborted || revision !== this.revision) break
        if (!this.owner || !sameOwner(this.owner, entry.draft.owner) || !['queued', 'unknown'].includes(entry.status)) continue
        if (!this.permissions.has(entry.draft.domain)) { entry.status = 'needs_confirmation'; continue }
        if (entry.expiresAt <= this.clock()) { entry.status = 'expired'; continue }
        this.activeDomain = entry.draft.domain
        if (entry.previewHash !== await candidateHash(entry.draft)) throw Error('PREVIEW_HASH_CONFLICT')
        if (controller.signal.aborted || revision !== this.revision || terminal.includes(entry.status)) break
        const recover = entry.status === 'unknown' || entry.needsQuery
        entry.status = 'sending'; entry.needsQuery = true
        try {
          const receipt = await (recover ? adapter.query(structuredClone(entry), controller.signal) : adapter.submit(structuredClone(entry), controller.signal))
          if (controller.signal.aborted || revision !== this.revision || terminal.includes(entry.status)) continue
          entry.status = receipt ?? 'unknown'
          entry.needsQuery = receipt === null
        } catch {
          if (!controller.signal.aborted && revision === this.revision && !terminal.includes(entry.status)) entry.status = 'unknown'
        }
      }
      return 'processed'
    } finally { this.busy = false; if (this.controller === controller) { this.controller = undefined; this.activeDomain = undefined } }
  }

  /** Export the active owner only; drafts that have never been confirmed are not stored here. */
  serialize(): string { return JSON.stringify({schema: 1, entries: this.entries, tombstones: [...this.cancellations.values()].filter(item => this.owner && sameOwner(item.owner, this.owner))}) }

  /** Restored choices never grant permissions or auto-send; uncertain requests retain query-first recovery. */
  restore(json: string): void {
    if (json.length > 1_000_000) throw Error('INVALID_OUTBOX')
    let value: unknown
    try { value = JSON.parse(json) } catch { throw Error('INVALID_OUTBOX') }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_OUTBOX')
    const parsed = value as Record<string, unknown>
    if (Object.keys(parsed).sort().join(',') !== 'entries,schema,tombstones' || parsed.schema !== 1 || !Array.isArray(parsed.entries) || parsed.entries.length > 100 || !Array.isArray(parsed.tombstones) || parsed.tombstones.length > 100) throw Error('INVALID_OUTBOX')
    const decoded: OutboxEntry[] = []
    for (const raw of parsed.entries) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('INVALID_OUTBOX')
      const entry = raw as Record<string, unknown>
      if (Object.keys(entry).sort().join(',') !== 'confirmedAt,draft,expiresAt,needsQuery,operationId,previewHash,status' || typeof entry.previewHash !== 'string' || !/^[0-9a-f]{64}$/u.test(entry.previewHash) || !uuid(entry.operationId) || typeof entry.needsQuery !== 'boolean' || !['queued', 'sending', 'unknown', 'received', 'cancelled', 'dismissed', 'expired', 'needs_confirmation', 'revoked'].includes(String(entry.status)) || !Number.isSafeInteger(entry.confirmedAt) || !Number.isSafeInteger(entry.expiresAt) || Number(entry.expiresAt) <= Number(entry.confirmedAt) || Number(entry.expiresAt) - Number(entry.confirmedAt) > 300_000) throw Error('INVALID_OUTBOX')
      const draft = decodeCandidateDraft(entry.draft)
      if (Number(entry.confirmedAt) < 0 || Number(entry.expiresAt) > draft.scope.validUntil) throw Error('INVALID_OUTBOX')
      decoded.push({draft, previewHash: entry.previewHash, operationId: String(entry.operationId), confirmedAt: Number(entry.confirmedAt), expiresAt: Number(entry.expiresAt), status: entry.status === 'cancelled' || entry.status === 'dismissed' ? entry.status : 'needs_confirmation', needsQuery: entry.needsQuery || ['sending', 'unknown', 'received', 'revoked'].includes(String(entry.status))})
    }
    const pendingCancellations = new Map(this.cancellations)
    for (const raw of parsed.tombstones) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('INVALID_OUTBOX')
      const item = raw as Record<string, unknown>, owner = item.owner
      if (Object.keys(item).sort().join(',') !== 'domain,operationId,owner,requestId,status' || !owner || typeof owner !== 'object' || Array.isArray(owner)) throw Error('INVALID_OUTBOX')
      const actor = owner as Record<string, unknown>
      if (Object.keys(actor).sort().join(',') !== 'actorId,tenantId' || typeof actor.actorId !== 'string' || typeof actor.tenantId !== 'string' || !actor.actorId || !actor.tenantId || !uuid(item.requestId) || !uuid(item.operationId) || (item.domain !== 'enterprise_knowledge' && item.domain !== 'platform_product_feedback') || !['cancelled', 'dismissed'].includes(String(item.status))) throw Error('INVALID_OUTBOX')
      const cancellation: LocalCancellation = {owner: {tenantId: actor.tenantId, actorId: actor.actorId}, domain: item.domain, requestId: String(item.requestId), operationId: String(item.operationId), status: item.status === 'cancelled' ? 'cancelled' : 'dismissed'}
      if (this.owner && sameOwner(cancellation.owner, this.owner)) {
        const key = cancellationKey(cancellation.owner, cancellation.domain, cancellation.requestId), previous = pendingCancellations.get(key)
        if (previous && previous.operationId !== cancellation.operationId) throw Error('PREVIEW_HASH_CONFLICT')
        pendingCancellations.set(key, cancellation)
      }
    }
    const pending = new Map(this.records)
    for (const entry of decoded) if (this.owner && sameOwner(entry.draft.owner, this.owner)) {
      const key = keyOf(entry.draft), existing = pending.get(key)
      if (existing && existing.previewHash !== entry.previewHash) throw Error('PREVIEW_HASH_CONFLICT')
      if (!existing || !terminal.includes(existing.status)) pending.set(key, entry)
    }
    this.invalidate(); this.permissions.clear(); this.records = pending; this.cancellations = pendingCancellations
    for (const entry of this.records.values()) {
      const cancellation = this.cancellations.get(cancellationKey(entry.draft.owner, entry.draft.domain, entry.draft.requestId))
      if (cancellation) { entry.status = cancellation.status; entry.operationId = cancellation.operationId }
    }
  }
}
