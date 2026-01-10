import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Helper to log admin actions
async function logAdminAction(adminId: string, action: string, targetType: string, targetId: string, details?: any) {
  try {
    await prisma.adminAction.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        details: details ? JSON.stringify(details) : null,
      },
    })
  } catch (e) {
    console.error('Failed to log admin action:', e)
  }
}

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
      // Get all users with moderation info
      const search = searchParams.get('search') || ''
      const filter = searchParams.get('filter') // 'suspended', 'warned', 'all'
      
      const where: any = {}
      if (search) {
        // Strip @ prefix if present for username search
        const searchTerm = search.startsWith('@') ? search.slice(1) : search
        
        if (search.startsWith('@')) {
          // Search only by username when @ prefix is used
          where.username = { contains: searchTerm, mode: 'insensitive' }
        } else {
          where.OR = [
            { username: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ]
        }
      }
      if (filter === 'suspended') {
        where.isSuspended = true
      } else if (filter === 'warned') {
        where.warningCount = { gt: 0 }
      } else if (filter === 'members') {
        where.membershipType = { not: 'VIEWER' }
      }
      
      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          legalName: true,
          avatar: true,
          phone: true,
          location: true,
          role: true,
          membershipType: true,
          isSuspended: true,
          suspendedAt: true,
          suspendedUntil: true,
          suspendReason: true,
          warningCount: true,
          lastWarningAt: true,
          lastWarningReason: true,
          bonusCredits: true,
          paidUploadCredits: true,
          adminNotes: true,
          createdAt: true,
          _count: {
            select: {
              media: true,
              chatMessages: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return NextResponse.json({ users })
    }
    
    if (action === 'chatMessages') {
      // Get recent chat messages for moderation
      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '50')
      const userId = searchParams.get('userId')
      const search = searchParams.get('search') || ''
      const filter = searchParams.get('filter') // 'warned', 'suspended', 'all'
      
      const where: any = {}
      if (userId) {
        where.userId = userId
      }
      
      // Handle search - search by username
      if (search) {
        const searchTerm = search.startsWith('@') ? search.slice(1) : search
        where.user = { username: { contains: searchTerm, mode: 'insensitive' } }
      }
      
      // Handle filter
      if (filter === 'warned') {
        where.user = { ...where.user, warningCount: { gt: 0 } }
      } else if (filter === 'suspended') {
        where.user = { ...where.user, isSuspended: true }
      }
      
      const [messages, total] = await Promise.all([
        prisma.chatMessage.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                avatar: true,
                isSuspended: true,
                warningCount: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.chatMessage.count({ where }),
      ])
      
      return NextResponse.json({
        messages,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      })
    }
    
    if (action === 'analytics') {
      // Get analytics data
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      const [
        totalUsers,
        newUsersThisMonth,
        newUsersThisWeek,
        totalSubscribers,
        totalMedia,
        newMediaThisWeek,
        totalChatMessages,
        activeUsersThisWeek,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { membershipType: { in: ['BASIC', 'PREMIUM', 'SUBSCRIBER'] } } }),
        prisma.media.count(),
        prisma.media.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.chatMessage.count(),
        prisma.chatMessage.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: sevenDaysAgo } },
        }).then(r => r.length),
      ])
      
      // User growth by day (last 30 days)
      const userGrowth = await prisma.$queryRaw`
        SELECT DATE(\"createdAt\") as date, COUNT(*) as count
        FROM "User"
        WHERE "createdAt" >= ${thirtyDaysAgo}
        GROUP BY DATE("createdAt")
        ORDER BY date
      ` as Array<{ date: string; count: bigint }>
      
      return NextResponse.json({
        analytics: {
          totalUsers,
          newUsersThisMonth,
          newUsersThisWeek,
          totalSubscribers,
          totalMedia,
          newMediaThisWeek,
          totalChatMessages,
          activeUsersThisWeek,
          userGrowth: userGrowth.map(r => ({ date: r.date, count: Number(r.count) })),
        },
      })
    }
    
    if (action === 'adminActions') {
      // Get recent admin actions for audit
      const actions = await prisma.adminAction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return NextResponse.json({ actions })
    }

    if (action === 'contentSales') {
      // Get content/media sales (completed purchases)
      const sales = await prisma.purchase.findMany({
        where: { status: 'completed' },
        include: {
          buyer: {
            select: {
              id: true,
              username: true,
              name: true,
              legalName: true,
              email: true,
              phone: true,
              location: true,
            },
          },
          media: {
            select: {
              id: true,
              title: true,
              type: true,
            },
          },
        },
        orderBy: { completedAt: 'desc' },
        take: 100,
      })
      return NextResponse.json({ sales })
    }

    if (action === 'media') {
      // Get all media for moderation
      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '20')
      const status = searchParams.get('status') // approved, pending
      const type = searchParams.get('type') // VIDEO, IMAGE
      const search = searchParams.get('search') || ''
      
      const where: any = {}
      if (status === 'pending') {
        where.isApproved = false
        where.isDeleted = false
      } else if (status === 'approved') {
        where.isApproved = true
        where.isDeleted = false
      } else if (status === 'deleted') {
        where.isDeleted = true
      } else {
        // "all" - show non-deleted by default
        where.isDeleted = false
      }
      if (type && ['VIDEO', 'IMAGE', 'MUSIC'].includes(type)) {
        where.type = type
      }
      if (search) {
        // Handle @mention search - strip @ prefix for username search
        const searchTerm = search.startsWith('@') ? search.slice(1) : search
        
        if (search.startsWith('@')) {
          // Search only by username when @ prefix is used
          where.user = { username: { contains: searchTerm, mode: 'insensitive' } }
        } else {
          // Search by title or username
          where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { user: { username: { contains: search, mode: 'insensitive' } } },
          ]
        }
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
                email: true,
              },
            },
            purchases: {
              where: { status: 'completed' },
              select: {
                id: true,
                completedAt: true,
                buyer: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
              orderBy: { completedAt: 'desc' },
              take: 1,
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
    const adminId = session.user.id

    switch (action) {
      case 'approveMedia':
        await prisma.media.update({
          where: { id: targetId },
          data: { isApproved: true },
        })
        await logAdminAction(adminId, 'APPROVE_MEDIA', 'MEDIA', targetId)
        return NextResponse.json({ message: 'Media approved' })

      case 'rejectMedia':
        await prisma.media.update({
          where: { id: targetId },
          data: { isApproved: false },
        })
        await logAdminAction(adminId, 'REJECT_MEDIA', 'MEDIA', targetId)
        return NextResponse.json({ message: 'Media rejected' })

      case 'suspendMedia': {
        // Get media details
        const mediaToSuspend = await prisma.media.findUnique({
          where: { id: targetId },
          include: { user: { select: { id: true, email: true } } }
        })
        
        if (!mediaToSuspend) {
          return NextResponse.json({ error: 'Media not found' }, { status: 404 })
        }
        
        const suspendReason = data?.reason || 'Policy violation'
        
        // Suspend the media (set isApproved to false)
        await prisma.media.update({
          where: { id: targetId },
          data: { isApproved: false },
        })
        
        // Create notification for the creator
        await prisma.notification.create({
          data: {
            userId: mediaToSuspend.user.id,
            type: 'content_suspended',
            title: 'Content Suspended',
            message: `Your content "${data?.mediaTitle || 'Untitled'}" has been suspended. Reason: ${suspendReason}`,
          },
        })
        
        // Send email notification if requested
        if (data?.sendNotification && data?.creatorEmail) {
          try {
            const { sendEmail } = await import('@/lib/email')
            await sendEmail({
              to: data.creatorEmail,
              subject: 'AiMediaTank - Content Suspended',
              html: `
                <h2>Content Suspended</h2>
                <p>Your content "<strong>${data?.mediaTitle || 'Untitled'}</strong>" has been suspended on AiMediaTank.</p>
                <p><strong>Reason:</strong> ${suspendReason}</p>
                <p>Please review our community guidelines. If you believe this was a mistake, please contact our support team.</p>
                <p>Best regards,<br>AiMediaTank Team</p>
              `,
            })
          } catch (emailError) {
            console.error('Failed to send suspension notification email:', emailError)
          }
        }
        
        await logAdminAction(adminId, 'SUSPEND_MEDIA', 'MEDIA', targetId, { reason: suspendReason, mediaTitle: data?.mediaTitle })
        return NextResponse.json({ message: 'Media suspended' })
      }

      case 'updateMediaStatus':
        await prisma.media.update({
          where: { id: targetId },
          data: { 
            isSold: data?.isSold || false,
            soldAt: data?.isSold ? new Date() : null,
          },
        })
        await logAdminAction(adminId, 'UPDATE_MEDIA_STATUS', 'MEDIA', targetId, { isSold: data?.isSold })
        return NextResponse.json({ message: 'Media status updated' })

      case 'updateMediaAgeRestriction':
        await prisma.media.update({
          where: { id: targetId },
          data: { 
            ageRestriction: data?.ageRestriction || 'ALL',
          },
        })
        await logAdminAction(adminId, 'UPDATE_MEDIA_AGE_RESTRICTION', 'MEDIA', targetId, { ageRestriction: data?.ageRestriction })
        return NextResponse.json({ message: 'Media age restriction updated' })

      case 'restoreMedia':
        await prisma.media.update({
          where: { id: targetId },
          data: { 
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            deletionReason: null,
            isPublic: true,
          },
        })
        await logAdminAction(adminId, 'RESTORE_MEDIA', 'MEDIA', targetId)
        return NextResponse.json({ message: 'Media restored' })

      case 'deleteMedia': {
        // Get media details before deletion
        const mediaToDelete = await prisma.media.findUnique({
          where: { id: targetId },
          include: { user: { select: { id: true, email: true } } }
        })
        
        if (!mediaToDelete) {
          return NextResponse.json({ error: 'Media not found' }, { status: 404 })
        }
        
        // Soft delete the media (keep record but hide from platform)
        const deletionReason = data?.reason || 'Policy violation'
        await prisma.media.update({
          where: { id: targetId },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: adminId,
            deletionReason: deletionReason,
            isPublic: false, // Also hide from public
          },
        })
        
        // Create notification for the creator
        await prisma.notification.create({
          data: {
            userId: mediaToDelete.user.id,
            type: 'content_removed',
            title: 'Content Removed',
            message: `Your content "${data?.mediaTitle || 'Untitled'}" has been removed. Reason: ${deletionReason}`,
          },
        })
        
        // Send email notification if requested
        let emailSent = false
        if (data?.sendNotification && data?.creatorEmail) {
          try {
            const { sendEmail } = await import('@/lib/email')
            emailSent = await sendEmail({
              to: data.creatorEmail,
              subject: 'AiMediaTank - Content Removed',
              html: `
                <h2>Content Removed</h2>
                <p>Your content "<strong>${data?.mediaTitle || 'Untitled'}</strong>" has been removed from AiMediaTank.</p>
                <p><strong>Reason:</strong> ${deletionReason}</p>
                <p>If you believe this was a mistake, please contact our support team.</p>
                <p>Best regards,<br>AiMediaTank Team</p>
              `,
            })
            console.log(`Delete notification email ${emailSent ? 'sent successfully' : 'failed'} to:`, data.creatorEmail)
          } catch (emailError) {
            console.error('Failed to send deletion notification email:', emailError)
          }
        }
        
        await logAdminAction(adminId, 'DELETE_MEDIA', 'MEDIA', targetId, { reason: deletionReason, mediaTitle: data?.mediaTitle, emailSent })
        return NextResponse.json({ 
          message: 'Media deleted',
          emailSent: data?.sendNotification ? emailSent : null,
          notificationSent: true
        })
      }

      case 'updateUserRole':
        if (!data?.role || !['ADMIN', 'SUBSCRIBER', 'VIEWER'].includes(data.role)) {
          return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
        }
        await prisma.user.update({
          where: { id: targetId },
          data: { role: data.role },
        })
        await logAdminAction(adminId, 'UPDATE_USER_ROLE', 'USER', targetId, { role: data.role })
        return NextResponse.json({ message: 'User role updated' })

      case 'deleteUser':
        await prisma.user.delete({
          where: { id: targetId },
        })
        await logAdminAction(adminId, 'DELETE_USER', 'USER', targetId)
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
        await logAdminAction(adminId, 'RESOLVE_REPORT', 'REPORT', targetId, data)
        return NextResponse.json({ message: 'Report resolved' })

      // New actions for user moderation
      case 'suspendUser': {
        // Get user info for email
        const suspendTargetUser = await prisma.user.findUnique({
          where: { id: targetId },
          select: { email: true, legalName: true, username: true }
        })
        
        const suspendUntil = data?.duration 
          ? new Date(Date.now() + data.duration * 24 * 60 * 60 * 1000) // duration in days
          : null // permanent
        const suspendReason = data?.reason || 'Policy violation'
        
        await prisma.user.update({
          where: { id: targetId },
          data: {
            isSuspended: true,
            suspendedAt: new Date(),
            suspendedUntil: suspendUntil,
            suspendReason: suspendReason,
          },
        })
        
        // Create notification for user
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'suspension',
            title: 'Account Suspended',
            message: `🚫 Your account has been suspended${suspendUntil ? ` until ${suspendUntil.toLocaleDateString()}` : ' permanently'}. Reason: ${suspendReason}`,
          },
        })
        
        // Send email notification
        if (suspendTargetUser) {
          try {
            const { sendEmail, generateSuspensionEmail } = await import('@/lib/email')
            const userName = suspendTargetUser.legalName || suspendTargetUser.username || 'User'
            await sendEmail({
              to: suspendTargetUser.email,
              subject: '🚫 Your AI Media Tank Account Has Been Suspended',
              html: generateSuspensionEmail(userName, suspendReason, suspendUntil)
            })
            console.log(`Suspension email sent to ${suspendTargetUser.email}`)
          } catch (emailError) {
            console.error('Failed to send suspension email:', emailError)
          }
        }
        
        await logAdminAction(adminId, 'SUSPEND_USER', 'USER', targetId, data)
        return NextResponse.json({ message: 'User suspended' })
      }

      case 'unsuspendUser': {
        // Get user info for email
        const unsuspendTargetUser = await prisma.user.findUnique({
          where: { id: targetId },
          select: { email: true, legalName: true, username: true }
        })
        
        await prisma.user.update({
          where: { id: targetId },
          data: {
            isSuspended: false,
            suspendedAt: null,
            suspendedUntil: null,
            suspendReason: null,
          },
        })
        
        // Create notification for user
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'info',
            title: 'Account Reinstated',
            message: '✅ Your account has been reinstated and is now fully active.',
          },
        })
        
        // Send email notification
        if (unsuspendTargetUser) {
          try {
            const { sendEmail, generateUnsuspensionEmail } = await import('@/lib/email')
            const userName = unsuspendTargetUser.legalName || unsuspendTargetUser.username || 'User'
            await sendEmail({
              to: unsuspendTargetUser.email,
              subject: '✅ Your AI Media Tank Account Has Been Reinstated',
              html: generateUnsuspensionEmail(userName)
            })
            console.log(`Unsuspension email sent to ${unsuspendTargetUser.email}`)
          } catch (emailError) {
            console.error('Failed to send unsuspension email:', emailError)
          }
        }
        
        await logAdminAction(adminId, 'UNSUSPEND_USER', 'USER', targetId)
        return NextResponse.json({ message: 'User unsuspended' })
      }

      case 'warnUser': {
        // Get user info for email
        const warnTargetUser = await prisma.user.findUnique({
          where: { id: targetId },
          select: { email: true, legalName: true, username: true, warningCount: true }
        })
        
        const warningReason = data?.reason || 'Policy violation'
        const newWarningCount = (warnTargetUser?.warningCount || 0) + 1
        
        await prisma.user.update({
          where: { id: targetId },
          data: {
            warningCount: { increment: 1 },
            lastWarningAt: new Date(),
            lastWarningReason: warningReason,
          },
        })
        
        // Create notification for user
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'warning',
            title: 'Account Warning',
            message: `⚠️ Warning: ${warningReason}. You now have ${newWarningCount} warning(s).`,
          },
        })
        
        // Send email notification
        if (warnTargetUser) {
          try {
            const { sendEmail, generateWarningEmail } = await import('@/lib/email')
            const userName = warnTargetUser.legalName || warnTargetUser.username || 'User'
            await sendEmail({
              to: warnTargetUser.email,
              subject: '⚠️ Warning: Your AI Media Tank Account',
              html: generateWarningEmail(userName, warningReason, newWarningCount)
            })
            console.log(`Warning email sent to ${warnTargetUser.email}`)
          } catch (emailError) {
            console.error('Failed to send warning email:', emailError)
          }
        }
        
        await logAdminAction(adminId, 'WARN_USER', 'USER', targetId, data)
        return NextResponse.json({ message: 'User warned' })
      }

      case 'getWarningHistory': {
        const warnings = await prisma.chatWarning.findMany({
          where: { userId: targetId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            messageContent: true,
            reason: true,
            createdAt: true,
          }
        })
        return NextResponse.json({ warnings })
      }

      case 'clearWarnings':
        await prisma.user.update({
          where: { id: targetId },
          data: {
            warningCount: 0,
            lastWarningAt: null,
            lastWarningReason: null,
          },
        })
        await logAdminAction(adminId, 'CLEAR_WARNINGS', 'USER', targetId)
        return NextResponse.json({ message: 'Warnings cleared' })

      case 'giveCredits': {
        const credits = parseInt(data?.credits) || 0
        if (credits <= 0) {
          return NextResponse.json({ error: 'Invalid credits amount' }, { status: 400 })
        }
        
        // Get user info for email
        const creditUser = await prisma.user.findUnique({
          where: { id: targetId },
          select: { email: true, legalName: true, username: true, bonusCredits: true, paidUploadCredits: true }
        })
        
        if (!creditUser) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }
        
        // Update credits
        await prisma.user.update({
          where: { id: targetId },
          data: {
            bonusCredits: { increment: credits },
          },
        })
        
        const newTotalCredits = (creditUser.bonusCredits || 0) + (creditUser.paidUploadCredits || 0) + credits
        
        // Create notification for user
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'credits',
            title: 'Bonus Credits Received',
            message: `🎁 You received ${credits} bonus upload credits! You now have ${newTotalCredits} total credits.`,
          },
        })
        
        // Send email notification
        try {
          const { sendEmail, generateBonusCreditsEmail } = await import('@/lib/email')
          const userName = creditUser.legalName || creditUser.username || 'User'
          await sendEmail({
            to: creditUser.email,
            subject: `🎁 You Received ${credits} Bonus Credits!`,
            html: generateBonusCreditsEmail(userName, credits, newTotalCredits)
          })
          console.log(`Bonus credits email sent to ${creditUser.email}`)
        } catch (emailError) {
          console.error('Failed to send bonus credits email:', emailError)
          // Don't fail the action if email fails
        }
        
        await logAdminAction(adminId, 'GIVE_CREDITS', 'USER', targetId, { credits })
        return NextResponse.json({ message: `${credits} credits given` })
      }

      case 'updateAdminNotes':
        await prisma.user.update({
          where: { id: targetId },
          data: {
            adminNotes: data?.notes || null,
          },
        })
        return NextResponse.json({ message: 'Admin notes updated' })

      // Chat moderation actions
      case 'deleteChatMessage':
        await prisma.chatMessage.delete({
          where: { id: targetId },
        })
        await logAdminAction(adminId, 'DELETE_CHAT_MESSAGE', 'CHAT_MESSAGE', targetId)
        return NextResponse.json({ message: 'Chat message deleted' })

      case 'warnChatUser': {
        // Create chat warning record
        await prisma.chatWarning.create({
          data: {
            userId: targetId,
            messageId: data?.messageId,
            messageContent: data?.messageContent,
            reason: data?.reason || 'Inappropriate message',
            action: data?.action || 'WARNING', // WARNING, MUTE, BAN
            duration: data?.duration, // minutes for mute
            adminId,
          },
        })
        // Update user warning count
        await prisma.user.update({
          where: { id: targetId },
          data: {
            warningCount: { increment: 1 },
            lastWarningAt: new Date(),
            lastWarningReason: `Chat: ${data?.reason || 'Inappropriate message'}`,
          },
        })
        // Notify user
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'chat_warning',
            title: 'Chat Warning',
            message: `⚠️ Chat Warning: ${data?.reason || 'Inappropriate message'}`,
          },
        })
        await logAdminAction(adminId, 'WARN_CHAT_USER', 'USER', targetId, data)
        return NextResponse.json({ message: 'Chat user warned' })
      }

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


