import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  createWatermarkedDownloadFile,
  guestWatermarkDiagnostics,
  watermarkedDownloadResponse,
} from '@/lib/downloadWatermark'
import {
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from '@azure/storage-blob'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Guest watermarks can take several minutes on large video; allow long serverless timeout where supported */
export const maxDuration = 600

/**
 * Parse Azure Storage connection string into its parts.
 */
function parseConnectionString(connectionString: string) {
  const parts = connectionString.split(';').reduce((acc, part) => {
    const [key, ...values] = part.split('=')
    acc[key] = values.join('=')
    return acc
  }, {} as Record<string, string>)
  return {
    accountName: parts['AccountName'] || '',
    accountKey: parts['AccountKey'] || '',
  }
}

/**
 * Generate a short-lived SAS URL with Content-Disposition: attachment so the
 * browser triggers a file save dialog instead of playing/displaying the file.
 */
function generateDownloadSasUrl(
  blobUrl: string,
  accountName: string,
  accountKey: string,
  fileName: string
): string | null {
  try {
    // Extract container and blob name from the URL
    // Format: https://<account>.blob.core.windows.net/<container>/<blobName>
    const url = new URL(blobUrl)
    const pathParts = url.pathname.split('/').filter(Boolean) // ['container', 'blobName']
    if (pathParts.length < 2) return null

    const containerName = pathParts[0]
    const blobName = pathParts.slice(1).join('/')

    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey)
    const startsOn = new Date()
    const expiresOn = new Date(startsOn.getTime() + 15 * 60 * 1000) // 15 minutes

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'), // read only
        startsOn,
        expiresOn,
        contentDisposition: `attachment; filename="${fileName}"`,
      },
      sharedKeyCredential
    ).toString()

    return `${blobUrl}?${sasToken}`
  } catch (e) {
    console.error('Failed to generate download SAS URL:', e)
    return null
  }
}

function resolveDownloadBlobUrl(
  media: {
    type: string
    url: string
    urlHq?: string | null
    versions?: { height: number; url: string }[]
  },
  opts: {
    isOwner: boolean
    hasPurchased: boolean
    freeDownloadMaxHeight: number
    paidQuality: string
  }
): string {
  const { isOwner, hasPurchased, freeDownloadMaxHeight, paidQuality } = opts
  const versions = media.versions || []

  if (media.type === 'VIDEO' && versions.length > 0) {
    if (isOwner || hasPurchased) {
      if (paidQuality === 'hq') {
        const bestVersion = versions[versions.length - 1]
        return media.urlHq ?? bestVersion?.url ?? media.url
      }
      if (paidQuality === '1080p') {
        const v = versions.find((v) => v.height === 1080)
        return v?.url ?? media.urlHq ?? media.url
      }
      const v = versions.find((v) => v.height === 720)
      return v?.url ?? media.url
    }
    const cap = Math.max(480, freeDownloadMaxHeight)
    const best = versions.filter((v) => v.height <= cap).pop()
    return best?.url ?? media.url
  }

  const useHq = (isOwner || hasPurchased) && media.urlHq
  return useHq ? media.urlHq! : media.url
}

function preferMp4ForVideo(
  media: { type: string; url: string; urlHq?: string | null; versions?: { url: string }[] },
  downloadBlobUrl: string
): string {
  if (media.type !== 'VIDEO') return downloadBlobUrl
  const isWebm = downloadBlobUrl.toLowerCase().includes('.webm')
  if (!isWebm) return downloadBlobUrl
  const urlHq = media.urlHq
  const versions = media.versions || []
  const mp4Version = versions.find((v) => v?.url && String(v.url).toLowerCase().includes('.mp4'))
  if (urlHq && urlHq.toLowerCase().includes('.mp4')) return urlHq
  if (mp4Version?.url) return mp4Version.url
  return downloadBlobUrl
}

function buildFileName(media: { title: string | null; type: string }, downloadBlobUrl: string): string {
  const rawExt = downloadBlobUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || ''
  const ext =
    media.type === 'VIDEO' && (rawExt === 'mp4' || downloadBlobUrl.toLowerCase().includes('.mp4'))
      ? 'mp4'
      : rawExt || 'mp4'
  const safeTitle = (media.title || 'download')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 80)
  return `${safeTitle}.${ext}`
}

function redirectToDownload(blobUrl: string, fileName: string): NextResponse {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (connectionString) {
    const { accountName, accountKey } = parseConnectionString(connectionString)
    if (accountName && accountKey) {
      const downloadUrl = generateDownloadSasUrl(blobUrl, accountName, accountKey, fileName)
      if (downloadUrl) return NextResponse.redirect(downloadUrl)
    }
  }
  return NextResponse.redirect(blobUrl)
}

// GET - Download media (free content, owner, or purchased)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params
    const session = await getServerSession(authOptions)
    const isRegistered = Boolean(session?.user?.id)

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        versions: { orderBy: { height: 'asc' } },
        user: { select: { username: true } },
      },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    const isOwner = isRegistered && media.userId === session!.user!.id
    const isFree = !media.price || media.price === 0

    let hasPurchased = false
    if (isRegistered) {
      const purchase = await prisma.purchase.findFirst({
        where: {
          mediaId,
          buyerId: session!.user!.id,
          status: 'completed',
        },
      })
      hasPurchased = !!purchase
    }

    if (!isOwner && !isFree && !hasPurchased) {
      if (!isRegistered) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
      return NextResponse.json(
        { error: 'You must purchase this content to download it' },
        { status: 403 }
      )
    }

    if (isRegistered && hasPurchased && !isOwner && !media.isSold) {
      const deleteAfterDate = new Date()
      deleteAfterDate.setDate(deleteAfterDate.getDate() + 10)

      await prisma.media.update({
        where: { id: mediaId },
        data: {
          isSold: true,
          soldAt: new Date(),
          deleteAfter: deleteAfterDate,
          isPublic: false,
        },
      })
    }

    await prisma.media
      .update({
        where: { id: mediaId },
        data: { downloadCount: { increment: 1 } },
      })
      .catch(() => {})

    const cropSettings = await prisma.cropToolSetting.findFirst()
    const freeDownloadMaxHeight = cropSettings?.freeDownloadMaxHeight ?? 720
    const paidQuality = cropSettings?.paidDownloadQuality ?? 'hq'

    let downloadBlobUrl = resolveDownloadBlobUrl(media, {
      isOwner,
      hasPurchased,
      freeDownloadMaxHeight,
      paidQuality,
    })
    downloadBlobUrl = preferMp4ForVideo(media, downloadBlobUrl)
    const fileName = buildFileName(media, downloadBlobUrl)

    // Guests (not logged in): free downloads only, with burned-in watermark
    if (!isRegistered) {
      try {
        const watermarked = await createWatermarkedDownloadFile(
          downloadBlobUrl,
          media.type,
          media.user.username
        )
        return watermarkedDownloadResponse(watermarked, fileName)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        console.error('Guest watermarked download failed:', detail, err)
        const site = process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_HOSTNAME || ''
        const exposeDebug = /staging/i.test(site)
        const diag = exposeDebug ? guestWatermarkDiagnostics() : undefined
        return NextResponse.json(
          {
            error: 'Failed to prepare watermarked download. Please try again or register for full quality.',
            ...(exposeDebug ? { debug: detail.slice(-1200), diag } : {}),
          },
          { status: 500 }
        )
      }
    }

    return redirectToDownload(downloadBlobUrl, fileName)
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json({ error: 'Failed to process download' }, { status: 500 })
  }
}
