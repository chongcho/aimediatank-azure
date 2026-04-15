import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'

export const getBaseUrl = () => {
  const host = headers().get('host')
  if (!host) return 'https://aimediatank.com'
  return host.includes('localhost') ? `http://${host}` : `https://${host}`
}

export const cleanTitle = (title: string) => title.replace(/#\w+/g, '').trim()

export const toAbsoluteUrl = (baseUrl: string, url: string | null) => {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  if (url.startsWith('/')) {
    return `${baseUrl}${url}`
  }
  return `${baseUrl}/${url}`
}

export async function getPublicMediaForMeta(mediaId: string) {
  return prisma.media.findFirst({
    where: {
      id: mediaId,
      isPublic: true,
      isApproved: true,
      isDeleted: false,
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      url: true,
      thumbnailUrl: true,
      aiTool: true,
      realDevice: true,
      createdAt: true,
      updatedAt: true,
      price: true,
      isSold: true,
      ageRestriction: true,
      user: {
        select: {
          username: true,
          name: true,
        },
      },
    },
  })
}
