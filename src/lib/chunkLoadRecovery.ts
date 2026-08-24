const RELOAD_KEY = 'amt_chunk_load_reload'
const CLEAR_AFTER_MS = 10_000

declare global {
  interface Window {
    __AMT_CHUNK_RECOVERY__?: boolean
  }
}

export function isChunkLoadFailure(
  message?: string | null,
  name?: string | null,
  filename?: string | null,
): boolean {
  const text = `${message ?? ''} ${name ?? ''} ${filename ?? ''}`
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk [\w.-]+ failed/i.test(text) ||
    /Loading CSS chunk [\w.-]+ failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /error loading dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text)
  )
}

function alreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_KEY) === '1'
  } catch {
    return true
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, '1')
  } catch {
    // ignore
  }
}

function clearReloadedFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    // ignore
  }
}

/** One-shot hard reload when a Next.js chunk is missing after deploy. */
export function recoverFromStaleChunk(): void {
  if (typeof window === 'undefined' || alreadyReloaded()) return
  markReloaded()
  window.location.reload()
}

/** Install window listeners once (safe to call from multiple mounts). */
export function installChunkLoadRecovery(): void {
  if (typeof window === 'undefined' || window.__AMT_CHUNK_RECOVERY__) return
  window.__AMT_CHUNK_RECOVERY__ = true

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
        const src =
          (target as HTMLScriptElement).src ||
          (target as HTMLLinkElement).href ||
          ''
        if (/\/_next\/static\//.test(src)) {
          recoverFromStaleChunk()
          return
        }
      }

      const err = event.error
      if (
        isChunkLoadFailure(
          event.message || err?.message,
          err?.name,
          event.filename,
        )
      ) {
        recoverFromStaleChunk()
      }
    },
    true,
  )

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message =
      typeof reason === 'string'
        ? reason
        : reason && typeof reason === 'object' && 'message' in reason
          ? String((reason as { message?: unknown }).message ?? '')
          : String(reason ?? '')
    const name =
      reason && typeof reason === 'object' && 'name' in reason
        ? String((reason as { name?: unknown }).name ?? '')
        : ''
    if (isChunkLoadFailure(message, name)) {
      recoverFromStaleChunk()
    }
  })

  window.addEventListener('load', () => {
    window.setTimeout(clearReloadedFlag, CLEAR_AFTER_MS)
  })
}
