export interface VoiceCallbacks {final(text: string): void; error(message: string): void; end(): void}
export interface VoiceTransport {start(callbacks: VoiceCallbacks): void; stop(): void; cancel(): void}

/** The microphone belongs to the scope captured at start, including after navigation away and back. */
export class ScopedVoiceCapture {
  private current: {scope: string; transport: VoiceTransport; ticket: object} | undefined
  private readonly options: {scope(): string; final(text: string, scope: string): void; error(message: string): void; state(listening: boolean): void}
  constructor(options: {scope(): string; final(text: string, scope: string): void; error(message: string): void; state(listening: boolean): void}) {this.options = options}

  start(transport: VoiceTransport) {
    this.cancel()
    const scope = this.options.scope()
    if (!scope) return
    const ticket = {}, current = {scope, transport, ticket}
    this.current = current
    const valid = () => this.current?.ticket === ticket && this.options.scope() === scope
    const end = () => {if (valid()) {this.current = undefined; this.options.state(false)}}
    this.options.state(true)
    try {
      transport.start({
        final: text => {if (valid() && text.trim()) this.options.final(text.trim(), scope)},
        error: message => {if (valid()) {end(); this.options.error(message)}},
        end,
      })
    } catch (error) {
      if (valid()) {end(); this.options.error(error instanceof Error ? error.message : '语音识别未开始，请使用文字输入。')}
    }
  }

  stop() {this.current?.transport.stop()}
  cancel() {
    const current = this.current
    if (!current) return
    this.current = undefined
    try {current.transport.cancel()} finally {this.options.state(false)}
  }
}

interface RecognitionResult {isFinal: boolean; [index: number]: {transcript: string}}
interface RecognitionInstance {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((event: {resultIndex: number; results: ArrayLike<RecognitionResult>}) => void) | null
  onerror: ((event: {error: string}) => void) | null
  onend: (() => void) | null
  start(): void; stop(): void; abort(): void
}
type RecognitionConstructor = new () => RecognitionInstance
interface VoiceBrowser extends EventTarget {
  __FS_NATIVE_VOICE__?: {version?: number; onDeviceOnly?: boolean}
  SpeechRecognition?: RecognitionConstructor
  webkitSpeechRecognition?: RecognitionConstructor
  location: {origin: string; assign(url: string): void}
}

export function voiceMode(browser: VoiceBrowser = window): 'native' | 'browser' | undefined {
  if (browser.__FS_NATIVE_VOICE__?.version === 1) return 'native'
  return browser.SpeechRecognition || browser.webkitSpeechRecognition ? 'browser' : undefined
}

export function createVoiceTransport(browser: VoiceBrowser = window): VoiceTransport | undefined {
  const mode = voiceMode(browser)
  if (mode === 'native') {
    const requestId = crypto.randomUUID(), scopeId = crypto.randomUUID()
    let callbacks: VoiceCallbacks | undefined
    const navigate = (action: string) => {
      const target = new URL('/__native/voice', browser.location.origin)
      target.search = new URLSearchParams({action, requestId, scopeId}).toString()
      browser.location.assign(target.href)
    }
    const cleanup = () => {browser.removeEventListener('fs-native-voice', receive); callbacks = undefined}
    const receive = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail
      if (!detail || typeof detail !== 'object') return
      const value = detail as Record<string, unknown>
      if (value.requestId !== requestId || value.scopeId !== scopeId || !callbacks) return
      const active = callbacks
      if (value.status === 'result') {
        cleanup()
        if (typeof value.text === 'string' && value.text.length <= 24000) active.final(value.text)
        else active.error('语音结果不完整，请使用文字输入。')
        active.end()
      } else if (value.status === 'error') {
        cleanup()
        active.error(typeof value.message === 'string' ? value.message.slice(0, 500) : '端侧语音不可用，请使用文字输入。')
      } else if (value.status === 'cancelled') {cleanup(); active.end()}
    }
    return {
      start: value => {callbacks = value; browser.addEventListener('fs-native-voice', receive); try {navigate('start')} catch (error) {cleanup(); throw error}},
      stop: () => {if (callbacks) navigate('stop')},
      cancel: () => {const active = !!callbacks; cleanup(); if (active) navigate('cancel')},
    }
  }
  const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition
  if (!Recognition) return
  const recognizer = new Recognition()
  const completed = new Set<number>()
  recognizer.lang = 'zh-CN'; recognizer.continuous = false; recognizer.interimResults = false
  return {
    start: callbacks => {
      recognizer.onresult = event => {
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index]
          if (result?.isFinal && !completed.has(index)) {completed.add(index); callbacks.final(result[0]?.transcript ?? '')}
        }
      }
      recognizer.onerror = event => callbacks.error(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? '未获得麦克风或语音识别权限，请使用文字输入。' : '语音识别未完成，请重试或使用文字输入。')
      recognizer.onend = () => callbacks.end()
      recognizer.start()
    },
    stop: () => recognizer.stop(),
    cancel: () => {recognizer.onresult = null; recognizer.onerror = null; recognizer.onend = null; recognizer.abort()},
  }
}
