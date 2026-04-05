import { BlobServiceClient } from '@azure/storage-blob'

function getBlobServiceClient(): BlobServiceClient | null {
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!cs) return null
  return BlobServiceClient.fromConnectionString(cs)
}

function defaultContainerName() {
  return process.env.AZURE_STORAGE_CONTAINER_NAME || 'media'
}

/** Parse Azure blob URL → container + blob path (aligned with mediaProcessor) */
export function parseBlobUrl(url: string): { containerName: string; blobName: string } | null {
  try {
    const u = new URL(url)
    const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
    if (parts.length >= 2) return { containerName: parts[0], blobName: parts.slice(1).join('/') }
    if (parts.length === 1) return { containerName: defaultContainerName(), blobName: parts[0] }
    return null
  } catch {
    return null
  }
}

export function isHttpOrHttpsUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim())
}

/** Best-effort blob delete; logs on failure, no throw */
export async function deleteAzureBlobByUrlIfExists(blobUrl: string): Promise<void> {
  const parsed = parseBlobUrl(blobUrl)
  const client = getBlobServiceClient()
  if (!parsed || !client) {
    if (!client) console.warn('[azureBlobDelete] AZURE_STORAGE_CONNECTION_STRING missing; skip blob delete')
    return
  }
  try {
    const container = client.getContainerClient(parsed.containerName)
    const blob = container.getBlobClient(parsed.blobName)
    await blob.deleteIfExists()
  } catch (e) {
    console.error(`[azureBlobDelete] Failed to delete blob: ${blobUrl}`, e)
  }
}
