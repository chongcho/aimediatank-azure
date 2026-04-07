import type { MetadataRoute } from 'next'

/**
 * Serves /robots.txt (text/plain). Add `sitemap` when /sitemap.xml exists (currently 404 on prod).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
    ],
  }
}
