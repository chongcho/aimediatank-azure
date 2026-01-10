'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Stats {
  totalUsers: number
  totalMedia: number
  totalComments: number
  pendingReports: number
  mediaByType: Array<{ type: string; _count: number }>
  usersByRole: Array<{ role: string; _count: number }>
}

interface Analytics {
  totalUsers: number
  newUsersThisMonth: number
  newUsersThisWeek: number
  totalSubscribers: number
  totalMedia: number
  newMediaThisWeek: number
  totalChatMessages: number
  activeUsersThisWeek: number
  userGrowth: Array<{ date: string; count: number }>
}

interface User {
  id: string
  email: string
  username: string
  name: string | null
  legalName: string | null
  avatar: string | null
  phone: string | null
  location: string | null
  role: string
  membershipType: string
  isSuspended: boolean
  suspendedAt: string | null
  suspendedUntil: string | null
  suspendReason: string | null
  warningCount: number
  lastWarningAt: string | null
  lastWarningReason: string | null
  bonusCredits: number
  paidUploadCredits: number
  adminNotes: string | null
  createdAt: string
  _count: { media: number; chatMessages: number }
}

interface Media {
  id: string
  title: string
  type: string
  url: string
  isApproved: boolean
  isDeleted: boolean
  deletedAt: string | null
  deletionReason: string | null
  isSold: boolean
  soldAt: string | null
  ageRestriction: string
  createdAt: string
  user: { id: string; username: string; name: string | null; email: string }
  purchases: Array<{
    id: string
    completedAt: string | null
    buyer: { id: string; username: string }
  }>
  _count: { reports: number }
}

interface Report {
  id: string
  reason: string
  status: string
  createdAt: string
  media: {
    id: string
    title: string
    user: { username: string }
  }
  user: { username: string }
}

interface ChatMessage {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    username: string
    name: string | null
    avatar: string | null
    isSuspended: boolean
    warningCount: number
  }
}

