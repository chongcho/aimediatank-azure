import { serveSocialCardImage } from '@/lib/serveSocialCardImage'

export const dynamic = 'force-dynamic'

/** Public OG image — lives under /media (not /api) so robots.txt does not block crawlers. */
export async function GET(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  return serveSocialCardImage(request, params.mediaId)
}
