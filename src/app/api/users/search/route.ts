import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/users/search - Search users by username for @mention autocomplete
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const limit = parseInt(searchParams.get('limit') || '5')

    // Search users by username (case-insensitive)
    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: query,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
      },
      take: Math.min(limit, 10), // Cap at 10 results
      orderBy: [
        // Prioritize exact matches, then prefix matches
        { username: 'asc' },
      ],
    })

    // Sort to prioritize usernames that start with the query
    const sortedUsers = users.sort((a, b) => {
      const aStarts = a.username.toLowerCase().startsWith(query.toLowerCase())
      const bStarts = b.username.toLowerCase().startsWith(query.toLowerCase())
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1
      return a.username.localeCompare(b.username)
    })

    return NextResponse.json({ users: sortedUsers })
  } catch (error) {
    console.error('Error searching users:', error)
    return NextResponse.json(
      { error: 'Failed to search users' },
      { status: 500 }
    )
  }
}


