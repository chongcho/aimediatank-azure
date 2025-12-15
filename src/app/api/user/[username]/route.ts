import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch user profile by username
export async function GET(
  request: Request,
  { params }: { params: { username: string } }
) {
  try {
    const { username } = params

    // Try to find user by username first
    let user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        name: true,
        avatar: true,
        bio: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            media: true,
          },
        },
      },
    })

    // If not found by username, try to find by email
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: username },
        select: {
          id: true,
          username: true,
          name: true,
          avatar: true,
          bio: true,
          role: true,
          createdAt: true,
          _count: {
            select: {
              media: true,
            },
          },
        },
      })
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error fetching user by username:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    )
  }
}






