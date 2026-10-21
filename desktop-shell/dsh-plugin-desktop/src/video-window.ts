import { BrowserWindow } from 'electron'
import type { NativeImage, Session } from 'electron'

/** Only Host-issued video capabilities on this generation's loopback carrier. */
export function localVideoPreviewUrl(root: string, requested: string): string | undefined {
  try {
    const carrier = new URL(root), target = new URL(requested)
    if (carrier.protocol !== 'http:' || carrier.hostname !== '127.0.0.1' || !carrier.port
      || target.origin !== carrier.origin || target.username || target.password || target.hash || target.search
      || !/^\/_futurestaff\/video\/(?:asset|preview)\/[a-f0-9]{48}$/.test(target.pathname)
      || target.href !== requested) return undefined
    target.pathname = target.pathname.replace('/video/asset/', '/video/preview/')
    return target.href
  } catch { return undefined }
}

/** Keep private playback inside the authenticated native session. */
export class DesktopVideoWindow {
  private readonly windows = new Map<string, BrowserWindow>()
  constructor(private readonly root: string, private readonly session: Session, private readonly icon: NativeImage,
    private readonly rendererIds: Set<number>, private readonly logError: (message: string) => void) {}

  open(requested: string): boolean {
    const url = localVideoPreviewUrl(this.root, requested)
    if (!url) return false
    const existing = this.windows.get(url)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.show(); existing.focus(); return true
    }
    const window = new BrowserWindow({
      title: '视频预览 · FutureStaff', width: 560, height: 860, minWidth: 360, minHeight: 420,
      show: false, icon: this.icon,
      webPreferences: { session: this.session, contextIsolation: true, nodeIntegration: false,
        sandbox: true, webSecurity: true },
    })
    this.windows.set(url, window)
    const id = window.webContents.id
    this.rendererIds.add(id)
    window.removeMenu()
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-attach-webview', event => event.preventDefault())
    const navigate = (event: Electron.Event, target: string) => {
      if (target !== url) event.preventDefault()
    }
    window.webContents.on('will-navigate', navigate)
    window.webContents.on('will-frame-navigate', event => { if (event.isMainFrame) navigate(event, event.url); else event.preventDefault() })
    window.webContents.on('will-redirect', navigate)
    window.once('ready-to-show', () => { if (!window.isDestroyed()) { window.show(); window.focus() } })
    const forget = () => {
      this.rendererIds.delete(id)
      if (this.windows.get(url) === window) this.windows.delete(url)
    }
    window.once('closed', forget)
    void window.loadURL(url).catch((cause: unknown) => {
      const code = cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
        && /^ERR_[A-Z_]+$/.test(cause.code) ? cause.code : 'unknown'
      this.logError('dsh-plugin-desktop: private video preview failed to load (' + code + ')')
      forget()
      if (!window.isDestroyed()) window.destroy()
    })
    return true
  }

  close(): void {
    for (const window of this.windows.values()) {
      this.rendererIds.delete(window.webContents.id)
      if (!window.isDestroyed()) window.destroy()
    }
    this.windows.clear()
  }
}
