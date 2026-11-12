import {useEffect, useRef, useState} from 'react'

interface WorkspaceHeaderProps {
  systemName: string
  tenantName: string
  conversationTitle?: string | undefined
  contextKey: string
  canCreate: boolean
  refreshing: boolean
  directoryBusy: boolean
  hasConversation: boolean
  onOpenNavigation(): void
  onCreate(): void
  onRefresh(): void
  onRefreshDirectory(): void
}

function HeaderIcon({kind}: {kind: 'navigation' | 'new' | 'more'}) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" focusable="false">
    {kind === 'navigation' ? <><path d="M4 6h16M4 12h16M4 18h16"/></> : kind === 'new' ? <path d="M12 5v14M5 12h14"/> : <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>}
  </svg>
}

function insideNativeShell() {
  const host = window as Window & {__FS_NATIVE_VOICE__?: {version: number}; __FS_NATIVE_AIGC_HOST__?: {version: number}}
  return host.__FS_NATIVE_VOICE__?.version === 1 || host.__FS_NATIVE_AIGC_HOST__?.version === 1
}

/** Presentation only: every command delegates to the existing workspace action. */
export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const menu = useRef<HTMLDetailsElement>(null), trigger = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [nativeShell, setNativeShell] = useState(insideNativeShell)
  const close = (restoreFocus = false) => {
    if (menu.current) menu.current.open = false
    if (restoreFocus) trigger.current?.focus()
  }
  useEffect(() => {if (menu.current) menu.current.open = false}, [props.contextKey])
  useEffect(() => {
    const ready = () => setNativeShell(insideNativeShell())
    window.addEventListener('fs-native-voice-ready', ready)
    window.addEventListener('fs-native-aigc-host-ready', ready)
    return () => {window.removeEventListener('fs-native-voice-ready', ready); window.removeEventListener('fs-native-aigc-host-ready', ready)}
  }, [])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {if (event.target instanceof Node && !menu.current?.contains(event.target)) close()}
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const command = (action: () => void) => {close(true); action()}
  const scopeTitle = props.systemName ? `${props.systemName} · FS助手` : 'FS助手'
  return <header className={'workspace-header' + (nativeShell ? ' native-workspace-header' : '')}>
    <button type="button" className="menu-button header-nav" aria-label="打开会话与账号" onClick={props.onOpenNavigation}><HeaderIcon kind="navigation"/></button>
    <div className="header-title"><h1 title={scopeTitle}><span className="header-system">{props.systemName || 'FS助手'}</span>{props.systemName && <span className="header-product">FS助手</span>}</h1></div>
    <div className="header-actions">
      {props.canCreate && <button type="button" className="primary header-new" onClick={props.onCreate}><HeaderIcon kind="new"/><span>新会话</span></button>}
      <details className="header-menu" ref={menu} onToggle={event => setOpen(event.currentTarget.open)} onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close()}} onKeyDown={event => {if (event.key === 'Escape' && menu.current?.open) {event.preventDefault(); event.stopPropagation(); close(true)}}}>
        <summary ref={trigger} role="button" aria-label="更多操作" title="更多操作" aria-expanded={open} aria-controls="workspace-actions"><HeaderIcon kind="more"/></summary>
        <div className="header-menu-panel" id="workspace-actions" role="group" aria-label="工作台操作">
          <div className="header-menu-context"><strong>{scopeTitle}</strong><p>{props.tenantName}</p>{props.conversationTitle && <div><span>当前会话</span><p>{props.conversationTitle}</p></div>}</div>
          <div className="header-menu-commands">
            {props.hasConversation && <button type="button" disabled={props.refreshing} onClick={() => command(props.onRefresh)}>{props.refreshing ? '正在刷新会话…' : '刷新当前会话'}</button>}
            <button type="button" disabled={props.directoryBusy} onClick={() => command(props.onRefreshDirectory)}>{props.directoryBusy ? '正在刷新目录…' : '刷新系统目录'}</button>
            <button type="button" onClick={() => command(props.onOpenNavigation)}>会话与账号</button>
          </div>
        </div>
      </details>
    </div>
  </header>
}
