import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BlobServiceClient } from '@azure/storage-blob'

export const dynamic = 'force-dynamic'

const LEGACY_HEIGHTS = [144, 240, 360]

function getBlobClient() {
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!cs) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set')
  return BlobServiceClient.fromConnectionString(cs)
}

function parseBlobUrl(url: string): { containerName: string; blobName: string } | null {
  try {
    const u = new URL(url)
    const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
    if (parts.length >= 2) return { containerName: parts[0], blobName: parts.slice(1).join('/') }
    const container = process.env.AZURE_STORAGE_CONTAINER_NAME || 'media'
    if (parts.length === 1) return { containerName: container, blobName: parts[0] }
    return null
  } catch {
    return null
  }
}

async function deleteBlobIfExists(blobUrl: string): Promise<boolean> {
  const parsed = parseBlobUrl(blobUrl)
  if (!parsed) return false
  try {
    const client = getBlobClient()
    const container = client.getContainerClient(parsed.containerName)
    const blob = container.getBlobClient(parsed.blobName)
    await blob.deleteIfExists()
    return true
  } catch {
    return false
  }
}

/**
 * POST: Delete all MediaVersion rows with height 144, 240, or 360 and their Azure blobs.
 * Admin only.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const legacy = await prisma.mediaVersion.findMany({
      where: { height: { in: LEGACY_HEIGHTS } },
      select: { id: true, url: true, label: true, height: true },
    })

    const errors: string[] = []
    let blobsDeleted = 0

    for (const v of legacy) {
      const ok = await deleteBlobIfExists(v.url)
      if (ok) blobsDeleted++
      else errors.push(`Blob delete failed: ${v.url}`)
      await prisma.mediaVersion.delete({ where: { id: v.id } })
    }

    return NextResponse.json({
      ok: true,
      versionsDeleted: legacy.length,
      blobsDeleted,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (e) {
    console.error('[cleanup-legacy-versions]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cleanup failed' },
      { status: 500 }
    )
  }
}
