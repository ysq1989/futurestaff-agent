import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SidebarRootComponentProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PlatformAccessSnapshot } from '../controller.js'
import type { SystemPages } from './system-pages.js'
import { systemDirectory, createCloudSystemPage } from './system-directory.js'
import { futureStaffLogoUrl } from '../brand.js'
const defaultPageState={mode:'sessions' as const,available:[],active:null,tabs:[],owner:''}
const noPageSubscription=()=>()=>{}
const defaultPageSnapshot=()=>defaultPageState

export interface SidebarAccountController {
  subscribe(listener: () => void): () => void
  getSnapshot(): PlatformAccessSnapshot
  logout(): Promise<void>
}

export function sidebarIdentity(snapshot: PlatformAccessSnapshot) {
  const tenant = ['ready', 'no_apps'].includes(snapshot.phase)
    ? snapshot.tenants.find(item => item.tenantId === snapshot.activeTenantId) : undefined
  return {
    tenantName: tenant?.displayName ?? 'FutureStaff Agent',
    logoUrl: tenant?.logoUrl ?? undefined,
    userName: tenant ? snapshot.user?.displayName ?? '用户' : '未登录',
  }
}

/** Read the installed shell's metadata, not a separately hardcoded UI version. */
export function sidebarVersion(search: string): string | undefined {
  const version = new URLSearchParams(search).get('dsh-desktop-version')
  return version && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) ? version : undefined
}

