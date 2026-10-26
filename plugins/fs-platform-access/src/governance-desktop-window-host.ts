import type {Context} from '@deepseek-ai/cordis'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {timingSafeEqual} from 'node:crypto'
import {candidateHash, decodeCandidateDraft, type CandidateDraft} from './governance-candidates.js'
import {canonicalContractJson, hashContractJson, parseContractJson, validateContractSchema, validateWebHandoffCompatibility, verifyPayloadMetadata, type ContractInputs} from './governance-desktop-contract.js'
import {decodeDesktopPublicResponse, type DesktopPublicResponse} from './governance-desktop-responses.js'
import type {CandidateWindowOffer, CandidateWindowView, NativeCandidateConsentRuntime, NativeCandidateConsentSession, NativeCandidateConsentState} from './governance-desktop-window-contract.js'

export interface CandidateConsentContext {tenantId: string; actorId: string; sessionId: string; taskBinding: string; signal: AbortSignal}
/** Only a trusted Host provider may supply these current server-bound records.
 * This interface/shape validation is not authentication. There is no default provider,
 * no renderer registration endpoint, and no automatic draft-to-wire conversion.
 */
export interface HostCandidateConsentGrant {
  handle: string; draft: CandidateDraft; sessionId: string; taskBinding: string
  prepare: ContractInputs['PrepareDesktop']; payloadJson: string; server: DesktopPublicResponse; signal: AbortSignal
}
export interface CandidateConsentProvider {
  /** Host configuration/admission epoch; abort before policy, source or version changes. */
  readonly authoritySignal: AbortSignal
  nativeWindowPolicy(): {platformOrigin: string; handoffOrigin: string} | null
  list(context: CandidateConsentContext): Promise<readonly HostCandidateConsentGrant[]>
}
interface Entry {context: CandidateConsentContext; authoritySignal: AbortSignal; grantSignal: AbortSignal; bindingHash: string; grant: HostCandidateConsentGrant | null; offer: CandidateWindowOffer; session: NativeCandidateConsentSession | null; state: CandidateWindowView['state']; transferred: boolean; attempted: boolean; run: number; stop(): void}
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(v)
const label = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/u.test(v)
const empty = () => ({status: 'not_connected' as const, candidates: [] as CandidateWindowOffer[]})
function view(handle: string, state: CandidateWindowView['state']): CandidateWindowView {return Object.freeze({handle, state, queryConnected: false})}
function same(a: CandidateConsentContext, b: CandidateConsentContext): boolean {return a.tenantId === b.tenantId && a.actorId === b.actorId && a.sessionId === b.sessionId && a.taskBinding === b.taskBinding && a.signal === b.signal && !a.signal.aborted}
function matchesPreview(draft: CandidateDraft, prepare: ContractInputs['PrepareDesktop'], value: unknown): boolean {
  const payload = value as Record<string, unknown>, scope = prepare.manifest.scope
  if (scope.valid_until === null || Date.parse(scope.valid_until) !== draft.scope.validUntil || draft.basis !== payload.basis || draft.scope.policyId !== scope.policy_id || draft.scope.policyVersion !== String(scope.policy_version) || draft.scope.purpose !== scope.purpose || canonicalContractJson(draft.scope.audiences) !== canonicalContractJson(scope.audiences)) return false
  const evidence = payload.evidence as {source: {source_id: string; version: string}; excerpt: string; redaction_status: string}[]
  if (draft.evidence.length !== evidence.length || draft.evidence.some((e, i) => e.sourceId !== evidence[i]?.source.source_id || e.sourceVersion !== evidence[i]?.source.version || e.excerpt !== evidence[i]?.excerpt || e.redacted !== (evidence[i]?.redaction_status === 'redacted'))) return false
  if (draft.domain === 'enterprise_knowledge') return draft.title === payload.title && draft.content === payload.proposed_content && draft.knowledgeKind === payload.kind
  const ratio = payload.aspect_ratio as {width: number; height: number} | null
  return draft.goal === payload.goal && draft.expected === payload.expected && draft.actual === payload.actual && draft.entrypoint === payload.entrypoint
    && draft.content === `目标：${draft.goal}；期望：${draft.expected}；实际：${draft.actual}；入口：${draft.entrypoint}。`
    && canonicalContractJson(draft.versions) === canonicalContractJson(payload.versions) && draft.aspectRatio === (ratio ? `${ratio.width}:${ratio.height}` : '') && canonicalContractJson(draft.pixelSize) === canonicalContractJson(payload.pixel_size)
}

