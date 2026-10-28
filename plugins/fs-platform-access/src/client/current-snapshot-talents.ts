import type { CurrentSnapshotCard } from '../agent-snapshot-host.js'
import { diagnosticFetch, diagnosticJson } from './diagnostics-request.js'

export type CurrentSnapshotTalent = CurrentSnapshotCard
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const version = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const invalid = () => Error('当前商城助手目录格式不兼容，请检查更新后重试。')

async function request(route: string, signal: AbortSignal, body?: unknown) {
  signal.throwIfAborted()
  const response = await diagnosticFetch('/_futurestaff/agents/' + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-futurestaff-agent': '1', 'content-type': 'application/json' }, cache: 'no-store', signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, { ignoreStatuses: route === 'current-snapshots' ? [404] : [] })
  // Older Hosts have no additive current-role directory.
  if (route === 'current-snapshots' && response.status === 404) return { items: [] }
  const data: unknown = await diagnosticJson(response); signal.throwIfAborted()
  if (!response.ok) {
    const messages: Record<string, string> = { AGENT_SNAPSHOT_CHANGED: '平台版本已更新，请检查更新后安装当前版本。', AGENT_APPLICATION_REQUIRED: '当前账号无权使用商城助手。', AGENT_SNAPSHOT_LOCAL_CONFLICT: '本机工作区存在不同文件，已保留原文件，请检查后重试。' }
    throw Error(object(data) && typeof data.error === 'string' ? messages[data.error] ?? '商城助手操作未完成，请检查当前版本与使用权限后重试。' : '商城助手操作未完成，请检查更新后重试。')
  }
  if (!object(data)) throw invalid()
  return data
}

export async function loadCurrentSnapshotTalents(signal: AbortSignal): Promise<CurrentSnapshotTalent[]> {
  const data = await request('current-snapshots', signal)
  if (!Array.isArray(data.items) || data.items.length > 200) throw invalid()
  const ids = new Set<string>()
  return data.items.map((value: unknown) => {
    if (!object(value) || typeof value.agentId !== 'string' || !uuid.test(value.agentId) || ids.has(value.agentId)
      || !version(value.version) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200
      || typeof value.description !== 'string' || value.description.length > 2000 || typeof value.available !== 'boolean'
      || typeof value.installed !== 'boolean' || !(value.unavailableReason === null || typeof value.unavailableReason === 'string')
      || !Array.isArray(value.businessSystems) || value.businessSystems.length !== 1 || value.businessSystems[0] !== 'shop'
      || !Array.isArray(value.requiredApplications) || value.requiredApplications.length !== 1 || value.requiredApplications[0] !== 'shop') throw invalid()
    ids.add(value.agentId)
    return { agentId: value.agentId, name: value.name, description: value.description, version: value.version, available: value.available, installed: value.installed,
      unavailableReason: value.unavailableReason as string | null, businessSystems: ['shop'], requiredApplications: ['shop'] }
  })
}

export async function installCurrentSnapshot(card: CurrentSnapshotTalent, signal: AbortSignal): Promise<void> {
  if (!card.available || !uuid.test(card.agentId) || !version(card.version)) throw invalid()
  const data = await request('install-snapshot', signal, { agentId: card.agentId, version: card.version })
  if (data.ok !== true) throw invalid()
}

export async function openCurrentSnapshot(card: Pick<CurrentSnapshotTalent, 'agentId' | 'version'>, signal: AbortSignal): Promise<{ path: string }> {
  if (!uuid.test(card.agentId) || !version(card.version)) throw invalid()
  const data = await request('open-snapshot', signal, { agentId: card.agentId, version: card.version })
  if (data.agentId !== card.agentId || data.version !== card.version || typeof data.path !== 'string' || !data.path.trim()) throw invalid()
  return { path: data.path }
}
