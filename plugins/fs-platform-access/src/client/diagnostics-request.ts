import { reportClientDiagnostic } from './diagnostics.js'

type RequestOperation = 'discovery' | 'system'
export interface DiagnosticFetchOptions {
  operation?: RequestOperation
  /** Compatibility responses the owning caller deliberately treats as normal. */
  ignoreStatuses?: readonly number[]
  fetcher?: typeof fetch
}

function cancelled(error: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return true
  try { return error !== null && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError' } catch { return false }
}

/** Observe one owned request without changing its response, retrying, or reading content. */
export async function diagnosticFetch(input: RequestInfo | URL, init?: RequestInit, options: DiagnosticFetchOptions = {}): Promise<Response> {
  const operation = options.operation === 'system' ? 'system' : 'discovery'
  const fetcher = options.fetcher ?? ((request, settings) => globalThis.fetch(request, settings))
  const signal = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined)
  let response: Response
  try { response = await fetcher(input, init) } catch (error) {
    if (!cancelled(error, signal)) reportClientDiagnostic({ category: 'network', operation, code: 'NETWORK_ERROR' })
    throw error
  }
  if (!response.ok && !signal?.aborted && !options.ignoreStatuses?.includes(response.status)) {
    reportClientDiagnostic({ category: 'network', operation, code: 'HTTP_ERROR', httpStatus: response.status })
  }
  return response
}

/** Preserve parser failures while reporting only their fixed contract category. */
export async function diagnosticJson(response: Response, operation: RequestOperation = 'discovery'): Promise<unknown> {
  try { return await response.json() } catch (error) {
    // A failed HTTP response was already reported by diagnosticFetch. Its error
    // body is allowed to have another format; avoid counting one failure twice.
    if (response.ok && !cancelled(error)) reportClientDiagnostic({ category: 'network', operation: operation === 'system' ? 'system' : 'discovery', code: 'CONTRACT_MISMATCH' })
    throw error
  }
}
