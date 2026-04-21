import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/siteUrl'

/**
 * Sitemap entries mirror the app footer (Discover, Community, Account, Legal & Support) plus /about.
 */
const SITEMAP_PATHS: {
  path: string
  changeFrequency: MetadataRoute.Sitemap[0]['changeFrequency']
  priority: number
}[] = [
  // DISCOVER
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/?type=VIDEO', changeFrequency: 'daily', priority: 0.9 },
  { path: '/?type=IMAGE', changeFrequency: 'daily', priority: 0.9 },
  { path: '/pricing', changeFrequency: 'weekly', priority: 0.85 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.8 },
  // COMMUNITY
  { path: '/notifications', changeFrequency: 'daily', priority: 0.65 },
  { path: '/open-chat', changeFrequency: 'weekly', priority: 0.75 },
  { path: '/ecard', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/game', changeFrequency: 'weekly', priority: 0.7 },
  // ACCOUNT
  { path: '/login', changeFrequency: 'monthly', priority: 0.55 },
  { path: '/register', changeFrequency: 'monthly', priority: 0.55 },
  { path: '/upload', changeFrequency: 'weekly', priority: 0.65 },
  // LEGAL & SUPPORT
  { path: '/policy', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/terms', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/privacy', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/support', changeFrequency: 'monthly', priority: 0.6 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl()
  const lastModified = new Date()

  return SITEMAP_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
