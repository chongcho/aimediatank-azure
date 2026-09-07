import { NextResponse } from 'next/server'
import { ensureMembershipPlans } from '@/lib/membershipPlans'

export const dynamic = 'force-dynamic'

/** Public membership plan catalog (Admin Panel → Pricing / checkout). */
export async function GET() {
  try {
    const plans = await ensureMembershipPlans()
    return NextResponse.json({ plans })
  } catch (error) {
    console.error('[membership/plans]', error)
    return NextResponse.json({ error: 'Failed to load membership plans' }, { status: 500 })
  }
}
