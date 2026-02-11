'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  read: boolean
  createdAt: string
}

export default function NotificationsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
      return
    }
    if (status !== 'authenticated') return

    const load = async () => {
      try {
        const res = await fetch('/api/notifications')
        const data = await res.json()
        if (res.ok && data.notifications) {
          setNotifications(data.notifications)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [status, router])

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Notifications</h1>
        <Link href="/" className="text-tank-accent hover:underline text-sm">Back to Home</Link>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : notifications.length === 0 ? (
        <p className="text-gray-400">No notifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id} className={`p-3 rounded-lg ${n.read ? 'bg-tank-dark/50 text-gray-400' : 'bg-tank-light/10 text-white'}`}>
              {n.link ? (
                <Link href={n.link} className="block hover:text-tank-accent">{n.title}: {n.message}</Link>
              ) : (
                <span>{n.title}: {n.message}</span>
              )}
              <span className="text-xs text-gray-500 block mt-1">{new Date(n.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
