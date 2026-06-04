import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getFirstHomeLayoutSetting } from '@/lib/homeLayoutSetting'
import { requireAdminPanelElevation } from '@/lib/requireAdminElevation'
import { detectAbnormalAccess } from '@/lib/accessLogAbnormalDetect'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/** Hide blocked client IPs from Access Logs (they remain visible only under Blocked IPs). */
async function blockedIpAddressList(): Promise<string[]> {
  const rows = await prisma.blockedIp.findMany({ select: { ipAddress: true } })
  return rows.map((r) => r.ipAddress)
}

function whereExcludingBlockedIps(baseWhere: Record<string, unknown>, blocked: string[]): Record<string, unknown> {
  if (blocked.length === 0) return baseWhere
  return {
    AND: [
      baseWhere,
      {
        OR: [{ ipAddress: null }, { ipAddress: { notIn: blocked } }],
      },
    ],
  }
}

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
    const reauthErr = requireAdminPanelElevation(request, session)
    if (reauthErr) return reauthErr

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
      
      // Auto-sync: For users with warningCount > 0, verify against actual ChatWarning records
      const usersWithWarnings = users.filter(u => u.warningCount > 0)
      if (usersWithWarnings.length > 0) {
        // First, clean up orphaned warnings (where messageId points to deleted messages)
        const allWarnings = await prisma.chatWarning.findMany({
          where: { userId: { in: usersWithWarnings.map(u => u.id) } },
          select: { id: true, userId: true, messageId: true }
        })
        
        // Find warnings with messageId that no longer exists
        const warningsWithMessageId = allWarnings.filter(w => w.messageId)
        if (warningsWithMessageId.length > 0) {
          const messageIds = warningsWithMessageId.map(w => w.messageId).filter(Boolean) as string[]
          const existingMessages = await prisma.chatMessage.findMany({
            where: { id: { in: messageIds } },
            select: { id: true }
          })
          const existingMessageIds = new Set(existingMessages.map(m => m.id))
          
          // Delete orphaned warnings (messageId doesn't exist anymore)
          const orphanedWarnings = warningsWithMessageId.filter(w => w.messageId && !existingMessageIds.has(w.messageId))
          if (orphanedWarnings.length > 0) {
            await prisma.chatWarning.deleteMany({
              where: { id: { in: orphanedWarnings.map(w => w.id) } }
            })
            console.log(`Cleaned up ${orphanedWarnings.length} orphaned warnings`)
          }
        }
        
        // Now get actual warning counts (after cleanup)
        const actualWarningCounts = await prisma.chatWarning.groupBy({
          by: ['userId'],
          where: { userId: { in: usersWithWarnings.map(u => u.id) } },
          _count: { id: true }
        })
        
        const actualCountMap = new Map(actualWarningCounts.map(c => [c.userId, c._count.id]))
        
        // Check for mismatches and fix them
        for (const user of usersWithWarnings) {
          const actualCount = actualCountMap.get(user.id) || 0
          if (user.warningCount !== actualCount) {
            // Fix the mismatch in database
            await prisma.user.update({
              where: { id: user.id },
              data: {
                warningCount: actualCount,
                ...(actualCount === 0 && {
                  lastWarningAt: null,
                  lastWarningReason: null,
                })
              }
            })
            // Update the user object for response
            user.warningCount = actualCount
            if (actualCount === 0) {
              user.lastWarningAt = null
              user.lastWarningReason = null
            }
            console.log(`Auto-synced warningCount for user ${user.username}: was ${user.warningCount}, now ${actualCount}`)
          }
        }
      }
      
      return NextResponse.json({ users })
    }
    
    if (action === 'chatMessages') {
      // Get recent chat messages for moderation (Open Chat only - public messages)
      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '50')
      const userId = searchParams.get('userId')
      const search = searchParams.get('search') || ''
      const filter = searchParams.get('filter') // 'warned', 'suspended', 'all'
      
      const where: any = {
        isPrivate: false, // Only show public (open chat) messages
      }
      if (userId) {
        where.userId = userId
      }
      
      // Handle search - search by username
      if (search) {
        const searchTerm = search.startsWith('@') ? search.slice(1) : search
        where.user = { ...where.user, username: { contains: searchTerm, mode: 'insensitive' } }
      }
      
      // Handle filter
      if (filter === 'warned') {
        where.user = { ...where.user, warningCount: { gt: 0 } }
      } else if (filter === 'suspended') {
        where.user = { ...where.user, isSuspended: true }
      } else if (filter === 'review') {
        where.contentInspectionStatus = 'review'
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
                email: true,
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

    if (action === 'accessLogsDistinct') {
      const dateWhere: any = {}
      const fromStr = searchParams.get('from')
      const toStr = searchParams.get('to')
      if (fromStr) dateWhere.createdAt = { gte: new Date(fromStr) }
      if (toStr) dateWhere.createdAt = { ...(dateWhere.createdAt as object), lte: new Date(toStr) }

      const blocked = await blockedIpAddressList()
      const whereDistinct = whereExcludingBlockedIps(dateWhere, blocked)

      const [browsers, oses, countries, methods] = await Promise.all([
        prisma.siteAccessLog.groupBy({ by: ['browser'], where: { ...whereDistinct, browser: { not: null } } }).then(r => r.map(x => x.browser!).sort()),
        prisma.siteAccessLog.groupBy({ by: ['os'], where: { ...whereDistinct, os: { not: null } } }).then(r => r.map(x => x.os!).sort()),
        prisma.siteAccessLog.groupBy({ by: ['country'], where: { ...whereDistinct, country: { not: null } } }).then(r => r.map(x => x.country!).sort()),
        prisma.siteAccessLog.groupBy({ by: ['method'], where: whereDistinct }).then(r => r.map(x => x.method).sort()),
      ])
      return NextResponse.json({ browsers, oses, countries, methods })
    }

    if (action === 'accessLogs') {
      const page = parseInt(searchParams.get('page') || '1')
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
      const pathFilter = searchParams.get('path') || ''
      const ipFilter = searchParams.get('ip') || ''
      const qRaw = searchParams.get('q') || ''
      const q = qRaw.trim().slice(0, 200)
      const fromStr = searchParams.get('from') // ISO date
      const toStr = searchParams.get('to') // ISO date
      const browserFilter = searchParams.get('browser') || ''
      const osFilter = searchParams.get('os') || ''
      const countryFilter = searchParams.get('country') || ''
      const methodFilter = searchParams.get('method') || ''
      const abnormalOnly =
        searchParams.get('abnormalOnly') === '1' || searchParams.get('abnormalOnly') === 'true'

      const mode = 'insensitive' as const
      const parts: Record<string, unknown>[] = []
      if (abnormalOnly) parts.push({ abnormalFlags: { not: null } })
      if (fromStr || toStr) {
        const dr: { gte?: Date; lte?: Date } = {}
        if (fromStr) dr.gte = new Date(fromStr)
        if (toStr) dr.lte = new Date(toStr)
        parts.push({ createdAt: dr })
      }
      if (browserFilter) {
        const list = browserFilter.split(',').filter(Boolean)
        if (list.length) parts.push({ browser: { in: list } })
      }
      if (osFilter) {
        const list = osFilter.split(',').filter(Boolean)
        if (list.length) parts.push({ os: { in: list } })
      }
      if (countryFilter) {
        const list = countryFilter.split(',').filter(Boolean)
        if (list.length) parts.push({ country: { in: list } })
      }
      if (methodFilter) {
        const list = methodFilter.split(',').filter(Boolean)
        if (list.length) parts.push({ method: { in: list } })
      }

      if (q) {
        parts.push({
          OR: [
            { path: { contains: q, mode } },
            { ipAddress: { contains: q, mode } },
            { userName: { contains: q, mode } },
            { userEmail: { contains: q, mode } },
            { referrer: { contains: q, mode } },
            { sessionId: { contains: q, mode } },
            { userAgent: { contains: q, mode } },
            { query: { contains: q, mode } },
            { country: { contains: q, mode } },
            { city: { contains: q, mode } },
            { region: { contains: q, mode } },
            { browser: { contains: q, mode } },
            { os: { contains: q, mode } },
            { device: { contains: q, mode } },
            { method: { contains: q, mode } },
          ],
        })
      } else {
        if (pathFilter) parts.push({ path: { contains: pathFilter, mode } })
        if (ipFilter) parts.push({ ipAddress: { contains: ipFilter, mode } })
      }

      const where: Record<string, unknown> = parts.length ? { AND: parts } : {}

      const blocked = await blockedIpAddressList()
      const whereLogs = whereExcludingBlockedIps(where, blocked)

      const [logs, total, uniqueIps, uniqueSessions] = await Promise.all([
        prisma.siteAccessLog.findMany({
          where: whereLogs,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.siteAccessLog.count({ where: whereLogs }),
        prisma.siteAccessLog.groupBy({
          by: ['ipAddress'],
          where: { ...whereLogs, ipAddress: { not: null } },
        }).then((r) => r.length),
        prisma.siteAccessLog.groupBy({
          by: ['sessionId'],
          where: { ...whereLogs, sessionId: { not: null } },
        }).then((r) => r.length),
      ])

      const parsedFlagsByLog = new Map<string, string[]>()
      const ips = Array.from(new Set(logs.map((l) => l.ipAddress).filter((v): v is string => Boolean(v))))
      for (const log of logs) {
        let parsed: string[] = []
        if (log.abnormalFlags) {
          try {
            const raw = JSON.parse(log.abnormalFlags) as unknown
            parsed = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
          } catch {
            parsed = []
          }
        }
        // Backfill for legacy rows that were stored without abnormalFlags.
        if (parsed.length === 0) {
          parsed = detectAbnormalAccess({
            path: log.path || '',
            method: log.method || 'GET',
            statusCode: log.statusCode ?? null,
            query: log.query ?? null,
            referrer: log.referrer ?? null,
            userAgent: log.userAgent ?? null,
          })
        }
        parsedFlagsByLog.set(log.id, parsed)
      }

      const now = new Date()
      const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000)
      const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000)
      const ipHits10m = new Map<string, number>()
      const ipHits30m = new Map<string, number>()
      const ipProbeHits30m = new Map<string, number>()
      const ipUaSet30m = new Map<string, Set<string>>()

      if (ips.length > 0) {
        const [recent10m, recent30m] = await Promise.all([
          prisma.siteAccessLog.findMany({
            where: { ipAddress: { in: ips }, createdAt: { gte: tenMinAgo } },
            select: { ipAddress: true },
          }),
          prisma.siteAccessLog.findMany({
            where: { ipAddress: { in: ips }, createdAt: { gte: thirtyMinAgo } },
            select: { ipAddress: true, userAgent: true, abnormalFlags: true },
          }),
        ])

        for (const row of recent10m) {
          const ip = row.ipAddress
          if (!ip) continue
          ipHits10m.set(ip, (ipHits10m.get(ip) || 0) + 1)
        }
        for (const row of recent30m) {
          const ip = row.ipAddress
          if (!ip) continue
          ipHits30m.set(ip, (ipHits30m.get(ip) || 0) + 1)
          const ua = (row.userAgent || '').trim()
          if (ua) {
            if (!ipUaSet30m.has(ip)) ipUaSet30m.set(ip, new Set<string>())
            ipUaSet30m.get(ip)!.add(ua.slice(0, 160))
          }
          if (row.abnormalFlags) {
            try {
              const arr = JSON.parse(row.abnormalFlags) as unknown
              if (Array.isArray(arr) && arr.length > 0) {
                ipProbeHits30m.set(ip, (ipProbeHits30m.get(ip) || 0) + 1)
              }
            } catch {}
          }
        }
      }

      const logsWithRisk = logs.map((log) => {
        const rowFlags = parsedFlagsByLog.get(log.id) || []
        const riskFlags: string[] = []
        let riskScore = Math.min(45, rowFlags.length * 15)

        const ip = log.ipAddress || null
        const hits10m = ip ? ipHits10m.get(ip) || 0 : 0
        const hits30m = ip ? ipHits30m.get(ip) || 0 : 0
        const probes30m = ip ? ipProbeHits30m.get(ip) || 0 : 0
        const uaVariety30m = ip ? (ipUaSet30m.get(ip)?.size || 0) : 0

        if (hits10m >= 200) {
          riskFlags.push('TRAFFIC_BURST_IP_HIGH')
          riskScore += 35
        } else if (hits10m >= 80) {
          riskFlags.push('TRAFFIC_BURST_IP')
          riskScore += 20
        }

        if (hits30m >= 20 && uaVariety30m >= 6) {
          riskFlags.push('USER_AGENT_CHURN_IP')
          riskScore += 20
        }

        if (probes30m >= 4) {
          riskFlags.push('PROBE_CLUSTER_IP')
          riskScore += probes30m >= 8 ? 30 : 18
        }

        if ((log.userAgent || '').trim() === '') {
          if (!riskFlags.includes('EMPTY_USER_AGENT')) riskFlags.push('EMPTY_USER_AGENT')
          riskScore += 10
        }

        if (rowFlags.includes('LEAK_SUSPECTED')) riskScore += 25
        riskScore = Math.max(0, Math.min(100, riskScore))
        return {
          ...log,
          riskFlags,
          riskScore,
        }
      })

      const highRiskHits = logsWithRisk.filter((l) => (l.riskScore ?? 0) >= 60).length

      return NextResponse.json({
        logs: logsWithRisk,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        summary: { uniqueIps, uniqueSessions, highRiskHits },
      })
    }

    if (action === 'blockedIps') {
      const blocked = await prisma.blockedIp.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
      })
      const blockingActive = Boolean(process.env.BLOCKED_IP_LIST_SECRET?.trim())
      return NextResponse.json({ blocked, blockingActive })
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
      } else if (status === 'review') {
        where.contentInspectionStatus = 'review'
        where.isDeleted = false
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
                purchases: true,
              },
            },
            versions: {
              orderBy: { height: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.media.count({ where }),
      ])

      // BigInt fields (fileSize, versions[].fileSize) must be JSON-serialized explicitly
      const mediaJson = media.map((m: any) => ({
        ...m,
        fileSize: m.fileSize === null || m.fileSize === undefined ? null : m.fileSize.toString(),
        versions: (m.versions || []).map((v: any) => ({
          ...v,
          fileSize: v.fileSize === null || v.fileSize === undefined ? null : v.fileSize.toString(),
        })),
      }))

      return NextResponse.json({
        media: mediaJson,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    }

    // Get membership plans for admin management
    if (action === 'membershipPlans') {
      let plans = await prisma.membershipPlan.findMany({
        orderBy: { sortOrder: 'asc' },
      })
      
      // If no plans exist, create default ones
      if (plans.length === 0) {
        const defaultPlans = [
          { planId: 'viewer', name: 'Viewer', monthlyPrice: 0, yearlyPrice: 0, freeUploads: 5, pricePerUpload: null, viewContents: true, buyContents: true, sellContents: true, sortOrder: 0 },
          { planId: 'basic', name: 'Basic', monthlyPrice: 2, yearlyPrice: 20, freeUploads: 10, pricePerUpload: 1, viewContents: true, buyContents: true, sellContents: true, sortOrder: 1 },
          { planId: 'advanced', name: 'Advanced', monthlyPrice: 5, yearlyPrice: 50, freeUploads: 20, pricePerUpload: 0.5, viewContents: true, buyContents: true, sellContents: true, sortOrder: 2 },
          { planId: 'premium', name: 'Premium', monthlyPrice: 8, yearlyPrice: 80, freeUploads: 30, pricePerUpload: null, viewContents: true, buyContents: true, sellContents: true, sortOrder: 3 },
        ]
        
        for (const plan of defaultPlans) {
          await prisma.membershipPlan.create({ data: plan })
        }
        
        plans = await prisma.membershipPlan.findMany({
          orderBy: { sortOrder: 'asc' },
        })
      }
      
      return NextResponse.json({ plans })
    }

    // Get promotions for admin management
    if (action === 'promotions') {
      const promotions = await prisma.promotion.findMany({
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json({ promotions })
    }

    // Get game settings for admin management
    if (action === 'gameSettings') {
      let games = await prisma.gameSetting.findMany({
        orderBy: { sortOrder: 'asc' },
      })
      
      // If no game settings exist, create defaults
      if (games.length === 0) {
        const defaultGames = [
          { gameId: 'tetris', name: 'Tetris', isEnabled: true, sortOrder: 0 },
          { gameId: 'minesweeper', name: 'Minesweeper', isEnabled: true, sortOrder: 1 },
          { gameId: 'donkeykong', name: 'Donkey Kong', isEnabled: true, sortOrder: 2 },
          { gameId: 'pacman', name: 'Pac-Man', isEnabled: true, sortOrder: 3 },
          { gameId: 'breakout', name: 'Block Breaker', isEnabled: true, sortOrder: 4 },
          { gameId: 'pong', name: 'Pong', isEnabled: true, sortOrder: 5 },
        ]
        
        for (const game of defaultGames) {
          await prisma.gameSetting.create({ data: game })
        }
        
        games = await prisma.gameSetting.findMany({
          orderBy: { sortOrder: 'asc' },
        })
      }
      
      return NextResponse.json({ games })
    }

    // Get navbar menu settings for admin management
    if (action === 'navbarSettings') {
      const defaultItems = [
        { itemKey: 'home', label: 'Home', isEnabled: true, sortOrder: 0 },
        { itemKey: 'all', label: 'All', isEnabled: true, sortOrder: 1 },
        { itemKey: 'videos', label: 'Videos', isEnabled: true, sortOrder: 2 },
        { itemKey: 'images', label: 'Images', isEnabled: true, sortOrder: 3 },
        { itemKey: 'about', label: 'About', isEnabled: true, sortOrder: 4 },
        { itemKey: 'play', label: 'Play', isEnabled: true, sortOrder: 5 },
        { itemKey: 'chat', label: 'Chat', isEnabled: true, sortOrder: 6 },
        { itemKey: 'mediaMessage', label: 'Celebration Card', isEnabled: true, sortOrder: 7 },
        { itemKey: 'upload', label: 'Post', isEnabled: true, sortOrder: 8 },
        { itemKey: 'cropTool', label: 'Crop Tool', isEnabled: true, sortOrder: 9 },
        { itemKey: 'signIn', label: 'Log in', isEnabled: true, sortOrder: 10 },
        { itemKey: 'signUp', label: 'Join', isEnabled: true, sortOrder: 11 },
        { itemKey: 'notification', label: 'Notification', isEnabled: true, sortOrder: 12 },
      ]

      try {
        let items = await prisma.navbarMenuSetting.findMany({
          orderBy: { sortOrder: 'asc' },
        })

        if (items.length === 0) {
          for (const item of defaultItems) {
            await prisma.navbarMenuSetting.create({ data: item })
          }
        } else {
          const existingKeys = new Set(items.map((item) => item.itemKey))
          const missingItems = defaultItems.filter((item) => !existingKeys.has(item.itemKey))

          // One-time migration for legacy deployments:
          // Older DBs created `signIn` with sortOrder=9. When `cropTool` is added later as a
          // missing item (also defaulting to sortOrder=9) and we intentionally do NOT
          // overwrite existing sortOrders, this creates a collision and non-deterministic ordering.
          //
          // If we detect the legacy default sequence (signIn=9, signUp=10, notification=11)
          // we shift those three up by +1 before inserting the missing `cropTool`.
          const missingKeys = new Set(missingItems.map((i) => i.itemKey))
          const cropToolMissing = missingKeys.has('cropTool')
          const signInItem = items.find((i) => i.itemKey === 'signIn')
          const signUpItem = items.find((i) => i.itemKey === 'signUp')
          const notificationItem = items.find((i) => i.itemKey === 'notification')

          const legacySequenceMatches =
            cropToolMissing &&
            signInItem?.sortOrder === 9 &&
            signUpItem?.sortOrder === 10 &&
            notificationItem?.sortOrder === 11 &&
            items.every((i) => i.sortOrder !== 9 || i.itemKey === 'signIn') &&
            items.every((i) => i.sortOrder !== 10 || i.itemKey === 'signUp') &&
            items.every((i) => i.sortOrder !== 11 || i.itemKey === 'notification')

          if (legacySequenceMatches) {
            await prisma.navbarMenuSetting.update({
              where: { id: signInItem!.id },
              data: { sortOrder: 10 },
            })
            await prisma.navbarMenuSetting.update({
              where: { id: signUpItem!.id },
              data: { sortOrder: 11 },
            })
            await prisma.navbarMenuSetting.update({
              where: { id: notificationItem!.id },
              data: { sortOrder: 12 },
            })
          }

          for (const item of missingItems) {
            await prisma.navbarMenuSetting.create({ data: item })
          }
          const defaultByKey = new Map(defaultItems.map((d) => [d.itemKey, d]))
          for (const item of items) {
            const expected = defaultByKey.get(item.itemKey)
            if (!expected) continue
            // Preserve admin/custom ordering: only sync labels (and only for existing items).
            // sortOrder is user-controlled and should not be overwritten on every GET.
            if (item.label !== expected.label) {
              await prisma.navbarMenuSetting.update({
                where: { id: item.id },
                data: {
                  label: expected.label,
                },
              })
            }
          }
        }

        items = await prisma.navbarMenuSetting.findMany({
          orderBy: { sortOrder: 'asc' },
        })

        const filteredItems = items.filter(
          (item) => item.itemKey !== 'marketing' && item.itemKey !== 'cropTool'
        )
        return NextResponse.json({ items: filteredItems })
      } catch (error) {
        console.error('Navbar settings unavailable, returning defaults:', error)
        return NextResponse.json({ items: defaultItems, warning: 'NAVBAR_SETTINGS_UNAVAILABLE' })
      }
    }

    // Get home feed layout setting (masonry | grid_top | grid_center, preplay on/off)
    if (action === 'homeLayoutSettings') {
      try {
        let row = await getFirstHomeLayoutSetting()
        if (!row) {
          row = await prisma.homeLayoutSetting.create({ data: { layout: 'masonry' } })
        }
        const layout = ['masonry', 'grid_top', 'grid_center'].includes(row.layout)
          ? row.layout
          : row.layout === 'grid'
            ? 'grid_center'
            : 'masonry'
        const preplay = row.preplay
        const homePreplaySound = row.homePreplaySound !== false
        const autoTranslation = row.autoTranslation !== false
        return NextResponse.json({ layout, preplay, homePreplaySound, autoTranslation })
      } catch (error) {
        console.error('Home layout settings unavailable:', error)
        return NextResponse.json({ layout: 'masonry', preplay: true, homePreplaySound: true, autoTranslation: true })
      }
    }

    // Get media detail page settings (Download/Share visibility + share apps)
    if (action === 'mediaDetailSettings') {
      try {
        let row = await prisma.mediaDetailSetting.findFirst()
        if (!row) {
          row = await prisma.mediaDetailSetting.create({ data: {} })
        }
        const rowWithExtras = row as { sendByEmailEnabled?: boolean; shareAppsEnabled?: unknown }
        const { normalizeShareAppsEnabled, DEFAULT_SHARE_APPS } = await import('@/app/api/ui/media-detail/shareAppsConfig')
        const shareAppsEnabled = normalizeShareAppsEnabled(rowWithExtras.shareAppsEnabled ?? DEFAULT_SHARE_APPS)
        return NextResponse.json({
          downloadEnabled: row.downloadEnabled ?? true,
          shareEnabled: row.shareEnabled ?? true,
          sendByEmailEnabled: rowWithExtras.sendByEmailEnabled ?? true,
          aiToolEnabled: row.aiToolEnabled ?? true,
          shareAppsEnabled,
        })
      } catch (error) {
        console.error('Media detail settings unavailable:', error)
        const { DEFAULT_SHARE_APPS } = await import('@/app/api/ui/media-detail/shareAppsConfig')
        return NextResponse.json({
          downloadEnabled: true,
          shareEnabled: true,
          sendByEmailEnabled: true,
          aiToolEnabled: true,
          shareAppsEnabled: { ...DEFAULT_SHARE_APPS },
        })
      }
    }

    // Get authentication verification settings for admin management
    if (action === 'authenticationSettings') {
      try {
        let row = await prisma.mediaDetailSetting.findFirst()
        if (!row) {
          row = await prisma.mediaDetailSetting.create({ data: {} })
        }
        const raw = (row as { shareAppsEnabled?: unknown }).shareAppsEnabled
        const auth =
          raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).__auth &&
          typeof (raw as Record<string, unknown>).__auth === 'object' &&
          !Array.isArray((raw as Record<string, unknown>).__auth)
            ? ((raw as Record<string, unknown>).__auth as Record<string, unknown>)
            : null
        return NextResponse.json({
          emailVerificationEnabled: auth?.emailVerificationEnabled !== false,
          phoneVerificationEnabled: auth?.phoneVerificationEnabled !== false,
          selfServiceDeactivateAccountEnabled: auth?.selfServiceDeactivateAccountEnabled !== false,
        })
      } catch (error) {
        console.error('Authentication settings unavailable:', error)
        return NextResponse.json({
          emailVerificationEnabled: true,
          phoneVerificationEnabled: true,
          selfServiceDeactivateAccountEnabled: true,
        })
      }
    }

    // Get media badge settings for admin management
    if (action === 'badgeSettings') {
      const defaultItems = [
        { itemKey: 'ai', label: 'AI', isEnabled: true, sortOrder: 0 },
        { itemKey: 'price', label: 'Price', isEnabled: true, sortOrder: 1 },
        { itemKey: 'sold', label: 'Times Sold', isEnabled: true, sortOrder: 2 },
        { itemKey: 'views', label: 'View', isEnabled: true, sortOrder: 3 },
        { itemKey: 'postDate', label: 'Post Date', isEnabled: true, sortOrder: 4 },
        { itemKey: 'smileRate', label: 'Thumbsup', isEnabled: true, sortOrder: 5 },
        { itemKey: 'comment', label: 'Comment', isEnabled: true, sortOrder: 6 },
        {
          itemKey: 'descriptionThumbnails',
          label: 'Description thumbnails',
          isEnabled: true,
          sortOrder: 7,
        },
        { itemKey: 'share', label: 'Share', isEnabled: true, sortOrder: 8 },
        { itemKey: 'mediaType', label: 'Media type', isEnabled: true, sortOrder: 9 },
      ]

      try {
        let items = await prisma.mediaBadgeSetting.findMany({
          orderBy: { sortOrder: 'asc' },
        })

        if (items.length === 0) {
          for (const item of defaultItems) {
            await prisma.mediaBadgeSetting.create({ data: item })
          }
        } else {
          const existingKeys = new Set(items.map((item) => item.itemKey))
          const missingItems = defaultItems.filter((item) => !existingKeys.has(item.itemKey))
          for (const item of missingItems) {
            await prisma.mediaBadgeSetting.create({ data: item })
          }
        }

        items = await prisma.mediaBadgeSetting.findMany({
          orderBy: { sortOrder: 'asc' },
        })

        const renamed = await prisma.mediaBadgeSetting.updateMany({
          where: {
            itemKey: 'smileRate',
            label: { in: ['Smile Rate', 'Likes'] },
          },
          data: { label: 'Thumbsup' },
        })
        if (renamed.count > 0) {
          items = await prisma.mediaBadgeSetting.findMany({
            orderBy: { sortOrder: 'asc' },
          })
        }

        // Not a tile badge — use Home Layout / dedicated "Homepage media sound" control only.
        items = items.filter((i) => i.itemKey !== 'homePreplaySound')

        return NextResponse.json({ items })
      } catch (error) {
        console.error('Badge settings unavailable, returning defaults:', error)
        return NextResponse.json({ items: defaultItems, warning: 'MEDIA_BADGE_SETTINGS_UNAVAILABLE' })
      }
    }
    // Get crop tool settings for admin management
    if (action === 'cropToolSettings') {
      const defaults = {
        isEnabled: true,
        imageQuality: 0.92, videoBitrateMbps: 8.0, videoFps: 30, audioBitrateKbps: 256,
        freeImageQuality: 0.75, freeVideoBitrateMbps: 4.0, freeVideoFps: 24, freeAudioBitrateKbps: 128,
        freeStreamMaxHeight: 720, freeDownloadMaxHeight: 720, paidDownloadQuality: 'hq' as const,
        maxUploadSizeMb: 10,
      }
      try {
        let settings = await prisma.cropToolSetting.findFirst()

        if (!settings) {
          settings = await prisma.cropToolSetting.create({ data: defaults })
        }

        return NextResponse.json({ settings })
      } catch (error) {
        console.error('Crop tool settings unavailable:', error)
        return NextResponse.json({ settings: defaults, warning: 'CROP_TOOL_SETTINGS_UNAVAILABLE' })
      }
    }

    // Default: return dashboard stats (totalMedia = non-deleted only, to match Media tab list)
    const [totalUsers, totalMedia, totalComments, pendingReports] =
      await Promise.all([
        prisma.user.count(),
        prisma.media.count({ where: { isDeleted: false } }),
        prisma.comment.count(),
        prisma.report.count({ where: { status: 'PENDING' } }),
      ])

    const mediaByType = await prisma.media.groupBy({
      by: ['type'],
      where: { isDeleted: false },
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
    const reauthErr = requireAdminPanelElevation(request, session)
    if (reauthErr) return reauthErr

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
              subject: 'AI Media Tank (AiM) — Content suspended',
              html: `
                <h2>Content Suspended</h2>
                <p>Your content "<strong>${data?.mediaTitle || 'Untitled'}</strong>" has been suspended on AI Media Tank (AiM).</p>
                <p><strong>Reason:</strong> ${suspendReason}</p>
                <p>Please review our community guidelines. If you believe this was a mistake, please contact our support team.</p>
                <p>Best regards,<br>AI Media Tank (AiM) Team</p>
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

      case 'clearContentInspectionAlert':
        await prisma.media.update({
          where: { id: targetId },
          data: {
            contentInspectionStatus: 'pass',
            contentInspectionAlertAt: null,
            contentInspectionSummary: null,
          },
        })
        await logAdminAction(adminId, 'CLEAR_CONTENT_INSPECTION_ALERT', 'MEDIA', targetId)
        return NextResponse.json({ message: 'Content inspection alert cleared' })

      case 'clearChatInspectionAlert':
        await prisma.chatMessage.update({
          where: { id: targetId },
          data: {
            contentInspectionStatus: 'pass',
            contentInspectionAlertAt: null,
            contentInspectionSummary: null,
          },
        })
        await logAdminAction(adminId, 'CLEAR_CHAT_INSPECTION_ALERT', 'CHAT_MESSAGE', targetId)
        return NextResponse.json({ message: 'Chat inspection alert cleared' })

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
              subject: 'AI Media Tank (AiM) — Content removed',
              html: `
                <h2>Content Removed</h2>
                <p>Your content "<strong>${data?.mediaTitle || 'Untitled'}</strong>" has been removed from AI Media Tank (AiM).</p>
                <p><strong>Reason:</strong> ${deletionReason}</p>
                <p>If you believe this was a mistake, please contact our support team.</p>
                <p>Best regards,<br>AI Media Tank (AiM) Team</p>
              `,
            })
          } catch (err) {
            console.error('Failed to send deletion notification email:', err)
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

      case 'deleteUser': {
        const shouldSendDeleteEmail = data?.sendEmail !== false
        const deleteReason = data?.reason || 'Account violation'
        const deleteUserEmail = data?.email
        const deleteUsername = data?.username
        
        // Get user info before deletion if we need to send email
        let userToDelete = null
        if (shouldSendDeleteEmail && !deleteUserEmail) {
          userToDelete = await prisma.user.findUnique({
            where: { id: targetId },
            select: { email: true, legalName: true, username: true }
          })
        }
        
        const recipientEmail = deleteUserEmail || userToDelete?.email
        const recipientName = deleteUsername || userToDelete?.username
        
        await prisma.user.delete({
          where: { id: targetId },
        })
        
        // Send email notification before deletion if requested
        let deleteEmailSent = false
        if (shouldSendDeleteEmail && recipientEmail) {
          try {
            const { sendEmail, generateAccountDeletedEmail } = await import('@/lib/email')
            deleteEmailSent = await sendEmail({
              to: recipientEmail,
              subject: '🗑️ Your AI Media Tank (AiM) Account Has Been Deleted',
              html: generateAccountDeletedEmail(recipientName || 'User', deleteReason)
            })
            if (deleteEmailSent) {
              console.log(`Account deletion email sent to ${recipientEmail}`)
            } else {
              console.log(`Account deletion email FAILED to send to ${recipientEmail}`)
            }
          } catch (emailError) {
            console.error('Failed to send account deletion email:', emailError)
            deleteEmailSent = false
          }
        }
        
        await logAdminAction(adminId, 'DELETE_USER', 'USER', targetId, { reason: deleteReason, emailSent: deleteEmailSent })
        return NextResponse.json({ 
          message: `User deleted${shouldSendDeleteEmail ? (deleteEmailSent ? ' (email sent)' : ' (email failed)') : ''}`,
          emailSent: deleteEmailSent
        })
      }

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
        const shouldSendSuspendEmail = data?.sendEmail !== false // Default to true for backward compatibility
        
        await prisma.user.update({
          where: { id: targetId },
          data: {
            isSuspended: true,
            suspendedAt: new Date(),
            suspendedUntil: suspendUntil,
            suspendReason: suspendReason,
          },
        })
        
        // Create in-app notification for user
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'suspension',
            title: 'Account Suspended',
            message: `🚫 Your account has been suspended${suspendUntil ? ` until ${suspendUntil.toLocaleDateString()}` : ' permanently'}. Reason: ${suspendReason}`,
          },
        })
        
        // Send email notification only if requested
        let suspendEmailSent = false
        if (shouldSendSuspendEmail && suspendTargetUser) {
          try {
            const { sendEmail, generateSuspensionEmail } = await import('@/lib/email')
            const userName = suspendTargetUser.legalName || suspendTargetUser.username || 'User'
            suspendEmailSent = await sendEmail({
              to: suspendTargetUser.email,
              subject: '🚫 Your AI Media Tank (AiM) Account Has Been Suspended',
              html: generateSuspensionEmail(userName, suspendReason, suspendUntil)
            })
            if (suspendEmailSent) {
              console.log(`Suspension email sent to ${suspendTargetUser.email}`)
            } else {
              console.log(`Suspension email FAILED to send to ${suspendTargetUser.email}`)
            }
          } catch (emailError) {
            console.error('Failed to send suspension email:', emailError)
            suspendEmailSent = false
          }
        }
        
        await logAdminAction(adminId, 'SUSPEND_USER', 'USER', targetId, { ...data, emailSent: suspendEmailSent })
        return NextResponse.json({ 
          message: `User suspended${shouldSendSuspendEmail ? (suspendEmailSent ? ' (email sent)' : ' (email failed)') : ''}`,
          emailSent: suspendEmailSent
        })
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
        
        // Create in-app notification for user
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'info',
            title: 'Account Reinstated',
            message: '✅ Your account has been reinstated and is now fully active.',
          },
        })
        
        // Send email notification
        let unsuspendEmailSent = false
        if (unsuspendTargetUser) {
          try {
            const { sendEmail, generateUnsuspensionEmail } = await import('@/lib/email')
            const userName = unsuspendTargetUser.legalName || unsuspendTargetUser.username || 'User'
            unsuspendEmailSent = await sendEmail({
              to: unsuspendTargetUser.email,
              subject: '✅ Your AI Media Tank (AiM) Account Has Been Reinstated',
              html: generateUnsuspensionEmail(userName)
            })
            if (unsuspendEmailSent) {
              console.log(`Unsuspension email sent to ${unsuspendTargetUser.email}`)
            } else {
              console.log(`Unsuspension email FAILED to send to ${unsuspendTargetUser.email}`)
            }
          } catch (emailError) {
            console.error('Failed to send unsuspension email:', emailError)
            unsuspendEmailSent = false
          }
        }
        
        await logAdminAction(adminId, 'UNSUSPEND_USER', 'USER', targetId, { emailSent: unsuspendEmailSent })
        return NextResponse.json({ 
          message: `User unsuspended${unsuspendEmailSent ? ' (email sent)' : ' (email failed)'}`,
          emailSent: unsuspendEmailSent
        })
      }

      case 'warnUser': {
        // Get user info for email
        const warnTargetUser = await prisma.user.findUnique({
          where: { id: targetId },
          select: { email: true, legalName: true, username: true, warningCount: true }
        })
        
        const warningReason = data?.reason || 'Policy violation'
        const newWarningCount = (warnTargetUser?.warningCount || 0) + 1
        const shouldSendWarningEmail = data?.sendEmail !== false // Default to true for backward compatibility
        
        // Create ChatWarning record (for tracking and auto-sync)
        await prisma.chatWarning.create({
          data: {
            userId: targetId,
            messageId: null,
            messageContent: null,
            reason: warningReason,
            action: 'WARNING',
            adminId,
          },
        })
        
        await prisma.user.update({
          where: { id: targetId },
          data: {
            warningCount: { increment: 1 },
            lastWarningAt: new Date(),
            lastWarningReason: warningReason,
          },
        })
        
        // Create in-app notification for user
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'warning',
            title: 'Account Warning',
            message: `⚠️ Warning: ${warningReason}. You now have ${newWarningCount} warning(s).`,
          },
        })
        
        // Send email notification only if requested
        let warningEmailSent = false
        if (shouldSendWarningEmail && warnTargetUser) {
          try {
            const { sendEmail, generateWarningEmail } = await import('@/lib/email')
            const userName = warnTargetUser.legalName || warnTargetUser.username || 'User'
            warningEmailSent = await sendEmail({
              to: warnTargetUser.email,
              subject: '⚠️ Warning: Your AI Media Tank (AiM) Account',
              html: generateWarningEmail(userName, warningReason, newWarningCount)
            })
          } catch (err) {
            console.error('Failed to send warning email:', err)
          }
        }
        
        await logAdminAction(adminId, 'WARN_USER', 'USER', targetId, { ...data, emailSent: warningEmailSent })
        return NextResponse.json({ 
          message: 'User warned',
          emailSent: warningEmailSent,
          notificationSent: true
        })
      }

      case 'getWarningHistory': {
        // Fetch actual warning records
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
        
        // Auto-sync: Check if user's warningCount matches actual records
        const user = await prisma.user.findUnique({
          where: { id: targetId },
          select: { warningCount: true }
        })
        
        const actualWarningCount = warnings.length
        
        // If mismatch, auto-correct the user's warningCount
        if (user && user.warningCount !== actualWarningCount) {
          await prisma.user.update({
            where: { id: targetId },
            data: {
              warningCount: actualWarningCount,
              // Clear warning fields if no more warnings
              ...(actualWarningCount === 0 && {
                lastWarningAt: null,
                lastWarningReason: null,
              })
            }
          })
          console.log(`Auto-synced warningCount for user ${targetId}: ${user.warningCount} -> ${actualWarningCount}`)
        }
        
        return NextResponse.json({ warnings, warningCount: actualWarningCount })
      }

      case 'clearWarnings':
        // Delete all ChatWarning records for this user
        await prisma.chatWarning.deleteMany({
          where: { userId: targetId },
        })
        // Update user's warning fields
        await prisma.user.update({
          where: { id: targetId },
          data: {
            warningCount: 0,
            lastWarningAt: null,
            lastWarningReason: null,
          },
        })
        // Notify user
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'system',
            title: 'Warnings Cleared',
            message: '✅ All your warnings have been cleared by an administrator.',
          },
        })
        await logAdminAction(adminId, 'CLEAR_WARNINGS', 'USER', targetId)
        return NextResponse.json({ message: 'Warnings cleared' })

      case 'getCreditHistory': {
        // Get user's current credits
        const creditUser = await prisma.user.findUnique({
          where: { id: targetId },
          select: { bonusCredits: true, paidUploadCredits: true, createdAt: true }
        })
        
        // Get existing credit history
        let creditHistory = await prisma.creditHistory.findMany({
          where: { userId: targetId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
        
        // Auto-sync: If user has credits but no history, create initial record
        const totalCredits = (creditUser?.bonusCredits || 0) + (creditUser?.paidUploadCredits || 0)
        const historyTotal = creditHistory.reduce((sum, h) => sum + h.amount, 0)
        
        if (totalCredits > 0 && creditHistory.length === 0) {
          // No history at all - create initial record for all credits
          const newRecord = await prisma.creditHistory.create({
            data: {
              userId: targetId,
              amount: totalCredits,
              type: 'bonus',
              reason: 'Platform launching event credit',
              adminId: null,
              adminName: 'System',
              createdAt: creditUser?.createdAt || new Date() // Use user's signup date
            }
          })
          creditHistory = [newRecord]
          console.log(`Auto-created credit history for user ${targetId}: ${totalCredits} credits`)
        } else if (totalCredits > historyTotal && historyTotal > 0) {
          // Has some history but credits don't match - create adjustment record
          const difference = totalCredits - historyTotal
          const newRecord = await prisma.creditHistory.create({
            data: {
              userId: targetId,
              amount: difference,
              type: 'bonus',
              reason: 'Credit adjustment (auto-sync)',
              adminId: null,
              adminName: 'System',
            }
          })
          creditHistory = [newRecord, ...creditHistory]
          console.log(`Auto-synced credit history for user ${targetId}: +${difference} credits`)
        }
        
        return NextResponse.json({ creditHistory })
      }

      case 'addCreditHistoryRecord': {
        // Manually add a credit history record for existing credits without history
        const amount = parseInt(data?.amount) || 0
        const reason = data?.reason || 'Initial credits'
        const dateStr = data?.date // Optional: backdate the record
        
        if (amount === 0) {
          return NextResponse.json({ error: 'Amount is required' }, { status: 400 })
        }
        
        const adminUser = await prisma.user.findUnique({
          where: { id: adminId },
          select: { username: true }
        })
        
        await prisma.creditHistory.create({
          data: {
            userId: targetId,
            amount,
            type: 'bonus',
            reason,
            adminId,
            adminName: adminUser?.username || 'Admin',
            ...(dateStr && { createdAt: new Date(dateStr) })
          }
        })
        
        await logAdminAction(adminId, 'ADD_CREDIT_HISTORY', 'USER', targetId, { amount, reason })
        return NextResponse.json({ message: 'Credit history record added' })
      }

      case 'giveCredits': {
        const credits = parseInt(data?.credits) || 0
        const shouldSendEmail = data?.sendEmail !== false // Default to true for backward compatibility
        const reason = data?.reason || 'Admin bonus credits'
        
        if (credits <= 0) {
          return NextResponse.json({ error: 'Invalid credits amount' }, { status: 400 })
        }
        
        // Get user info for email and admin info for history
        const [creditUser, adminUser] = await Promise.all([
          prisma.user.findUnique({
            where: { id: targetId },
            select: { email: true, legalName: true, username: true, bonusCredits: true, paidUploadCredits: true }
          }),
          prisma.user.findUnique({
            where: { id: adminId },
            select: { username: true }
          })
        ])
        
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
        
        // Log credit history
        await prisma.creditHistory.create({
          data: {
            userId: targetId,
            amount: credits,
            type: 'bonus',
            reason: reason,
            adminId: adminId,
            adminName: adminUser?.username || 'Admin',
          }
        })
        
        // Create in-app notification for user
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'credits',
            title: 'Bonus Credits Received',
            message: `🎁 You received ${credits} bonus upload credits! You now have ${newTotalCredits} total credits.${reason !== 'Admin bonus credits' ? ` Reason: ${reason}` : ''}`,
          },
        })
        
        // Send email notification only if requested
        let emailActuallySent = false
        if (shouldSendEmail) {
          try {
            const { sendEmail, generateBonusCreditsEmail } = await import('@/lib/email')
            const userName = creditUser.legalName || creditUser.username || 'User'
            // Use the comment as email subject if provided, otherwise use default
            const emailSubject = reason && reason !== 'Admin bonus credits' 
              ? `🎁 ${reason}` 
              : `🎁 You Received ${credits} Bonus Credits!`
            emailActuallySent = await sendEmail({
              to: creditUser.email,
              subject: emailSubject,
              html: generateBonusCreditsEmail(userName, credits, newTotalCredits, reason)
            })
            if (emailActuallySent) {
              console.log(`Bonus credits email sent to ${creditUser.email}`)
            } else {
              console.log(`Bonus credits email FAILED to send to ${creditUser.email}`)
            }
          } catch (emailError) {
            console.error('Failed to send bonus credits email:', emailError)
            emailActuallySent = false
          }
        }
        
        await logAdminAction(adminId, 'GIVE_CREDITS', 'USER', targetId, { credits, reason, emailSent: emailActuallySent })
        return NextResponse.json({ 
          message: `${credits} credits given${shouldSendEmail ? (emailActuallySent ? ' (email sent)' : ' (email failed)') : ''}`,
          emailSent: emailActuallySent
        })
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
      case 'deleteChatMessage': {
        const deleteMessageReason = data?.reason || 'Message violated community guidelines'
        const shouldSendDeleteMessageEmail = data?.sendEmail !== false
        const deleteMessageUserEmail = data?.email
        
        // First check if there's a warning associated with this message
        const associatedWarning = await prisma.chatWarning.findFirst({
          where: { messageId: targetId }
        })
        
        // Get the message to find the user and content
        const messageToDelete = await prisma.chatMessage.findUnique({
          where: { id: targetId },
          select: { userId: true, content: true }
        })
        
        // Get user info for email if needed
        let deleteMessageUser = null
        if (shouldSendDeleteMessageEmail && messageToDelete?.userId) {
          deleteMessageUser = await prisma.user.findUnique({
            where: { id: messageToDelete.userId },
            select: { email: true, legalName: true, username: true }
          })
        }
        
        const userEmail = deleteMessageUserEmail || deleteMessageUser?.email
        const userName = deleteMessageUser?.legalName || deleteMessageUser?.username || data?.username || 'User'
        const messageContent = messageToDelete?.content || 'Message content unavailable'
        
        // Delete the message
        await prisma.chatMessage.delete({
          where: { id: targetId },
        })
        
        // Create in-app notification
        if (messageToDelete?.userId) {
          await prisma.notification.create({
            data: {
              userId: messageToDelete.userId,
              type: 'system',
              title: 'Chat Message Deleted',
              message: `🗑️ Your chat message was deleted. Reason: ${deleteMessageReason}`,
            },
          })
        }
        
        // Send email notification if requested
        let deleteMessageEmailSent = false
        if (shouldSendDeleteMessageEmail && userEmail) {
          try {
            const { sendEmail, generateChatMessageDeletedEmail } = await import('@/lib/email')
            deleteMessageEmailSent = await sendEmail({
              to: userEmail,
              subject: `🗑️ Chat Message Deleted`,
              html: generateChatMessageDeletedEmail(userName, deleteMessageReason, messageContent)
            })
            if (deleteMessageEmailSent) {
              console.log(`Chat message deleted email sent to ${userEmail}`)
            } else {
              console.log(`Chat message deleted email FAILED to send to ${userEmail}`)
            }
          } catch (emailError) {
            console.error('Failed to send chat message deleted email:', emailError)
            deleteMessageEmailSent = false
          }
        }
        
        await logAdminAction(adminId, 'DELETE_CHAT_MESSAGE', 'CHAT_MESSAGE', targetId, { reason: deleteMessageReason, emailSent: deleteMessageEmailSent })
        
        // If there was an associated warning, clear it
        if (associatedWarning && messageToDelete?.userId) {
          // Delete the warning record
          await prisma.chatWarning.delete({
            where: { id: associatedWarning.id }
          })
          
          // Decrement user's warning count
          const warnedUser = await prisma.user.findUnique({
            where: { id: messageToDelete.userId },
            select: { warningCount: true }
          })
          
          if (warnedUser && warnedUser.warningCount > 0) {
            const newWarningCount = warnedUser.warningCount - 1
            await prisma.user.update({
              where: { id: messageToDelete.userId },
              data: {
                warningCount: newWarningCount,
                // Clear warning fields if no more warnings
                ...(newWarningCount === 0 && {
                  lastWarningAt: null,
                  lastWarningReason: null,
                })
              }
            })
            
            // Notify user that warning was cleared
            if (newWarningCount === 0) {
              await prisma.notification.create({
                data: {
                  userId: messageToDelete.userId,
                  type: 'system',
                  title: 'Warning Cleared',
                  message: '✅ Your warning has been cleared as the associated message was removed.',
                },
              })
            }
          }
        }
        
        return NextResponse.json({ 
          message: `Chat message deleted${shouldSendDeleteMessageEmail ? (deleteMessageEmailSent ? ' (email sent)' : ' (email failed)') : ''}`,
          emailSent: deleteMessageEmailSent
        })
      }

      case 'warnChatUser': {
        const chatWarningReason = data?.reason || 'Inappropriate message'
        const shouldSendChatWarningEmail = data?.sendEmail !== false
        
        // Get user info for email if needed
        let chatWarnUser = null
        if (shouldSendChatWarningEmail) {
          chatWarnUser = await prisma.user.findUnique({
            where: { id: targetId },
            select: { email: true, legalName: true, username: true, warningCount: true }
          })
        }
        
        // Create chat warning record
        await prisma.chatWarning.create({
          data: {
            userId: targetId,
            messageId: data?.messageId,
            messageContent: data?.messageContent,
            reason: chatWarningReason,
            action: data?.action || 'WARNING', // WARNING, MUTE, BAN
            duration: data?.duration, // minutes for mute
            adminId,
          },
        })
        
        // Update user warning count
        const updatedUser = await prisma.user.update({
          where: { id: targetId },
          data: {
            warningCount: { increment: 1 },
            lastWarningAt: new Date(),
            lastWarningReason: `Chat: ${chatWarningReason}`,
          },
        })
        
        const newWarningCount = updatedUser.warningCount
        
        // Create in-app notification
        await prisma.notification.create({
          data: {
            userId: targetId,
            type: 'chat_warning',
            title: 'Chat Warning',
            message: `⚠️ Chat Warning: ${chatWarningReason}`,
          },
        })
        
        // Send email notification if requested
        let chatWarningEmailSent = false
        if (shouldSendChatWarningEmail && chatWarnUser) {
          try {
            const { sendEmail, generateChatWarningEmail } = await import('@/lib/email')
            const userName = chatWarnUser.legalName || chatWarnUser.username || 'User'
            chatWarningEmailSent = await sendEmail({
              to: chatWarnUser.email,
              subject: `⚠️ Chat Warning: ${chatWarningReason}`,
              html: generateChatWarningEmail(userName, chatWarningReason, data?.messageContent, newWarningCount)
            })
            if (chatWarningEmailSent) {
              console.log(`Chat warning email sent to ${chatWarnUser.email}`)
            } else {
              console.log(`Chat warning email FAILED to send to ${chatWarnUser.email}`)
            }
          } catch (emailError) {
            console.error('Failed to send chat warning email:', emailError)
            chatWarningEmailSent = false
          }
        }
        
        await logAdminAction(adminId, 'WARN_CHAT_USER', 'USER', targetId, { ...data, emailSent: chatWarningEmailSent })
        return NextResponse.json({ 
          message: `Chat user warned${shouldSendChatWarningEmail ? (chatWarningEmailSent ? ' (email sent)' : ' (email failed)') : ''}`,
          emailSent: chatWarningEmailSent
        })
      }

      case 'updateMembershipPlan': {
        // Update a single membership plan field
        const { planId, field, value } = data || {}
        
        if (!planId || !field) {
          return NextResponse.json({ error: 'Missing planId or field' }, { status: 400 })
        }
        
        // Validate field name to prevent arbitrary updates
        const allowedFields = ['monthlyPrice', 'yearlyPrice', 'freeUploads', 'pricePerUpload', 'viewContents', 'buyContents', 'sellContents']
        if (!allowedFields.includes(field)) {
          return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
        }
        
        const plan = await prisma.membershipPlan.findUnique({
          where: { planId },
        })
        
        if (!plan) {
          return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
        }
        
        // Parse value based on field type
        let parsedValue: any = value
        if (['monthlyPrice', 'yearlyPrice', 'pricePerUpload'].includes(field)) {
          parsedValue = value === null || value === '' ? null : parseFloat(value)
        } else if (field === 'freeUploads') {
          parsedValue = parseInt(value) || 0
        } else if (['viewContents', 'buyContents', 'sellContents'].includes(field)) {
          parsedValue = Boolean(value)
        }
        
        const updatedPlan = await prisma.membershipPlan.update({
          where: { planId },
          data: { [field]: parsedValue },
        })
        
        await logAdminAction(adminId, 'UPDATE_MEMBERSHIP_PLAN', 'MEMBERSHIP_PLAN', planId, { field, value: parsedValue })
        return NextResponse.json({ message: 'Plan updated', plan: updatedPlan })
      }

      case 'resetMembershipPlans': {
        // Reset plans to default values (from the image)
        const defaultPlans = [
          { planId: 'viewer', name: 'Viewer', monthlyPrice: 0, yearlyPrice: 0, freeUploads: 5, pricePerUpload: null, viewContents: true, buyContents: true, sellContents: true, sortOrder: 0 },
          { planId: 'basic', name: 'Basic', monthlyPrice: 2, yearlyPrice: 20, freeUploads: 10, pricePerUpload: 1, viewContents: true, buyContents: true, sellContents: true, sortOrder: 1 },
          { planId: 'advanced', name: 'Advanced', monthlyPrice: 5, yearlyPrice: 50, freeUploads: 20, pricePerUpload: 0.5, viewContents: true, buyContents: true, sellContents: true, sortOrder: 2 },
          { planId: 'premium', name: 'Premium', monthlyPrice: 8, yearlyPrice: 80, freeUploads: 30, pricePerUpload: null, viewContents: true, buyContents: true, sellContents: true, sortOrder: 3 },
        ]
        
        // Delete all existing plans and recreate
        await prisma.membershipPlan.deleteMany({})
        
        for (const plan of defaultPlans) {
          await prisma.membershipPlan.create({ data: plan })
        }
        
        const plans = await prisma.membershipPlan.findMany({
          orderBy: { sortOrder: 'asc' },
        })
        
        await logAdminAction(adminId, 'RESET_MEMBERSHIP_PLANS', 'MEMBERSHIP_PLAN', 'all', {})
        return NextResponse.json({ message: 'Plans reset to default', plans })
      }

      case 'createPromotion': {
        const promotionData = data
        
        // Validate required fields
        if (!promotionData?.name || !promotionData?.type) {
          return NextResponse.json({ error: 'Name and type are required' }, { status: 400 })
        }
        
        const promotion = await prisma.promotion.create({
          data: {
            name: promotionData.name,
            description: promotionData.description || null,
            type: promotionData.type,
            discountType: promotionData.discountType || null,
            discountValue: promotionData.discountValue ? parseFloat(promotionData.discountValue) : null,
            bonusUploads: promotionData.bonusUploads ? parseInt(promotionData.bonusUploads) : null,
            freeTrialDays: promotionData.freeTrialDays ? parseInt(promotionData.freeTrialDays) : null,
            applicablePlans: promotionData.applicablePlans || 'all',
            promoCode: promotionData.promoCode || null,
            startDate: promotionData.startDate ? new Date(promotionData.startDate) : new Date(),
            endDate: promotionData.endDate ? new Date(promotionData.endDate) : null,
            usageLimit: promotionData.usageLimit ? parseInt(promotionData.usageLimit) : null,
            isActive: promotionData.isActive ?? true,
            showPopup: promotionData.showPopup ?? false,
            popupTitle: promotionData.popupTitle || null,
            popupMessage: promotionData.popupMessage || null,
            popupButtonText: promotionData.popupButtonText || 'Get Offer',
            popupImageUrl: promotionData.popupImageUrl || null,
            popupCtaUrl: promotionData.popupCtaUrl || null,
          },
        })
        
        await logAdminAction(adminId, 'CREATE_PROMOTION', 'PROMOTION', promotion.id, { name: promotionData.name })
        return NextResponse.json({ message: 'Promotion created', promotion })
      }

      case 'updatePromotion': {
        const { promotionId, ...updateData } = data || {}
        
        if (!promotionId) {
          return NextResponse.json({ error: 'Promotion ID is required' }, { status: 400 })
        }
        
        // Build update object
        const updateObj: any = {}
        if (updateData.name !== undefined) updateObj.name = updateData.name
        if (updateData.description !== undefined) updateObj.description = updateData.description
        if (updateData.type !== undefined) updateObj.type = updateData.type
        if (updateData.discountType !== undefined) updateObj.discountType = updateData.discountType
        if (updateData.discountValue !== undefined) updateObj.discountValue = updateData.discountValue ? parseFloat(updateData.discountValue) : null
        if (updateData.bonusUploads !== undefined) updateObj.bonusUploads = updateData.bonusUploads ? parseInt(updateData.bonusUploads) : null
        if (updateData.freeTrialDays !== undefined) updateObj.freeTrialDays = updateData.freeTrialDays ? parseInt(updateData.freeTrialDays) : null
        if (updateData.applicablePlans !== undefined) updateObj.applicablePlans = updateData.applicablePlans
        if (updateData.promoCode !== undefined) updateObj.promoCode = updateData.promoCode || null
        if (updateData.startDate !== undefined) updateObj.startDate = updateData.startDate ? new Date(updateData.startDate) : new Date()
        if (updateData.endDate !== undefined) updateObj.endDate = updateData.endDate ? new Date(updateData.endDate) : null
        if (updateData.usageLimit !== undefined) updateObj.usageLimit = updateData.usageLimit ? parseInt(updateData.usageLimit) : null
        if (updateData.isActive !== undefined) updateObj.isActive = updateData.isActive
        if (updateData.showPopup !== undefined) updateObj.showPopup = updateData.showPopup
        if (updateData.popupTitle !== undefined) updateObj.popupTitle = updateData.popupTitle
        if (updateData.popupMessage !== undefined) updateObj.popupMessage = updateData.popupMessage
        if (updateData.popupButtonText !== undefined) updateObj.popupButtonText = updateData.popupButtonText
        if (updateData.popupImageUrl !== undefined) updateObj.popupImageUrl = updateData.popupImageUrl
        if (updateData.popupCtaUrl !== undefined) updateObj.popupCtaUrl = updateData.popupCtaUrl || null
        
        const promotion = await prisma.promotion.update({
          where: { id: promotionId },
          data: updateObj,
        })
        
        await logAdminAction(adminId, 'UPDATE_PROMOTION', 'PROMOTION', promotionId, updateObj)
        return NextResponse.json({ message: 'Promotion updated', promotion })
      }

      case 'deletePromotion': {
        const promotionId = targetId
        
        if (!promotionId) {
          return NextResponse.json({ error: 'Promotion ID is required' }, { status: 400 })
        }
        
        await prisma.promotion.delete({
          where: { id: promotionId },
        })
        
        await logAdminAction(adminId, 'DELETE_PROMOTION', 'PROMOTION', promotionId, {})
        return NextResponse.json({ message: 'Promotion deleted' })
      }

      case 'togglePromotion': {
        const promotionId = targetId
        const { isActive } = data || {}
        
        if (!promotionId) {
          return NextResponse.json({ error: 'Promotion ID is required' }, { status: 400 })
        }
        
        const promotion = await prisma.promotion.update({
          where: { id: promotionId },
          data: { isActive: isActive ?? false },
        })
        
        await logAdminAction(adminId, 'TOGGLE_PROMOTION', 'PROMOTION', promotionId, { isActive })
        return NextResponse.json({ message: `Promotion ${isActive ? 'activated' : 'deactivated'}`, promotion })
      }

      case 'toggleGame': {
        const { gameId, isEnabled } = data || {}
        
        if (!gameId) {
          return NextResponse.json({ error: 'Game ID is required' }, { status: 400 })
        }
        
        const game = await prisma.gameSetting.update({
          where: { gameId },
          data: { isEnabled: isEnabled ?? false },
        })
        
        await logAdminAction(adminId, 'TOGGLE_GAME', 'GAME', gameId, { isEnabled })
        return NextResponse.json({ message: `Game ${isEnabled ? 'enabled' : 'disabled'}`, game })
      }

      case 'toggleNavbarItem': {
        const { itemKey, isEnabled } = data || {}

        if (!itemKey) {
          return NextResponse.json({ error: 'Item key is required' }, { status: 400 })
        }

        const item = await prisma.navbarMenuSetting.update({
          where: { itemKey },
          data: { isEnabled: isEnabled ?? false },
        })

        await logAdminAction(adminId, 'TOGGLE_NAVBAR_ITEM', 'NAVBAR', itemKey, { isEnabled })
        return NextResponse.json({ message: `Navbar item ${isEnabled ? 'enabled' : 'disabled'}`, item })
      }

      case 'setHomeLayout': {
        const { layout, preplay } = data || {}
        const validLayouts = ['masonry', 'grid_top', 'grid_center']
        const layoutVal = layout === 'grid' ? 'grid_center' : layout
        if (!layoutVal || !validLayouts.includes(layoutVal)) {
          return NextResponse.json({ error: 'layout must be "masonry", "grid_top", or "grid_center"' }, { status: 400 })
        }
        const preplayBool = typeof preplay === 'boolean' ? preplay : undefined
        let row = await getFirstHomeLayoutSetting()
        if (!row) {
          row = await prisma.homeLayoutSetting.create({
            data: {
              layout: layoutVal,
              ...(preplayBool !== undefined && { preplay: preplayBool }),
            },
          })
        } else {
          row = await prisma.homeLayoutSetting.update({
            where: { id: row.id },
            data: {
              layout: layoutVal,
              ...(preplayBool !== undefined && { preplay: preplayBool }),
            },
          })
        }
        await logAdminAction(adminId, 'SET_HOME_LAYOUT', 'HOME_LAYOUT', row.id, {
          layout: layoutVal,
          preplay: row.preplay,
          homePreplaySound: row.homePreplaySound,
          autoTranslation: row.autoTranslation,
        })
        return NextResponse.json({
          message: 'Home layout updated',
          layout: row.layout as string,
          preplay: row.preplay,
          homePreplaySound: row.homePreplaySound !== false,
          autoTranslation: row.autoTranslation !== false,
        })
      }

      case 'setHomePreplaySound': {
        const { homePreplaySound } = data || {}
        if (typeof homePreplaySound !== 'boolean') {
          return NextResponse.json({ error: 'homePreplaySound must be a boolean' }, { status: 400 })
        }
        const existingCount = await prisma.homeLayoutSetting.count()
        let row
        if (existingCount === 0) {
          row = await prisma.homeLayoutSetting.create({
            data: { layout: 'masonry', homePreplaySound },
          })
        } else {
          // Keep every row in sync if duplicates exist (otherwise findFirst could read a stale row).
          await prisma.homeLayoutSetting.updateMany({ data: { homePreplaySound } })
          row = await getFirstHomeLayoutSetting()
          if (!row) {
            return NextResponse.json({ error: 'Home layout setting not found' }, { status: 500 })
          }
        }
        await logAdminAction(adminId, 'SET_HOME_PREPLAY_SOUND', 'HOME_LAYOUT', row.id, { homePreplaySound })
        return NextResponse.json({
          message: 'Homepage media sound visibility updated',
          homePreplaySound: row.homePreplaySound !== false,
        })
      }

      case 'setAutoTranslation': {
        const { autoTranslation } = data || {}
        if (typeof autoTranslation !== 'boolean') {
          return NextResponse.json({ error: 'autoTranslation must be a boolean' }, { status: 400 })
        }
        const existingCount = await prisma.homeLayoutSetting.count()
        let row
        if (existingCount === 0) {
          row = await prisma.homeLayoutSetting.create({
            data: { layout: 'masonry', autoTranslation },
          })
        } else {
          await prisma.homeLayoutSetting.updateMany({ data: { autoTranslation } })
          row = await getFirstHomeLayoutSetting()
          if (!row) {
            return NextResponse.json({ error: 'Home layout setting not found' }, { status: 500 })
          }
        }
        await logAdminAction(adminId, 'SET_AUTO_TRANSLATION', 'HOME_LAYOUT', row.id, { autoTranslation })
        return NextResponse.json({
          message: 'Automatic translation updated',
          autoTranslation: row.autoTranslation !== false,
        })
      }

      case 'setMediaDetail': {
        const {
          downloadEnabled: downloadPayload,
          shareEnabled: sharePayload,
          sendByEmailEnabled: sendByEmailPayload,
          aiToolEnabled: aiToolPayload,
          shareAppsEnabled: shareAppsPayload,
        } = data || {}
        const downloadBool = typeof downloadPayload === 'boolean' ? downloadPayload : undefined
        const shareBool = typeof sharePayload === 'boolean' ? sharePayload : undefined
        const sendByEmailBool = typeof sendByEmailPayload === 'boolean' ? sendByEmailPayload : undefined
        const aiToolBool = typeof aiToolPayload === 'boolean' ? aiToolPayload : undefined
        const shareAppsObj = shareAppsPayload && typeof shareAppsPayload === 'object' && !Array.isArray(shareAppsPayload)
          ? (shareAppsPayload as Record<string, boolean>)
          : undefined
        let row = await prisma.mediaDetailSetting.findFirst()
        const existingRaw =
          row && (row as { shareAppsEnabled?: unknown }).shareAppsEnabled &&
          typeof (row as { shareAppsEnabled?: unknown }).shareAppsEnabled === 'object' &&
          !Array.isArray((row as { shareAppsEnabled?: unknown }).shareAppsEnabled)
            ? ((row as { shareAppsEnabled?: unknown }).shareAppsEnabled as Record<string, unknown>)
            : null
        const existingAuth =
          existingRaw && existingRaw.__auth && typeof existingRaw.__auth === 'object' && !Array.isArray(existingRaw.__auth)
            ? (existingRaw.__auth as Record<string, unknown>)
            : null
        const shareAppsWithAuth = shareAppsObj
          ? ({
              ...shareAppsObj,
              ...(existingAuth ? { __auth: existingAuth } : {}),
            } as Record<string, unknown>)
          : undefined
        const shareAppsJson: Prisma.InputJsonValue | undefined = shareAppsWithAuth
          ? (shareAppsWithAuth as unknown as Prisma.InputJsonValue)
          : undefined
        const updateData: Prisma.MediaDetailSettingUncheckedUpdateInput = {}
        if (downloadBool !== undefined) updateData.downloadEnabled = downloadBool
        if (shareBool !== undefined) updateData.shareEnabled = shareBool
        if (sendByEmailBool !== undefined) updateData.sendByEmailEnabled = sendByEmailBool
        if (aiToolBool !== undefined) updateData.aiToolEnabled = aiToolBool
        if (shareAppsJson !== undefined) updateData.shareAppsEnabled = shareAppsJson
        if (!row) {
          const createData: Prisma.MediaDetailSettingUncheckedCreateInput = {}
          if (downloadBool !== undefined) createData.downloadEnabled = downloadBool
          if (shareBool !== undefined) createData.shareEnabled = shareBool
          if (sendByEmailBool !== undefined) createData.sendByEmailEnabled = sendByEmailBool
          if (aiToolBool !== undefined) createData.aiToolEnabled = aiToolBool
          if (shareAppsJson !== undefined) createData.shareAppsEnabled = shareAppsJson
          row = await prisma.mediaDetailSetting.create({
            data: createData,
          })
        } else {
          row = await prisma.mediaDetailSetting.update({
            where: { id: row.id },
            data: updateData,
          })
        }
        const updated = row as { sendByEmailEnabled: boolean; shareAppsEnabled?: unknown }
        const { normalizeShareAppsEnabled, DEFAULT_SHARE_APPS } = await import('@/app/api/ui/media-detail/shareAppsConfig')
        const shareAppsEnabled = normalizeShareAppsEnabled(updated.shareAppsEnabled ?? DEFAULT_SHARE_APPS)
        await logAdminAction(adminId, 'SET_MEDIA_DETAIL', 'MEDIA_DETAIL', row.id, {
          downloadEnabled: row.downloadEnabled,
          shareEnabled: row.shareEnabled,
          sendByEmailEnabled: updated.sendByEmailEnabled,
          aiToolEnabled: row.aiToolEnabled,
          shareAppsEnabled,
        })
        return NextResponse.json({
          message: 'Media detail settings updated',
          downloadEnabled: row.downloadEnabled,
          shareEnabled: row.shareEnabled,
          sendByEmailEnabled: updated.sendByEmailEnabled,
          aiToolEnabled: row.aiToolEnabled,
          shareAppsEnabled,
        })
      }

      case 'setAuthenticationSettings': {
        const {
          emailVerificationEnabled: emailPayload,
          phoneVerificationEnabled: phonePayload,
        } = data || {}
        const emailVerificationEnabled = typeof emailPayload === 'boolean' ? emailPayload : undefined
        const phoneVerificationEnabled = typeof phonePayload === 'boolean' ? phonePayload : undefined

        let row = await prisma.mediaDetailSetting.findFirst()
        if (!row) {
          row = await prisma.mediaDetailSetting.create({ data: {} })
        }
        const raw =
          (row as { shareAppsEnabled?: unknown }).shareAppsEnabled &&
          typeof (row as { shareAppsEnabled?: unknown }).shareAppsEnabled === 'object' &&
          !Array.isArray((row as { shareAppsEnabled?: unknown }).shareAppsEnabled)
            ? ((row as { shareAppsEnabled?: unknown }).shareAppsEnabled as Record<string, unknown>)
            : {}
        const prevAuth =
          raw.__auth && typeof raw.__auth === 'object' && !Array.isArray(raw.__auth)
            ? (raw.__auth as Record<string, unknown>)
            : {}
        const nextAuth = {
          ...prevAuth,
          ...(emailVerificationEnabled !== undefined ? { emailVerificationEnabled } : {}),
          ...(phoneVerificationEnabled !== undefined ? { phoneVerificationEnabled } : {}),
        }
        row = await prisma.mediaDetailSetting.update({
          where: { id: row.id },
          data: {
            shareAppsEnabled: {
              ...raw,
              __auth: nextAuth,
            } as Prisma.InputJsonValue,
          },
        })
        const appliedEmail =
          typeof nextAuth.emailVerificationEnabled === 'boolean' ? nextAuth.emailVerificationEnabled : true
        const appliedPhone =
          typeof nextAuth.phoneVerificationEnabled === 'boolean' ? nextAuth.phoneVerificationEnabled : true

        await logAdminAction(adminId, 'SET_AUTHENTICATION_SETTINGS', 'AUTHENTICATION', row.id, {
          emailVerificationEnabled: appliedEmail,
          phoneVerificationEnabled: appliedPhone,
        })

        return NextResponse.json({
          message: 'Authentication settings updated',
          emailVerificationEnabled: appliedEmail,
          phoneVerificationEnabled: appliedPhone,
        })
      }

      case 'setAccountManagementSettings': {
        const { selfServiceDeactivateAccountEnabled: deactPayload } = data || {}
        const selfServiceDeactivateAccountEnabled =
          typeof deactPayload === 'boolean' ? deactPayload : undefined
        if (selfServiceDeactivateAccountEnabled === undefined) {
          return NextResponse.json(
            { error: 'selfServiceDeactivateAccountEnabled boolean is required' },
            { status: 400 },
          )
        }

        let row = await prisma.mediaDetailSetting.findFirst()
        if (!row) {
          row = await prisma.mediaDetailSetting.create({ data: {} })
        }
        const raw =
          (row as { shareAppsEnabled?: unknown }).shareAppsEnabled &&
          typeof (row as { shareAppsEnabled?: unknown }).shareAppsEnabled === 'object' &&
          !Array.isArray((row as { shareAppsEnabled?: unknown }).shareAppsEnabled)
            ? ((row as { shareAppsEnabled?: unknown }).shareAppsEnabled as Record<string, unknown>)
            : {}
        const prevAuth =
          raw.__auth && typeof raw.__auth === 'object' && !Array.isArray(raw.__auth)
            ? (raw.__auth as Record<string, unknown>)
            : {}
        const nextAuth = {
          ...prevAuth,
          selfServiceDeactivateAccountEnabled,
        }
        row = await prisma.mediaDetailSetting.update({
          where: { id: row.id },
          data: {
            shareAppsEnabled: {
              ...raw,
              __auth: nextAuth,
            } as Prisma.InputJsonValue,
          },
        })

        await logAdminAction(adminId, 'SET_ACCOUNT_MANAGEMENT', 'ACCOUNT', row.id, {
          selfServiceDeactivateAccountEnabled,
        })

        return NextResponse.json({
          message: 'Account management settings updated',
          selfServiceDeactivateAccountEnabled,
        })
      }

      case 'toggleBadge': {
        const { itemKey, isEnabled } = data || {}

        if (!itemKey) {
          return NextResponse.json({ error: 'Item key is required' }, { status: 400 })
        }

        const item = await prisma.mediaBadgeSetting.update({
          where: { itemKey },
          data: { isEnabled: isEnabled ?? false },
        })

        await logAdminAction(adminId, 'TOGGLE_MEDIA_BADGE', 'MEDIA_BADGE', itemKey, { isEnabled })
        return NextResponse.json({ message: `Badge ${isEnabled ? 'enabled' : 'disabled'}`, item })
      }

      case 'updateCropToolSettings': {
        const {
          isEnabled, imageQuality, videoBitrateMbps, videoFps, audioBitrateKbps,
          freeImageQuality, freeVideoBitrateMbps, freeVideoFps, freeAudioBitrateKbps,
          freeStreamMaxHeight, freeDownloadMaxHeight, paidDownloadQuality, maxUploadSizeMb,
        } = data || {}

        const { clampUploadSizeMb } = await import('@/lib/uploadPlanConfig')

        // Find existing row or create one
        let existing = await prisma.cropToolSetting.findFirst()
        if (!existing) {
          existing = await prisma.cropToolSetting.create({
            data: {
              isEnabled: true,
              imageQuality: 0.92, videoBitrateMbps: 8.0, videoFps: 30, audioBitrateKbps: 256,
              freeImageQuality: 0.75, freeVideoBitrateMbps: 4.0, freeVideoFps: 24, freeAudioBitrateKbps: 128,
              freeStreamMaxHeight: 720, freeDownloadMaxHeight: 720, paidDownloadQuality: 'hq',
              maxUploadSizeMb: 10,
            },
          })
        }

        const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number(v)))
        const updateData: Record<string, unknown> = {}
        if (isEnabled !== undefined) updateData.isEnabled = Boolean(isEnabled)
        // Paid / Selling quality
        if (imageQuality !== undefined) updateData.imageQuality = clamp(imageQuality, 0.1, 1)
        if (videoBitrateMbps !== undefined) updateData.videoBitrateMbps = clamp(videoBitrateMbps, 1, 50)
        if (videoFps !== undefined) updateData.videoFps = Math.round(clamp(videoFps, 15, 60))
        if (audioBitrateKbps !== undefined) updateData.audioBitrateKbps = Math.round(clamp(audioBitrateKbps, 64, 512))
        // Free quality
        if (freeImageQuality !== undefined) updateData.freeImageQuality = clamp(freeImageQuality, 0.1, 1)
        if (freeVideoBitrateMbps !== undefined) updateData.freeVideoBitrateMbps = clamp(freeVideoBitrateMbps, 1, 50)
        if (freeVideoFps !== undefined) updateData.freeVideoFps = Math.round(clamp(freeVideoFps, 15, 60))
        if (freeAudioBitrateKbps !== undefined) updateData.freeAudioBitrateKbps = Math.round(clamp(freeAudioBitrateKbps, 64, 512))
        // Download & streaming (resolution caps)
        if (freeStreamMaxHeight !== undefined) updateData.freeStreamMaxHeight = Math.round(clamp(freeStreamMaxHeight, 480, 1080))
        if (freeDownloadMaxHeight !== undefined) updateData.freeDownloadMaxHeight = Math.round(clamp(freeDownloadMaxHeight, 480, 1080))
        if (paidDownloadQuality !== undefined && ['hq', '1080p', '720p'].includes(String(paidDownloadQuality))) {
          updateData.paidDownloadQuality = String(paidDownloadQuality)
        }
        if (maxUploadSizeMb !== undefined) {
          updateData.maxUploadSizeMb = clampUploadSizeMb(Number(maxUploadSizeMb))
        }

        const settings = await prisma.cropToolSetting.update({
          where: { id: existing.id },
          data: updateData,
        })

        await logAdminAction(adminId, 'UPDATE_CROP_TOOL_SETTINGS', 'CROP_TOOL', existing.id, updateData)
        return NextResponse.json({ message: 'Crop tool settings updated', settings })
      }

      case 'blockIp': {
        const { ipAddress, note } = data ?? {}
        const raw = typeof ipAddress === 'string' ? ipAddress : ''
        const { normalizeStoredIp, isPlausibleIpAddress } = await import('@/lib/ipBlockUtils')
        const normalized = normalizeStoredIp(raw)
        if (!normalized || !isPlausibleIpAddress(normalized)) {
          return NextResponse.json({ error: 'Invalid IP address' }, { status: 400 })
        }
        try {
          const row = await prisma.blockedIp.create({
            data: {
              ipAddress: normalized,
              note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 2000) : null,
              createdBy: adminId,
            },
          })
          await logAdminAction(adminId, 'BLOCK_IP', 'BLOCKED_IP', row.id, { ipAddress: normalized })
          return NextResponse.json({ message: 'IP blocked', blocked: row })
        } catch (e: unknown) {
          const code = e && typeof e === 'object' && 'code' in e ? (e as { code?: string }).code : ''
          if (code === 'P2002') {
            return NextResponse.json({ error: 'This IP is already blocked' }, { status: 409 })
          }
          throw e
        }
      }

      case 'unblockIp': {
        const id = typeof targetId === 'string' ? targetId : ''
        if (!id) {
          return NextResponse.json({ error: 'targetId required' }, { status: 400 })
        }
        const existing = await prisma.blockedIp.findUnique({ where: { id } })
        if (!existing) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        await prisma.blockedIp.delete({ where: { id } })
        await logAdminAction(adminId, 'UNBLOCK_IP', 'BLOCKED_IP', id, { ipAddress: existing.ipAddress })
        return NextResponse.json({ message: 'IP unblocked' })
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

