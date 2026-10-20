import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeImage, Session } from 'electron'
const native = vi.hoisted(() => {
  const windows: any[] = [], load = vi.fn(async () => {})
  class BrowserWindow {
    readonly webContents = { id: 200 + windows.length, on: vi.fn(), setWindowOpenHandler: vi.fn() }
    readonly once = vi.fn(); readonly removeMenu = vi.fn(); readonly destroy = vi.fn()
    readonly isDestroyed = vi.fn(() => false); readonly isMinimized = vi.fn(() => false)
    readonly restore = vi.fn(); readonly show = vi.fn(); readonly focus = vi.fn()
    readonly loadURL = load
    constructor(readonly options: unknown) { windows.push(this) }
  }
  return { windows, BrowserWindow, load }
})
vi.mock('electron', () => ({ BrowserWindow: native.BrowserWindow }))
import { DesktopVideoWindow, localVideoPreviewUrl } from '../src/video-window.ts'
const root = 'http://127.0.0.1:43120/?dsh-desktop-generation=fixture'
const url = 'http://127.0.0.1:43120/_futurestaff/video/asset/' + 'ab'.repeat(24)
describe('private native video preview', () => {
  beforeEach(() => { native.windows.length = 0; vi.clearAllMocks() })
  function fixture() {
    const ids = new Set([73]), session = {} as Session
    return { ids, session, manager: new DesktopVideoWindow(root, session, {} as NativeImage, ids, vi.fn()) }
  }
  it('accepts only an exact capability on the active carrier', () => {
    expect(localVideoPreviewUrl(root, url)).toBe(url)
    for (const target of [url.replace('43120', '43121'), url.replace('127.0.0.1', 'localhost'),
      url.replace('http:', 'https:'), url + '?download=1', url + '#x', url + '/',
      url.replace('/video/asset/', '/other/'), url.replace('abab', 'ABAB'),
      url.replace('127.0.0.1', 'user@127.0.0.1'), 'file:///video.mp4', 'javascript:alert(1)']) {
      expect(localVideoPreviewUrl(root, target)).toBeUndefined()
    }
  })
  it('uses the authenticated session and focuses the same result without opening an external browser', () => {
    const { manager, ids, session } = fixture()
    expect(manager.open('https://evil.invalid/')).toBe(false)
    expect(manager.open(url)).toBe(true)
    const window = native.windows[0]!
    expect(window.options).toMatchObject({ webPreferences: { session, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } })
    expect(ids.has(window.webContents.id)).toBe(true)
    expect(window.loadURL).toHaveBeenCalledWith(url)
    window.isMinimized.mockReturnValue(true); manager.open(url)
    expect(native.windows).toHaveLength(1); expect(window.restore).toHaveBeenCalledOnce()
    expect(window.webContents.setWindowOpenHandler.mock.calls[0][0]({ url: 'https://evil.invalid/' })).toEqual({ action: 'deny' })
    manager.close(); expect(ids).toEqual(new Set([73])); expect(window.destroy).toHaveBeenCalledOnce()
  })
  it('blocks redirects and navigation and revokes the renderer on close or failed loading', async () => {
    const { manager, ids } = fixture(); manager.open(url)
    const window = native.windows[0]!
    for (const name of ['will-navigate', 'will-redirect']) {
      const navigate = window.webContents.on.mock.calls.find(([event]: string[]) => event === name)[1]
      const event = { preventDefault: vi.fn() }; navigate(event, 'https://evil.invalid/')
      expect(event.preventDefault).toHaveBeenCalledOnce()
    }
    window.once.mock.calls.find(([event]: string[]) => event === 'closed')[1]()
    expect(ids).toEqual(new Set([73]))
    native.load.mockRejectedValueOnce(Error('fixture failure')); manager.open(url); await Promise.resolve()
    expect(ids).toEqual(new Set([73])); expect(native.windows[1]!.destroy).toHaveBeenCalledOnce()
  })
})