export const sidebarCss = `
.fs-sidebar{--dsh-sidebar-inline-padding:12px;--bg-hover:var(--fs-sidebar-hover);--bg-active:var(--fs-sidebar-selected);--text-secondary:var(--fs-sidebar-muted);--text-tertiary:var(--fs-sidebar-muted);display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;padding:12px;gap:14px;background:var(--fs-sidebar-bg);color:var(--fs-sidebar-text);font-size:13px;border-right:1px solid var(--border-default)}
.fs-sidebar button{font:inherit;color:inherit;cursor:pointer;border:0;background:transparent;border-radius:8px;min-height:36px}
.fs-sidebar button:hover{background:var(--bg-hover)}.fs-sidebar button:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}.fs-sidebar button:disabled{cursor:default}
.fs-sidebar-brand{display:flex;align-items:center;gap:9px;min-width:0}.fs-sidebar-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.fs-sidebar-avatar{display:grid;place-items:center;flex-shrink:0;width:30px;height:30px;border-radius:8px;object-fit:contain;background:var(--bg-active);color:var(--accent-primary);font-weight:600}
.fs-sidebar-new{width:100%;flex-shrink:0;background:var(--accent-primary)!important;color:var(--fs-on-accent)!important;font-weight:600!important;margin-bottom:14px;box-shadow:0 3px 9px color-mix(in srgb,var(--accent-primary) 14%,transparent)}.fs-sidebar-new:hover{background:var(--accent-hover,var(--accent-primary))!important}
.fs-sidebar-tabs{display:flex;border-radius:7px;background:var(--bg-hover);padding:3px;gap:3px}.fs-sidebar-tabs button{flex:1;color:var(--text-secondary);min-height:30px}.fs-sidebar-tabs button[aria-selected=true]{background:var(--fs-control-selected);color:var(--text-primary);font-weight:600;box-shadow:0 1px 3px var(--fs-shadow)}
.fs-sidebar-region{flex:1;min-height:0;display:flex;flex-direction:column}.fs-sidebar-region[hidden]{display:none}.fs-sidebar-menu{gap:6px;overflow:auto}.fs-sidebar-menu:empty:after{content:'暂无菜单';color:var(--text-tertiary);padding:12px}
.fs-sidebar-footer{position:relative;flex-shrink:0;border-top:1px solid var(--border-default);padding-top:10px}.fs-sidebar-user{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:8px!important}.fs-sidebar-user-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fs-sidebar-version{display:block;text-align:left;color:var(--text-tertiary);font-size:11px;padding:8px;border-top:1px solid var(--border-default);margin-top:4px}
.fs-sidebar-account{--text-secondary:var(--fs-popup-muted);--text-tertiary:var(--fs-popup-muted);--bg-hover:var(--fs-popup-hover);position:absolute;bottom:100%;left:0;right:0;z-index:20;color:var(--text-primary)}.fs-sidebar-account[data-open=true]{background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:10px;padding:6px;box-shadow:0 8px 24px var(--fs-shadow)}
/* Keep the settings page and onboarding mounted; hide only the trigger row. */
.fs-sidebar-account[data-open=false] .fs-settings-trigger-row,.fs-sidebar-account[data-open=false]>.fs-sidebar-settings>div:not([data-slot]):first-child,.fs-sidebar-account[data-open=false]>.fs-sidebar-settings>[data-slot="sidebar.settings"]>div:first-child{display:none}.fs-sidebar-exit{width:100%;text-align:left;color:var(--error)!important;padding:8px!important}
.fs-sidebar[data-collapsed=true]{padding:12px 8px}.fs-sidebar[data-collapsed=true] .fs-sidebar-brand{justify-content:center}.fs-sidebar[data-collapsed=true] .fs-sidebar-tabs{flex-direction:column}.fs-sidebar[data-collapsed=true] .fs-sidebar-name{display:none}
.fs-sidebar-section-label{display:flex;justify-content:space-between;align-items:center;padding:2px 8px 8px;font-size:11px;color:var(--text-secondary);letter-spacing:.08em}.fs-sidebar-section-label span{letter-spacing:0}
.fs-sidebar-menu .fs-sidebar-system{display:flex;align-items:center;gap:10px;flex-shrink:0;width:100%;min-height:52px;padding:8px 10px;text-align:left;border:1px solid transparent;border-radius:7px}
.fs-sidebar-system[aria-current=page]{background:var(--fs-sidebar-selected);color:var(--accent-primary)}.fs-sidebar-system:disabled{color:var(--text-secondary)}.fs-sidebar-system:disabled:hover{background:transparent}
.fs-system-icon{display:grid;place-items:center;flex-shrink:0;width:24px;height:28px;color:var(--text-secondary)}.fs-sidebar-system[aria-current=page] .fs-system-icon{color:var(--accent-primary)}.fs-system-copy{flex:1;min-width:0}.fs-system-copy strong,.fs-system-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-system-copy strong{font-size:13px;font-weight:500}.fs-system-copy small{font-size:11px;color:var(--text-secondary);margin-top:3px}.fs-system-indicator{color:var(--text-secondary);opacity:.65}
.fs-sidebar[data-collapsed=true] .fs-sidebar-system{justify-content:center;padding:8px 0}.fs-sidebar-menu p{padding:8px;font-size:12px;color:var(--text-secondary)}
.fs-sidebar[data-collapsed=true] .fs-sidebar-account[data-open=true]{width:min(240px,calc(100vw - 24px));right:auto}
@media(prefers-reduced-motion:reduce){.fs-sidebar *{transition:none!important}}
.fs-sidebar{--text-primary:var(--fs-sidebar-text);--dsw-alias-label-primary:var(--text-primary);--dsw-alias-label-primary-bluish:var(--text-primary);--dsw-alias-label-secondary:var(--text-secondary);--dsw-alias-label-tertiary:var(--text-tertiary);--dsw-alias-label-caption:var(--text-secondary);--dsw-alias-label-dimmed:var(--text-tertiary);--dsw-alias-interactive-bg-hover:var(--bg-hover)}
.fs-sidebar-account{--text-primary:var(--fs-popup-text)}.fs-sidebar-avatar{color:var(--accent-primary)}
.fs-sidebar-logo{width:28px;height:30px;flex-shrink:0}.fs-sidebar-brand-wordmark{flex:1;min-width:0;font-size:14px;font-weight:650;letter-spacing:-.4px}.fs-sidebar-brand-wordmark span{color:var(--accent-primary)}.fs-sidebar-brand button{display:grid;place-items:center;width:30px;min-height:30px;color:var(--text-secondary)}
.fs-sidebar-subject{display:flex;align-items:center;gap:9px;padding:8px;border:1px solid var(--border-default);border-radius:8px;background:var(--bg-secondary)}.fs-sidebar-subject .fs-sidebar-avatar{width:28px;height:28px;font-size:12px}.fs-sidebar-subject small{display:block;font-size:10px;font-weight:400;color:var(--text-secondary);margin-bottom:2px}.fs-sidebar-subject .fs-sidebar-name{font-size:12px}
.fs-sidebar-account .fs-sidebar-subject{margin-bottom:6px}.fs-sidebar-subject[hidden]{display:none}.fs-sidebar[data-collapsed=true] .fs-sidebar-account .fs-sidebar-name{display:block}
.fs-sidebar[data-collapsed=true]{align-items:center;gap:12px}.fs-sidebar[data-collapsed=true] .fs-sidebar-brand{height:30px;width:36px}
.fs-sidebar[data-collapsed=true] .fs-sidebar-tabs{background:transparent;padding:0;gap:4px;align-items:center;width:36px}.fs-sidebar[data-collapsed=true] .fs-sidebar-tabs button{display:grid;place-items:center;width:36px;height:36px;min-height:36px;flex:none;border-radius:7px}.fs-sidebar[data-collapsed=true] .fs-sidebar-tabs button[aria-selected=true]{background:var(--fs-sidebar-selected);color:var(--accent-primary);box-shadow:none}
.fs-sidebar[data-collapsed=true] .fs-sidebar-region{width:36px}.fs-sidebar[data-collapsed=true] .fs-sidebar-menu{gap:6px;border-top:1px solid var(--border-default);padding-top:12px;scrollbar-width:none}.fs-sidebar[data-collapsed=true] .fs-sidebar-system{width:36px;height:36px;min-height:36px;padding:0;border-radius:7px}.fs-sidebar[data-collapsed=true] .fs-system-icon{width:24px;height:24px}
.fs-sidebar[data-collapsed=true] .fs-sidebar-footer{width:36px}.fs-sidebar[data-collapsed=true] .fs-sidebar-user{display:grid;place-items:center;width:36px;min-height:36px;padding:0!important}.fs-sidebar[data-collapsed=true] .fs-sidebar-user .fs-sidebar-avatar{width:28px;height:28px}
.fs-sidebar-workspaces{display:flex;flex-direction:column;flex:1;min-height:0}.fs-sidebar-workspaces[hidden]{display:none}
.fs-sidebar[data-collapsed=true] #fs-sessions-panel{gap:8px;border-top:1px solid var(--border-default);padding-top:12px}
.fs-sidebar[data-collapsed=true] .fs-sidebar-new,.fs-sidebar-rail-action{display:grid;place-items:center;flex:none;width:36px;height:36px;min-height:36px;margin:0;padding:0;border-radius:7px;background:transparent!important;color:var(--text-secondary)!important;box-shadow:none}
.fs-sidebar[data-collapsed=true] .fs-sidebar-new:hover,.fs-sidebar-rail-action:hover{background:var(--bg-hover)!important;color:var(--text-primary)!important}
.dshDesktopSidebarSurface:has(.fs-sidebar-account[data-open=true]){overflow:visible;z-index:4}
`

