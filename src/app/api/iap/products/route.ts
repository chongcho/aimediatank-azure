import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { allAppleIapProductIds, mediaUnlockProductForPrice } from '@/lib/appleIapCatalog'
import { isNativeIosClientFromRequest } from '@/lib/iosAppStoreCompliance'

export const dynamic = 'force-dynamic'

/** GET — product catalog for the native iOS StoreKit plugin. */
export async function GET(request: Request) {
  if (!isNativeIosClientFromRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Please log in' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const mediaPriceRaw = searchParams.get('mediaPrice')
  if (mediaPriceRaw != null) {
    const price = Number(mediaPriceRaw)
    const tier = mediaUnlockProductForPrice(price)
    return NextResponse.json({
      productIds: allAppleIapProductIds(),
      mediaUnlockProductId: tier?.productId ?? null,
      mediaUnlockUsd: tier?.usd ?? null,
    })
  }

  return NextResponse.json({ productIds: allAppleIapProductIds() })
}
