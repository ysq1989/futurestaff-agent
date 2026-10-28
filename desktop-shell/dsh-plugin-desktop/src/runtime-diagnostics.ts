/** Fixed native failure observations for trusted Host subscribers only. */
export type DesktopRuntimeDiagnosticCode =
  | 'PREVIOUS_RUN_ABNORMAL'
  | 'NATIVE_RENDERER_PROCESS_GONE'
  | 'NATIVE_RENDERER_LOAD_FAILED'
  | 'NATIVE_RENDERER_BOOT_FAILED'

/** No native exception, URL, dump, path or renderer data crosses this channel. */
export interface DesktopRuntimeDiagnostic {
  readonly code: DesktopRuntimeDiagnosticCode
  readonly category: 'crash' | 'system'
  readonly operation: 'runtime' | 'bootstrap'
  readonly severity: 'error' | 'fatal'
}

const observations = new Map<DesktopRuntimeDiagnosticCode, DesktopRuntimeDiagnostic>([
  ['PREVIOUS_RUN_ABNORMAL', Object.freeze({ code: 'PREVIOUS_RUN_ABNORMAL', category: 'crash', operation: 'bootstrap', severity: 'error' })],
  ['NATIVE_RENDERER_PROCESS_GONE', Object.freeze({ code: 'NATIVE_RENDERER_PROCESS_GONE', category: 'crash', operation: 'runtime', severity: 'fatal' })],
  ['NATIVE_RENDERER_LOAD_FAILED', Object.freeze({ code: 'NATIVE_RENDERER_LOAD_FAILED', category: 'system', operation: 'runtime', severity: 'error' })],
  ['NATIVE_RENDERER_BOOT_FAILED', Object.freeze({ code: 'NATIVE_RENDERER_BOOT_FAILED', category: 'system', operation: 'bootstrap', severity: 'fatal' })],
])

/** Buffer startup observations once; a later profile never receives consumed history. */
export class DesktopRuntimeDiagnosticChannel {
  private readonly listeners = new Set<(event: DesktopRuntimeDiagnostic) => void>()
  private readonly early: DesktopRuntimeDiagnostic[] = []
  private subscribed = false

  report(code: DesktopRuntimeDiagnosticCode): void {
    if (typeof code !== 'string') return
    const event = observations.get(code)
    if (event === undefined) return
    if (!this.subscribed) {
      this.early.push(event)
      if (this.early.length > 16) this.early.shift()
      return
    }
    for (const listener of [...this.listeners]) this.deliver(listener, event)
  }

  subscribe(listener: (event: DesktopRuntimeDiagnostic) => void): () => void {
    this.listeners.add(listener)
    if (!this.subscribed) {
      this.subscribed = true
      const early = this.early.splice(0)
      for (const event of early) this.deliver(listener, event)
    }
    return () => { this.listeners.delete(listener) }
  }

  private deliver(listener: (event: DesktopRuntimeDiagnostic) => void, event: DesktopRuntimeDiagnostic): void {
    try {
      void Promise.resolve(listener(event)).catch(() => {})
    } catch { /* Observability cannot change native recovery or exit. */ }
  }
}
