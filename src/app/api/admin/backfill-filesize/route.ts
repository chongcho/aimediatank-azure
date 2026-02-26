import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAdminReauthFromRequest } from '@/lib/adminReauthCookie'
import { BlobServiceClient } from '@azure/storage-blob'

export const dynamic = 'force-dynamic'

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

  // 1) Full URL (typical): https://<acct>.blob.core.windows.net/<container>/<blob>
  // 2) CDN/custom domain URL (sometimes): https://cdn.example.com/<blob> (no container segment)
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

  // Allow passing a blob name or path (e.g. "uuid.mp4", "/media/uuid.mp4", "media/uuid.mp4", "uploads/uuid.mp4")
  const noQuery = raw.split('?')[0]
  const path = noQuery.replace(/^\/+/, '')
  if (!path) return null
  const parts = path.split('/').filter(Boolean)

  // Only treat first segment as container if it matches our expected container name.
  if (parts.length >= 2 && parts[0] && parts[0].toLowerCase() === containerFromEnv.toLowerCase()) {
    return { containerName: parts[0], blobName: parts.slice(1).join('/') }
  }

  return { containerName: containerFromEnv, blobName: parts.join('/') }
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') {
    return null
  }
  return session
}

export async function GET(request: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const reauth = getAdminReauthFromRequest(request)
  if (!reauth || reauth.userId !== session.user.id) {
    return NextResponse.json({ error: 'Re-authentication required' }, { status: 403 })
  }

  const missing = await prisma.media.count({
    where: { fileSize: null, isDeleted: false },
  })

  return NextResponse.json({ missing })
}

export async function POST(request: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const reauth = getAdminReauthFromRequest(request)
  if (!reauth || reauth.userId !== session.user.id) {
    return NextResponse.json({ error: 'Re-authentication required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '200', 10) || 200))

  const rows = await prisma.media.findMany({
    where: {
      fileSize: null,
      isDeleted: false,
      url: { not: '' },
    },
    select: { id: true, url: true },
    take: limit,
    orderBy: { createdAt: 'desc' },
  })

  let blobServiceClient: BlobServiceClient | null = null
  try {
    blobServiceClient = getAzureBlobClient()
  } catch (e) {
    // We'll still attempt a HEAD-based fallback per-row (works when URLs are publicly reachable).
    console.error('Azure client unavailable for filesize backfill:', e)
  }

  let scanned = 0
  let updated = 0
  const errors: string[] = []

  const concurrency = 10
  let i = 0

  async function worker() {
    while (true) {
      const idx = i++
      if (idx >= rows.length) return

      const row = rows[idx]
      scanned++

      try {
        let size: number | null = null

        // Prefer Azure SDK when available (works even if URL is behind a custom domain).
        if (blobServiceClient) {
          const parsed = parseAzureUrl(row.url)
          if (parsed) {
            const containerClient = blobServiceClient.getContainerClient(parsed.containerName)
            const blobClient = containerClient.getBlobClient(parsed.blobName)
            const props = await blobClient.getProperties()
            if (typeof props.contentLength === 'number' && Number.isFinite(props.contentLength) && props.contentLength >= 0) {
              size = props.contentLength
            }
          }
        }

        // Fallback: HEAD request against the stored URL (works if URL is publicly reachable).
        if (size === null) {
          size = await tryGetSizeViaHead(row.url)
        }

        if (typeof size === 'number' && Number.isFinite(size) && size >= 0) {
          // Use raw SQL to avoid Prisma client type drift in some environments
          await prisma.$executeRaw`
            UPDATE "Media"
            SET "fileSize" = ${BigInt(Math.trunc(size))}
            WHERE "id" = ${row.id}
          `
          updated++
        } else {
          errors.push(`${row.id}: could not resolve size`)
        }
      } catch (e) {
        errors.push(`${row.id}: ${(e as Error).message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  return NextResponse.json({
    scanned,
    updated,
    errors: errors.length ? errors.slice(0, 50) : undefined,
  })
}

