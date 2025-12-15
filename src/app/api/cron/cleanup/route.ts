import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { BlobServiceClient } from '@azure/storage-blob'

export const dynamic = 'force-dynamic'

// Initialize Azure Blob Storage client
function getAzureBlobClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined')
  }
  return BlobServiceClient.fromConnectionString(connectionString)
}

// Extract blob name from Azure URL
function getBlobNameFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    return pathParts[pathParts.length - 1]
  } catch {
    return null
  }
}

// This endpoint should be called by a cron job daily
export async function GET(request: Request) {
  try {
    // Verify the request is from Vercel Cron (optional security check)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    // Find all media that should be deleted
    const mediaToDelete = await prisma.media.findMany({
      where: {
        isSold: true,
        deleteAfter: {
          lte: now,
        },
      },
    })

    console.log(`Found ${mediaToDelete.length} media items to delete`)

    if (mediaToDelete.length === 0) {
      return NextResponse.json({
        message: 'No media to delete',
        deleted: 0,
      })
    }

    // Initialize Azure Blob Storage
    const blobServiceClient = getAzureBlobClient()
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'media'
    const containerClient = blobServiceClient.getContainerClient(containerName)

    let deletedCount = 0
    const errors: string[] = []

    for (const media of mediaToDelete) {
      try {
        // Delete main file from Azure
        const blobName = getBlobNameFromUrl(media.url)
        if (blobName) {
          const blobClient = containerClient.getBlockBlobClient(blobName)
          await blobClient.deleteIfExists()
        }

        // Delete thumbnail if exists
        if (media.thumbnailUrl) {
          const thumbBlobName = getBlobNameFromUrl(media.thumbnailUrl)
          if (thumbBlobName) {
            const thumbBlobClient = containerClient.getBlockBlobClient(thumbBlobName)
            await thumbBlobClient.deleteIfExists()
          }
        }

        // Delete from database
        await prisma.media.delete({
          where: { id: media.id },
        })

        deletedCount++
      } catch (err) {
        console.error(`Failed to delete media ${media.id}:`, err)
        errors.push(`${media.id}: ${(err as Error).message}`)
      }
    }

    return NextResponse.json({
      message: 'Cleanup completed',
      deleted: deletedCount,
      total: mediaToDelete.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Cleanup cron error:', error)
    return NextResponse.json(
      { error: 'Cleanup failed', details: (error as Error).message },
      { status: 500 }
    )
  }
}






