import { BlobServiceClient } from '@azure/storage-blob'
import { MAX_UPLOAD_FILE_BYTES, UPLOAD_FILE_SIZE_EXCEEDED_MESSAGE } from '@/lib/uploadPlanConfig'

function getAzureBlobClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined')
  }
  return BlobServiceClient.fromConnectionString(connectionString)
}

async function tryGetSizeViaHead(url: string): Promise<number | null> {
  const raw = (url || '').trim()
  if (!raw) return null
  try {
    const res = await fetch(raw, { method: 'HEAD', redirect: 'follow' })
    if (!res.ok) return null
    const cl = res.headers.get('content-length')
    if (!cl) return null
    const n = Number(cl)
    if (!Number.isFinite(n) || n < 0) return null
    return n
  } catch {
    return null
  }
}

function parseAzureUrl(input: string): { containerName: string; blobName: string } | null {
  const containerFromEnv = process.env.AZURE_STORAGE_CONTAINER_NAME || 'media'
  const raw = (input || '').trim()
  if (!raw) return null

  try {
    const u = new URL(raw)
    const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
    if (parts.length >= 2) {
      return { containerName: parts[0], blobName: parts.slice(1).join('/') }
    }
    if (parts.length === 1) {
      return { containerName: containerFromEnv, blobName: parts[0] }
    }
    return null
  } catch {
    // Not a URL: fall through
  }

  const noQuery = raw.split('?')[0]
  const path = noQuery.replace(/^\/+/, '')
  if (!path) return null
  const parts = path.split('/').filter(Boolean)

  if (parts.length >= 2 && parts[0] && parts[0].toLowerCase() === containerFromEnv.toLowerCase()) {
    return { containerName: parts[0], blobName: parts.slice(1).join('/') }
  }

  return { containerName: containerFromEnv, blobName: parts.join('/') }
}

/** Best-effort byte length for a blob already in our Azure account (or HEAD if public). */
export async function getUploadedBlobByteLength(blobUrl: string): Promise<number | null> {
  const raw = (blobUrl || '').trim()
  if (!raw) return null

  try {
    const parsed = parseAzureUrl(raw)
    if (parsed) {
      const blobServiceClient = getAzureBlobClient()
      const containerClient = blobServiceClient.getContainerClient(parsed.containerName)
      const blobClient = containerClient.getBlobClient(parsed.blobName)
      const props = await blobClient.getProperties()
      if (
        typeof props.contentLength === 'number' &&
        Number.isFinite(props.contentLength) &&
        props.contentLength >= 0
      ) {
        return props.contentLength
      }
    }
  } catch (e) {
    console.error('getUploadedBlobByteLength SDK failed:', e)
  }

  return tryGetSizeViaHead(raw)
}

/** When length is known and over limit, return an error message; otherwise null. */
export async function uploadBlobExceedsLimitMessage(blobUrl: string | null | undefined): Promise<string | null> {
  if (!blobUrl?.trim()) return null
  const len = await getUploadedBlobByteLength(blobUrl.trim())
  if (len === null || !Number.isFinite(len)) return null
  if (len <= MAX_UPLOAD_FILE_BYTES) return null
  return UPLOAD_FILE_SIZE_EXCEEDED_MESSAGE
}
