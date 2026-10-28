import { describe, expect, it, vi } from 'vitest'
import {
  DesktopRuntimeDiagnosticChannel,
  type DesktopRuntimeDiagnostic,
  type DesktopRuntimeDiagnosticCode,
} from '../src/runtime-diagnostics.ts'

describe('Host-only runtime diagnostics', () => {
  it('delivers only immutable fixed metadata and rejects unknown runtime input', () => {
    const channel = new DesktopRuntimeDiagnosticChannel()
    const received: DesktopRuntimeDiagnostic[] = []
    channel.subscribe(event => { received.push(event) })
    channel.report('NATIVE_RENDERER_PROCESS_GONE')
    channel.report('private path and token' as DesktopRuntimeDiagnosticCode)
    channel.report({ code: 'NATIVE_RENDERER_PROCESS_GONE', message: 'private value' } as unknown as DesktopRuntimeDiagnosticCode)
    expect(received).toEqual([{
      code: 'NATIVE_RENDERER_PROCESS_GONE', category: 'crash', operation: 'runtime', severity: 'fatal',
    }])
    expect(Object.isFrozen(received[0])).toBe(true)
  })

  it('keeps at most sixteen early observations and drains them only to the first subscriber', () => {
    const channel = new DesktopRuntimeDiagnosticChannel()
    channel.report('PREVIOUS_RUN_ABNORMAL')
    for (let index = 0; index < 16; index++) channel.report('NATIVE_RENDERER_LOAD_FAILED')
    const first = vi.fn(), nextProfile = vi.fn()
    const release = channel.subscribe(first)
    expect(first).toHaveBeenCalledTimes(16)
    expect(first.mock.calls.every(([event]) => event.code === 'NATIVE_RENDERER_LOAD_FAILED')).toBe(true)
    release()
    channel.report('NATIVE_RENDERER_PROCESS_GONE')
    channel.subscribe(nextProfile)
    expect(nextProfile).not.toHaveBeenCalled()
    channel.report('PREVIOUS_RUN_ABNORMAL')
    expect(nextProfile).toHaveBeenCalledExactlyOnceWith({
      code: 'PREVIOUS_RUN_ABNORMAL', category: 'crash', operation: 'bootstrap', severity: 'error',
    })
    expect(first).toHaveBeenCalledTimes(16)
  })

  it('isolates throwing subscribers and supports idempotent unsubscribe', () => {
    const channel = new DesktopRuntimeDiagnosticChannel()
    const broken = vi.fn(() => { throw Error('private subscriber detail') })
    const healthy = vi.fn()
    const release = channel.subscribe(broken)
    channel.subscribe(healthy)
    expect(() => channel.report('NATIVE_RENDERER_BOOT_FAILED')).not.toThrow()
    expect(healthy).toHaveBeenCalledExactlyOnceWith({
      code: 'NATIVE_RENDERER_BOOT_FAILED', category: 'system', operation: 'bootstrap', severity: 'fatal',
    })
    release(); release()
    channel.report('NATIVE_RENDERER_LOAD_FAILED')
    expect(broken).toHaveBeenCalledOnce()
    expect(healthy).toHaveBeenCalledTimes(2)
  })

  it('contains asynchronous subscriber failures without raising an unhandled rejection', async () => {
    const channel = new DesktopRuntimeDiagnosticChannel()
    channel.subscribe(async () => { throw Error('private async subscriber detail') })
    const healthy = vi.fn()
    channel.subscribe(healthy)
    channel.report('NATIVE_RENDERER_PROCESS_GONE')
    await new Promise(resolve => setImmediate(resolve))
    expect(healthy).toHaveBeenCalledOnce()
  })
})