export class CandidateConsentHost {
  private readonly entries = new Map<string, Entry>()
  private disposed = false
  private readonly epochs = new Map<string, number>()
  private readonly epochTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly metadataTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private sequence = 0
  constructor(private readonly options: {provider(): CandidateConsentProvider | undefined; runtime(): NativeCandidateConsentRuntime | undefined; authorize(sessionId: string): Promise<CandidateConsentContext>; now?: () => number}) {}
  private now(): number {return this.options.now?.() ?? Date.now()}
  nativeWindowPolicy(): {platformOrigin: string; handoffOrigin: string} | null {
    try {
      if (this.disposed) return null
      const policy = this.options.provider()?.nativeWindowPolicy()
      if (!policy || !(this.options.provider()?.authoritySignal instanceof AbortSignal) || this.options.provider()?.authoritySignal.aborted) return null
      const platform = new URL(policy.platformOrigin), local = new URL(policy.handoffOrigin)
      if (platform.protocol !== 'https:' || platform.origin !== policy.platformOrigin || local.origin !== policy.handoffOrigin || !['https:', 'http:'].includes(local.protocol)
        || (local.protocol === 'http:' && (local.hostname !== '127.0.0.1' || !local.port))) return null
      return Object.freeze({...policy})
    } catch {return null}
  }
  private async current(sessionId: string): Promise<CandidateConsentContext> {
    if (this.disposed || !label(sessionId) || !this.options.provider() || !this.nativeWindowPolicy()) throw Error('NOT_CONNECTED')
    const c = await this.options.authorize(sessionId)
    if (this.disposed || !(c.signal instanceof AbortSignal) || c.signal.aborted || c.sessionId !== sessionId || !id(c.actorId) || !id(c.tenantId) || !c.taskBinding) throw Error('NOT_CONNECTED')
    return c
  }
  private epoch(sessionId: string): number | null {
    if (this.disposed || !label(sessionId)) return null
    const current = this.epochs.get(sessionId)
    if (current !== undefined) return current
    if (this.epochs.size >= 32) return null
    const epoch = ++this.sequence;this.epochs.set(sessionId, epoch)
    const timer = setTimeout(() => {
      for (const [handle, entry] of this.entries) if (entry.context.sessionId === sessionId) {this.close(entry, 'expired');this.remove(handle)}
      this.epochs.delete(sessionId);this.epochTimers.delete(sessionId)
    }, 300000);timer.unref?.();this.epochTimers.set(sessionId, timer)
    return epoch
  }
  private remove(handle: string): void {const timer = this.metadataTimers.get(handle);if (timer !== undefined) clearTimeout(timer);this.metadataTimers.delete(handle);this.entries.delete(handle)}
  private close(entry: Entry, state: CandidateWindowView['state'], reason: 'cancelled' | 'identity_changed' = 'cancelled'): void {
    entry.run++;entry.state = state; entry.grant = null; entry.stop(); const session = entry.session; entry.session = null
    session?.cancel(reason)
    entry.state = entry.transferred && state !== 'not_connected' ? 'unknown' : state
  }
  async list(sessionId: string): Promise<{status: 'not_connected' | 'ready'; candidates: CandidateWindowOffer[]}> {
    const epoch = this.epoch(sessionId)
    if (epoch === null) return empty()
    try {
      const provider = this.options.provider(), c = await this.current(sessionId)
      if (!provider) throw Error('NOT_CONNECTED')
      const grants = await provider.list(c)
      if (!Array.isArray(grants) || grants.length > 8) throw Error('NOT_CONNECTED')
      const result: CandidateWindowOffer[] = []
      for (const raw of grants) {
        try {
          const signal = raw.signal, draft = decodeCandidateDraft(raw.draft), prepare = validateContractSchema('PrepareDesktop', structuredClone(raw.prepare))
          const payloadJson = raw.payloadJson, handle = raw.handle
          if (!id(handle) || raw.sessionId !== c.sessionId || raw.taskBinding !== c.taskBinding || !(signal instanceof AbortSignal) || signal.aborted || draft.owner.actorId !== c.actorId || draft.owner.tenantId !== c.tenantId) continue
          const payload = parseContractJson(payloadJson)
          if (canonicalContractJson(payload) !== payloadJson || new TextEncoder().encode(payloadJson).length > 60000 || prepare.manifest.domain !== draft.domain) continue
          validateWebHandoffCompatibility(prepare.manifest.domain, payload)
          await verifyPayloadMetadata(prepare.manifest, payload)
          if (!matchesPreview(draft, prepare, payload)) continue
          const server = decodeDesktopPublicResponse(structuredClone(raw.server), {request_id: prepare.request_id, domain: prepare.manifest.domain, payload_hash: prepare.manifest.payload_hash})
          const expiresAt = Math.min(Date.parse(server.expires_at), draft.scope.validUntil)
          if (server.status !== 'pending' || expiresAt <= this.now() || expiresAt > this.now() + 300000) continue
          const offer = Object.freeze({handle, candidateId: draft.requestId, previewHash: await candidateHash(draft), expiresAt})
          const bindingHash = await hashContractJson({prepare, server})
          const fresh = await this.current(sessionId)
          if (!same(c, fresh) || signal.aborted || this.options.provider() !== provider || epoch !== (this.epochs.get(sessionId) ?? 0)) throw Error('NOT_CONNECTED')
          const previous = this.entries.get(handle)
          if (previous) {
            if (!same(previous.context, c) || previous.authoritySignal !== provider.authoritySignal || previous.grantSignal !== signal || previous.bindingHash !== bindingHash || previous.offer.previewHash !== offer.previewHash || previous.offer.candidateId !== offer.candidateId) {this.close(previous, 'not_connected');continue}
            // Retain only the original window's metadata while Web review is active.
            // Its consumed plaintext grant remains null and can never be restaged.
            if (previous.grant || (previous.transferred && previous.session && ['transferred', 'awaiting_web'].includes(previous.state))) result.push(previous.offer)
            continue
          }
          if (this.entries.size >= 64) continue
          const entry: Entry = {context: c, authoritySignal: provider.authoritySignal, grantSignal: signal, bindingHash, grant: {...raw, draft, prepare, server, payloadJson, signal}, offer, session: null, state: 'ready', transferred: false, attempted: false, run: 0, stop: () => {}}
          const aborted = () => this.close(entry, 'not_connected', 'identity_changed')
          const timer = setTimeout(() => {this.close(entry, 'expired');this.remove(handle)}, Math.max(1, expiresAt - this.now())); timer.unref?.();this.metadataTimers.set(handle, timer)
          c.signal.addEventListener('abort', aborted, {once: true}); signal.addEventListener('abort', aborted, {once: true});entry.authoritySignal.addEventListener('abort', aborted, {once: true})
          entry.stop = () => {c.signal.removeEventListener('abort', aborted);signal.removeEventListener('abort', aborted);entry.authoritySignal.removeEventListener('abort', aborted)}
          this.entries.set(handle, entry);result.push(offer)
        } catch { /* Invalid provider records never enter the UI or native adapter. */ }
      }
      if (!same(c, await this.current(sessionId)) || this.options.provider() !== provider || epoch !== (this.epochs.get(sessionId) ?? 0)) throw Error('NOT_CONNECTED')
      const selected = new Set(result.map(offer => offer.handle))
      for (const entry of this.entries.values()) if (entry.context.sessionId === sessionId && !selected.has(entry.offer.handle)) this.close(entry, 'cancelled')
      return {status: result.length ? 'ready' : 'not_connected', candidates: result}
    } catch {for (const entry of this.entries.values()) if (entry.context.sessionId === sessionId) this.close(entry, 'not_connected');return empty()}
  }
  private async entry(sessionId: string, handle: string): Promise<Entry | null> {
    if (!id(handle)) return null
    const entry = this.entries.get(handle)
    if (!entry) return null
    try {
      const c = await this.current(sessionId)
      if (!same(entry.context, c) || this.options.provider()?.authoritySignal !== entry.authoritySignal || entry.authoritySignal.aborted) {this.close(entry, 'not_connected', 'identity_changed');return null}
      if (entry.offer.expiresAt <= this.now()) {this.close(entry, 'expired');this.remove(handle)}
      return entry
    } catch {this.close(entry, 'not_connected', 'identity_changed');return null}
  }
  async open(sessionId: string, handle: string): Promise<CandidateWindowView> {
    const entry = await this.entry(sessionId, handle)
    if (!entry) return view(handle, 'not_connected')
    if (entry.attempted) return this.status(sessionId, handle)
    const grant = entry.grant, policy = this.nativeWindowPolicy(), runtime = this.options.runtime()
    if (!grant || !policy || !runtime?.openCandidateConsent) {this.close(entry, 'not_connected');return view(handle, entry.state)}
    entry.attempted = true;entry.state = 'opening'
    try {
      const run = ++entry.run
      const changed = (state: NativeCandidateConsentState) => {
        if (run !== entry.run || this.disposed) return
        if (state === 'transferred') entry.transferred = true
        entry.state = entry.transferred && !['transferred', 'awaiting_web'].includes(state) ? 'unknown' : state
        if (['transferred', 'cancelled', 'expired', 'closed', 'not_connected'].includes(state)) {entry.grant = null; if (state !== 'transferred') {entry.stop();entry.run++;entry.session = null}}
      }
      const expiresAt = Date.parse(grant.server.expires_at) <= entry.offer.expiresAt ? grant.server.expires_at : grant.prepare.manifest.scope.valid_until!
      const session = runtime.openCandidateConsent({requestId: grant.server.request_id, targetHash: grant.server.target_hash, actorId: entry.context.actorId, tenantId: entry.context.tenantId, expiresAt, payloadJson: grant.payloadJson, ...policy, signal: AbortSignal.any([entry.context.signal, grant.signal, entry.authoritySignal])}, changed)
      if (run === entry.run) {entry.session = session;if (!session) this.close(entry, 'not_connected')}
      else session?.cancel()
      return view(handle, entry.state)
    } catch {this.close(entry, 'not_connected');return view(handle, entry.state)}
  }
  async status(sessionId: string, handle: string): Promise<CandidateWindowView> {
    const entry = await this.entry(sessionId, handle)
    if (!entry) return view(handle, 'not_connected')
    if (entry.session) {
      const state = entry.session.state()
      if (state === 'transferred') {entry.transferred = true;entry.grant = null}
      entry.state = entry.transferred && !['transferred', 'awaiting_web'].includes(state) ? 'unknown' : state
    }
    return view(handle, entry.state)
  }
  async cancel(sessionId: string, handle: string): Promise<CandidateWindowView> {
    // A known opaque handle can revoke only its existing profile-local window.
    // No renewal, new grant or content access is permitted by this cleanup path.
    const entry = label(sessionId) && id(handle) ? this.entries.get(handle) : undefined
    if (!entry || entry.context.sessionId !== sessionId) return view(handle, 'not_connected')
    this.close(entry, 'cancelled');return view(handle, entry.state)
  }
  async clear(sessionId: string): Promise<{status: 'not_connected'; candidates: CandidateWindowOffer[]}> {
    // Revoking this profile-local view grants nothing and must not wait for renewal.
    if (this.epoch(sessionId) !== null) {this.epochs.set(sessionId, ++this.sequence);for (const entry of this.entries.values()) if (entry.context.sessionId === sessionId) this.close(entry, 'cancelled')}
    return empty()
  }
  dispose(): void {this.disposed = true;for (const entry of this.entries.values()) this.close(entry, 'not_connected', 'identity_changed');this.entries.clear();for (const timer of this.metadataTimers.values()) clearTimeout(timer);this.metadataTimers.clear();for (const timer of this.epochTimers.values()) clearTimeout(timer);this.epochTimers.clear();this.epochs.clear()}
}

