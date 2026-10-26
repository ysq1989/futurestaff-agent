import {createContext, useContext, useId, type ButtonHTMLAttributes, type ReactNode} from 'react'
import type {Context} from '@deepseek-ai/cordis'

export type MessageCardStatus = 'loading' | 'ready' | 'pending' | 'running' | 'succeeded' | 'failed' | 'expired' | 'unconfirmed' | 'readonly'

const statusLabels: Record<MessageCardStatus, string> = {
  loading: '正在读取', ready: '已读取', pending: '待确认', running: '执行中',
  succeeded: '已完成', failed: '未完成', expired: '已过期', unconfirmed: '结果待核实', readonly: '历史记录',
}
const CardBusy = createContext(false)

export interface MessageCardProps {
  title: string
  eyebrow?: string
  status?: MessageCardStatus
  statusLabel?: string
  description?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  className?: string
  busy?: boolean
  ariaLabel?: string
}

/** Trusted adapters own data and actions; rendering or replaying a card performs no business operation. */
export function MessageCard({title, eyebrow, status = 'ready', statusLabel, description, children, actions, footer, className = '', busy = false, ariaLabel}: MessageCardProps) {
  const titleId = useId()
  const pending = busy || status === 'loading' || status === 'running'
  return <CardBusy.Provider value={pending}>
    <section className={`fs-message-card ${className}`} data-message-card="true" data-status={status}
      aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : titleId} aria-busy={pending}>
      <header className="fs-message-card__header">
        <div className="fs-message-card__heading">
          {eyebrow && <span className="fs-message-card__eyebrow">{eyebrow}</span>}
          <h3 id={titleId}>{title}</h3>
        </div>
        <span className="fs-message-card__status" role="status" aria-live="polite">
          <span aria-hidden="true">{status === 'succeeded' ? '✓' : status === 'failed' || status === 'unconfirmed' ? '!' : pending ? '…' : '•'}</span>
          {statusLabel ?? statusLabels[status]}
        </span>
      </header>
      {description && <div className="fs-message-card__description">{description}</div>}
      {children && <div className="fs-message-card__content">{children}</div>}
      {actions && <div className="fs-message-card__actions">{actions}</div>}
      {footer && <div className="fs-message-card__footer">{footer}</div>}
    </section>
  </CardBusy.Provider>
}

export interface MessageCardActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet'
  /** Only explicit actions such as cancellation may remain available during owned work. */
  allowWhileBusy?: boolean
}

export function MessageCardAction({variant = 'secondary', allowWhileBusy = false, disabled, className = '', type = 'button', ...props}: MessageCardActionProps) {
  const busy = useContext(CardBusy)
  return <button {...props} type={type} className={`fs-message-card-action fs-message-card-action--${variant} ${className}`}
    disabled={disabled || (busy && !allowWhileBusy)}/>
}

