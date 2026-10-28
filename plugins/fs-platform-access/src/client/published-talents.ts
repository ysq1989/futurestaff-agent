import type { DistributionCard } from '../agent-distribution.js'
import { notifyInstalledTalentsChanged } from './installed-talents.js'
import {talentApplicationIds} from './talent-market-model.js'
import { diagnosticFetch, diagnosticJson } from './diagnostics-request.js'
import { reportClientDiagnostic } from './diagnostics.js'

export interface PublishedTalent extends DistributionCard {
  installedVersion: string | null
  versions: string[]
  updateAvailable: boolean
  category?: string
  businessSystems?: string[]
  classificationKnown?: boolean
  requiredApplications?:string[]
}
export class PublishedTalentFailure extends Error {}
export class PublishedCapabilityConfirmation extends PublishedTalentFailure {
  constructor(readonly capabilities: string[]) { super('此版本增加了能力要求，请确认后继续。'); this.name = 'PublishedCapabilityConfirmation' }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const version = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit
const invalid = () => new PublishedTalentFailure('平台智能体目录格式不兼容，请刷新后重试。')
const systems = new Set(['shop', 'erp', 'product-hub', 'geo', 'visa', 'web'])

async function request(route: string, signal: AbortSignal, body?: unknown): Promise<Record<string, unknown>> {
  signal.throwIfAborted()
  let response: Response
  try { response = await diagnosticFetch('/_futurestaff/agents/' + route, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-futurestaff-agent': '1', 'content-type': 'application/json' }, cache: 'no-store', signal,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, { ignoreStatuses: [409] }) }
  catch { signal.throwIfAborted(); throw new PublishedTalentFailure('平台智能体连接暂不可用，请刷新后重试。') }
  let data: unknown
  try { data = await diagnosticJson(response) } catch {
    if (response.status === 409 && !signal.aborted) reportClientDiagnostic({ category: 'network', operation: 'discovery', code: 'HTTP_ERROR', httpStatus: 409 })
    throw invalid()
  }
  signal.throwIfAborted()
  if (!response.ok) {
    if (record(data) && data.error === 'AGENT_PERMISSION_CONFIRMATION_REQUIRED' && Array.isArray(data.capabilities)
      && data.capabilities.length <= 20 && data.capabilities.every(value => text(value, 100) && /^[a-z][a-z0-9_.-]*$/.test(value))) {
      throw new PublishedCapabilityConfirmation([...new Set(data.capabilities)] as string[])
    }
    // Capability confirmation is an expected business branch. Other 409s are
    // failed operations and are reported after that branch is excluded.
    if (response.status === 409) reportClientDiagnostic({ category: 'network', operation: 'discovery', code: 'HTTP_ERROR', httpStatus: 409 })
    const messages: Record<string, string> = {
      AGENT_DISTRIBUTION_UPGRADE_REQUIRED: '平台发布服务暂不可用，请稍后刷新目录。',
      AGENT_RELEASE_CHANGED: '平台版本已更新，请刷新目录后重试。',
      AGENT_PACKAGE_INTEGRITY: '安装文件校验失败，请重新下载。',
      AGENT_NOT_INSTALLED: '此智能体尚未安装，请先下载并安装。',
      AGENT_UNAVAILABLE: '此智能体暂不可用，请检查平台连接与使用权限。',
    }
    throw new PublishedTalentFailure(record(data) && typeof data.error === 'string' ? messages[data.error] ?? '平台智能体操作未完成，请刷新后重试。' : '平台智能体操作未完成，请刷新后重试。')
  }
  if (!record(data)) throw invalid()
  return data
}

function decodeCard(value: unknown): PublishedTalent {
  if (!record(value) || typeof value.agentId !== 'string' || !uuid.test(value.agentId)
    || !text(value.name, 200) || !value.name.trim() || !text(value.description, 2000) || !version(value.version) || value.sha256 !== value.version
    || !Number.isInteger(value.bytes) || Number(value.bytes) < 0 || Number(value.bytes) > 2 * 1024 * 1024
    || !text(value.notes, 2000) || typeof value.available !== 'boolean'
    || !(value.unavailableReason === null || text(value.unavailableReason, 2000))
    || !(value.publishedAt === null || text(value.publishedAt, 128))
    || !(value.installedVersion === null || version(value.installedVersion))
    || !Array.isArray(value.versions) || value.versions.length > 1000 || !value.versions.every(version)
    || new Set(value.versions).size !== value.versions.length || typeof value.updateAvailable !== 'boolean'
    || (value.installedVersion !== null && !value.versions.includes(value.installedVersion))
    || (value.installedVersion === null && value.updateAvailable)
    || (value.bytes === 0 && (value.installedVersion === null || value.available))
    || !record(value.requirements) || Object.keys(value.requirements).sort().join() !== 'capabilities,minClientVersion'
    || !text(value.requirements.minClientVersion, 32) || !/^\d+\.\d+\.\d+$/.test(value.requirements.minClientVersion)
    || !Array.isArray(value.requirements.capabilities) || value.requirements.capabilities.length > 20
    || !value.requirements.capabilities.every(cap => text(cap, 100) && /^[a-z][a-z0-9_.-]*$/.test(cap))
    || new Set(value.requirements.capabilities).size !== value.requirements.capabilities.length
    || (value.category !== undefined && !text(value.category, 120))
    || (value.classificationKnown !== undefined && typeof value.classificationKnown !== 'boolean')
    || (value.classificationKnown === true && !Array.isArray(value.businessSystems))
    || (value.requiredApplications !== undefined && (!Array.isArray(value.requiredApplications) || new Set(value.requiredApplications).size !== value.requiredApplications.length
      || value.requiredApplications.some(id=>!talentApplicationIds.includes(id as typeof talentApplicationIds[number]))))
    || (value.businessSystems !== undefined && (!Array.isArray(value.businessSystems) || value.businessSystems.length > systems.size
      || value.businessSystems.some(item => typeof item !== 'string' || !systems.has(item)) || new Set(value.businessSystems).size !== value.businessSystems.length))) throw invalid()
  return { agentId: value.agentId.toLowerCase(), name: value.name, description: value.description, version: value.version,
    sha256: value.sha256, bytes: Number(value.bytes), notes: value.notes, available: value.available,
    unavailableReason: value.unavailableReason as string | null, publishedAt: value.publishedAt as string | null,
    requirements: { minClientVersion: value.requirements.minClientVersion, capabilities: [...value.requirements.capabilities] as string[] },
    installedVersion: value.installedVersion, versions: [...value.versions], updateAvailable: value.updateAvailable,
    ...(value.category === undefined ? {} : { category: value.category as string }),
    ...(value.classificationKnown === undefined ? {} : { classificationKnown: value.classificationKnown as boolean }),
    ...(value.requiredApplications === undefined ? {} : { requiredApplications: value.requiredApplications as string[] }),
    ...(value.businessSystems === undefined ? {} : { businessSystems: [...value.businessSystems] as string[] }) }
}
export async function loadPublishedTalents(signal: AbortSignal): Promise<PublishedTalent[]> {
  const data = await request('distribution', signal)
  if (!Array.isArray(data.items) || data.items.length > 200) throw invalid()
  const ids = new Set<string>()
  return data.items.map(value => { const card = decodeCard(value); if (ids.has(card.agentId)) throw invalid(); ids.add(card.agentId); return card })
}
export async function mutatePublishedTalent(route: 'install' | 'rollback' | 'uninstall', card: PublishedTalent,
  signal: AbortSignal, selectedVersion?: string, confirmCapabilities = false): Promise<void> {
  if (!['install', 'rollback', 'uninstall'].includes(route) || !uuid.test(card.agentId)) throw invalid()
  if (route !== 'uninstall' && !card.available) throw new PublishedTalentFailure('此智能体暂不可用。')
  const target = selectedVersion ?? card.version
  if (route !== 'uninstall' && (!version(target) || (route === 'rollback' && !card.versions.includes(target)))) throw invalid()
  await request(route, signal, { agentId: card.agentId, ...(route === 'uninstall' ? {} : { version: target }),
    ...(confirmCapabilities ? { confirmCapabilities: true } : {}) })
  signal.throwIfAborted()
  notifyInstalledTalentsChanged()
}