function SubjectLogo({ name, url }: { name: string; url: string | undefined }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [url])
  return url && !failed
    ? <img className="fs-sidebar-avatar" src={url} alt={`${name} Logo`} referrerPolicy="no-referrer" onError={() => { setFailed(true) }} />
    : <span className="fs-sidebar-avatar" aria-hidden="true">{Array.from(name)[0]}</span>
}

function SystemIcon({id}:{id:string}) {
  const paths:Record<string,string>={erp:'M3 7h18v14H3z M3 7l4-4h10l4 4 M8 11h8',hub:'M4 4h6v6H4z M14 14h6v6h-6z M14 4h6v6h-6z M4 14h6v6H4z',shop:'M5 8h14l1 13H4z M9 8V6a3 3 0 0 1 6 0v2',ai:'M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4',geo:'M4 3v17h17 M8 15l4-5 4 3 5-7',immigration:'M6 3h13v18H6z M10 7h5 M10 11h5 M10 15h3',douyin:'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5'}
  paths.web='M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18'
  paths.new='M12 5v14 M5 12h14'
  paths.search='M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[id]??paths.hub}/></svg>
}

export function createAccountSidebar(controller: SidebarAccountController,pages?:SystemPages,onNewSession?:()=>void) {
  return function FutureStaffAccountSidebar({ collapsed, startSession, toggleSidebar, renderSlot }: SidebarRootComponentProps) {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
    const identity = sidebarIdentity(snapshot)
    const [localTab, setTab] = useState<'sessions' | 'menu'>('sessions')
    const navigation=useSyncExternalStore(pages?.subscribe??noPageSubscription,pages?.getSnapshot??defaultPageSnapshot,pages?.getSnapshot??defaultPageSnapshot)
    const systems=systemDirectory(snapshot,navigation.available)
    const authenticated=['ready','no_apps'].includes(snapshot.phase)
    const tab=pages?(navigation.mode==='systems'?'menu':'sessions'):localTab
    const [accountOpen, setAccountOpen] = useState(false)
    const footer = useRef<HTMLDivElement>(null)
    const userButton = useRef<HTMLButtonElement>(null)
    const workspaces = useRef<HTMLDivElement>(null)
    const focusSessionSearch = useRef(false)
    useEffect(() => {
      if (!collapsed && focusSessionSearch.current) {
        focusSessionSearch.current = false
        workspaces.current?.querySelector<HTMLInputElement>('input[aria-label="搜索会话"]')?.focus()
      }
    }, [collapsed])
    const version = typeof window === 'undefined' ? undefined : sidebarVersion(window.location.search)
    useEffect(() => { setAccountOpen(false); setTab('sessions');pages?.bindOwner(['ready','no_apps'].includes(snapshot.phase)&&snapshot.activeTenantId&&snapshot.user?.userId?`${snapshot.activeTenantId}:${snapshot.user.userId}`:'') }, [snapshot.phase,snapshot.activeTenantId, snapshot.user?.userId])
    useEffect(() => {
      if (!accountOpen) return
      const pointer = (event: PointerEvent) => {
        // Native settings dialogs are portals or fixed descendants; let them own dismissal.
        if (document.querySelector('[role="dialog"],.fs-settings-page')) return
        if (!footer.current?.contains(event.target as Node)) setAccountOpen(false)
      }
      const key = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && !document.querySelector('[role="dialog"],.fs-settings-page')) {
          setAccountOpen(false); userButton.current?.focus()
        }
      }
      document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', key)
      return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key) }
    }, [accountOpen])
    const chooseTab = (next: 'sessions' | 'menu') => { setTab(next);pages?.select(next==='menu'?'systems':'sessions') }
    const switchByKey = (event: React.KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home' ? 'sessions' : event.key === 'End' ? 'menu' : tab === 'sessions' ? 'menu' : 'sessions'
      chooseTab(next)
      document.getElementById(next === 'sessions' ? 'fs-sessions-tab' : 'fs-menu-tab')?.focus()
    }
    return <aside className="fs-sidebar" data-collapsed={collapsed} aria-label="主体导航">
      <style>{sidebarCss}</style>
      <header className="fs-sidebar-brand">
        {!collapsed && <><img className="fs-sidebar-logo" src={futureStaffLogoUrl} alt="FutureStaff"/><span className="fs-sidebar-brand-wordmark">FutureStaff<span>.Agent</span></span></>}
        <button type="button" aria-label={collapsed ? '展开侧栏' : '收起侧栏'} onClick={toggleSidebar}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg></button>
      </header>
      <div className="fs-sidebar-tabs" role="tablist" aria-label="侧栏内容" aria-orientation={collapsed ? 'vertical' : 'horizontal'} onKeyDown={switchByKey}>
        <button type="button" role="tab" id="fs-sessions-tab" aria-label="会话" title="会话" tabIndex={tab === 'sessions' ? 0 : -1} aria-controls="fs-sessions-panel" aria-selected={tab === 'sessions'} onClick={() => { chooseTab('sessions') }}>{collapsed?<SystemIcon id="douyin"/>:'会话'}</button>
        <button type="button" role="tab" id="fs-menu-tab" aria-label="系统" title="系统" tabIndex={tab === 'menu' ? 0 : -1} aria-controls="fs-menu-panel" aria-selected={tab === 'menu'} onClick={() => { chooseTab('menu') }}>{collapsed?<SystemIcon id="hub"/>:'系统'}</button>
      </div>
      <section key={`sessions:${snapshot.activeTenantId ?? 'signed-out'}`} className="fs-sidebar-region" id="fs-sessions-panel" role="tabpanel" aria-labelledby="fs-sessions-tab" hidden={tab !== 'sessions'}>
        <button type="button" className="fs-sidebar-new" aria-label="新会话" title="新会话" onClick={() => { pages?.select('sessions');if(onNewSession)onNewSession();else startSession() }}>{collapsed ? <SystemIcon id="new"/> : '+ 新会话'}</button>
        {collapsed && <button type="button" className="fs-sidebar-rail-action" aria-label="搜索会话" title="搜索会话" onClick={() => { focusSessionSearch.current = true; toggleSidebar() }}><SystemIcon id="search"/></button>}
        <div className="fs-sidebar-workspaces" ref={workspaces} hidden={collapsed}>{renderSlot('sidebar.workspaces', { wide: !collapsed, expandSidebar: () => { if (collapsed) toggleSidebar() } })}</div>
      </section>
      <section key={`menu:${snapshot.activeTenantId ?? 'signed-out'}`} className="fs-sidebar-region fs-sidebar-menu" id="fs-menu-panel" role="tabpanel" aria-labelledby="fs-menu-tab" hidden={tab !== 'menu'}>
        {!collapsed && <div className="fs-sidebar-section-label">工作台系统 <span>{systems.length}</span></div>}
        {authenticated && !systems.length && <p role="status">当前主体暂无可用系统入口。</p>}
        {systems.map(item => {
          const enabled=!!pages&&authenticated&&!!(item.pageId||item.url)
          const targetId=item.url?`cloud:${item.id}`:item.pageId
          const selected=navigation.active===targetId
          return <button type="button" className="fs-sidebar-system" key={item.id} aria-label={`打开${item.title}`} aria-current={selected?'page':undefined} disabled={!enabled} title={`${item.title} · ${enabled?item.description:'未授权或未接入'}`} onClick={()=>{
            if(!pages||!enabled)return
            const id=item.url?`cloud:${item.id}`:item.pageId
            if(!id)return
            if(!pages.has(id))pages.register({id,title:item.title,component:createCloudSystemPage(controller,item.id)})
            pages.open(id)
          }}>
            <span className="fs-system-icon" aria-hidden="true"><SystemIcon id={item.id}/></span>
            {!collapsed && <><span className="fs-system-copy"><strong>{item.title}</strong><small>{enabled?item.description:'未授权或未接入'}</small></span><span className="fs-system-indicator" aria-hidden="true">{enabled?'›':'—'}</span></>}
          </button>
        })}
        {snapshot.phase==='loading' && <p role="status">正在读取系统授权…</p>}
        {snapshot.phase==='error' && <p role="status">系统授权读取失败，请在账号设置中重新连接。</p>}
      </section>
      <footer className="fs-sidebar-footer" ref={footer}>
        <div className="fs-sidebar-account" data-open={accountOpen}>
          <div className="fs-sidebar-subject" title={identity.tenantName} hidden={!accountOpen}><SubjectLogo name={identity.tenantName} url={identity.logoUrl}/><span className="fs-sidebar-name"><small>当前主体</small>{identity.tenantName}</span></div>
          <div key={snapshot.activeTenantId ?? 'signed-out'} className="fs-sidebar-settings">{renderSlot('sidebar.settings', { wide: true })}</div>
          {accountOpen && <button type="button" className="fs-sidebar-exit" onClick={() => { setAccountOpen(false); void controller.logout() }}>退出登录</button>}
          {accountOpen && version && <span className="fs-sidebar-version">客户端版本 · v{version}</span>}
        </div>
        <button ref={userButton} type="button" className="fs-sidebar-user" aria-label={`${identity.userName}，用户菜单`} title={identity.userName} aria-expanded={accountOpen} onClick={() => { setAccountOpen(value => !value) }}>
          <span className="fs-sidebar-avatar" aria-hidden="true">{Array.from(identity.userName)[0]}</span>
          {!collapsed && <><span className="fs-sidebar-user-name">{identity.userName}</span><span aria-hidden="true">{accountOpen ? '⌃' : '⌄'}</span></>}
        </button>
      </footer>
    </aside>
  }
}
