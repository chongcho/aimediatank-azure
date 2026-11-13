/** Client helper: abortable fetch that times out so UI does not stick on "Sending…". */

/** Client ceiling; verification email APIs return after ACS accept (usually seconds). */
export const DEFAULT_SEND_TIMEOUT_MS = 90_000

export type AbortableTimedFetchHandle = {
  signal: AbortSignal
  /** Abort without treating as a send timeout (method switch / verify click). */
  abort: () => void
  clear: () => void
  /** True when abort was caused by the timeout timer. */
  didTimeout: () => boolean
}

export function createAbortableTimedFetch(
  timeoutMs: number = DEFAULT_SEND_TIMEOUT_MS
): AbortableTimedFetchHandle {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const clear = () => {
    clearTimeout(timer)
  }

  return {
    signal: controller.signal,
    abort: () => {
      clear()
      if (!controller.signal.aborted) controller.abort()
    },
    clear,
    didTimeout: () => timedOut,
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}
