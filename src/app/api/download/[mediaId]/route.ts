import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from '@azure/storage-blob'

export const dynamic = 'force-dynamic'

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

// GET - Download media (free content, owner, or purchased)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Check if user has purchased this media
    const purchase = await prisma.purchase.findFirst({
      where: {
        mediaId,
        buyerId: session.user.id,
        status: 'completed',
      },
    })

    // Get the media with versions (for resolution selection)
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        versions: { orderBy: { height: 'asc' } },
      },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Allow download if user purchased it OR if they're the owner OR if it's free
    const isOwner = media.userId === session.user.id
    const isFree = !media.price || media.price === 0
    const hasPurchased = !!purchase

    if (!isOwner && !isFree && !hasPurchased) {
      return NextResponse.json(
        { error: 'You must purchase this content to download it' },
        { status: 403 }
      )
    }

    // If this is a paid purchase (not owner, not free), mark as sold
    if (hasPurchased && !isOwner && !(media as any).isSold) {
      const deleteAfterDate = new Date()
      deleteAfterDate.setDate(deleteAfterDate.getDate() + 10) // 10 days from now

      await prisma.media.update({
        where: { id: mediaId },
        data: {
          isSold: true,
          soldAt: new Date(),
          deleteAfter: deleteAfterDate,
          isPublic: false, // Hide from public listings
        },
      })
    }

    // Increment download counter
    await prisma.media.update({
      where: { id: mediaId },
      data: { downloadCount: { increment: 1 } },
    }).catch(() => {}) // non-blocking — don't fail the download if counter update fails

    // Choose download URL from admin settings (free vs paid/sell)
    const cropSettings = await prisma.cropToolSetting.findFirst()
    const freeDownloadMaxHeight = cropSettings?.freeDownloadMaxHeight ?? 720
    const paidQuality = cropSettings?.paidDownloadQuality ?? 'hq'
    const versions = (media as any).versions || []

    let downloadBlobUrl: string
    if (media.type === 'VIDEO' && versions.length > 0) {
      if (isOwner || hasPurchased) {
        if (paidQuality === 'hq') {
          // Prefer urlHq when present; otherwise use best available version (versions ordered by height asc)
          const bestVersion = versions[versions.length - 1]
          downloadBlobUrl = (media as any).urlHq ?? bestVersion?.url ?? media.url
        } else if (paidQuality === '1080p') {
          const v = versions.find((v: any) => v.height === 1080)
          downloadBlobUrl = v?.url ?? (media as any).urlHq ?? media.url
        } else {
          const v = versions.find((v: any) => v.height === 720)
          downloadBlobUrl = v?.url ?? media.url
        }
      } else {
        // Normalize cap to at least 480 so legacy DB values (144/240/360) don't yield no match and fallback to 720p
        const cap = Math.max(480, freeDownloadMaxHeight)
        const best = versions.filter((v: any) => v.height <= cap).pop()
        downloadBlobUrl = best?.url ?? media.url
      }
    } else {
      const useHq = (isOwner || hasPurchased) && (media as any).urlHq
      downloadBlobUrl = useHq ? (media as any).urlHq : media.url
    }

    // Prefer MP4 over WebM for VIDEO when we have an MP4 source (better compatibility)
    if (media.type === 'VIDEO') {
      const isWebm = downloadBlobUrl.toLowerCase().includes('.webm')
      if (isWebm) {
        const urlHq = (media as any).urlHq as string | undefined
        const mp4Version = versions.find((v: any) => v?.url && String(v.url).toLowerCase().includes('.mp4'))
        if (urlHq && urlHq.toLowerCase().includes('.mp4')) {
          downloadBlobUrl = urlHq
        } else if (mp4Version?.url) {
          downloadBlobUrl = mp4Version.url
        }
      }
    }

    // Build a friendly file name from the title; use .mp4 for VIDEO when we're serving an MP4
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
    const fileName = `${safeTitle}.${ext}`

    // Generate a SAS URL with Content-Disposition: attachment so the browser
    // triggers a file download instead of playing/displaying the file inline.
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
    if (connectionString) {
      const { accountName, accountKey } = parseConnectionString(connectionString)
      if (accountName && accountKey) {
        const downloadUrl = generateDownloadSasUrl(downloadBlobUrl, accountName, accountKey, fileName)
        if (downloadUrl) {
          return NextResponse.redirect(downloadUrl)
        }
      }
    }

    // Fallback: redirect to the blob URL (may play inline instead of downloading)
    return NextResponse.redirect(downloadBlobUrl)
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: 'Failed to process download' },
      { status: 500 }
    )
  }
}
