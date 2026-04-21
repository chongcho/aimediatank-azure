import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/siteUrl'

/** Serves /robots.txt (text/plain). */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
