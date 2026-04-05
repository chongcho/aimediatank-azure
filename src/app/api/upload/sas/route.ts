import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from '@azure/storage-blob'
import { v4 as uuidv4 } from 'uuid'
import { MAX_UPLOAD_FILE_BYTES, UPLOAD_FILE_SIZE_EXCEEDED_MESSAGE } from '@/lib/uploadPlanConfig'

export const dynamic = 'force-dynamic'

// Generate SAS token for direct client-side upload to Azure Blob Storage
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'SUBSCRIBER' && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only subscribers can upload media' },
        { status: 403 }
      )
    }

    const { fileName, contentType, fileType, fileSize } = await request.json()

    if (!fileName || !contentType || !fileType) {
      return NextResponse.json(
        { error: 'fileName, contentType, and fileType are required' },
        { status: 400 }
      )
    }

    if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize < 0) {
      return NextResponse.json(
        { error: 'fileSize is required and must be a non-negative number' },
        { status: 400 }
      )
    }

    if (fileSize > MAX_UPLOAD_FILE_BYTES) {
      return NextResponse.json({ error: UPLOAD_FILE_SIZE_EXCEEDED_MESSAGE }, { status: 400 })
    }

    // Validate file type
    const allowedTypes: Record<string, string[]> = {
      VIDEO: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'],
      IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      MUSIC: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/mp4', 'audio/aac'],
    }

    if (!['VIDEO', 'IMAGE', 'MUSIC'].includes(fileType)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }

    // Extract base content type (without codec parameters like ";codecs=vp9,opus")
    const baseContentType = contentType.split(';')[0].trim()
    
    if (!allowedTypes[fileType].includes(baseContentType)) {
      return NextResponse.json(
        { error: `Invalid content type for ${fileType}: ${baseContentType}` },
        { status: 400 }
      )
    }

    // Get Azure credentials
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
    if (!connectionString) {
      return NextResponse.json(
        { error: 'Azure storage not configured' },
        { status: 500 }
      )
    }

    // Parse connection string to get account name and key
    const connectionParts = connectionString.split(';').reduce((acc, part) => {
      const [key, ...values] = part.split('=')
      acc[key] = values.join('=')
      return acc
    }, {} as Record<string, string>)

    const accountName = connectionParts['AccountName']
    const accountKey = connectionParts['AccountKey']
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'media'

    if (!accountName || !accountKey) {
      return NextResponse.json(
        { error: 'Invalid Azure storage configuration' },
        { status: 500 }
      )
    }

    // Generate unique blob name
    const fileExt = fileName.split('.').pop() || ''
    const blobName = `${uuidv4()}.${fileExt}`

    // Create SAS token
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey)
    const startsOn = new Date()
    const expiresOn = new Date(startsOn.getTime() + 30 * 60 * 1000) // 30 minutes

    const sasToken = generateBlobSASQueryParameters({
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('racwd'), // read, add, create, write, delete
      startsOn,
      expiresOn,
    }, sharedKeyCredential).toString()

    const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`
    const uploadUrl = `${blobUrl}?${sasToken}`

    return NextResponse.json({
      uploadUrl,
      blobUrl,
      blobName,
    })
  } catch (error) {
    console.error('Error generating SAS token:', error)
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}