type TabType = 'dashboard' | 'analytics' | 'users' | 'media' | 'chat' | 'membershipSales' | 'contentSales' | 'adSales'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [stats, setStats] = useState<Stats | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [media, setMedia] = useState<Media[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [contentSales, setContentSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // User modal state
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showUserModal, setShowUserModal] = useState(false)
  
  // Warning details modal state
  const [warningModal, setWarningModal] = useState<{
    show: boolean
    userId: string
    username: string
    warningCount: number
    lastWarningReason: string | null
    lastWarningAt: string | null
    history: Array<{
      id: string
      messageContent: string | null
      reason: string
      createdAt: string
    }>
    loading: boolean
  } | null>(null)
  
  // Suspension details modal state
  const [suspensionModal, setSuspensionModal] = useState<{
    show: boolean
    username: string
    suspendReason: string | null
    suspendedAt: string | null
    suspendedUntil: string | null
  } | null>(null)
  
  // Search/filter state
  const [userSearch, setUserSearch] = useState('')
  const [userSearchDebounced, setUserSearchDebounced] = useState('')
  const [userFilter, setUserFilter] = useState('all')
  
  // Debounce timers
  const userSearchTimer = useRef<NodeJS.Timeout | null>(null)
  const mediaSearchTimer = useRef<NodeJS.Timeout | null>(null)
  
  // Pagination state
  const [mediaPage, setMediaPage] = useState(1)
  const [mediaTotalPages, setMediaTotalPages] = useState(1)
  const [mediaTotal, setMediaTotal] = useState(0)
  
  // Media filter state
  const [mediaSearch, setMediaSearch] = useState('')
  const [mediaSearchDebounced, setMediaSearchDebounced] = useState('')
  const [mediaTypeFilter, setMediaTypeFilter] = useState('all')
  const [mediaStatusFilter, setMediaStatusFilter] = useState('all')
  
  // Delete media modal state
  const [deleteModal, setDeleteModal] = useState<{
    show: boolean
    mediaId: string
    mediaTitle: string
    creatorUsername: string
    creatorEmail: string
  } | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [sendNotification, setSendNotification] = useState(true)
  
  // Suspend media modal state
  const [suspendModal, setSuspendModal] = useState<{
    show: boolean
    mediaId: string
    mediaTitle: string
    creatorUsername: string
    creatorEmail: string
  } | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [sendSuspendNotification, setSendSuspendNotification] = useState(true)
  
  // Give credits modal state
  const [creditsModal, setCreditsModal] = useState<{
    show: boolean
    userId: string
    username: string
    legalName: string | null
    currentCredits: number
  } | null>(null)
  const [creditsAmount, setCreditsAmount] = useState('')
  
  // Chat search/filter state
  const [chatSearch, setChatSearch] = useState('')
  const [chatSearchDebounced, setChatSearchDebounced] = useState('')
  const [chatFilter, setChatFilter] = useState('all')
  const chatSearchTimer = useRef<NodeJS.Timeout | null>(null)
  
  // Chat warning modal state
  const [chatWarningModal, setChatWarningModal] = useState<{
    show: boolean
    messageId: string
    messageContent: string
    userId: string
    username: string
  } | null>(null)
  const [chatWarningReason, setChatWarningReason] = useState('')
  
  // Chat delete modal state
  const [chatDeleteModal, setChatDeleteModal] = useState<{
    show: boolean
    messageId: string
    messageContent: string
    userId: string
    username: string
  } | null>(null)
  const [chatDeleteReason, setChatDeleteReason] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
      router.push('/')
    }
  }, [status, session, router])

  // Debounce user search
  useEffect(() => {
    if (userSearchTimer.current) clearTimeout(userSearchTimer.current)
    userSearchTimer.current = setTimeout(() => {
      setUserSearchDebounced(userSearch)
    }, 300)
    return () => {
      if (userSearchTimer.current) clearTimeout(userSearchTimer.current)
    }
  }, [userSearch])

  // Debounce media search
  useEffect(() => {
    if (mediaSearchTimer.current) clearTimeout(mediaSearchTimer.current)
    mediaSearchTimer.current = setTimeout(() => {
      setMediaSearchDebounced(mediaSearch)
      setMediaPage(1)
    }, 300)
    return () => {
      if (mediaSearchTimer.current) clearTimeout(mediaSearchTimer.current)
    }
  }, [mediaSearch])

  // Debounce chat search
  useEffect(() => {
    if (chatSearchTimer.current) clearTimeout(chatSearchTimer.current)
    chatSearchTimer.current = setTimeout(() => {
      setChatSearchDebounced(chatSearch)
    }, 300)
    return () => {
      if (chatSearchTimer.current) clearTimeout(chatSearchTimer.current)
    }
  }, [chatSearch])

  useEffect(() => {
    if (session?.user?.role === 'ADMIN') {
      fetchData()
    }
  }, [session, activeTab, userSearchDebounced, userFilter, mediaPage, mediaSearchDebounced, mediaTypeFilter, mediaStatusFilter, chatSearchDebounced, chatFilter])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'dashboard') {
        const res = await fetch('/api/admin')
        const data = await res.json()
        setStats(data.stats)
      } else if (activeTab === 'analytics') {
        const res = await fetch('/api/admin?action=analytics')
        const data = await res.json()
        setAnalytics(data.analytics)
      } else if (activeTab === 'users') {
        const params = new URLSearchParams({ action: 'users' })
        if (userSearchDebounced) params.set('search', userSearchDebounced)
        if (userFilter !== 'all') params.set('filter', userFilter)
        const res = await fetch(`/api/admin?${params}`)
        const data = await res.json()
        setUsers(data.users || [])
      } else if (activeTab === 'media') {
        const params = new URLSearchParams({ action: 'media', page: String(mediaPage), limit: '20' })
        if (mediaSearchDebounced) params.set('search', mediaSearchDebounced)
        if (mediaTypeFilter !== 'all') params.set('type', mediaTypeFilter)
        if (mediaStatusFilter !== 'all') params.set('status', mediaStatusFilter)
        const res = await fetch(`/api/admin?${params}`)
        const data = await res.json()
        setMedia(data.media || [])
        if (data.pagination) {
          setMediaTotalPages(data.pagination.totalPages)
          setMediaTotal(data.pagination.total)
        }
      } else if (activeTab === 'chat') {
        const params = new URLSearchParams({ action: 'chatMessages' })
        if (chatSearchDebounced) params.set('search', chatSearchDebounced)
        if (chatFilter !== 'all') params.set('filter', chatFilter)
        const res = await fetch(`/api/admin?${params}`)
        const data = await res.json()
        setChatMessages(data.messages || [])
      } else if (activeTab === 'membershipSales') {
        // Fetch users with membership for sales report
        const res = await fetch('/api/admin?action=users&filter=members')
        const data = await res.json()
        setUsers(data.users || [])
      } else if (activeTab === 'contentSales') {
        const res = await fetch('/api/admin?action=contentSales')
        const data = await res.json()
        setContentSales(data.sales || [])
      }
    } catch (error) {
      console.error('Error fetching admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchWarningHistory = async (userId: string, username: string, warningCount: number, lastWarningReason: string | null, lastWarningAt: string | null) => {
    setWarningModal({
      show: true,
      userId,
      username,
      warningCount,
      lastWarningReason,
      lastWarningAt,
      history: [],
      loading: true
    })
    
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getWarningHistory', targetId: userId }),
      })
      const data = await res.json()
      
      setWarningModal(prev => prev ? {
        ...prev,
        history: data.warnings || [],
        loading: false
      } : null)
    } catch (error) {
      console.error('Failed to fetch warning history:', error)
      setWarningModal(prev => prev ? { ...prev, loading: false } : null)
    }
  }

  const handleAction = async (action: string, targetId: string, data?: any) => {
    const confirmActions = ['deleteUser', 'deleteChatMessage', 'suspendUser']
    if (confirmActions.includes(action) && !confirm('Are you sure?')) return

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetId, data }),
      })

      if (res.ok) {
        fetchData()
        if (action === 'suspendUser' || action === 'unsuspendUser' || action === 'warnUser' || action === 'giveCredits') {
          setShowUserModal(false)
        }
      }
    } catch (error) {
      console.error('Error performing action:', error)
    }
  }

  if (status === 'loading' || !session?.user || session.user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="w-full px-4 lg:px-8 pb-[500px]">
      <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
      <p className="text-gray-400 mb-8">Manage users, content, chat, and reports</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar">
        {([
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'analytics', label: 'Analytics' },
          { id: 'users', label: 'Users' },
          { id: 'media', label: 'Media' },
          { id: 'chat', label: 'Chat' },
          { id: 'membershipSales', label: 'Membership Sales Reports' },
          { id: 'contentSales', label: 'Contents Sales Reports' },
          { id: 'adSales', label: 'Ad Sales Reports' },
        ] as { id: TabType; label: string }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              if (tab.id === 'media') {
                setMediaPage(1)
                setMediaSearch('')
                setMediaTypeFilter('all')
                setMediaStatusFilter('all')
              }
            }}
            className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-tank-accent text-tank-black'
                : 'bg-tank-gray text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Media Filters - Always visible to prevent losing focus */}
      {activeTab === 'media' && (
        <div className="flex gap-4 flex-wrap items-center mb-4">
          <input
            type="text"
            placeholder="Search title or creator..."
            value={mediaSearch}
            onChange={(e) => setMediaSearch(e.target.value)}
            className="input flex-1 min-w-[200px]"
          />
          <select
            value={mediaTypeFilter}
            onChange={(e) => { setMediaTypeFilter(e.target.value); setMediaPage(1); }}
            className="input w-auto"
          >
            <option value="all">All Types</option>
            <option value="VIDEO">Video</option>
            <option value="IMAGE">Image</option>
            <option value="MUSIC">Music</option>
          </select>
          <select
            value={mediaStatusFilter}
            onChange={(e) => { setMediaStatusFilter(e.target.value); setMediaPage(1); }}
            className="input w-auto"
          >
            <option value="all">All Status</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="deleted">Deleted</option>
          </select>
          <p className="text-gray-400">Total: {mediaTotal} items</p>
        </div>
      )}

      {/* Users Filters - Always visible */}
      {activeTab === 'users' && (
        <div className="flex gap-4 flex-wrap mb-4">
          <input
            type="text"
            placeholder="Search users..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="input flex-1 min-w-[200px]"
          />
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="all">All Users</option>
            <option value="suspended">Suspended</option>
            <option value="warned">With Warnings</option>
          </select>
        </div>
      )}

      {/* Chat Filters - Always visible */}
      {activeTab === 'chat' && (
        <div className="flex gap-4 flex-wrap items-center mb-4">
          <input
            type="text"
            placeholder="Search users..."
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            className="input flex-1 min-w-[200px]"
          />
          <select
            value={chatFilter}
            onChange={(e) => setChatFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="all">All Users</option>
            <option value="warned">With Warnings</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* Dashboard */}
          {activeTab === 'dashboard' && stats && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card text-center">
                  <div className="text-3xl font-bold text-tank-accent">{stats.totalUsers}</div>
                  <div className="text-gray-500">Total Users</div>
                </div>
                <div className="card text-center">
                  <div className="text-3xl font-bold text-blue-400">{stats.totalMedia}</div>
                  <div className="text-gray-500">Total Media</div>
                </div>
                <div className="card text-center">
                  <div className="text-3xl font-bold text-purple-400">{stats.totalComments}</div>
                  <div className="text-gray-500">Comments</div>
                </div>
                <div className="card text-center">
                  <div className="text-3xl font-bold text-red-400">{stats.pendingReports}</div>
                  <div className="text-gray-500">Pending Reports</div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="card">
                  <h3 className="font-semibold mb-4">Media by Type</h3>
                  <div className="space-y-3">
                    {stats.mediaByType.map((item) => (
                      <div key={item.type} className="flex items-center justify-between">
                        <span className={`badge ${
                          item.type === 'VIDEO' ? 'badge-video' :
                          item.type === 'IMAGE' ? 'badge-image' : 'badge-music'
                        }`}>
                          {item.type}
                        </span>
                        <span className="font-medium">{item._count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <h3 className="font-semibold mb-4">Users by Role</h3>
                  <div className="space-y-3">
                    {stats.usersByRole.map((item) => (
                      <div key={item.role} className="flex items-center justify-between">
                        <span className={`badge ${
                          item.role === 'ADMIN' ? 'bg-red-500/20 text-red-400' :
                          item.role === 'SUBSCRIBER' ? 'bg-tank-accent/20 text-tank-accent' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {item.role}
                        </span>
                        <span className="font-medium">{item._count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analytics */}
          {activeTab === 'analytics' && analytics && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card text-center">
                  <div className="text-3xl font-bold text-tank-accent">{analytics.totalUsers}</div>
                  <div className="text-gray-500">Total Users</div>
                </div>
                <div className="card text-center">
                  <div className="text-3xl font-bold text-green-400">{analytics.newUsersThisWeek}</div>
                  <div className="text-gray-500">New This Week</div>
                </div>
                <div className="card text-center">
                  <div className="text-3xl font-bold text-blue-400">{analytics.totalSubscribers}</div>
                  <div className="text-gray-500">Subscribers</div>
                </div>
                <div className="card text-center">
                  <div className="text-3xl font-bold text-purple-400">{analytics.activeUsersThisWeek}</div>
                  <div className="text-gray-500">Active (Chat)</div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="card">
                  <h3 className="font-semibold mb-4">Content Stats</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Media</span>
                      <span className="font-medium">{analytics.totalMedia}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">New Media This Week</span>
                      <span className="font-medium text-green-400">+{analytics.newMediaThisWeek}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Chat Messages</span>
                      <span className="font-medium">{analytics.totalChatMessages}</span>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <h3 className="font-semibold mb-4">User Growth (30 days)</h3>
                  <div className="flex justify-between">
                    <span className="text-gray-400">New Users</span>
                    <span className="font-medium text-green-400">+{analytics.newUsersThisMonth}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="card overflow-x-auto">
                <table className="w-full text-sm min-w-[1300px]">
                  <thead>
                    <tr className="border-b border-tank-light">
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">User ID</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">User Name</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Email Address</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Phone Number</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Country</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Subscription Date</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Membership Status</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Status</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Credits</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-tank-light/50 hover:bg-tank-light/20">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center text-xs font-bold overflow-hidden flex-shrink-0">
                              {user.avatar ? (
                                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                user.legalName?.[0]?.toUpperCase() || user.username[0].toUpperCase()
                              )}
                            </div>
                            <span className="font-medium whitespace-nowrap">@{user.username}</span>
                          </div>
                        </td>
                        <td className="p-3 text-gray-300 whitespace-nowrap">
                          {user.legalName || '-'}
                        </td>
                        <td className="p-3 text-gray-300 max-w-[180px] truncate" title={user.email}>
                          {user.email}
                        </td>
                        <td className="p-3 text-gray-400 whitespace-nowrap">
                          {user.phone || '-'}
                        </td>
                        <td className="p-3 text-gray-400 whitespace-nowrap">
                          {user.location || '-'}
                        </td>
                        <td className="p-3 text-gray-400 whitespace-nowrap">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <span className={`badge text-xs ${
                            user.membershipType === 'PREMIUM' ? 'bg-purple-500/20 text-purple-400' :
                            user.membershipType === 'BASIC' || user.membershipType === 'SUBSCRIBER' ? 'bg-tank-accent/20 text-tank-accent' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {user.membershipType}
                          </span>
                        </td>
                        <td className="p-3">
                          {user.isSuspended ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSuspensionModal({
                                  show: true,
                                  username: user.username,
                                  suspendReason: user.suspendReason,
                                  suspendedAt: user.suspendedAt,
                                  suspendedUntil: user.suspendedUntil
                                })
                              }}
                              className="badge bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 transition-colors cursor-pointer"
                            >
                              🚫 Suspended
                            </button>
                          ) : user.warningCount > 0 ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                fetchWarningHistory(
                                  user.id,
                                  user.username,
                                  user.warningCount,
                                  user.lastWarningReason,
                                  user.lastWarningAt
                                )
                              }}
                              className="badge bg-yellow-500/20 text-yellow-400 text-xs hover:bg-yellow-500/30 transition-colors cursor-pointer"
                            >
                              ⚠️ Warned ({user.warningCount})
                            </button>
                          ) : (
                            <span className="badge bg-green-500/20 text-green-400 text-xs">
                              ✅ Active
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-gray-400 whitespace-nowrap">
                          {user.bonusCredits + user.paidUploadCredits}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => { setSelectedUser(user); setShowUserModal(true); }}
                            className="text-tank-accent hover:underline text-sm whitespace-nowrap"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Chat Moderation */}
          {activeTab === 'chat' && (
            <div className="space-y-4">
              <div className="card overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="border-b border-tank-light">
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Date</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">User ID</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Open Chat Messages</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chatMessages.map((msg) => (
                      <tr key={msg.id} className="border-b border-tank-light/50 hover:bg-tank-light/20">
                        <td className="p-3 text-gray-400 whitespace-nowrap">
                          {new Date(msg.createdAt).toLocaleDateString()}<br/>
                          <span className="text-xs text-gray-500">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden">
                              {msg.user.avatar ? (
                                <img src={msg.user.avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                msg.user.username[0].toUpperCase()
                              )}
                            </div>
                            <div>
                              <span className="font-medium whitespace-nowrap">@{msg.user.username}</span>
                              <div className="flex gap-1 mt-0.5">
                                {msg.user.isSuspended && (
                                  <span className="text-xs bg-red-500/20 text-red-400 px-1 rounded">Suspended</span>
                                )}
                                {msg.user.warningCount > 0 && (
                                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1 rounded">
                                    {msg.user.warningCount}⚠️
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 max-w-[400px]">
                          <p className="text-gray-300 text-sm break-words line-clamp-2" title={msg.content}>
                            {msg.content}
                          </p>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2 whitespace-nowrap">
                            <button
                              onClick={() => setChatWarningModal({
                                show: true,
                                messageId: msg.id,
                                messageContent: msg.content,
                                userId: msg.user.id,
                                username: msg.user.username
                              })}
                              className="text-yellow-400 hover:text-yellow-300 text-sm"
                            >
                              Warning
                            </button>
                            <button
                              onClick={() => setChatDeleteModal({
                                show: true,
                                messageId: msg.id,
                                messageContent: msg.content,
                                userId: msg.user.id,
                                username: msg.user.username
                              })}
                              className="text-red-400 hover:text-red-300 text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Media */}
          {activeTab === 'media' && (
            <div className="space-y-4">
              <div className="card overflow-x-auto">
                <table className="w-full text-sm min-w-[1500px]">
                  <thead>
                    <tr className="border-b border-tank-light">
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Media Title</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Type</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Creator</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Upload Date</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">File Location</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Age Filter</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Status</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Sold Date</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Buyer User ID</th>
                      <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {media.map((item) => {
                      const latestPurchase = item.purchases?.[0]
                      return (
                        <tr key={item.id} className="border-b border-tank-light/50 hover:bg-tank-light/20">
                          <td className="p-3 max-w-[200px]">
                            <Link href={`/media/${item.id}`} className="font-medium hover:text-tank-accent line-clamp-1" title={item.title}>
                              {item.title.split('#')[0].trim()}
                            </Link>
                          </td>
                          <td className="p-3">
                            <span className={`badge ${
                              item.type === 'VIDEO' ? 'badge-video' :
                              item.type === 'IMAGE' ? 'badge-image' : 'badge-music'
                            }`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="p-3 text-gray-400 whitespace-nowrap">@{item.user.username}</td>
                          <td className="p-3 text-gray-400 whitespace-nowrap">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-3 max-w-[150px]">
                            <a 
                              href={item.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-400 hover:text-blue-300 text-xs truncate block"
                              title={item.url}
                            >
                              {item.url.split('/').pop()?.slice(0, 20)}...
                            </a>
                          </td>
                          <td className="p-3">
                            <select
                              value={item.ageRestriction || 'ALL'}
                              onChange={(e) => handleAction('updateMediaAgeRestriction', item.id, { ageRestriction: e.target.value })}
                              className="bg-tank-dark border border-tank-light rounded px-2 py-1 text-xs"
                            >
                              <option value="ALL">All Ages</option>
                              <option value="18+">18+</option>
                            </select>
                          </td>
                          <td className="p-3">
                            {item.isDeleted ? (
                              <span className="badge bg-red-500/20 text-red-400 text-xs" title={item.deletionReason || ''}>
                                Deleted
                              </span>
                            ) : (
                              <select
                                value={item.isSold ? 'sold' : 'live'}
                                onChange={(e) => handleAction('updateMediaStatus', item.id, { isSold: e.target.value === 'sold' })}
                                className="bg-tank-dark border border-tank-light rounded px-2 py-1 text-xs"
                              >
                                <option value="live">Live</option>
                                <option value="sold">Sold</option>
                              </select>
                            )}
                          </td>
                          <td className="p-3 text-gray-400 whitespace-nowrap">
                            {item.soldAt ? new Date(item.soldAt).toLocaleDateString() : 
                             latestPurchase?.completedAt ? new Date(latestPurchase.completedAt).toLocaleDateString() : '-'}
                          </td>
                          <td className="p-3 text-gray-400 whitespace-nowrap">
                            {latestPurchase?.buyer ? `@${latestPurchase.buyer.username}` : '-'}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2 whitespace-nowrap">
                              {item.isDeleted ? (
                                <button onClick={() => handleAction('restoreMedia', item.id)} className="text-green-400 hover:text-green-300 text-sm">
                                  Restore
                                </button>
                              ) : (
                              <>
                                {!item.isApproved && (
                                  <button onClick={() => handleAction('approveMedia', item.id)} className="text-green-400 hover:text-green-300 text-sm">
                                    Approve
                                  </button>
                                )}
                                {item.isApproved && (
                                  <button 
                                    onClick={() => setSuspendModal({
                                      show: true,
                                      mediaId: item.id,
                                      mediaTitle: item.title,
                                      creatorUsername: item.user.username,
                                      creatorEmail: item.user.email
                                    })}
                                    className="text-yellow-400 hover:text-yellow-300 text-sm"
                                  >
                                    Suspend
                                  </button>
                                )}
                                <button 
                                  onClick={() => setDeleteModal({
                                    show: true,
                                    mediaId: item.id,
                                    mediaTitle: item.title,
                                    creatorUsername: item.user.username,
                                    creatorEmail: item.user.email
                                  })} 
                                  className="text-red-400 hover:text-red-300 text-sm"
                                >
                                  Delete
                                </button>
                              </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {mediaTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setMediaPage(1)}
                    disabled={mediaPage === 1}
                    className="px-3 py-1 rounded bg-tank-gray text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ««
                  </button>
                  <button
                    onClick={() => setMediaPage(p => Math.max(1, p - 1))}
                    disabled={mediaPage === 1}
                    className="px-3 py-1 rounded bg-tank-gray text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    «
                  </button>
                  <span className="px-4 py-1 text-gray-300">
                    Page {mediaPage} of {mediaTotalPages}
                  </span>
                  <button
                    onClick={() => setMediaPage(p => Math.min(mediaTotalPages, p + 1))}
                    disabled={mediaPage === mediaTotalPages}
                    className="px-3 py-1 rounded bg-tank-gray text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    »
                  </button>
                  <button
                    onClick={() => setMediaPage(mediaTotalPages)}
                    disabled={mediaPage === mediaTotalPages}
                    className="px-3 py-1 rounded bg-tank-gray text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    »»
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Membership Sales Reports */}
          {activeTab === 'membershipSales' && (
            <div className="space-y-4">
              <div className="card overflow-x-auto">
                <table className="w-full text-sm min-w-[1200px]">
                  <thead>
                    <tr className="border-b border-tank-light bg-[#2a7b9b]">
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Year</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Month</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">User ID</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">User Name</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Email</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Phone</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Country</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Membership</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Revenues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.membershipType !== 'VIEWER').length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-gray-500">
                          No membership sales data available yet.
                        </td>
                      </tr>
                    ) : (
                      users.filter(u => u.membershipType !== 'VIEWER').map((user) => {
                        const date = new Date(user.createdAt)
                        return (
                          <tr key={user.id} className="border-b border-tank-light/50 hover:bg-tank-light/20 even:bg-[#c5d9e0]/10">
                            <td className="p-3 text-gray-300">{date.getFullYear()}</td>
                            <td className="p-3 text-gray-300">{date.toLocaleString('default', { month: 'short' })}</td>
                            <td className="p-3 text-gray-300">@{user.username}</td>
                            <td className="p-3 text-gray-300">{user.legalName || '-'}</td>
                            <td className="p-3 text-gray-300">{user.email}</td>
                            <td className="p-3 text-gray-300">{user.phone || '-'}</td>
                            <td className="p-3 text-gray-300">{user.location || '-'}</td>
                            <td className="p-3">
                              <span className={`badge text-xs ${
                                user.membershipType === 'PREMIUM' ? 'bg-purple-500/20 text-purple-400' :
                                'bg-tank-accent/20 text-tank-accent'
                              }`}>
                                {user.membershipType}
                              </span>
                            </td>
                            <td className="p-3 text-gray-300">
                              {user.membershipType === 'PREMIUM' ? '$19.99' : 
                               user.membershipType === 'BASIC' ? '$9.99' : '-'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Contents Sales Reports */}
          {activeTab === 'contentSales' && (
            <div className="space-y-4">
              <div className="card overflow-x-auto">
                <table className="w-full text-sm min-w-[1200px]">
                  <thead>
                    <tr className="border-b border-tank-light bg-[#2a7b9b]">
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Year</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Month</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">User ID</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">User Name</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Email</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Phone</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Country</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Media Title</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Sold Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!contentSales || contentSales.length === 0) ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-gray-500">
                          No content sales data available yet.
                        </td>
                      </tr>
                    ) : (
                      contentSales.map((sale: any) => {
                        const date = new Date(sale.completedAt || sale.createdAt)
                        return (
                          <tr key={sale.id} className="border-b border-tank-light/50 hover:bg-tank-light/20 even:bg-[#c5d9e0]/10">
                            <td className="p-3 text-gray-300">{date.getFullYear()}</td>
                            <td className="p-3 text-gray-300">{date.toLocaleString('default', { month: 'short' })}</td>
                            <td className="p-3 text-gray-300">@{sale.buyer?.username || '-'}</td>
                            <td className="p-3 text-gray-300">{sale.buyer?.legalName || sale.buyer?.name || '-'}</td>
                            <td className="p-3 text-gray-300">{sale.buyer?.email || '-'}</td>
                            <td className="p-3 text-gray-300">{sale.buyer?.phone || '-'}</td>
                            <td className="p-3 text-gray-300">{sale.buyer?.location || '-'}</td>
                            <td className="p-3 text-gray-300 max-w-[200px] truncate" title={sale.media?.title}>
                              {sale.media?.title || '-'}
                            </td>
                            <td className="p-3 text-gray-300">${sale.amount?.toFixed(2) || '0.00'}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ad Sales Reports */}
          {activeTab === 'adSales' && (
            <div className="space-y-4">
              <div className="card overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="border-b border-tank-light bg-[#2a7b9b]">
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Year</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Month</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Google AdSense</th>
                      <th className="text-left p-3 text-white font-medium whitespace-nowrap">Revenues</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500">
                        No ad sales data available yet. Connect Google AdSense to view revenue reports.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Warning Details Modal */}
      {warningModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setWarningModal(null)}>
          <div className="bg-tank-gray rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <h2 className="text-xl font-bold text-yellow-400">Warning Details</h2>
                <p className="text-gray-400">@{warningModal.username}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-2xl font-bold text-yellow-400">{warningModal.warningCount}</p>
                <p className="text-xs text-gray-400">Total Warnings</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {warningModal.loading ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              ) : warningModal.history.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No warning history found</div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-tank-gray">
                    <tr className="border-b border-tank-light">
                      <th className="text-left p-3 text-gray-400 font-medium w-12">#</th>
                      <th className="text-left p-3 text-gray-400 font-medium">Warning Item</th>
                      <th className="text-left p-3 text-gray-400 font-medium">Warning Reason</th>
                      <th className="text-left p-3 text-gray-400 font-medium">Warning Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warningModal.history.map((warning, index) => (
                      <tr key={warning.id} className="border-b border-tank-light/30">
                        <td className="p-3 text-gray-400">{index + 1}</td>
                        <td className="p-3 text-gray-300 text-sm max-w-[200px]">
                          {warning.messageContent ? (
                            <span className="line-clamp-2">{warning.messageContent}</span>
                          ) : (
                            <span className="text-gray-500 italic">N/A</span>
                          )}
                        </td>
                        <td className="p-3 text-white text-sm">{warning.reason}</td>
                        <td className="p-3 text-gray-300 text-sm whitespace-nowrap">
                          {new Date(warning.createdAt).toLocaleDateString()}<br/>
                          <span className="text-xs text-gray-500">{new Date(warning.createdAt).toLocaleTimeString()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <button
              onClick={() => setWarningModal(null)}
              className="w-full mt-4 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-2 px-4 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Suspension Details Modal */}
      {suspensionModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSuspensionModal(null)}>
          <div className="bg-tank-gray rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">🚫</span>
              <div>
                <h2 className="text-xl font-bold text-red-400">Suspension Details</h2>
                <p className="text-gray-400">@{suspensionModal.username}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              {suspensionModal.suspendReason && (
                <div className="bg-tank-dark rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-1">Reason for Suspension</p>
                  <p className="text-white">{suspensionModal.suspendReason}</p>
                </div>
              )}
              
              {suspensionModal.suspendedAt && (
                <div className="bg-tank-dark rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-1">Suspended On</p>
                  <p className="text-white">{new Date(suspensionModal.suspendedAt).toLocaleDateString()} at {new Date(suspensionModal.suspendedAt).toLocaleTimeString()}</p>
                </div>
              )}
              
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm mb-1">Duration</p>
                <p className="text-white">
                  {suspensionModal.suspendedUntil 
                    ? `Until ${new Date(suspensionModal.suspendedUntil).toLocaleDateString()} at ${new Date(suspensionModal.suspendedUntil).toLocaleTimeString()}`
                    : 'Permanent'
                  }
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setSuspensionModal(null)}
              className="w-full mt-6 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-2 px-4 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* User Management Modal */}
      {showUserModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowUserModal(false)}>
          <div className="bg-tank-gray rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center text-xl font-bold overflow-hidden">
                {selectedUser.avatar ? (
                  <img src={selectedUser.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  selectedUser.legalName?.[0]?.toUpperCase() || selectedUser.username[0].toUpperCase()
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold">{selectedUser.legalName || selectedUser.username}</h2>
                <p className="text-tank-accent font-medium">@{selectedUser.username}</p>
                <p className="text-sm text-gray-500">{selectedUser.email}</p>
              </div>
            </div>

            {/* User Info */}
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Role:</span>
                  <span className="ml-2 font-medium">{selectedUser.role}</span>
                </div>
                <div>
                  <span className="text-gray-500">Membership:</span>
                  <span className="ml-2 font-medium">{selectedUser.membershipType}</span>
                </div>
                <div>
                  <span className="text-gray-500">Media:</span>
                  <span className="ml-2 font-medium">{selectedUser._count.media}</span>
                </div>
                <div>
                  <span className="text-gray-500">Chat Messages:</span>
                  <span className="ml-2 font-medium">{selectedUser._count.chatMessages}</span>
                </div>
              </div>

              {selectedUser.isSuspended && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-red-400 font-medium">🚫 Account Suspended</p>
                  <p className="text-sm text-gray-400">{selectedUser.suspendReason}</p>
                  {selectedUser.suspendedUntil && (
                    <p className="text-xs text-gray-500">Until: {new Date(selectedUser.suspendedUntil).toLocaleDateString()}</p>
                  )}
                </div>
              )}

              {selectedUser.warningCount > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-yellow-400 font-medium">⚠️ {selectedUser.warningCount} Warning(s)</p>
                  <p className="text-sm text-gray-400">{selectedUser.lastWarningReason}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-300">Actions</h3>
              
              {/* Give Credits - Green */}
              <button
                onClick={() => {
                  setCreditsModal({
                    show: true,
                    userId: selectedUser.id,
                    username: selectedUser.username,
                    legalName: selectedUser.legalName,
                    currentCredits: (selectedUser.bonusCredits || 0) + (selectedUser.paidUploadCredits || 0)
                  })
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 px-4 font-medium transition-colors"
              >
                🎁 Give Credits
              </button>

              {/* Send Warning - Yellow/Gold */}
              <button
                onClick={() => {
                  const reason = prompt('Reason for warning:')
                  if (reason) {
                    handleAction('warnUser', selectedUser.id, { reason })
                  }
                }}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-lg py-2.5 px-4 font-medium transition-colors"
              >
                ⚠️ Send Warning
              </button>

              {/* Suspend/Unsuspend - Red */}
              {selectedUser.isSuspended ? (
                <button
                  onClick={() => handleAction('unsuspendUser', selectedUser.id)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 px-4 font-medium transition-colors"
                >
                  ✅ Unsuspend User
                </button>
              ) : (
                <button
                  onClick={() => {
                    const reason = prompt('Reason for suspension:')
                    const days = prompt('Duration in days (leave empty for permanent):')
                    if (reason) {
                      handleAction('suspendUser', selectedUser.id, { 
                        reason, 
                        duration: days ? parseInt(days) : null 
                      })
                    }
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 px-4 font-medium transition-colors"
                >
                  🚫 Suspend User
                </button>
              )}

              {/* Delete User - Dark Maroon */}
              <button
                onClick={() => handleAction('deleteUser', selectedUser.id)}
                className="w-full bg-red-900/80 hover:bg-red-900 text-white rounded-lg py-2.5 px-4 font-medium transition-colors"
              >
                🗑️ Delete User
              </button>
            </div>

            {/* Close button */}
            <button
              onClick={() => setShowUserModal(false)}
              className="w-full mt-4 bg-neutral-700 hover:bg-neutral-600 text-gray-300 rounded-lg py-2.5 px-4 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Delete Media Modal */}
      {deleteModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setDeleteModal(null); setDeleteReason(''); }}>
          <div className="bg-tank-gray rounded-xl p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4 text-red-400">🗑️ Delete Content</h2>
            
            <div className="space-y-4 mb-6">
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">Content Title:</p>
                <p className="font-medium">{deleteModal.mediaTitle}</p>
              </div>
              
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">Creator:</p>
                <p className="font-medium">@{deleteModal.creatorUsername}</p>
                <p className="text-sm text-gray-400">{deleteModal.creatorEmail}</p>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Reason for Deletion:</label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Enter the reason for deleting this content..."
                  className="input w-full h-24 resize-none"
                />
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendNotification}
                  onChange={(e) => setSendNotification(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-gray-300">Send notification email to creator</span>
              </label>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteModal(null); setDeleteReason(''); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-2 px-4"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const res = await fetch('/api/admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      action: 'deleteMedia', 
                      targetId: deleteModal.mediaId, 
                      data: {
                        reason: deleteReason,
                        sendNotification,
                        creatorEmail: deleteModal.creatorEmail,
                        mediaTitle: deleteModal.mediaTitle
                      }
                    }),
                  })
                  const result = await res.json()
                  if (res.ok) {
                    if (sendNotification) {
                      alert(result.emailSent 
                        ? '✅ Content deleted. Notification and email sent to creator.' 
                        : '⚠️ Content deleted. Notification sent, but email failed to send.')
                    } else {
                      alert('✅ Content deleted. Notification sent to creator.')
                    }
                    fetchData()
                  }
                  setDeleteModal(null)
                  setDeleteReason('')
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 px-4"
              >
                Send and Delete Content
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Media Modal */}
      {suspendModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setSuspendModal(null); setSuspendReason(''); }}>
          <div className="bg-tank-gray rounded-xl p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4 text-yellow-400">⚠️ Suspend Content</h2>
            
            <div className="space-y-4 mb-6">
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">Content Title:</p>
                <p className="font-medium">{suspendModal.mediaTitle}</p>
              </div>
              
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">Creator:</p>
                <p className="font-medium">@{suspendModal.creatorUsername}</p>
                <p className="text-sm text-gray-400">{suspendModal.creatorEmail}</p>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Reason for Suspension:</label>
                <textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Enter the reason for suspending this content..."
                  className="input w-full h-24 resize-none"
                />
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendSuspendNotification}
                  onChange={(e) => setSendSuspendNotification(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-gray-300">Send notification email to creator</span>
              </label>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setSuspendModal(null); setSuspendReason(''); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-2 px-4"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleAction('suspendMedia', suspendModal.mediaId, {
                    reason: suspendReason,
                    sendNotification: sendSuspendNotification,
                    creatorEmail: suspendModal.creatorEmail,
                    mediaTitle: suspendModal.mediaTitle
                  })
                  setSuspendModal(null)
                  setSuspendReason('')
                }}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg py-2 px-4"
              >
                Send and Suspend Content
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Give Credits Modal */}
      {creditsModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setCreditsModal(null); setCreditsAmount(''); }}>
          <div className="bg-tank-gray rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4 text-tank-accent">🎁 Give Credits</h2>
            
            <div className="space-y-4 mb-6">
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">User:</p>
                <p className="font-medium">{creditsModal.legalName || creditsModal.username}</p>
                <p className="text-sm text-gray-400">@{creditsModal.username}</p>
              </div>
              
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">Current Credits:</p>
                <p className="font-medium text-tank-accent">{creditsModal.currentCredits}</p>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Number of credits to give:</label>
                <input
                  type="number"
                  min="1"
                  value={creditsAmount}
                  onChange={(e) => setCreditsAmount(e.target.value)}
                  placeholder="Enter number of credits..."
                  className="input w-full"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setCreditsModal(null); setCreditsAmount(''); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-white rounded-lg py-2 px-4"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const credits = parseInt(creditsAmount)
                  if (credits > 0) {
                    await handleAction('giveCredits', creditsModal.userId, { credits })
                    setCreditsModal(null)
                    setCreditsAmount('')
                  }
                }}
                disabled={!creditsAmount || parseInt(creditsAmount) <= 0}
                className="flex-1 bg-tank-accent hover:bg-tank-accent/80 text-black rounded-lg py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Give Credits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Warning Modal */}
      {chatWarningModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setChatWarningModal(null); setChatWarningReason(''); }}>
          <div className="bg-tank-gray rounded-xl p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4 text-yellow-400">⚠️ Warning Chat User</h2>
            
            <div className="space-y-4 mb-6">
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">User:</p>
                <p className="font-medium">@{chatWarningModal.username}</p>
              </div>
              
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">Message:</p>
                <p className="text-sm text-gray-300 break-words">{chatWarningModal.messageContent}</p>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Reason for Warning:</label>
                <textarea
                  value={chatWarningReason}
                  onChange={(e) => setChatWarningReason(e.target.value)}
                  placeholder="Enter the reason for warning this user..."
                  className="input w-full h-24 resize-none"
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setChatWarningModal(null); setChatWarningReason(''); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-2 px-4"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleAction('warnChatUser', chatWarningModal.userId, {
                    messageId: chatWarningModal.messageId,
                    messageContent: chatWarningModal.messageContent,
                    reason: chatWarningReason
                  })
                  setChatWarningModal(null)
                  setChatWarningReason('')
                }}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg py-2 px-4"
              >
                Send Warning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Delete Modal */}
      {chatDeleteModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setChatDeleteModal(null); setChatDeleteReason(''); }}>
          <div className="bg-tank-gray rounded-xl p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4 text-red-400">🗑️ Delete Chat Message</h2>
            
            <div className="space-y-4 mb-6">
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">User:</p>
                <p className="font-medium">@{chatDeleteModal.username}</p>
              </div>
              
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">Message:</p>
                <p className="text-sm text-gray-300 break-words">{chatDeleteModal.messageContent}</p>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Reason for Deletion:</label>
                <textarea
                  value={chatDeleteReason}
                  onChange={(e) => setChatDeleteReason(e.target.value)}
                  placeholder="Enter the reason for deleting this message..."
                  className="input w-full h-24 resize-none"
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setChatDeleteModal(null); setChatDeleteReason(''); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-2 px-4"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleAction('deleteChatMessage', chatDeleteModal.messageId, {
                    reason: chatDeleteReason,
                    userId: chatDeleteModal.userId,
                    username: chatDeleteModal.username
                  })
                  setChatDeleteModal(null)
                  setChatDeleteReason('')
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 px-4"
              >
                Delete Message
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
