import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - Admin dashboard stats
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'reports') {
      // Get pending reports
      const reports = await prisma.report.findMany({
        where: { status: 'PENDING' },
        include: {
          media: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              username: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json({ reports })
    }

    if (action === 'users') {
      // Get all users
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          role: true,
          createdAt: true,
          _count: {
            select: {
              media: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json({ users })
    }

    if (action === 'media') {
      // Get all media for moderation
      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '20')
      const status = searchParams.get('status') // approved, pending, rejected
      
      const where: any = {}
      if (status === 'pending') {
        where.isApproved = false
      } else if (status === 'approved') {
        where.isApproved = true
      }

      const [media, total] = await Promise.all([
        prisma.media.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
              },
            },
            _count: {
              select: {
                reports: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.media.count({ where }),
      ])

      return NextResponse.json({
        media,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    }

    // Default: return dashboard stats
    const [totalUsers, totalMedia, totalComments, pendingReports] =
      await Promise.all([
        prisma.user.count(),
        prisma.media.count(),
        prisma.comment.count(),
        prisma.report.count({ where: { status: 'PENDING' } }),
      ])

    const mediaByType = await prisma.media.groupBy({
      by: ['type'],
      _count: true,
    })

    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: true,
    })

    return NextResponse.json({
      stats: {
        totalUsers,
        totalMedia,
        totalComments,
        pendingReports,
        mediaByType,
        usersByRole,
      },
    })
  } catch (error) {
    console.error('Error fetching admin data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch admin data' },
      { status: 500 }
    )
  }
}

// POST - Admin actions
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { action, targetId, data } = await request.json()

    switch (action) {
      case 'approveMedia':
        await prisma.media.update({
          where: { id: targetId },
          data: { isApproved: true },
        })
        return NextResponse.json({ message: 'Media approved' })

      case 'rejectMedia':
        await prisma.media.update({
          where: { id: targetId },
          data: { isApproved: false },
        })
        return NextResponse.json({ message: 'Media rejected' })

      case 'deleteMedia':
        await prisma.media.delete({
          where: { id: targetId },
        })
        return NextResponse.json({ message: 'Media deleted' })

      case 'updateUserRole':
        if (!data?.role || !['ADMIN', 'SUBSCRIBER', 'VIEWER'].includes(data.role)) {
          return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
        }
        await prisma.user.update({
          where: { id: targetId },
          data: { role: data.role },
        })
        return NextResponse.json({ message: 'User role updated' })

      case 'deleteUser':
        await prisma.user.delete({
          where: { id: targetId },
        })
        return NextResponse.json({ message: 'User deleted' })

      case 'resolveReport':
        await prisma.report.update({
          where: { id: targetId },
          data: {
            status: data?.status || 'RESOLVED',
            adminNote: data?.note,
            resolvedAt: new Date(),
          },
        })
        return NextResponse.json({ message: 'Report resolved' })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error processing admin action:', error)
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    )
  }
}