/** Same-origin metadata route; no arbitrary URL, principal, payload or provider registration. */
export function mountCandidateConsent(ctx: Context, options: {authorize(sessionId: string): Promise<CandidateConsentContext>}): CandidateConsentHost {
  const service = new CandidateConsentHost({provider: () => ctx.get('futurestaffGovernanceCandidateProvider') as CandidateConsentProvider | undefined, runtime: () => ctx.get('desktopRuntime') as NativeCandidateConsentRuntime | undefined, authorize: options.authorize})
  ctx.provide('platformCandidateConsent', service)
  ctx.effect(() => () => service.dispose(), 'futurestaff candidate consent lifecycle')
  ctx.effect(() => ctx.webServer.register({kind: 'exact', path: '/_futurestaff/governance/candidate-window', handler: async (request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, value: unknown) => {response.statusCode = status;response.setHeader('content-type', 'application/json; charset=utf-8');response.setHeader('cache-control', 'no-store');response.setHeader('x-content-type-options', 'nosniff');response.end(JSON.stringify(value))}
    const origin = `http://127.0.0.1:${ctx.webServer.port}`
    const access = ctx.get('desktopBrowserAccess') as {rendererHeader?: {name?: unknown; value?: unknown}} | undefined
    const expected = access?.rendererHeader?.value, actual = request.headers['x-dsh-desktop-renderer']
    const renderer = access?.rendererHeader?.name === 'x-dsh-desktop-renderer' && typeof expected === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(expected) && typeof actual === 'string' && actual.length === expected.length && /^[A-Za-z0-9_-]{43}$/u.test(actual) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    if (!renderer || request.method !== 'POST' || request.headers['x-futurestaff-candidate-window'] !== '1' || request.headers.origin !== origin || request.headers.host !== new URL(origin).host || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) return send(403, {error: 'CANDIDATE_WINDOW_UNAVAILABLE'})
    try {
      let text = '', bytes = 0
      for await (const raw of request) {const chunk = Buffer.from(raw);bytes += chunk.length;if (bytes > 2048) throw Error('INVALID');text += chunk.toString('utf8')}
      const body = parseContractJson(text) as Record<string, unknown>
      if (!body || Array.isArray(body) || typeof body !== 'object' || !label(body.sessionId)) throw Error('INVALID')
      const keys = Object.keys(body).sort().join(',')
      if (['list', 'clear'].includes(String(body.action)) && keys === 'action,sessionId') return send(200, await service[body.action as 'list' | 'clear'](body.sessionId))
      if (!['open', 'status', 'cancel'].includes(String(body.action)) || keys !== 'action,handle,sessionId' || !id(body.handle)) throw Error('INVALID')
      return send(200, await service[body.action as 'open' | 'status' | 'cancel'](body.sessionId, body.handle))
    } catch {send(422, {error: 'CANDIDATE_WINDOW_UNAVAILABLE'})}
  }}), 'futurestaff candidate consent metadata route')
  return service
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    platformCandidateConsent: CandidateConsentHost
    futurestaffGovernanceCandidateProvider: CandidateConsentProvider
  }
}
