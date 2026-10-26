import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { futureStaffLogoUrl } from '../brand.js'

interface SettingsRow { id: string; label: string; order: number }
type SelectHook<S> = <T>(select: (state: S) => T) => T

/** The existing settings slot's injected face; section data and commands remain owner-provided. */
export interface SettingsPageProps {
  wide: boolean
  loginRequired?: boolean
  reconnect(): void
  useConnectionState: SelectHook<string | undefined>
  useSections: SelectHook<readonly SettingsRow[]>
  useOnboardingSteps: SelectHook<readonly { id: string; order: number }[]>
  useSessions: SelectHook<{ phase: string; current: string | undefined; byId: Record<string, { blank?: boolean }> }>
  renderSlot(name: 'settings.trigger' | 'settings.header' | 'settings.action' | 'settings.section' | 'settings.onboarding', props: Record<string, unknown>, options?: { only: string }): ReactNode
  t(key: string): string
}

export const settingsPageCss = `
.fs-settings-trigger-row{display:flex;align-items:center;gap:8px}
.fs-settings-trigger-row .fs-settings-trigger{display:flex;align-items:center;gap:8px;width:100%;min-height:38px;padding:8px;text-align:left}
.fs-settings-connection{font-size:12px;color:var(--text-secondary);white-space:nowrap}
.fs-settings-page{--fs-settings-nav-width:264px;--text-primary:var(--fs-popup-text);--text-secondary:var(--fs-popup-muted);--text-tertiary:var(--fs-sidebar-muted);--bg-hover:var(--fs-sidebar-hover);position:fixed;inset:var(--fs-settings-top,0px) 0 0;z-index:1000;display:grid;grid-template-columns:var(--fs-settings-nav-width) minmax(0,1fr);background:var(--bg-primary);color:var(--text-primary);font:14px/1.5 'Segoe UI','Microsoft YaHei UI',system-ui,sans-serif;text-align:left;-webkit-app-region:no-drag}
.fs-settings-page *{box-sizing:border-box}
.fs-settings-page::before{content:'';position:fixed;inset:0 0 auto;height:var(--fs-settings-top,0px);box-sizing:border-box;background:var(--bg-primary);border-bottom:1px solid var(--border-default);pointer-events:none}
.fs-sidebar:has(.fs-settings-page)>.fs-sidebar-brand{visibility:hidden;pointer-events:none}
.fs-settings-brand{position:fixed;top:0;left:0;display:flex;align-items:center;gap:8px;width:var(--fs-settings-nav-width);max-width:calc(100vw - 150px);height:var(--fs-settings-top,0px);padding:0 16px;overflow:hidden;background:var(--fs-sidebar-bg);border-right:1px solid var(--border-default);font-size:12px;font-weight:600;white-space:nowrap;-webkit-app-region:drag}
.fs-settings-brand img{display:block;width:20px;height:20px;flex:none;object-fit:contain;pointer-events:none}
.fs-settings-brand span{overflow:hidden;text-overflow:ellipsis}.fs-settings-brand b{color:var(--accent-primary);font-weight:600}
.fs-settings-nav{display:flex;flex-direction:column;min-height:0;padding:24px 16px 16px;background:var(--fs-sidebar-bg);border-right:1px solid var(--border-default);gap:24px}
.fs-settings-page .fs-settings-back{display:flex;align-items:center;gap:8px;align-self:flex-start;border:0;border-radius:6px;padding:6px 8px;background:transparent;color:var(--text-secondary);font:inherit;cursor:pointer}
.fs-settings-nav h1{margin:0 12px;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-.4px}
.fs-settings-search{display:flex;align-items:center;gap:8px;margin:0 4px;padding:9px 12px;border:1px solid var(--border-default);border-radius:8px;color:var(--text-secondary);background:var(--bg-hover)}
.fs-settings-search input{width:100%;min-width:0;border:0;outline:none;background:transparent;color:var(--text-primary);font:inherit}
.fs-settings-search:focus-within{outline:2px solid var(--accent-primary);outline-offset:2px}
.fs-settings-search input::-webkit-search-cancel-button{cursor:pointer}
.fs-settings-links{display:flex;flex-direction:column;gap:4px;min-height:0;overflow:auto;padding:3px 4px}
.fs-settings-page .fs-settings-link{display:flex;align-items:center;gap:10px;width:100%;flex-shrink:0;border:0;border-radius:7px;padding:10px 12px;color:var(--text-secondary);background:transparent;font:inherit;text-align:left;cursor:pointer}
.fs-settings-page .fs-settings-link[aria-current=page]{color:var(--text-primary);background:var(--bg-hover);font-weight:600}
.fs-settings-page button:hover{background:var(--bg-hover)}
.fs-settings-page button:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}
.fs-settings-page svg{flex-shrink:0}
.fs-settings-empty{padding:12px;color:var(--text-secondary);font-size:13px}
.fs-settings-workspace{display:flex;flex-direction:column;min-width:0;min-height:0}
.fs-settings-toolbar{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:8px;min-height:60px;padding:12px 32px;border-bottom:1px solid var(--border-default);flex-shrink:0}
.fs-settings-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:48px clamp(24px,5vw,96px) 64px}
.fs-settings-content{max-width:960px;margin:0 auto;min-width:0}
.fs-settings-content>h2{margin:0 0 32px;font-size:28px;line-height:1.3;font-weight:600;letter-spacing:-.6px;outline:none}
.fs-settings-section{min-width:0;overflow-wrap:anywhere}
.fs-settings-page .futurestaff-access{padding:0;max-width:none}
.fs-settings-page .futurestaff-access .fs-panel{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
.fs-settings-page .futurestaff-access .fs-tenant{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.fs-settings-page .futurestaff-access .fs-tenant p{max-width:48ch}
/* The account menu also raises this surface; settings must win its specificity
   so mounted desktop chat overlays remain behind the full settings page. */
.dshDesktopSidebarSurface:has(.fs-settings-page),.dshDesktopSidebarSurface:has(.fs-sidebar-account[data-open] .fs-settings-page){overflow:visible;z-index:1001}
@media(max-width:760px){.fs-settings-page{--fs-settings-nav-width:200px}.fs-settings-nav{padding:20px 10px;gap:20px}.fs-settings-toolbar{padding:10px 16px}.fs-settings-scroll{padding:28px 20px 48px}.fs-settings-content>h2{font-size:24px}.fs-settings-page .futurestaff-access .fs-tenant{grid-template-columns:1fr}}
@media(max-width:560px){.fs-settings-page{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.fs-settings-nav{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 16px;border-right:0;border-bottom:1px solid var(--border-default)}.fs-settings-nav h1{grid-column:2;grid-row:1;margin:0;text-align:right;font-size:20px}.fs-settings-search{grid-column:1/-1;margin:0}.fs-settings-links{grid-column:1/-1;flex-direction:row;overflow:auto;padding:3px 0}.fs-settings-page .fs-settings-link{width:auto;white-space:nowrap;padding:8px 10px}.fs-settings-toolbar{justify-content:flex-start;min-height:48px}.fs-settings-scroll{padding:24px 16px 40px}.fs-settings-content>h2{margin-bottom:24px}.fs-settings-page .futurestaff-access .fs-app-grid{grid-template-columns:1fr}}
`

function SettingsIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    back: 'M15 5l-7 7 7 7 M8 12h13', search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    'futurestaff-access': 'M20 21v-2a7 7 0 0 0-14 0v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    'futurestaff-agent-market': 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
    general: 'M4 7h16 M4 17h16 M9 4v6 M15 14v6',
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind] ?? paths.general}/></svg>
}

/** A page transition keeps the existing chat mounted but removes it from keyboard/AT navigation. */
function suspendCoveredContent(page: HTMLElement) {
  const saved: { element: HTMLElement; inert: boolean }[] = []
  let branch: HTMLElement | null = page
  while (branch?.parentElement && branch.parentElement !== document.body) {
    for (const element of branch.parentElement.children) {
      if (!(element instanceof HTMLElement) || element === branch || element.matches('style,script')) continue
      // Window controls stay usable while the settings page is active.
      if (element.matches('.dshDesktopWindowsCaptionRow,.dshDesktopMacCaptionRow,.dshDesktopFrameTitlebar')) continue
      saved.push({ element, inert: element.inert }); element.inert = true
    }
    branch = branch.parentElement
  }
  return () => { for (const { element, inert } of saved) element.inert = inert }
}

export function FutureStaffSettingsRoot(props: SettingsPageProps) {
  const { wide, loginRequired = false, renderSlot, useSections, useConnectionState, useOnboardingSteps, useSessions, reconnect, t } = props
  // Platform agents own role, knowledge and skills. Keep legacy preset execution
  // and persisted preferences intact, but omit its upstream configuration page.
  const sections = useSections(state => state)
  const rows = sections.filter(row => row.id !== 'agent-presets')
  const connection = useConnectionState(state => state)
  const steps = useOnboardingSteps(state => state)
  const onboardingActive = useSessions(state => state.phase === 'ready' && (state.current === undefined || state.byId[state.current]?.blank === true))
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set())
  const [open, setOpen] = useState(false)
  const visible = open && !loginRequired
  const [selected, setSelected] = useState<string>()
  const [query, setQuery] = useState('')
  const page = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const active = rows.find(row => row.id === selected) ?? rows[0]
  const filtered = rows.filter(row => row.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const close = useCallback(() => { setOpen(false); setQuery(''); setSelected(undefined) }, [])
  const openSection = useCallback((id: string) => { setSelected(id); setQuery(''); setOpen(true) }, [])
  const step = onboardingActive ? steps.find(item => !completed.has(item.id)) : undefined
  const wasOpen = useRef(false)

  useEffect(() => { if (!onboardingActive) setCompleted(new Set()) }, [onboardingActive])
  useLayoutEffect(() => { if (loginRequired && open) close() }, [loginRequired, open, close])
  useLayoutEffect(() => {
    if (!visible || !page.current) return
    const node = page.current
    const updateTop = () => {
      const caption = document.querySelector('.dshDesktopWindowsCaptionRow,.dshDesktopMacCaptionRow,.dshDesktopFrameTitlebar')
      node.style.setProperty('--fs-settings-top', `${caption?.getBoundingClientRect().bottom ?? 0}px`)
    }
    updateTop()
    const restore = suspendCoveredContent(node)
    back.current?.focus()
    window.addEventListener('resize', updateTop)
    return () => { restore(); window.removeEventListener('resize', updateTop) }
  }, [visible])
  useEffect(() => {
    if (wasOpen.current && !visible && !loginRequired) trigger.current?.focus()
    wasOpen.current = visible
  }, [visible, loginRequired])
  useEffect(() => { scroll.current?.scrollTo(0, 0) }, [active?.id])

  return <>
    <style>{settingsPageCss}</style>
    <div className="fs-settings-trigger-row">
      <button ref={trigger} data-settings-trigger type="button" className="fs-settings-trigger" aria-expanded={visible} onClick={() => { setOpen(true) }}>{renderSlot('settings.trigger', { wide })}</button>
      {connection !== undefined && connection !== 'connected' && <button type="button" className="fs-settings-connection" onClick={reconnect} aria-label={t('connection.reconnect')}>{t(connection === 'connecting' ? 'connection.connecting' : 'connection.retry')}</button>}
    </div>
    {visible && <div ref={page} className="fs-settings-page" role="region" aria-label="设置">
      <div className="fs-settings-brand" aria-label="FutureStaff Agent"><img src={futureStaffLogoUrl} alt=""/><span>FutureStaff<b>.Agent</b></span></div>
      <nav className="fs-settings-nav" aria-label="设置分类">
        <button ref={back} type="button" className="fs-settings-back" aria-label="返回工作台" onClick={close}><SettingsIcon kind="back"/>返回工作台</button>
        <h1>{renderSlot('settings.header', {})}</h1>
        <label className="fs-settings-search"><SettingsIcon kind="search"/><input type="search" aria-label="搜索设置分类" placeholder="搜索设置" value={query} onChange={event => { setQuery(event.target.value) }}/></label>
        <div className="fs-settings-links">
          {filtered.map(row => <button type="button" key={row.id} data-settings-section={row.id} className="fs-settings-link" aria-current={active?.id === row.id ? 'page' : undefined} onClick={() => { setSelected(row.id) }}><SettingsIcon kind={row.id}/>{row.label}</button>)}
          {!filtered.length && <p className="fs-settings-empty" role="status">没有匹配的设置分类</p>}
        </div>
      </nav>
      <div className="fs-settings-workspace">
        <header className="fs-settings-toolbar">{renderSlot('settings.action', {})}</header>
        <div ref={scroll} className="fs-settings-scroll">
          <div className="fs-settings-content">
            <h2>{active?.label ?? '设置'}</h2>
            <div key={active?.id} className="fs-settings-section">{active ? renderSlot('settings.section', { close }, { only: active.id }) : <p className="fs-settings-empty" role="status">暂无可用的设置分类</p>}</div>
          </div>
        </div>
      </div>
    </div>}
    {!loginRequired && step && renderSlot('settings.onboarding', { stepId: step.id, complete: () => { setCompleted(previous => new Set([...previous, step.id])) }, openSection }, { only: step.id })}
  </>
}
