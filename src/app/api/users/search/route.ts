import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Force dynamic rendering since we use request.url
export const dynamic = 'force-dynamic'

const USER_SELECT = {
  id: true,
  username: true,
  name: true,
  legalName: true,
  role: true,
  avatar: true,
} as const

function sortByQueryPrefix<T extends { username: string }>(users: T[], query: string): T[] {
  if (!query) return users
  const lower = query.toLowerCase()
  return [...users].sort((a, b) => {
    const aStarts = a.username.toLowerCase().startsWith(lower)
    const bStarts = b.username.toLowerCase().startsWith(lower)
    if (aStarts && !bStarts) return -1
    if (!aStarts && bStarts) return 1
    return a.username.localeCompare(b.username)
  })
}

// GET /api/users/search - Search users by username for @mention autocomplete
// GET /api/users/search?listAll=1 - Signed-in browse of app users (voice call picker)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') || '').trim()
    const listAll = searchParams.get('listAll') === '1'
    const limit = parseInt(searchParams.get('limit') || '5', 10)

    if (listAll) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const subscribersOnly = searchParams.get('subscribersOnly') === '1'
      const max = Math.min(Math.max(limit, 1), 500)
      const users = await prisma.user.findMany({
        where: {
          accountDeactivatedAt: null,
          id: { not: session.user.id },
          ...(subscribersOnly ? { role: { in: ['SUBSCRIBER', 'ADMIN'] } } : {}),
          ...(query
            ? {
                OR: [
                  { username: { contains: query, mode: 'insensitive' } },
                  { name: { contains: query, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: USER_SELECT,
        take: max,
        orderBy: { username: 'asc' },
      })

      return NextResponse.json({ users: sortByQueryPrefix(users, query) })
    }

    // Autocomplete: short queries, small result cap
    const users = await prisma.user.findMany({
      where: {
        accountDeactivatedAt: null,
        username: {
          contains: query,
          mode: 'insensitive',
        },
      },
      select: USER_SELECT,
      take: Math.min(Math.max(limit, 1), 10),
      orderBy: [{ username: 'asc' }],
    })

    return NextResponse.json({ users: sortByQueryPrefix(users, query) })
  } catch (error) {
    console.error('Error searching users:', error)
    return NextResponse.json(
      { error: 'Failed to search users' },
      { status: 500 }
    )
  }
}
