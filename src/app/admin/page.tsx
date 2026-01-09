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
  avatar: string | null
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
  createdAt: string
  user: { username: string; name: string | null; email: string }
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

type TabType = 'dashboard' | 'analytics' | 'users' | 'media' | 'chat' | 'reports'

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
  const [loading, setLoading] = useState(true)
  
  // User modal state
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showUserModal, setShowUserModal] = useState(false)
  
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

  useEffect(() => {
    if (session?.user?.role === 'ADMIN') {
      fetchData()
    }
  }, [session, activeTab, userSearchDebounced, userFilter, mediaPage, mediaSearchDebounced, mediaTypeFilter, mediaStatusFilter])

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
        const res = await fetch('/api/admin?action=chatMessages')
        const data = await res.json()
        setChatMessages(data.messages || [])
      } else if (activeTab === 'reports') {
        const res = await fetch('/api/admin?action=reports')
        const data = await res.json()
        setReports(data.reports || [])
      }
    } catch (error) {
      console.error('Error fetching admin data:', error)
    } finally {
      setLoading(false)
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
    <div className="max-w-7xl mx-auto p-4 pb-[500px]">
      <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
      <p className="text-gray-400 mb-8">Manage users, content, chat, and reports</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar">
        {(['dashboard', 'analytics', 'users', 'media', 'chat', 'reports'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab)
              if (tab === 'media') {
                setMediaPage(1)
                setMediaSearch('')
                setMediaTypeFilter('all')
                setMediaStatusFilter('all')
              }
            }}
            className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap ${
              activeTab === tab
                ? 'bg-tank-accent text-tank-black'
                : 'bg-tank-gray text-gray-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'reports' && stats && stats.pendingReports > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {stats.pendingReports}
              </span>
            )}
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
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-tank-light">
                      <th className="text-left p-4 text-gray-400 font-medium">User</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Status</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Warnings</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Credits</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-tank-light/50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center text-sm font-bold overflow-hidden">
                              {user.avatar ? (
                                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                user.name?.[0]?.toUpperCase() || user.username[0].toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{user.name || user.username}</div>
                              <div className="text-sm text-gray-500">@{user.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          {user.isSuspended ? (
                            <span className="badge bg-red-500/20 text-red-400">Suspended</span>
                          ) : (
                            <span className="badge bg-green-500/20 text-green-400">Active</span>
                          )}
                        </td>
                        <td className="p-4">
                          {user.warningCount > 0 && (
                            <span className="badge bg-yellow-500/20 text-yellow-400">
                              {user.warningCount} warning{user.warningCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-gray-400">
                          {user.bonusCredits + user.paidUploadCredits}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => { setSelectedUser(user); setShowUserModal(true); }}
                            className="text-tank-accent hover:underline text-sm"
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
              <div className="card">
                <h3 className="font-semibold mb-4">Recent Chat Messages</h3>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-3 p-3 bg-tank-dark rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {msg.user.avatar ? (
                          <img src={msg.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          msg.user.username[0].toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">@{msg.user.username}</span>
                          {msg.user.isSuspended && (
                            <span className="text-xs bg-red-500/20 text-red-400 px-1 rounded">Suspended</span>
                          )}
                          {msg.user.warningCount > 0 && (
                            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1 rounded">
                              {msg.user.warningCount}⚠️
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {new Date(msg.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm break-words">{msg.content}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction('warnChatUser', msg.user.id, { 
                            messageId: msg.id, 
                            messageContent: msg.content,
                            reason: prompt('Reason for warning:') 
                          })}
                          className="text-yellow-400 hover:text-yellow-300 text-xs"
                          title="Warn User"
                        >
                          ⚠️
                        </button>
                        <button
                          onClick={() => handleAction('deleteChatMessage', msg.id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                          title="Delete Message"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Media */}
          {activeTab === 'media' && (
            <div className="space-y-4">
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-tank-light">
                      <th className="text-left p-4 text-gray-400 font-medium">Media</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Type</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Creator</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Status</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Reports</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {media.map((item) => (
                      <tr key={item.id} className="border-b border-tank-light/50">
                        <td className="p-4">
                          <Link href={`/media/${item.id}`} className="font-medium hover:text-tank-accent line-clamp-1">
                            {item.title}
                          </Link>
                        </td>
                        <td className="p-4">
                          <span className={`badge ${
                            item.type === 'VIDEO' ? 'badge-video' :
                            item.type === 'IMAGE' ? 'badge-image' : 'badge-music'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="p-4 text-gray-400">@{item.user.username}</td>
                        <td className="p-4">
                          {item.isDeleted ? (
                            <span className="badge bg-red-500/20 text-red-400" title={item.deletionReason || ''}>
                              Deleted
                            </span>
                          ) : (
                            <span className={`badge ${
                              item.isApproved ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              {item.isApproved ? 'Approved' : 'Pending'}
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          {item._count.reports > 0 && (
                            <span className="badge bg-red-500/20 text-red-400">{item._count.reports}</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
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
                                  <button onClick={() => handleAction('rejectMedia', item.id)} className="text-yellow-400 hover:text-yellow-300 text-sm">
                                    Reject
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
                    ))}
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

          {/* Reports */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              {reports.length === 0 ? (
                <div className="card text-center py-12 text-gray-500">No pending reports</div>
              ) : (
                reports.map((report) => (
                  <div key={report.id} className="card">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="badge bg-red-500/20 text-red-400">Report</span>
                          <span className="text-sm text-gray-500">by @{report.user.username}</span>
                        </div>
                        <p className="text-gray-300 mb-2">{report.reason}</p>
                        <Link href={`/media/${report.media.id}`} className="text-sm text-tank-accent hover:underline">
                          View: {report.media.title}
                        </Link>
                        <p className="text-xs text-gray-500 mt-1">Posted by @{report.media.user.username}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAction('resolveReport', report.id, { status: 'RESOLVED' })} className="btn-secondary text-sm py-2">
                          Resolve
                        </button>
                        <button onClick={() => handleAction('resolveReport', report.id, { status: 'DISMISSED' })} className="text-gray-400 hover:text-gray-300 text-sm">
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
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
                  selectedUser.username[0].toUpperCase()
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold">{selectedUser.name || selectedUser.username}</h2>
                <p className="text-gray-400">@{selectedUser.username}</p>
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
              
              {/* Suspend/Unsuspend */}
              {selectedUser.isSuspended ? (
                <button
                  onClick={() => handleAction('unsuspendUser', selectedUser.id)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 px-4"
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
                  className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 px-4"
                >
                  🚫 Suspend User
                </button>
              )}

              {/* Warn */}
              <button
                onClick={() => {
                  const reason = prompt('Reason for warning:')
                  if (reason) {
                    handleAction('warnUser', selectedUser.id, { reason })
                  }
                }}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg py-2 px-4"
              >
                ⚠️ Send Warning
              </button>

              {selectedUser.warningCount > 0 && (
                <button
                  onClick={() => handleAction('clearWarnings', selectedUser.id)}
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white rounded-lg py-2 px-4"
                >
                  🧹 Clear Warnings
                </button>
              )}

              {/* Give Credits */}
              <button
                onClick={() => {
                  const credits = prompt('Number of credits to give:')
                  if (credits && parseInt(credits) > 0) {
                    handleAction('giveCredits', selectedUser.id, { credits: parseInt(credits) })
                  }
                }}
                className="w-full bg-tank-accent hover:bg-tank-accent/80 text-black rounded-lg py-2 px-4"
              >
                🎁 Give Credits
              </button>

              {/* Change Role */}
              <div className="flex gap-2">
                <select
                  defaultValue={selectedUser.role}
                  onChange={(e) => handleAction('updateUserRole', selectedUser.id, { role: e.target.value })}
                  className="flex-1 bg-tank-dark border border-tank-light rounded-lg px-3 py-2"
                >
                  <option value="VIEWER">VIEWER</option>
                  <option value="SUBSCRIBER">SUBSCRIBER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              {/* Delete User */}
              <button
                onClick={() => handleAction('deleteUser', selectedUser.id)}
                className="w-full bg-red-900 hover:bg-red-800 text-white rounded-lg py-2 px-4"
              >
                🗑️ Delete User
              </button>
            </div>

            <button
              onClick={() => setShowUserModal(false)}
              className="w-full mt-4 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-2 px-4"
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
                  await handleAction('deleteMedia', deleteModal.mediaId, {
                    reason: deleteReason,
                    sendNotification,
                    creatorEmail: deleteModal.creatorEmail,
                    mediaTitle: deleteModal.mediaTitle
                  })
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
    </div>
  )
}
