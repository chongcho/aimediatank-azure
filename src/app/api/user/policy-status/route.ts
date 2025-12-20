import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Get user's policy agreement status
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ agreed: false, agreedAt: null })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { policyAgreedAt: true },
    })

    return NextResponse.json({
      agreed: !!user?.policyAgreedAt,
      agreedAt: user?.policyAgreedAt?.toISOString() || null,
    })
  } catch (error) {
    console.error('Error fetching policy status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch policy status' },
      { status: 500 }
    )
  }
}