export function MessageCardNotice({kind = 'info', children}: {kind?: 'info' | 'success' | 'warning' | 'error'; children?: ReactNode}) {
  return <div className="fs-message-card-notice" data-kind={kind} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export const messageCardCss = `
.fs-message-card{min-width:0;max-width:100%;margin:14px 0;color:var(--text-primary);background:var(--bg-primary);border:1px solid var(--border-default);border-radius:10px;overflow:hidden;font-size:14px;line-height:1.6;text-align:left}
.fs-message-card *{box-sizing:border-box}.fs-message-card__header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border-default)}
.fs-message-card__heading{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;min-width:0}.fs-message-card__heading h3{margin:0;font-size:15px;font-weight:650;line-height:1.5;overflow-wrap:anywhere}.fs-message-card__eyebrow{color:var(--text-secondary);font-size:11px;font-weight:600}
.fs-message-card__status{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;max-width:55%;padding:3px 8px;border-radius:6px;background:var(--bg-tertiary);color:var(--text-secondary);font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.fs-message-card[data-status=pending]>.fs-message-card__header .fs-message-card__status,.fs-message-card[data-status=unconfirmed]>.fs-message-card__header .fs-message-card__status{color:var(--warning);background:color-mix(in srgb,var(--warning) 9%,var(--bg-primary))}
.fs-message-card[data-status=running]>.fs-message-card__header .fs-message-card__status{color:var(--accent-primary);background:color-mix(in srgb,var(--accent-primary) 8%,var(--bg-primary))}
.fs-message-card[data-status=succeeded]>.fs-message-card__header .fs-message-card__status{color:var(--success);background:color-mix(in srgb,var(--success) 8%,var(--bg-primary))}
.fs-message-card[data-status=failed]>.fs-message-card__header .fs-message-card__status{color:var(--error);background:color-mix(in srgb,var(--error) 8%,var(--bg-primary))}
.fs-message-card__description,.fs-message-card__content{padding:14px 18px 0;min-width:0;overflow-wrap:anywhere}.fs-message-card__description{color:var(--text-secondary);font-size:13px}.fs-message-card__content:last-child,.fs-message-card__description:last-child{padding-bottom:16px}
.fs-message-card__content>p:first-child{margin-top:0}.fs-message-card__content>p:last-child{margin-bottom:0}.fs-message-card__content dl{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fs-message-card__content dt{font-size:12px;color:var(--text-secondary)}.fs-message-card__content dd{margin:3px 0 0;overflow-wrap:anywhere}
.fs-message-card__actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:16px 18px}.fs-message-card__footer{padding:12px 18px;border-top:1px solid var(--border-default);color:var(--text-secondary);font-size:12px}
.fs-message-card-action{display:inline-flex;justify-content:center;align-items:center;gap:6px;min-height:38px;max-width:100%;padding:8px 13px;border:1px solid var(--border-default);border-radius:7px;background:var(--bg-primary);color:var(--text-primary);font:inherit;font-size:13px;line-height:1.5;text-align:center;white-space:normal;overflow-wrap:anywhere;cursor:pointer}
.fs-message-card-action:hover:not(:disabled){background:var(--bg-hover)}.fs-message-card-action--primary{background:var(--fs-button-start,var(--accent-primary));border-color:var(--fs-button-start,var(--accent-primary));color:var(--fs-on-accent);font-weight:600}.fs-message-card-action--primary:hover:not(:disabled){background:var(--fs-button-end,var(--accent-hover));border-color:var(--fs-button-end,var(--accent-hover))}.fs-message-card-action--quiet{background:transparent;border-color:transparent;color:var(--text-secondary)}
.fs-message-card-action:disabled{opacity:.55;cursor:default}.fs-message-card-action:focus-visible{outline:2px solid var(--accent-primary);outline-offset:3px}
.fs-message-card-notice{padding:9px 11px;border-radius:6px;background:var(--bg-tertiary);color:var(--text-secondary);font-size:13px;overflow-wrap:anywhere}.fs-message-card-notice[data-kind=warning]{color:var(--warning)}.fs-message-card-notice[data-kind=error]{color:var(--error)}.fs-message-card-notice[data-kind=success]{color:var(--success)}
@media(max-width:560px){.fs-message-card__header{padding:13px 14px;gap:8px}.fs-message-card__description,.fs-message-card__content{padding:12px 14px 0}.fs-message-card__actions{padding:14px;align-items:stretch}.fs-message-card__actions>.fs-message-card-action{flex:1 1 140px;min-height:44px}.fs-message-card__footer{padding:11px 14px}.fs-message-card__content dl{grid-template-columns:1fr}.fs-message-card__status{max-width:52%}}
`

/** Install once from the owning client plugin; standalone adapters may register the same scoped effect. */
export function installMessageCardStyles(ctx: Pick<Context, 'effect'>): void {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.futurestaffMessageCards = 'true'
    style.textContent = messageCardCss
    document.head.append(style)
    return () => style.remove()
  })
}
