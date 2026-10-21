import { useSyncExternalStore } from 'react'
import type { PlatformAccessSnapshot } from '../controller.js'
import type { SidebarAccountController } from './sidebar.js'
import { applicationHome, systemApplicationId as directoryId } from '../system-navigation.js'
import { EmbeddedSystemPage } from './embedded-system.js'
export { applicationHome } from '../system-navigation.js'

const catalog = [
  { id: 'erp', title: '进销存系统', description: '进销存与业务管理' },
  { id: 'hub', title: '货源集市', description: '货源接入与商品整理' },
  { id: 'shop', title: '商城系统', description: '商城管理' },
  { id: 'web', title: 'Web 系统', description: '网站建设与内容管理' },
  { id: 'ai', title: '智能模型服务', description: '企业智能模型能力' },
  { id: 'geo', title: '品牌运营系统', description: '品牌内容与智能搜索可见性' },
  { id: 'immigration', title: '越南签证', description: '签证业务工作台' },
]
// Discovery exposes module IDs, including historical labels and internal tools.
// Only the product directory defines which applications belong in this launcher.
export function systemTitle(id: string, fallback: string): string {
  const appId = id.startsWith('cloud:') ? id.slice(6) : id
  return catalog.find(item => item.id === directoryId(appId))?.title ?? fallback
}
const internalApplications = new Set(['agent', 'agents', 'platform', 'wecom_album'])
export interface DirectoryItem { id: string; title: string; description: string; pageId?: string; url: string | null }

export function systemDirectory(snapshot: PlatformAccessSnapshot, pages: readonly { id: string; title: string }[]): DirectoryItem[] {
  const items = new Map<string, DirectoryItem>(catalog.map(item => [item.id, { ...item, url: null }]))
  for (const app of snapshot.applications) {
    const id = directoryId(app.appId)
    const existing = items.get(id)
    if (!existing) continue
    const url = applicationHome(snapshot, app)
    if (!url) continue
    if (existing.url && app.appId !== id) continue
    items.set(id, { ...existing, url })
  }
  for (const page of pages) {
    if (page.id.startsWith('cloud:') || internalApplications.has(page.id)) continue
    const id = directoryId(page.id)
    const existing = items.get(id)
    // Canonical cloud systems always use the native authorized guest, including GEO.
    if (existing) continue
    items.set(id, { id, title: page.title, description: '本地业务工作台', pageId: page.id, url: null })
  }
  return ['ready', 'no_apps'].includes(snapshot.phase)
    ? [...items.values()].filter(item => item.url !== null || item.pageId !== undefined) : []
}

export function createCloudSystemPage(controller: SidebarAccountController, appId: string) {
  return function CloudSystemPage({ visible = true }: { visible?: boolean }) {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
    const item = systemDirectory(snapshot, []).find(entry => entry.id === appId)
    return item?.url ? <EmbeddedSystemPage appId={appId} title={item.title} visible={visible}/>
      : <section className="fs-cloud-entry"><h1>{item?.title ?? '系统入口'}</h1><p role="status">当前主体尚无可用入口，请核对平台授权。</p></section>
  }
}
