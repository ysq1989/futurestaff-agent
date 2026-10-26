import type {CandidateWindowOffer, CandidateWindowSnapshot, CandidateWindowState, CandidateWindowView} from './governance-desktop-window-contract.js'
const initial = (): CandidateWindowSnapshot => Object.freeze({status: 'not_connected', candidates: [], active: null})
const states: CandidateWindowState[] = ['not_connected', 'ready', 'opening', 'awaiting_web', 'transferred', 'cancelled', 'expired', 'closed', 'unknown']
const id = (x: unknown): x is string => typeof x === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(x)
function object(x: unknown): Record<string, unknown> {if (!x || typeof x !== 'object' || Array.isArray(x)) throw Error('INVALID');return x as Record<string, unknown>}
function fields(x: Record<string, unknown>, names: string): void {if (Object.keys(x).sort().join(',') !== names.split(',').sort().join(',')) throw Error('INVALID')}
/** Only the local metadata route is called. No candidate text or identity claims are sent. */
export class CandidateConsentClient {
  private snapshot: CandidateWindowSnapshot = initial()
  private readonly listeners = new Set<() => void>()
  private generation = 0
  private pending = false
  private touched = false
  private disposed = false
  private readonly requests = new Set<AbortController>()
  constructor(private readonly sessionId: string, private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) {}
  getSnapshot = (): CandidateWindowSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {this.listeners.add(listener);return () => this.listeners.delete(listener)}
  private update(value: CandidateWindowSnapshot): void {this.snapshot = Object.freeze(value);for (const l of this.listeners) l()}
  private async request(action: 'list' | 'open' | 'status' | 'cancel' | 'clear', handle?: string): Promise<unknown> {
    const controller = new AbortController();this.requests.add(controller)
    try {
      const response = await this.fetcher('/_futurestaff/governance/candidate-window', {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json', 'x-futurestaff-candidate-window': '1'}, body: JSON.stringify({action, sessionId: this.sessionId, ...(handle ? {handle} : {})}), signal: controller.signal})
      if (!response.ok || !/^application\/json(?:\s*;.*)?$/iu.test(response.headers.get('content-type') ?? '')) throw Error('UNAVAILABLE')
      const text = await response.text();if (new TextEncoder().encode(text).length > 4096) throw Error('INVALID')
      return JSON.parse(text) as unknown
    } finally {this.requests.delete(controller)}
  }
  async list(): Promise<void> {
    if (this.disposed || this.pending) return
    const epoch = this.generation;this.pending = true;this.touched = true
    try {
      const raw = object(await this.request('list'));fields(raw, 'status,candidates')
      if (!['not_connected', 'ready'].includes(String(raw.status)) || !Array.isArray(raw.candidates) || raw.candidates.length > 8) throw Error('INVALID')
      const offers = raw.candidates.map(item => {
        const v = object(item);fields(v, 'handle,candidateId,previewHash,expiresAt')
        if (!id(v.handle) || !id(v.candidateId) || typeof v.previewHash !== 'string' || !/^[a-f0-9]{64}$/u.test(v.previewHash) || !Number.isSafeInteger(v.expiresAt) || Number(v.expiresAt) <= Date.now()) throw Error('INVALID')
        return Object.freeze({...v}) as unknown as CandidateWindowOffer
      })
      if (new Set(offers.map(v => v.handle)).size !== offers.length || (raw.status === 'ready') !== Boolean(offers.length)) throw Error('INVALID')
      if (epoch === this.generation && !this.disposed) this.update({status: raw.status as 'ready' | 'not_connected', candidates: offers, active: this.snapshot.active})
    } catch {if (epoch === this.generation && !this.disposed) this.update(initial())}
    finally {if (epoch === this.generation) this.pending = false}
  }
  async act(action: 'open' | 'status' | 'cancel', handle: string): Promise<void> {
    if (this.disposed || (this.pending && action !== 'cancel') || !id(handle)) return
    const offer = this.snapshot.candidates.find(v => v.handle === handle)
    if (!offer && this.snapshot.active?.handle !== handle) return
    if (action === 'cancel') {
      this.generation++;for (const request of this.requests) request.abort();this.requests.clear();this.pending = false
      this.update({...this.snapshot, active: {handle, state: ['transferred', 'unknown'].includes(this.snapshot.active?.state ?? '') ? 'unknown' : 'cancelled', queryConnected: false}})
    }
    // Unknown, transferred and closed results never reopen or obtain a new request.
    if (action === 'open' && this.snapshot.active?.handle === handle) action = 'status'
    const epoch = this.generation;this.pending = true;this.touched = true
    if (action === 'open') this.update({...this.snapshot, active: {handle, state: 'opening', queryConnected: false}})
    try {
      const raw = object(await this.request(action, handle));fields(raw, 'handle,state,queryConnected')
      if (raw.handle !== handle || !states.includes(raw.state as CandidateWindowState) || raw.queryConnected !== false) throw Error('INVALID')
      if (action === 'cancel' && !['cancelled', 'expired', 'closed', 'not_connected', 'unknown'].includes(String(raw.state))) throw Error('INVALID')
      if (epoch === this.generation && !this.disposed) this.update({...this.snapshot, active: Object.freeze({...raw}) as unknown as CandidateWindowView})
    } catch {if (epoch === this.generation && !this.disposed) this.update({...this.snapshot, active: {handle, state: action === 'open' || this.snapshot.active ? 'unknown' : 'not_connected', queryConnected: false}})}
    finally {if (epoch === this.generation) this.pending = false}
  }
  invalidate(): void {
    const touched = this.touched;this.generation++;this.pending = false;this.touched = false
    for (const request of this.requests) request.abort();this.requests.clear();this.update(initial())
    if (touched) void this.request('clear').catch(() => {})
  }
  dispose(): void {this.invalidate();this.disposed = true;this.listeners.clear()}
}
