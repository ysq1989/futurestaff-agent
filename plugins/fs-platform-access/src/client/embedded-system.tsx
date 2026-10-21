import { useEffect, useRef, useState } from 'react'

interface EmbeddedBridge {
  request(input: { action: 'show' | 'hide' | 'close' | 'reload'; appId: string; bounds?: { x: number; y: number; width: number; height: number } }): Promise<{ ok: boolean; error?: string }>
}
declare global { interface Window { futurestaffSystems?: EmbeddedBridge } }

/** Native guests occupy this measured tab body; no remote page receives a bridge. */
export function EmbeddedSystemPage({ appId, title, visible }: { appId: string; title: string; visible: boolean }) {
  const area = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const bridge = window.futurestaffSystems
    if (!bridge) { setError('请更新 Agent 桌面客户端以启用系统内嵌页面。'); return }
    if (!visible) { void bridge.request({ action: 'hide', appId }).catch(() => {}); return }
    let live = true, pending = 0, sequence = 0
    let fallback: number | undefined
    const update = async () => {
      const current = ++sequence
      const element = area.current
      if (!live || !element) return
      const frame = element.getBoundingClientRect()
      const overlays = [...document.querySelectorAll('.fs-sidebar-account[data-open="true"],[role="dialog"][aria-modal="true"],.fs-settings-page')].filter(overlay => {
        const rect = overlay.getBoundingClientRect(), style = getComputedStyle(overlay)
        return !overlay.closest('[hidden]') && rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      })
      if (overlays.some(overlay => overlay.matches('[role="dialog"][aria-modal="true"],.fs-settings-page'))) {
        await bridge.request({ action: 'hide', appId }); return
      }
      let { x, width } = frame
      const { y, height } = frame
      // Native views paint above renderer popovers. Reserve only the overlapping
      // left edge for a collapsed account menu; a non-overlapping menu changes nothing.
      for (const overlay of overlays) {
        const popup = overlay.getBoundingClientRect()
        if (popup.right > frame.left && popup.left < frame.right && popup.bottom > frame.top && popup.top < frame.bottom) {
          x = Math.min(frame.right, Math.max(x, popup.right + 8))
          width = frame.right - x
        }
      }
      if (!width || !height) { await bridge.request({ action: 'hide', appId }); return }
      try {
        const result = await bridge.request({ action: 'show', appId, bounds: { x, y, width, height } })
        if (live && current === sequence) {
          setReady(result.ok)
          const guidance:Record<string,string>={SYSTEM_SSO_NOT_ENROLLED:'该系统尚未接入 Agent 单点登录，请更新系统服务后重试。',SYSTEM_SSO_UNAVAILABLE:'平台单点登录接口尚未就绪，请更新平台服务后重试。',SYSTEM_SSO_CONTRACT_MISMATCH:'系统登录接入配置不匹配，请联系管理员。',SYSTEM_SSO_EXCHANGE_FAILED:'系统登录交接失败，请重试。'}
          setError(result.ok?'':guidance[result.error??'']??'系统页面暂时无法加载，请重试。')
        }
      } catch { if (live && current === sequence) setError('系统页面连接失败，请重试。') }
    }
    const flush = () => {
      cancelAnimationFrame(pending)
      if (fallback !== undefined) window.clearTimeout(fallback)
      fallback = undefined
      if (live) void update()
    }
    const schedule = () => {
      if (!live || fallback !== undefined) return
      pending = requestAnimationFrame(flush)
      // Windows occlusion can suspend renderer animation frames while the native Host stays active.
      fallback = window.setTimeout(flush, 100)
    }
    const observer = new ResizeObserver(schedule)
    const overlays = new MutationObserver(schedule)
    overlays.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-open', 'aria-modal'] })
    if (area.current) observer.observe(area.current)
    window.addEventListener('resize', schedule)
    schedule()
    return () => { live = false; observer.disconnect(); overlays.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(pending); if (fallback !== undefined) window.clearTimeout(fallback); void bridge.request({ action: 'hide', appId }).catch(() => {}) }
  }, [appId, visible, retry])
  useEffect(() => () => { void window.futurestaffSystems?.request({ action: 'close', appId }).catch(() => {}) }, [appId])
  return <section style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }} aria-label={`${title}内嵌页面`}>
    <style>{`.fs-embedded-tools{position:absolute;top:7px;right:12px;z-index:2}.fs-embedded-tools button{display:grid;place-items:center;width:32px;height:32px;padding:0;border:1px solid var(--border-default);border-radius:6px;background:var(--bg-secondary);color:var(--text-secondary);cursor:pointer}.fs-embedded-tools button:hover{background:var(--bg-hover);color:var(--text-primary)}.fs-embedded-tools button:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}.fs-embedded-error{padding:24px;font-size:13px}.fs-embedded-error button{padding:6px 12px;border:1px solid var(--border-default);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font:inherit;cursor:pointer}`}</style>
    <div className="fs-embedded-tools">
      <button type="button" title={`刷新${title}`} onClick={() => { void window.futurestaffSystems?.request({ action: 'reload', appId }).then(result => { if (!result.ok) setError('系统刷新失败，请重试。') }).catch(() => setError('系统刷新失败，请重试。')) }} aria-label={`刷新${title}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5 M20 12a8 8 0 1 0-2 5 M20 7l-3-2"/></svg></button>
    </div>
    <div ref={area} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {error ? <div role="status" className="fs-embedded-error"><p>{error}</p><button type="button" onClick={() => { setError(''); setRetry(value => value + 1) }}>重试</button></div>
        : !ready && <p role="status" style={{ padding: 24, color: 'var(--text-secondary)' }}>正在加载系统页面…</p>}
    </div>
  </section>
}
