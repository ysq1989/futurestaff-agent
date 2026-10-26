import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BrowserWindow access deliberately throws after destruction, as Electron does.
const native = vi.hoisted(() => {
  const windows: any[] = [], sessions: any[] = []
  const faults: {child?: (contents: any) => void; throwChild: boolean; throwChildGetter: boolean} = {throwChild: false, throwChildGetter: false}
  class Window {
    destroyed = false
    callbacks = new Map<string, ((...args: any[]) => void)[]>()
    readonly contents: any
    rejectLoad: (reason: Error) => void = () => {}
    constructor(readonly options: any) {
      if (windows.length && faults.throwChild) throw Error('synthetic native construction failure')
      const listeners: Record<string, ((...args: any[]) => void)[]> = {}
      this.contents = {id: windows.length + 1, mainFrame: {}, url: '', session: options.webPreferences?.session,
        isDestroyed: () => this.destroyed,
        on: (name: string, fn: (...args: any[]) => void) => { (listeners[name] ??= []).push(fn) },
        once: (name: string, fn: (...args: any[]) => void) => { (listeners[name] ??= []).push(fn) },
        callbacks: listeners, setWindowOpenHandler: vi.fn(), getURL: () => this.contents.url,
        getLastWebPreferences: () => ({ ...options.webPreferences })}
      if (windows.length) faults.child?.(this.contents)
      windows.push(this)
    }
    get webContents() {
      if (this.destroyed) throw Error('Object has been destroyed')
      if (this !== windows[0] && faults.throwChildGetter) throw Error('synthetic native contents failure')
      return this.contents
    }
    isDestroyed() { return this.destroyed }
    removeMenu() {}
    show = vi.fn()
    focus = vi.fn()
    loadURL(url: string) { this.contents.url = url; return new Promise<void>((_resolve, reject) => { this.rejectLoad = reject }) }
    once(name: string, fn: (...args: any[]) => void) { const list = this.callbacks.get(name) ?? []; list.push(fn); this.callbacks.set(name, list) }
    emit(name: string, ...args: any[]) { for (const fn of this.callbacks.get(name) ?? []) fn(...args) }
    emitContents(name: string, ...args: any[]) { for (const fn of this.contents.callbacks[name] ?? []) fn(...args) }
    destroy() { if (this.destroyed) return; this.destroyed = true; this.emit('closed') }
  }
  const session = {fromPartition: vi.fn((_partition: string, _options: unknown) => {
    const value: any = {setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), on: vi.fn(),
      getPreloadScripts: () => [], getStoragePath: () => null, clearStorageData: vi.fn(async () => {}),
      protocol: {handle: vi.fn(), unhandle: vi.fn()}, webRequest: {onBeforeRequest: (fn: unknown) => { value.handler = fn }}}
    sessions.push(value); return value
  })}
  return {windows, sessions, Window, session, faults}
})
vi.mock('electron', () => ({BrowserWindow: native.Window, session: native.session}))
import { DesktopConsentWindowController } from '../src/desktop-consent-window.ts'

