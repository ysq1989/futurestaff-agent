import type {Conversation} from './api.js'

export interface SendAttempt {
  requestId: string
  text: string
  attachmentIds: string[]
  draft: string
}

export interface SeenSession {updatedAt?: number; responseOrder: number}

export function conversationKey(systemId: string, id: string): string {return JSON.stringify([systemId, id])}

export function isCurrentConversation(value: {id: string; systemId?: string}, systemId: string, id: string): boolean {
  return !!systemId && value.systemId === systemId && value.id === id
}

function timestamp(value: Conversation['updatedAt']): number | undefined {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(result) && result >= 0 ? result : undefined
}

/** Timestamps order server state; request order resolves equal timestamp races. */
export function acceptSessionVersion(seen: Map<string, SeenSession>, value: Pick<Conversation, 'id' | 'updatedAt'>, responseOrder: number): boolean {
  const key = 'systemId' in value && typeof value.systemId === 'string' ? conversationKey(value.systemId, value.id) : value.id
  const updatedAt = timestamp(value.updatedAt), previous = seen.get(key)
  if (previous) {
    if (previous.updatedAt !== undefined && (updatedAt === undefined || updatedAt < previous.updatedAt)) return false
    if (updatedAt === previous.updatedAt && responseOrder < previous.responseOrder) return false
  }
  seen.set(key, {...(updatedAt === undefined ? {} : {updatedAt}), responseOrder})
  return true
}

/** Only the server's user-message identity acknowledges a submitted request. */
export function reconcileSend(value: Conversation, attempt: SendAttempt | undefined, draft: string, attachmentIds: readonly string[]) {
  const confirmed = !!attempt && value.messages.some(message => message.role === 'user' && message.id === attempt.requestId)
  return {
    confirmed,
    clearComposer: confirmed && draft === attempt.draft && attachmentIds.length === attempt.attachmentIds.length &&
      attachmentIds.every((id, index) => id === attempt.attachmentIds[index]),
  }
}

/** A foreground or network return reads current state; it never resends input. */
export function subscribeSessionResume(browser: EventTarget, page: EventTarget & {readonly visibilityState: string}, isOnline: () => boolean, refresh: () => void): () => void {
  const resume = () => {if (isOnline() && page.visibilityState !== 'hidden') refresh()}
  browser.addEventListener('online', resume)
  browser.addEventListener('pageshow', resume)
  page.addEventListener('visibilitychange', resume)
  return () => {
    browser.removeEventListener('online', resume)
    browser.removeEventListener('pageshow', resume)
    page.removeEventListener('visibilitychange', resume)
  }
}
