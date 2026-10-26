import { useEffect, useRef, useState } from 'react'
import { mutatePublishedTalent, PublishedCapabilityConfirmation, PublishedTalentFailure, type PublishedTalent } from './published-talents.js'

interface Confirmation { route: 'install' | 'rollback' | 'uninstall'; version?: string; capabilities?: string[] }
export interface PublishedTalentCardProps {
  card: PublishedTalent
  signal: AbortSignal
  disabled?: boolean
  onChanged(): void | Promise<void>
  onNewSession(): void | Promise<void>
  onStart?(card: PublishedTalent): void | Promise<void>
  beforeNewSession?(): void
}
const labels: Record<string, string> = { 'core.chat': '智能对话', 'local.files': '本地文件', 'video.production': '视频制作', 'geo.collection': 'GEO 网页采集' }
export function PublishedTalentCard({ card, signal, disabled = false, onChanged, onNewSession, onStart, beforeNewSession }: PublishedTalentCardProps) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const working = useRef(false)
  useEffect(() => { working.current = false; setBusy(false); setError(''); setConfirmation(null) }, [signal, card.agentId])
  const blocked = disabled || busy || signal.aborted
  const act = async (route: Confirmation['route'], selectedVersion?: string, confirmed = false) => {
    if (blocked || working.current) return
    working.current = true; setBusy(true); setError('')
    try {
      await mutatePublishedTalent(route, card, signal, selectedVersion, confirmed)
      signal.throwIfAborted(); setConfirmation(null); await onChanged()
    } catch (reason) {
      if (!signal.aborted) {
        if (reason instanceof PublishedCapabilityConfirmation) setConfirmation({ route,
          ...(selectedVersion === undefined ? {} : { version: selectedVersion }), capabilities: reason.capabilities })
        else setError(reason instanceof PublishedTalentFailure ? reason.message : '平台智能体操作未完成，请刷新后重试。')
      }
    } finally { if (!signal.aborted) { working.current = false; setBusy(false) } }
  }
  const start = async () => {
    if (blocked || working.current || !card.available || !card.installedVersion) return
    working.current = true; setBusy(true); setError('')
    try {
      beforeNewSession?.()
      await (onStart ? onStart(card) : onNewSession())
    } catch { if (!signal.aborted) setError('会话入口暂不可用，请重试。') }
    finally { if (!signal.aborted) { working.current = false; setBusy(false) } }
  }
  return <article className="fs-talent-card fs-published-talent-card" data-published-agent-id={card.agentId}>
    <div className="fs-talent-card-header">
      <span className="fs-talent-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="6" width="16" height="14" rx="4"/><path d="M12 3v3m-5 6h.01M17 12h.01M9 16h6M1 11v4m22-4v4" strokeLinecap="round"/></svg></span>
      <div className="fs-talent-heading"><h2>{card.name}</h2><span className="fs-agent-center-status" data-state={!card.available ? 'unavailable' : card.updateAvailable ? 'updates' : card.installedVersion ? 'installed' : 'available'}>{!card.available ? '暂不可用' : card.updateAvailable ? '可更新' : card.installedVersion ? '本机已安装' : '可安装'}</span></div>
    </div>
    <p className="fs-talent-description" title={card.description}>{card.description || '平台发布的智能体'}</p>
    {!card.available && <p>{card.unavailableReason || '平台已停用或撤销授权。'}</p>}
    {error && <p role="alert">{error}</p>}{busy && <p role="status">正在处理，请稍候…</p>}
    <div className="fs-agent-center-actions">
      {(!card.installedVersion || card.updateAvailable) && <button type="button" className="fs-agent-primary" disabled={blocked || !card.available} onClick={() => void act('install', card.version)}>{card.installedVersion ? '更新安装' : '下载并安装'}</button>}
      {card.installedVersion && <button type="button" className="fs-agent-primary" disabled={blocked || !card.available} onClick={() => void start()}>开始对话</button>}
    </div>
    <details className="fs-talent-details"><summary>智能体详情</summary>
      <p className="fs-agent-note">{card.description}</p>
      <small>平台版本 {card.version.slice(0, 12)}{card.installedVersion && ` · 本机 ${card.installedVersion.slice(0, 12)}`}</small>
      <p className="fs-agent-note">所需能力：{card.requirements.capabilities.map(cap => labels[cap] || cap).join('、') || '无额外能力要求'}</p>
      {card.notes && <p className="fs-agent-note">{card.notes}</p>}
      {card.installedVersion && card.versions.some(value => value !== card.installedVersion) && <label><small>切换到本机保留的版本</small>
      <select aria-label={`回滚${card.name}`} disabled={blocked || !card.available} value="" onChange={event => {
        if (event.target.value) setConfirmation({ route: 'rollback', version: event.target.value })
      }}><option value="">选择版本…</option>{card.versions.filter(value => value !== card.installedVersion).map(value => <option key={value} value={value}>{value.slice(0, 12)}</option>)}</select>
      </label>}
      {card.installedVersion && <button type="button" disabled={blocked} onClick={() => setConfirmation({ route: 'uninstall' })}>卸载</button>}
    </details>
    {confirmation && <div className="fs-agent-confirm">
      <p>{confirmation.capabilities ? '此版本增加了能力要求，请确认后继续。' : confirmation.route === 'uninstall'
        ? '卸载将停用本机安装，已有会话、工程和历史版本都会保留。' : '切换后新会话使用所选版本，已有会话继续使用原版本。'}</p>
      {confirmation.capabilities && <p>{confirmation.capabilities.map(cap => labels[cap] || cap).join('、')}</p>}
      <button type="button" disabled={blocked} onClick={() => void act(confirmation.route, confirmation.version, !!confirmation.capabilities)}>确认{confirmation.route === 'uninstall' ? '卸载' : '继续'}</button>
      <button type="button" disabled={blocked} onClick={() => setConfirmation(null)}>取消</button>
    </div>}
  </article>
}
