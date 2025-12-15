'use client'

import { useEffect, useState } from 'react'
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

interface User {
  id: string
  email: string
  username: string
  name: string | null
  role: string
  createdAt: string
  _count: { media: number }
}

interface Media {
  id: string
  title: string
  type: string
  url: string
  isApproved: boolean
  createdAt: string
  user: { username: string; name: string | null }
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

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'media' | 'reports'>('dashboard')
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [media, setMedia] = useState<Media[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
      router.push('/')
    }
  }, [status, session, router])

  useEffect(() => {
    if (session?.user?.role === 'ADMIN') {
      fetchData()
    }
  }, [session, activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'dashboard') {
        const res = await fetch('/api/admin')
        const data = await res.json()
        setStats(data.stats)
      } else if (activeTab === 'users') {
        const res = await fetch('/api/admin?action=users')
        const data = await res.json()
        setUsers(data.users || [])
      } else if (activeTab === 'media') {
        const res = await fetch('/api/admin?action=media')
        const data = await res.json()
        setMedia(data.media || [])
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
    if (!confirm('Are you sure?')) return

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetId, data }),
      })

      if (res.ok) {
        fetchData()
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
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
      <p className="text-gray-400 mb-8">Manage users, content, and reports</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar">
        {['dashboard', 'users', 'media', 'reports'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap ${
              activeTab === tab
                ? 'bg-tank-accent text-tank-black'
                : 'bg-tank-gray text-gray-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* Dashboard */}
          {activeTab === 'dashboard' && stats && (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card text-center">
                  <div className="text-3xl font-bold text-tank-accent">
                    {stats.totalUsers}
                  </div>
                  <div className="text-gray-500">Total Users</div>
                </div>
                <div className="card text-center">
                  <div className="text-3xl font-bold text-blue-400">
                    {stats.totalMedia}
                  </div>
                  <div className="text-gray-500">Total Media</div>
                </div>
                <div className="card text-center">
                  <div className="text-3xl font-bold text-purple-400">
                    {stats.totalComments}
                  </div>
                  <div className="text-gray-500">Comments</div>
                </div>
                <div className="card text-center">
                  <div className="text-3xl font-bold text-red-400">
                    {stats.pendingReports}
                  </div>
                  <div className="text-gray-500">Pending Reports</div>
                </div>
              </div>

              {/* Breakdown */}
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

          {/* Users */}
          {activeTab === 'users' && (
            <div className="card overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-tank-light">
                    <th className="text-left p-4 text-gray-400 font-medium">User</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Email</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Role</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Media</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-tank-light/50">
                      <td className="p-4">
                        <Link
                          href={`/profile/${user.username}`}
                          className="flex items-center gap-3 hover:text-tank-accent"
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center text-xs font-bold">
                            {user.name?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">{user.name || user.username}</div>
                            <div className="text-sm text-gray-500">@{user.username}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="p-4 text-gray-400">{user.email}</td>
                      <td className="p-4">
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleAction('updateUserRole', user.id, { role: e.target.value })
                          }
                          className="bg-tank-dark border border-tank-light rounded px-2 py-1 text-sm"
                        >
                          <option value="VIEWER">VIEWER</option>
                          <option value="SUBSCRIBER">SUBSCRIBER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td className="p-4">{user._count.media}</td>
                      <td className="p-4">
                        <button
                          onClick={() => handleAction('deleteUser', user.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Media */}
          {activeTab === 'media' && (
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
                        <Link
                          href={`/media/${item.id}`}
                          className="font-medium hover:text-tank-accent line-clamp-1"
                        >
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
                      <td className="p-4 text-gray-400">
                        @{item.user.username}
                      </td>
                      <td className="p-4">
                        <span className={`badge ${
                          item.isApproved
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {item.isApproved ? 'Approved' : 'Pending'}
                        </span>
                      </td>
                      <td className="p-4">
                        {item._count.reports > 0 && (
                          <span className="badge bg-red-500/20 text-red-400">
                            {item._count.reports}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          {!item.isApproved && (
                            <button
                              onClick={() => handleAction('approveMedia', item.id)}
                              className="text-green-400 hover:text-green-300 text-sm"
                            >
                              Approve
                            </button>
                          )}
                          {item.isApproved && (
                            <button
                              onClick={() => handleAction('rejectMedia', item.id)}
                              className="text-yellow-400 hover:text-yellow-300 text-sm"
                            >
                              Reject
                            </button>
                          )}
                          <button
                            onClick={() => handleAction('deleteMedia', item.id)}
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
          )}

          {/* Reports */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              {reports.length === 0 ? (
                <div className="card text-center py-12 text-gray-500">
                  No pending reports
                </div>
              ) : (
                reports.map((report) => (
                  <div key={report.id} className="card">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="badge bg-red-500/20 text-red-400">
                            Report
                          </span>
                          <span className="text-sm text-gray-500">
                            by @{report.user.username}
                          </span>
                        </div>
                        <p className="text-gray-300 mb-2">{report.reason}</p>
                        <Link
                          href={`/media/${report.media.id}`}
                          className="text-sm text-tank-accent hover:underline"
                        >
                          View: {report.media.title}
                        </Link>
                        <p className="text-xs text-gray-500 mt-1">
                          Posted by @{report.media.user.username}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            handleAction('resolveReport', report.id, { status: 'RESOLVED' })
                          }
                          className="btn-secondary text-sm py-2"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() =>
                            handleAction('resolveReport', report.id, { status: 'DISMISSED' })
                          }
                          className="text-gray-400 hover:text-gray-300 text-sm"
                        >
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
    </div>
  )
}


