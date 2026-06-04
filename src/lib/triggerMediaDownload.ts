/** Parse filename from Content-Disposition (attachment). */
function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null
  const star = header.match(/filename\*=UTF-8''([^;\s]+)/i)
  if (star) {
    try {
      return decodeURIComponent(star[1])
    } catch {
      return star[1]
    }
  }
  const basic = header.match(/filename="([^"]+)"/i) ?? header.match(/filename=([^;\s]+)/i)
  return basic?.[1]?.trim() ?? null
}

function saveBlobAsFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Hidden iframe — triggers SAS attachment download without opening a video player tab. */
function triggerUrlDownload(url: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.title = 'download'
  iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden'
  iframe.src = url
  document.body.appendChild(iframe)
  window.setTimeout(() => iframe.remove(), 120000)
}

const CLIENT_DOWNLOAD_HEADER = 'X-AiMT-Download-Client'

/**
 * Download media via /api/download without opening a blank tab that shows a black video player.
 * Guests receive a watermarked blob; logged-in users get a SAS URL in JSON (fetch cannot read 302 Location).
 */
export async function triggerMediaDownload(mediaId: string): Promise<void> {
  const res = await fetch(`/api/download/${mediaId}`, {
    credentials: 'include',
    headers: { [CLIENT_DOWNLOAD_HEADER]: '1' },
  })

  const contentType = res.headers.get('Content-Type') ?? ''

  if (!res.ok) {
    let message = 'Download failed'
    if (contentType.includes('application/json')) {
      try {
        const data = (await res.json()) as { error?: string }
        if (data?.error) message = data.error
      } catch {
        /* ignore */
      }
    }
    throw new Error(message)
  }

  if (contentType.includes('application/json')) {
    const data = (await res.json()) as { downloadUrl?: string; fileName?: string; error?: string }
    if (!data.downloadUrl) {
      throw new Error(data.error || 'Download failed')
    }
    triggerUrlDownload(data.downloadUrl)
    return
  }

  const blob = await res.blob()
  const fileName =
    parseContentDispositionFilename(res.headers.get('Content-Disposition')) ??
    `media-${mediaId}.mp4`
  saveBlobAsFile(blob, fileName)
}
