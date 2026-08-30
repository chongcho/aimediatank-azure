import type { MetadataRoute } from 'next'
import { SOCIAL_PREVIEW_CRAWLER_ROBOTS_AGENTS } from '@/lib/socialPreviewCrawler'
import { getSiteUrl } from '@/lib/siteUrl'

/** Serves /robots.txt (text/plain). */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/media/*/card-image'],
        disallow: ['/admin', '/api/'],
      },
      {
        userAgent: [...SOCIAL_PREVIEW_CRAWLER_ROBOTS_AGENTS],
        allow: '/',
        disallow: ['/admin'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
