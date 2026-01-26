import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BlobServiceClient } from '@azure/storage-blob'

export const dynamic = 'force-dynamic'

function getAzureBlobClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined')
  }
  return BlobServiceClient.fromConnectionString(connectionString)
}

function parseAzureUrl(url: string): { containerName: string; blobName: string } | null {
  try {
    const u = new URL(url)
    const parts = u.pathname.replace(/^\/+/, '').split('/')
    if (parts.length < 2) return null
    const containerName = parts[0]
    const blobName = parts.slice(1).join('/')
    return { containerName, blobName }
  } catch {
    return null
  }
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') {
    return null
  }
  return session
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const missing = await prisma.media.count({
    where: { fileSize: null, isDeleted: false },
  })

  return NextResponse.json({ missing })
}

export async function POST(request: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

  const blobServiceClient = getAzureBlobClient()

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

      const parsed = parseAzureUrl(row.url)
      if (!parsed) {
        errors.push(`${row.id}: invalid url`)
        continue
      }

      try {
        const containerClient = blobServiceClient.getContainerClient(parsed.containerName)
        const blobClient = containerClient.getBlobClient(parsed.blobName)
        const props = await blobClient.getProperties()
        const size = props.contentLength

        if (typeof size === 'number' && Number.isFinite(size) && size >= 0) {
          await prisma.media.update({
            where: { id: row.id },
            data: { fileSize: Math.trunc(size) },
          })
          updated++
        } else {
          errors.push(`${row.id}: missing contentLength`)
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