const localOrigin = 'http://127.0.0.1:43120', platformOrigin = 'https://platform.invalid'
const requestId = '00000000-0000-4000-8000-000000000001'
const openerUrl = `${localOrigin}/__futurestaff/desktop-consent/${requestId}`
const confirmationUrl = `${platformOrigin}/module/governance/desktop-consent/${requestId}`
const policy = {platformOrigin, handoffOrigin: localOrigin}
function open(expiresIn = 15000) {
  const controller = new DesktopConsentWindowController(localOrigin), signal = new AbortController(), states: string[] = []
  const flow = controller.open({requestId, targetHash: 'a'.repeat(64), actorId: requestId, tenantId: requestId,
    expiresAt: new Date(Date.now() + expiresIn).toISOString(), payloadJson: '{"goal":"synthetic"}',
    platformOrigin, handoffOrigin: localOrigin, signal: signal.signal}, policy, state => states.push(state))!
  expect(flow).not.toBeNull()
  return {controller, signal, flow, states, opener: native.windows[0]!, session: native.sessions[0]!}
}
function popupResponse(opener: any) {
  return opener.contents.setWindowOpenHandler.mock.calls[0]![0]({url: confirmationUrl, frameName: `futurestaff-consent-${requestId}`})
}
function createConfirmation(opener: any) {
  const response = popupResponse(opener)
  expect(response.action).toBe('allow')
  expect(response.createWindow).toBeTypeOf('function')
  expect(response.overrideBrowserWindowOptions?.webPreferences).toMatchObject({
    contextIsolation: true, sandbox: true, webSecurity: true, nodeIntegration: false,
    nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, webviewTag: false,
  })
  const contents = response.createWindow({webPreferences: {preload: 'untrusted-preload.cjs', nodeIntegration: true, sandbox: false}})
  const window = native.windows[1]!
  expect(contents).toBe(window.contents)
  return window
}

