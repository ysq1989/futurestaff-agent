import { BrowserWindow, session } from 'electron'
import type { Session } from 'electron'
import { randomBytes, randomUUID } from 'node:crypto'
import { consentWindowTarget } from './desktop-consent-window-contract.ts'
import type { NativeConsentWindowPolicy, NativeConsentWindowRequest, NativeConsentWindowSession, NativeConsentWindowState } from './desktop-consent-window-contract.ts'
import { consentWindowDocument } from './desktop-consent-window-document.ts'

/** Only a separately configured Host policy can admit a request. No renderer URL API. */
export class DesktopConsentWindowController {
  private readonly active = new Set<() => void>()
  private disposed = false
  constructor(private readonly localOrigin: string, private readonly hooks: {prepareSession?(value: Session, kind: 'opener' | 'confirmation'): void} = {}) {}
  open(request: NativeConsentWindowRequest, policy: NativeConsentWindowPolicy | undefined, onState: (state: NativeConsentWindowState) => void = () => {}): NativeConsentWindowSession | null {
    if (this.disposed || this.active.size) return null
    const target = consentWindowTarget(request, policy, this.localOrigin)
    if (!target) return null
    const signal = request.signal
    let current: NativeConsentWindowState = 'opening', stopped = false, used = false, child: BrowserWindow | undefined
    const report = (state: NativeConsentWindowState) => { current = state; try { onState(state) } catch {} }
    let emergency: (() => void) | undefined
    try {
    // Native window.open inherits its opener's BrowserContext. Both zero-preload
    // surfaces share only this request's fresh, nonpersistent session, never the
    // main renderer/default/system session or its credentials/access headers.
    const partition = `futurestaff-consent-request-${randomUUID()}`
    const local = session.fromPartition(partition, {cache:false}), remote = local
    const preferences = {contextIsolation:true,sandbox:true,webSecurity:true,nodeIntegration:false,nodeIntegrationInSubFrames:false,nodeIntegrationInWorker:false,webviewTag:false,v8CacheOptions:'none' as const}
    for (const isolated of [local]) {
      isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
      isolated.setPermissionCheckHandler(() => false)
      isolated.on('will-download', event => event.preventDefault())
    }
    this.hooks.prepareSession?.(local, 'opener'); this.hooks.prepareSession?.(remote, 'confirmation')
    if (local.getPreloadScripts().length || local.getStoragePath() !== null) return null
    let document: string | null = consentWindowDocument(target, randomBytes(24).toString('hex'))
    let created: BrowserWindow | undefined
    emergency = () => {
      document = null
      try { local.protocol.unhandle('http') } catch {}
      try { if (created && !created.isDestroyed()) created.destroy() } catch {}
      void local.clearStorageData().catch(() => {})
    }
    local.protocol.handle('http', source => source.url === target.openerUrl && source.method === 'GET' && document !== null
      ? new Response(document, {headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','pragma':'no-cache','x-content-type-options':'nosniff'}})
      : new Response('',{status:403}))
    // Metadata target does not retain the body after constructing the one owned document.
    target.payloadJson = ''
    const opener = new BrowserWindow({title:'本次候选确认',width:640,height:420,show:false,webPreferences:{...preferences,session:local}})
    created = opener
    const openerContents = opener.webContents, openerId = openerContents.id
    let childId: number | undefined
    opener.removeMenu()
    const finish = (state: NativeConsentWindowState) => {
      if (stopped) return
      stopped = true; document = null; clearTimeout(timer); signal.removeEventListener('abort', abort)
      // Keep a deny-all policy on this disposed private session. A previously
      // queued callback must not dereference a now-destroyed native window.
      try { local.webRequest.onBeforeRequest((_details,callback)=>callback({cancel:true})) } catch {}
      try { local.protocol.unhandle('http') } catch {}
      this.active.delete(dispose)
      try { if (child && !child.isDestroyed()) child.destroy() } catch {}
      try { if (!opener.isDestroyed()) opener.destroy() } catch {}
      void local.clearStorageData().catch(() => {})
      report(state)
    }
    const abort = () => finish('cancelled'), dispose = () => finish('closed')
    let timer = setTimeout(()=>finish('expired'),Math.max(0,Math.min(60000,Date.parse(target.expiresAt)-Date.now())))
    emergency = () => finish('not_connected')
    this.active.add(dispose); signal.addEventListener('abort',abort,{once:true})
    const guard = (window: BrowserWindow, expected: string) => {
      const contents = window.webContents
      let loaded = false
      contents.once('did-finish-load',()=>{loaded=true})
      contents.on('will-attach-webview', event=>event.preventDefault())
      const navigate = (event: Electron.Event, url: string) => { if(!loaded&&url===expected)return;event.preventDefault(); if (!stopped) finish(url === expected ? 'closed' : 'not_connected') }
      contents.on('will-navigate',navigate);contents.on('will-redirect',navigate)
      contents.on('will-frame-navigate', event=>{if(event.isMainFrame)navigate(event,event.url);else{event.preventDefault();if(!stopped)finish('not_connected')}})
      contents.on('did-navigate-in-page',(_event,url)=>{if(url!==expected)finish('not_connected')})
      contents.on('did-start-navigation',(_event,url,inPlace,isMainFrame)=>{if(loaded&&isMainFrame&&(!inPlace||url!==expected))finish(url===expected?'closed':'not_connected')})
      contents.on('render-process-gone',()=>finish('not_connected'))
      contents.on('did-fail-load',()=>finish('not_connected'))
      window.once('closed',()=>finish('closed'))
    }
    guard(opener,target.openerUrl)
    remote.webRequest.onBeforeRequest((details,callback)=>{
      if(stopped){callback({cancel:true});return}
      let allowed=details.webContentsId===openerId&&details.resourceType==='mainFrame'&&details.method==='GET'&&details.url===target.openerUrl
      try{if(childId!==undefined&&details.webContentsId===childId)allowed=new URL(details.url).origin===target.platformOrigin}catch{}
      callback({cancel:!allowed})
    })
    openerContents.setWindowOpenHandler(details=>{
      if(stopped||used||signal.aborted||Date.now()>=Date.parse(target.expiresAt)||details.url!==target.confirmationUrl||details.frameName!==`futurestaff-consent-${target.requestId}`)return {action:'deny'}
      used=true
      // Preserve Electron's native popup WebContents/WindowProxy association.
      // Register its identity and guards before Electron starts the first load;
      // did-create-window is intentionally not emitted for this hook.
      return {action:'allow',overrideBrowserWindowOptions:{webPreferences:preferences},createWindow: options=>{
        // Native window.open supplies its existing guest here. Even a failed
        // construction must return that same object to Electron, never a new
        // WebContents or the opener as a fallback.
        const supplied=(options as Electron.BrowserWindowConstructorOptions & {webContents?: Electron.WebContents}).webContents
        let window: BrowserWindow | undefined
        try {
          window = new BrowserWindow({...options,show:false,title:'平台本人确认',width:900,height:780,
            webPreferences:{...preferences,session:remote}})
          const contents = window.webContents
          if(stopped||signal.aborted||child||Date.now()>=Date.parse(target.expiresAt)){window.destroy();finish('not_connected');return contents}
          child=window; childId=contents.id; window.removeMenu(); guard(window,target.confirmationUrl)
          contents.setWindowOpenHandler(()=>({action:'deny'}))
          // Electron exposes this runtime inspection outside its public TS API.
          // An unavailable inspection must keep the handoff closed.
          const inspect=contents as unknown as {getLastWebPreferences?(): Electron.WebPreferences | null}
          const actual=inspect.getLastWebPreferences?.()
          if(!actual||actual.preload||actual.nodeIntegration!==false||actual.contextIsolation!==true||actual.sandbox!==true||actual.webSecurity!==true||actual.nodeIntegrationInSubFrames!==false||(actual.nodeIntegrationInWorker!==undefined&&actual.nodeIntegrationInWorker!==false)||actual.webviewTag!==false||contents.session!==remote||remote.getPreloadScripts().length||remote.getStoragePath()!==null){finish('not_connected');return contents}
          const owned=window
          owned.once('ready-to-show',()=>{if(!stopped&&!owned.isDestroyed()&&!contents.isDestroyed()){try{owned.show();owned.focus()}catch{finish('not_connected')}}})
          report('awaiting_web')
          return contents
        } catch (error) {
          finish('not_connected')
          try{if(window&&!window.isDestroyed())window.destroy()}catch{}
          if(supplied){try{if(!supplied.isDestroyed())supplied.close({waitForBeforeUnload:false})}catch{}return supplied}
          // A missing native guest is an invalid API relationship. There is no
          // safe substitute; the request has already been revoked and cleaned.
          throw error
        }
      }}
    })
    // Any ordinary popup callback is unexpected when the owned createWindow
    // hook is in use, including one queued before cancellation.
    openerContents.on('did-create-window',window=>{
      try {if(!window.isDestroyed())window.destroy()} catch {}
      finish('not_connected')
    })
    openerContents.on('console-message',(details)=>{
      if(stopped||openerContents.isDestroyed()||details.frame!==openerContents.mainFrame||openerContents.getURL()!==target.openerUrl)return
      const message = details.message
      // Finite informational state only. Never treated as server receipt/authority.
      const state=message.startsWith('futurestaff-consent-state:')?message.slice('futurestaff-consent-state:'.length):''
      if(state==='transferred'&&current!=='transferred'){document=null;clearTimeout(timer);timer=setTimeout(()=>finish('expired'),Math.max(0,Date.parse(target.expiresAt)-Date.now()));report('transferred')}
      else if(state==='cancelled'||state==='expired'||state==='closed'||state==='not_connected')finish(state)
    })
    opener.once('ready-to-show',()=>{if(!stopped&&!opener.isDestroyed()&&!openerContents.isDestroyed()){try{opener.show();opener.focus()}catch{finish('not_connected')}}})
    report('opening')
    void opener.loadURL(target.openerUrl).catch(()=>finish('not_connected'))
    if(signal.aborted)finish('cancelled')
    return {state:()=>current,cancel:()=>finish('cancelled')}
    } catch { try { emergency?.() } catch {} if(!stopped)report('not_connected'); return null }
  }
  dispose(): void { if(this.disposed)return;this.disposed=true;for(const close of [...this.active])close() }
}
