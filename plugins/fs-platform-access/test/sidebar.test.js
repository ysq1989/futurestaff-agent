import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAccountSidebar, sidebarIdentity, sidebarVersion } from '../lib/client/sidebar.js'
import { apply } from '../lib/client/index.js'
import { FutureStaffSettingsRoot } from '../lib/client/settings-page.js'

const snapshot = { phase: 'ready', user: { userId: 'fixture-user', displayName: '测试用户' },
  activeTenantId: 'active-subject', tenants: [
    { tenantId: 'other-subject', displayName: '另一个主体', logoUrl: 'https://example.invalid/other.png' },
    { tenantId: 'active-subject', displayName: '当前主体', logoUrl: 'https://example.invalid/active.png' },
  ], applications: [], models: [], simulated: true, contractVersion: '0.1.1' }

test('sidebar identity comes only from the active authenticated subject and clears after logout', () => {
  assert.deepEqual(sidebarIdentity(snapshot), { tenantName: '当前主体', logoUrl: 'https://example.invalid/active.png', userName: '测试用户' })
  for (const value of [{ ...snapshot, phase: 'signed_out' }, { ...snapshot, activeTenantId: 'unknown' }]) {
    assert.deepEqual(sidebarIdentity(value), { tenantName: 'FutureStaff Agent', logoUrl: undefined, userName: '未登录' })
  }
})

test('sidebar reads installed-shell version metadata and rejects arbitrary display text', () => {
  assert.equal(sidebarVersion('?dsh-desktop-version=2.0.18'), '2.0.18')
  assert.equal(sidebarVersion('?dsh-desktop-version=2.0.19-alpha.1'), '2.0.19-alpha.1')
  assert.equal(sidebarVersion('?dsh-desktop-version=%3Cscript%3E'), undefined)
  assert.equal(sidebarVersion(''), undefined)
})

test('account sidebar preserves sessions and settings but replaces legacy launchers with the system directory', () => {
  const slots = []
  const controller = { subscribe: () => () => {}, getSnapshot: () => snapshot, logout: async () => {} }
  const Sidebar = createAccountSidebar(controller)
  const html = renderToStaticMarkup(createElement(Sidebar, {
    collapsed: false, width: 270, startSession: () => {}, toggleSidebar: () => {},
    renderSlot: (name, props) => { slots.push({ name, props }); return createElement('div', null, name) },
  }))
  assert.match(html, /当前主体/)
  assert.match(html, /class="fs-sidebar-account"[^>]*>[\s\S]*class="fs-sidebar-subject"[^>]*hidden=""[\s\S]*当前主体[\s\S]*class="fs-sidebar-settings"/)
  assert.doesNotMatch(html.slice(0, html.indexOf('<footer')), /class="fs-sidebar-subject"/)
  assert.match(html, /测试用户，用户菜单/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /id="fs-menu-panel"[^>]+hidden/)
  assert.match(html, /aria-selected="true"/)
  assert.doesNotMatch(html, />退出登录</)
  assert.deepEqual(slots.map(slot => slot.name), ['sidebar.workspaces', 'sidebar.settings'])
  assert.equal(slots[1].props.wide, true)
  assert.doesNotMatch(html, /打开进销存系统/)
  assert.doesNotMatch(html, /打开货源集市/)
  assert.doesNotMatch(html, /选品中心/)
})

test('product sidebar preserves the native child slot declarations and navigation injection', () => {
  const inject = () => ({ startSession: () => {} }), children = { 'sidebar.workspaces': { kind: 'single', scope: 'root' } }
  const OriginalSidebar = () => null
  const original = { options: {}, locale: 'sidebar', children, inject, component: OriginalSidebar }
  const registered = []
  apply({ inject:(_services,callback)=>callback({effect:()=>{}}),slots: {
    inject: (_name, register) => register(),
    subscribe: () => () => {},
    entries: name => name === 'sidebar' ? [original] : [],
    register: (options, component) => { registered.push({ options, component }); return () => {} },
  } })
  assert.equal(original.children, children)
  assert.equal(original.inject, inject)
  assert.notEqual(original.component, OriginalSidebar)
})

test('full-page settings replaces only the standard shell and retains live section and onboarding injection', () => {
  const children = { 'settings.section': { kind: 'list', scope: 'root' }, 'settings.onboarding': { kind: 'list', scope: 'root' } }
  const inject = () => ({ reconnect: () => {}, hooks: { sections: {}, onboardingSteps: {} } })
  const Original = () => null
  const standard = { options: {}, locale: 'settings', children, inject, component: Original }
  const custom = { options: { priority: -50 }, locale: 'custom', component: Original }
  apply({ inject: (_services, callback) => callback({ effect: () => {} }), slots: {
    inject: (_name, register) => register(), subscribe: () => () => {},
    entries: name => name === 'sidebar.settings' ? [standard, custom] : [], register: () => () => {},
  } })
  assert.equal(standard.component, FutureStaffSettingsRoot)
  assert.equal(standard.children, children)
  assert.equal(standard.inject, inject)
  assert.equal(custom.component, Original)
})