describe('dedicated native window disposal', () => {
  beforeEach(() => {native.windows.length = 0; native.sessions.length = 0; delete native.faults.child; native.faults.throwChild = false; native.faults.throwChildGetter = false; native.session.fromPartition.mockClear(); vi.useFakeTimers()})
  afterEach(() => {vi.clearAllTimers(); vi.useRealTimers()})
  it('denies a queued old request after cancellation without accessing a destroyed BrowserWindow', () => {
    const {flow, session, controller} = open(), queued = session.handler, callback = vi.fn()
    flow.cancel()
    expect(() => queued({webContentsId: 1, resourceType: 'mainFrame', method: 'GET', url: openerUrl}, callback)).not.toThrow()
    expect(callback).toHaveBeenCalledWith({cancel: true})
    expect(native.windows.every(w => w.destroyed)).toBe(true)
    expect(flow.state()).toBe('cancelled')
    controller.dispose()
  })
  it.each(['cancel', 'destroy', 'abort', 'dispose'] as const)('keeps the terminal state after %s despite queued native callbacks', async action => {
    const {controller, signal, flow, states, opener, session} = open(), queued = session.handler
    if (action === 'cancel') flow.cancel()
    else if (action === 'destroy') opener.destroy()
    else if (action === 'abort') signal.abort()
    else controller.dispose()
    const terminal = flow.state(), history = [...states], orphan = new native.Window({webPreferences: {session}})
    expect(() => {
      opener.emit('ready-to-show')
      opener.emitContents('console-message', {get frame() {throw Error('late frame access')}})
      opener.emitContents('did-create-window', orphan, {url: confirmationUrl})
      opener.emitContents('render-process-gone')
      opener.emitContents('did-fail-load')
      queued({webContentsId: opener.contents.id, resourceType: 'mainFrame', method: 'GET', url: openerUrl}, vi.fn())
      opener.rejectLoad(Error('late network rejection'))
    }).not.toThrow()
    await Promise.resolve(); await Promise.resolve()
    expect(opener.show).not.toHaveBeenCalled()
    expect(flow.state()).toBe(terminal)
    expect(states).toEqual(history)
    expect(orphan.destroyed).toBe(true)
  })
  it('creates confirmation with this request Session and no inherited privilege before its first request', () => {
    const {flow, opener, session} = open(), child = createConfirmation(opener)
    expect(native.session.fromPartition.mock.calls[0]![0]).not.toMatch(/^persist:/u)
    expect(opener.options.webPreferences.session).toBe(session)
    expect(child.contents.session).toBe(session)
    expect(child.contents.getLastWebPreferences()).toMatchObject({session, contextIsolation: true, sandbox: true, webSecurity: true,
      nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, webviewTag: false})
    expect(child.contents.getLastWebPreferences().preload ?? '').toBe('')
    const allowed = vi.fn()
    session.handler({webContentsId: child.contents.id, resourceType: 'mainFrame', method: 'GET', url: confirmationUrl}, allowed)
    expect(allowed).toHaveBeenCalledWith({cancel: false})
    expect(flow.state()).toBe('awaiting_web')
    expect(child.contents.setWindowOpenHandler.mock.calls[0]![0]({url: confirmationUrl}).action).toBe('deny')
    flow.cancel()
    expect(child.destroyed).toBe(true)
  })
  it('retains the real Session object check and closes when confirmation uses a different Session', () => {
    const {opener, session, flow, states} = open(), response = popupResponse(opener)
    native.faults.child = contents => {contents.session = {}}
    response.createWindow({})
    const child = native.windows[1]!
    expect(flow.state()).toBe('not_connected')
    expect(child.destroyed).toBe(true)
    expect(session.clearStorageData).toHaveBeenCalled()
    expect(states).not.toContain('awaiting_web')
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each([
    ['preload', 'injected.cjs'], ['nodeIntegration', true], ['contextIsolation', false], ['sandbox', false],
    ['webSecurity', false], ['nodeIntegrationInSubFrames', true], ['nodeIntegrationInWorker', true],
    ['nodeIntegrationInWorker', null], ['nodeIntegrationInWorker', 'false'], ['nodeIntegrationInWorker', 0], ['webviewTag', true],
  ])('rejects actual native %s mismatch even when construction options requested isolation', (key, value) => {
    const {opener, flow, states, session} = open(), response = popupResponse(opener)
    native.faults.child = contents => {
      const requested = contents.getLastWebPreferences()
      contents.getLastWebPreferences = () => ({...requested, [key as string]: value})
    }
    expect(() => response.createWindow({})).not.toThrow()
    expect(flow.state()).toBe('not_connected')
    expect(states).not.toContain('awaiting_web')
    expect(native.windows.every(w => w.destroyed)).toBe(true)
    expect(session.clearStorageData).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('accepts Electron inspection that omits worker preference while forcing isolation before guest creation', () => {
    const {opener, flow, session} = open(), response = popupResponse(opener)
    native.faults.child = contents => {
      const snapshot = {...contents.getLastWebPreferences()}
      delete snapshot.nodeIntegrationInWorker
      contents.getLastWebPreferences = () => snapshot
    }
    expect(() => response.createWindow({webPreferences: {nodeIntegrationInWorker: true, preload: 'untrusted-preload.cjs'}})).not.toThrow()
    expect(flow.state()).toBe('awaiting_web')
    expect(response.overrideBrowserWindowOptions?.webPreferences).toMatchObject({sandbox: true, nodeIntegrationInWorker: false})
    expect(native.windows[1]!.contents.session).toBe(session)
    expect(native.windows[1]!.options.webPreferences.nodeIntegrationInWorker).toBe(false)
    expect(native.windows[1]!.options.webPreferences.preload).toBeUndefined()
    flow.cancel()
    expect(native.windows.every(w => w.destroyed)).toBe(true)
  })
  it.each(['missing', 'null'] as const)('rejects actual native preferences inspection that is %s', kind => {
    const {opener, flow, states, session} = open(), response = popupResponse(opener)
    native.faults.child = contents => {contents.getLastWebPreferences = kind === 'missing' ? undefined : () => null}
    expect(() => response.createWindow({})).not.toThrow()
    expect(flow.state()).toBe('not_connected')
    expect(states).not.toContain('awaiting_web')
    expect(native.windows.every(w => w.destroyed)).toBe(true)
    expect(session.clearStorageData).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['preloads', 'persistent'] as const)('rejects a Session whose actual %s boundary changed before popup construction', kind => {
    const {opener, flow, states, session} = open(), response = popupResponse(opener)
    if (kind === 'preloads') session.getPreloadScripts = () => ['injected.cjs']
    else session.getStoragePath = () => 'synthetic-persistent-session'
    expect(() => response.createWindow({})).not.toThrow()
    expect(flow.state()).toBe('not_connected')
    expect(states).not.toContain('awaiting_web')
    expect(native.windows.every(w => w.destroyed)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['construction', 'contents'] as const)('finishes and releases the opener when native confirmation %s throws', kind => {
    const {opener, flow, states, session} = open(), response = popupResponse(opener)
    const queued = session.handler
    const guest = {destroyed: false, closeOptions: undefined as unknown, isDestroyed() {return this.destroyed},
      close(options: unknown) {this.closeOptions = options; this.destroyed = true}}
    if (kind === 'construction') native.faults.throwChild = true
    else native.faults.throwChildGetter = true
    let returned: unknown
    expect(() => {returned = response.createWindow({webContents: guest})}).not.toThrow()
    expect(returned).toBe(guest)
    expect(guest.destroyed).toBe(true)
    expect(guest.closeOptions).toEqual({waitForBeforeUnload: false})
    expect(flow.state()).toBe('not_connected')
    expect(states).not.toContain('awaiting_web')
    expect(opener.destroyed).toBe(true)
    expect(native.windows.every(w => w.destroyed)).toBe(true)
    expect(session.clearStorageData).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    const history = [...states], callback = vi.fn()
    opener.emit('ready-to-show')
    opener.emitContents('console-message', {get frame() {throw Error('late frame access')}})
    queued({webContentsId: opener.contents.id, resourceType: 'mainFrame', method: 'GET', url: openerUrl}, callback)
    expect(callback).toHaveBeenCalledWith({cancel: true})
    expect(states).toEqual(history)
  })
  it.each([['will-navigate', 'https://untrusted.invalid/'], ['will-redirect', 'https://untrusted.invalid/'],
    ['did-navigate-in-page', `${openerUrl}#changed`]])('closes on %s and refuses subsequent transfer notification', (event, url) => {
    const {opener, flow, states} = open()
    opener.emitContents(event!, {preventDefault: vi.fn()}, url)
    expect(flow.state()).toBe('not_connected')
    const history = [...states]
    opener.emitContents('console-message', {frame: opener.contents.mainFrame, message: 'futurestaff-consent-state:transferred'})
    expect(states).toEqual(history)
    expect(opener.destroyed).toBe(true)
  })
  it('closes on a renderer crash and ignores a later load rejection', async () => {
    const {opener, flow, states} = open()
    opener.emitContents('render-process-gone')
    const history = [...states]
    opener.rejectLoad(Error('navigation interrupted by crash'))
    await Promise.resolve(); await Promise.resolve()
    expect(flow.state()).toBe('not_connected')
    expect(states).toEqual(history)
    expect(opener.destroyed).toBe(true)
  })
  it('expires unfinished transfer and cannot be revived by later native events', () => {
    const {opener, flow, states} = open()
    vi.advanceTimersByTime(15000)
    expect(flow.state()).toBe('expired')
    const history = [...states]
    opener.emit('ready-to-show')
    opener.emitContents('console-message', {frame: opener.contents.mainFrame, message: 'futurestaff-consent-state:transferred'})
    expect(states).toEqual(history)
    expect(opener.destroyed).toBe(true)
  })
  it('keeps manual confirmation open beyond handoff timeout after transfer, within request deadline', () => {
    const {opener, flow} = open(120000)
    createConfirmation(opener)
    opener.emitContents('console-message', {frame: opener.contents.mainFrame, message: 'futurestaff-consent-state:transferred'})
    vi.advanceTimersByTime(60001)
    expect(flow.state()).toBe('transferred')
    expect(opener.destroyed).toBe(false)
    vi.advanceTimersByTime(59999)
    expect(flow.state()).toBe('expired')
    expect(native.windows.every(w => w.destroyed)).toBe(true)
  })
})
