/** Metadata-only local UI boundary. None of these values grants Platform authority. */
export type CandidateWindowState = 'not_connected' | 'ready' | 'opening' | 'awaiting_web' | 'transferred' | 'cancelled' | 'expired' | 'closed' | 'unknown'
export interface CandidateWindowOffer {readonly handle: string; readonly candidateId: string; readonly previewHash: string; readonly expiresAt: number}
export interface CandidateWindowView {readonly handle: string; readonly state: CandidateWindowState; readonly queryConnected: false}
export interface CandidateWindowSnapshot {readonly status: 'not_connected' | 'ready'; readonly candidates: readonly CandidateWindowOffer[]; readonly active: CandidateWindowView | null}
export interface NativeCandidateConsentRequest {requestId: string; targetHash: string; actorId: string; tenantId: string; expiresAt: string; payloadJson: string; platformOrigin: string; handoffOrigin: string; signal: AbortSignal}
export type NativeCandidateConsentState = Exclude<CandidateWindowState, 'ready' | 'unknown'>
export interface NativeCandidateConsentSession {state(): NativeCandidateConsentState; cancel(reason?: 'cancelled' | 'identity_changed'): void}
export interface NativeCandidateConsentRuntime {openCandidateConsent?(request: NativeCandidateConsentRequest, onState?: (state: NativeCandidateConsentState) => void): NativeCandidateConsentSession | null}
