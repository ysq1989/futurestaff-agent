import {useEffect, useRef, type ReactNode} from 'react'

export interface InteractionColumn {
  key: string
  label: string
  format?: (value: unknown, row: Record<string, unknown>) => ReactNode
}
/** Columns and handlers come from trusted business adapters, never generated markup. */
export function InteractionTable({rows, columns, onDetail, emptyText='当前范围内没有记录。'}: {
  rows: readonly Record<string, unknown>[]
  columns: readonly InteractionColumn[]
  onDetail?: (id: string) => void
  emptyText?: string
}) {
  if (!rows.length) return <p>{emptyText}</p>
  return <div className="fs-interaction-scroll"><table><thead><tr>
    {columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}{onDetail && <th scope="col">操作</th>}
  </tr></thead><tbody>{rows.slice(0,100).map((row,index) => <tr key={String(row.id ?? index)}>
    {columns.map(column => <td key={column.key}>{column.format ? column.format(row[column.key], row) : row[column.key] == null ? '—' : String(row[column.key])}</td>)}
    {onDetail && <td>{typeof row.id === 'string' && <button type="button" onClick={() => onDetail(row.id as string)}>查看详情</button>}</td>}
  </tr>)}</tbody></table></div>
}

export function InteractionWindow({title, children, onClose, busy=false, mode='sidebar', className=''}: {
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  mode?: 'sidebar' | 'dialog'
  className?: string
}) {
  const section=useRef<HTMLElement>(null), closingBlocked=useRef(busy)
  closingBlocked.current=busy
  useEffect(() => {
    const previous=document.activeElement as HTMLElement | null
    const root=section.current
    if (!root) return
    const focusables=() => [...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(element=>element.getClientRects().length>0)
    ;(focusables()[0] ?? root).focus()
    const keydown=(event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!closingBlocked.current) onClose(); return }
      if (event.key !== 'Tab') return
      const elements=focusables(), first=elements[0], last=elements.at(-1)
      if (!first || !last) { event.preventDefault(); root.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown',keydown)
    return () => { document.removeEventListener('keydown',keydown); if (previous?.isConnected) previous.focus() }
  },[onClose])
  return <div className={`fs-interaction-backdrop fs-interaction-${mode}`}>
    <section ref={section} tabIndex={-1} className={`fs-interaction-window ${className}`} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy}>
      <header><h2>{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="关闭业务窗口">关闭</button></header>{children}
    </section>
  </div>
}

export const interactionCss=`.fs-interaction-backdrop{position:fixed;inset:0;z-index:90;display:flex;justify-content:flex-end;background:color-mix(in srgb,var(--bg-primary) 65%,transparent)}.fs-interaction-window{color:var(--text-primary);background:var(--bg-secondary);border:1px solid var(--border-default);padding:18px;width:min(850px,100vw);height:100%;overflow:auto;border-radius:12px 0 0 12px}.fs-interaction-dialog{align-items:center;justify-content:center;padding:20px}.fs-interaction-dialog .fs-interaction-window{height:auto;max-height:90vh;border-radius:12px}.fs-interaction-window header{display:flex;justify-content:space-between;align-items:center;gap:16px}.fs-interaction-window button{padding:8px 12px;border:1px solid var(--border-default);border-radius:7px;background:var(--bg-tertiary);color:var(--text-primary);cursor:pointer}.fs-interaction-window button:disabled{opacity:.5;cursor:default}.fs-interaction-window :focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}.fs-interaction-scroll{overflow:auto}.fs-interaction-scroll table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:13px}.fs-interaction-scroll td,.fs-interaction-scroll th{padding:10px;border-bottom:1px solid var(--border-default);text-align:left}.fs-interaction-scroll th{background:var(--bg-tertiary)}`
