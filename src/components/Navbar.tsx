'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import MediaMessageModal from './MediaMessageModal'
import { setAppBadge, clearAppBadge, calculateTotalNotifications, isInstalledPWA, requestNotificationPermission } from '@/lib/appBadge'
import { clearHomeFeed } from '@/lib/homePrefetchCache'

// Dynamic import TalkChat to prevent SSR issues
const TalkChat = dynamic(() => import('./TalkChat'), { ssr: false })

interface Notification {
  id: string
  type: 'purchase' | 'download_reminder' | 'message' | 'system'
  title: string
  message: string
  read: boolean
  createdAt: string
  link?: string
}

interface NavbarMenuItem {
  itemKey: string
  label: string
  isEnabled: boolean
  sortOrder: number
}

export default function Navbar() {
  const { data: session, status } = useSession()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isAlertsOpen, setIsAlertsOpen] = useState(false)
  // IMPORTANT: keep chat closed by default to avoid background polling slowing the app.
  const [isTalkChatOpen, setIsTalkChatOpen] = useState(false)
  const [isPageVisible, setIsPageVisible] = useState(true)
  const [isMediaMessageOpen, setIsMediaMessageOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [chatInviteCount, setChatInviteCount] = useState(0)
  const [notificationsOn, setNotificationsOn] = useState(true)
  const [expandedNotificationId, setExpandedNotificationId] = useState<string | null>(null)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [userData, setUserData] = useState<{ name: string | null; username: string | null; avatar: string | null; membershipType: string | null; role: string | null } | null>(null)
  const [navbarMenuItems, setNavbarMenuItems] = useState<NavbarMenuItem[]>([])
  const [ecardEnabled, setEcardEnabled] = useState(true)

  const navRef = useRef<HTMLElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const alertsRef = useRef<HTMLDivElement>(null)
  const alertsDropdownRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const [alertsDropdownStyle, setAlertsDropdownStyle] = useState<React.CSSProperties>({})

  const fetchNavbarMenuSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/ui/navbar', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setNavbarMenuItems(data.items || [])
      }
    } catch (error) {
      console.error('Error fetching navbar settings:', error)
    }
  }, [])

  const isNavbarItemEnabled = useCallback(
    (key: string) => {
      if (navbarMenuItems.length === 0) return true
      return navbarMenuItems.find((item) => item.itemKey === key)?.isEnabled !== false
    },
    [navbarMenuItems]
  )

  // Load navbar settings + respond to admin updates.
  useEffect(() => {
    fetchNavbarMenuSettings()
    const handler = () => fetchNavbarMenuSettings()
    window.addEventListener('navbarMenuUpdated', handler as EventListener)
    return () => window.removeEventListener('navbarMenuUpdated', handler as EventListener)
  }, [fetchNavbarMenuSettings])

  const fetchHomeLayout = useCallback(async () => {
    try {
      const res = await fetch('/api/ui/home-layout', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setEcardEnabled(data.ecardEnabled !== false)
      }
    } catch (error) {
      console.error('Error fetching home layout:', error)
    }
  }, [])

  useEffect(() => {
    fetchHomeLayout()
    const handler = () => fetchHomeLayout()
    window.addEventListener('homeLayoutUpdated', handler as EventListener)
    return () => window.removeEventListener('homeLayoutUpdated', handler as EventListener)
  }, [fetchHomeLayout])

  // If chat is disabled via Navbar Control, force-close it.
  useEffect(() => {
    if (!isNavbarItemEnabled('chat')) {
      setIsTalkChatOpen(false)
    }
  }, [isNavbarItemEnabled])

  // Check subscriber status from fetched data (more reliable than session)
  const isSubscriber = userData?.role === 'SUBSCRIBER' || userData?.role === 'ADMIN' || 
                       userData?.membershipType === 'BASIC' || userData?.membershipType === 'ADVANCED' || userData?.membershipType === 'PREMIUM' ||
                       session?.user?.role === 'SUBSCRIBER' || session?.user?.role === 'ADMIN'
  const isAdmin = userData?.role === 'ADMIN' || session?.user?.role === 'ADMIN'
  
  // Display name - show Nickname (username) in navbar
  const displayName = userData?.username || session?.user?.username || 'User'

  // Keep notification dropdown within viewport, positioned just below the navbar
  useLayoutEffect(() => {
    if (!isAlertsOpen || !alertsRef.current) {
      setAlertsDropdownStyle({})
      return
    }
    const rect = alertsRef.current.getBoundingClientRect()
    const navRect = navRef.current?.getBoundingClientRect()
    const dropdownWidth = 320
    const gap = 4
    const padding = 8
    // Place top edge just below the navbar (or below bell if nav ref missing)
    const top = navRect ? navRect.bottom + gap : rect.bottom + gap
    let left = rect.right - dropdownWidth
    if (left < padding) {
      left = padding
    }
    const maxLeft = typeof window !== 'undefined' ? window.innerWidth - dropdownWidth - padding : 0
    const clampedLeft = Math.min(Math.max(left, padding), maxLeft)
    const safeTop = Math.max(padding, top)
    setAlertsDropdownStyle({
      position: 'fixed',
      top: safeTop,
      left: clampedLeft,
      width: Math.min(dropdownWidth, (typeof window !== 'undefined' ? window.innerWidth : 400) - padding * 2),
      zIndex: 50,
    })
  }, [isAlertsOpen])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false)
      }
      if (alertsRef.current && !alertsRef.current.contains(event.target as Node)) {
        setIsAlertsOpen(false)
        setExpandedNotificationId(null)
        setIsSelectMode(false)
        setSelectedIds(new Set())
      }
      // Close mobile menu when clicking outside
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node) &&
          mobileMenuButtonRef.current && !mobileMenuButtonRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Pause background polling when tab is hidden
  useEffect(() => {
    const update = () => setIsPageVisible(!document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  // Fetch user data for updated name/avatar
  useEffect(() => {
    if (session?.user) {
      fetchUserData()
      // Refresh user data every 30 seconds to keep avatar/name in sync
      const interval = setInterval(fetchUserData, 30000)
      
      // Listen for profile update events
      const handleProfileUpdate = () => fetchUserData()
      window.addEventListener('profileUpdated', handleProfileUpdate)
      
      return () => {
        clearInterval(interval)
        window.removeEventListener('profileUpdated', handleProfileUpdate)
      }
    }
  }, [session])

  // Fetch notifications
  useEffect(() => {
    if (session?.user) {
      fetchNotifications()
    }
  }, [session])

  // Fetch chat invites count
  useEffect(() => {
    if (session?.user) {
      if (!isPageVisible) return
      fetchChatInvites()
      const interval = setInterval(fetchChatInvites, 30000) // Check every 30 seconds
      return () => clearInterval(interval)
    }
  }, [session, isPageVisible])

  // Request notification permission when user is signed in (helps with badge support)
  useEffect(() => {
    if (session?.user) {
      // Request permission for notifications (needed for badges in some browsers)
      requestNotificationPermission().then((granted) => {
        if (granted) {
          console.log('Notification permission granted - badges should work')
        }
      })
    }
  }, [session])

  // Persist notifications ON/OFF preference
  useEffect(() => {
    try {
      const stored = localStorage.getItem('notifications-on')
      if (stored !== null) setNotificationsOn(stored === 'true')
    } catch {
      // ignore
    }
  }, [])

  const toggleNotificationsOn = () => {
    setNotificationsOn((prev) => {
      const next = !prev
      try {
        localStorage.setItem('notifications-on', String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  // Update app badge when notification counts change (only if notifications are on)
  useEffect(() => {
    const totalCount = notificationsOn ? calculateTotalNotifications(unreadCount, chatInviteCount) : 0
    setAppBadge(totalCount)
  }, [unreadCount, chatInviteCount, notificationsOn])

  // Listen for notification updates from TalkChat
  useEffect(() => {
    const handleNotificationUpdate = () => {
      fetchChatInvites()
      fetchNotifications()
    }
    
    window.addEventListener('notificationUpdate', handleNotificationUpdate)
    return () => window.removeEventListener('notificationUpdate', handleNotificationUpdate)
  }, [])

  const fetchUserData = async () => {
    try {
      // Add timestamp to prevent any caching
      const res = await fetch(`/api/user/profile?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setUserData({
          name: data.user?.name || null,
          username: data.user?.username || null,
          avatar: data.user?.avatar || null,
          membershipType: data.user?.membershipType || null,
          role: data.user?.role || null,
        })
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    }
  }

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    }
  }

  const fetchChatInvites = async () => {
    try {
      // Fetch unread private message count (includes invites)
      const res = await fetch('/api/chat/unread')
      if (res.ok) {
        const data = await res.json()
        setChatInviteCount(data.unreadCount || 0)
      }
    } catch (error) {
      console.error('Error fetching unread messages:', error)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, { method: 'POST' })
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const deleteSelectedNotifications = async () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    try {
      const res = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (res.ok) {
        setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)))
        const deletedUnread = notifications.filter(n => selectedIds.has(n.id) && !n.read).length
        setUnreadCount(prev => Math.max(0, prev - deletedUnread))
        setSelectedIds(new Set())
        setIsSelectMode(false)
      }
    } catch (error) {
      console.error('Error deleting notifications:', error)
    }
  }

  const toggleSelectNotification = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'purchase':
        return (
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )
      case 'download_reminder':
        return (
          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
      case 'message':
        return (
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
        )
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-gray-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
        )
    }
  }

  return (
    <nav ref={navRef} className="fixed top-0 left-0 right-0 z-50 bg-tank-dark/90 backdrop-blur-md border-b border-tank-light pwa-navbar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Home Icon */}
          <div className="flex items-center flex-shrink-0">
            <Link href="/" className="flex items-center" onClick={(e) => { 
              e.preventDefault();
              sessionStorage.removeItem('homeScrollState');
              clearHomeFeed();
              if (window.location.pathname === '/') {
                window.scrollTo({ top: 0, behavior: 'instant' });
              } else {
                window.location.href = '/';
              }
            }}>
            <img 
              src="/logo.png" 
              alt="AiMediaTank" 
              className="h-10 w-auto"
            />
            </Link>
            {/* Home Icon - wireframe only */}
            {isNavbarItemEnabled('home') && (
            <Link 
              href="/" 
              className="ml-[20px] text-gray-400 hover:text-white transition-colors"
              onClick={(e) => { 
                e.preventDefault();
                sessionStorage.removeItem('homeScrollState');
                clearHomeFeed();
                if (window.location.pathname === '/') {
                  window.scrollTo({ top: 0, behavior: 'instant' });
                  window.dispatchEvent(new Event('homeRefreshRequested'));
                } else {
                  window.location.href = '/';
                }
              }}
              title="Home"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </Link>
            )}
            </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {isNavbarItemEnabled('all') && <NavLink href="/">All</NavLink>}
            {isNavbarItemEnabled('videos') && <NavLink href="/?type=VIDEO">Videos</NavLink>}
            {isNavbarItemEnabled('images') && <NavLink href="/?type=IMAGE">Images</NavLink>}
            {isNavbarItemEnabled('about') && <NavLink href="/about">About</NavLink>}
            {isNavbarItemEnabled('play') && <NavLink href="/game">Play</NavLink>}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Notification Bell - signed-in users */}
            {session && (
              <div className="relative" ref={alertsRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAlertsOpen(!isAlertsOpen)
                    setIsProfileOpen(false)
                    setExpandedNotificationId(null)
                    if (isAlertsOpen) {
                      setIsSelectMode(false)
                      setSelectedIds(new Set())
                    }
                  }}
                  className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-200 hover:text-white hover:bg-tank-light transition-colors"
                  aria-label="Notifications"
                  title="Notifications"
                >
                  <div className="relative">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </div>
                </button>
                {/* Notifications Dropdown - positioned in viewport via alertsDropdownStyle */}
                {isAlertsOpen && (
                  <div
                    ref={alertsDropdownRef}
                    style={alertsDropdownStyle}
                    className="bg-tank-gray border border-tank-light rounded-lg shadow-xl overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-tank-light flex items-center justify-between bg-tank-dark">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">Notifications</h3>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleNotificationsOn()
                          }}
                          className={`text-xs font-medium px-2 py-0.5 rounded ${notificationsOn ? 'bg-tank-accent text-black' : 'bg-tank-light/30 text-gray-400'}`}
                          aria-label={notificationsOn ? 'Turn notifications off' : 'Turn notifications on'}
                        >
                          {notificationsOn ? 'ON' : 'OFF'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSelectMode ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const visible = notifications.slice(0, 5)
                                if (selectedIds.size === visible.length) {
                                  setSelectedIds(new Set())
                                } else {
                                  setSelectedIds(new Set(visible.map(n => n.id)))
                                }
                              }}
                              className="text-xs text-gray-400 hover:text-white"
                            >
                              {selectedIds.size === notifications.slice(0, 5).length ? 'Deselect All' : 'Select All'}
                            </button>
                            {selectedIds.size > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteSelectedNotifications()
                                }}
                                className="text-xs font-medium px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white"
                              >
                                Delete ({selectedIds.size})
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setIsSelectMode(false)
                                setSelectedIds(new Set())
                              }}
                              className="text-xs text-gray-400 hover:text-white"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {notifications.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setIsSelectMode(true)
                                  setExpandedNotificationId(null)
                                }}
                                className="text-xs text-gray-400 hover:text-white"
                              >
                                Delete
                              </button>
                            )}
                            {unreadCount > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  markAllAsRead()
                                }}
                                className="text-xs text-tank-accent hover:underline"
                              >
                                Mark all read
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-gray-500 text-center">No notifications</p>
                      ) : (
                        notifications.slice(0, 5).map((notification) => {
                          const isExpanded = expandedNotificationId === notification.id
                          const isSelected = selectedIds.has(notification.id)
                          return (
                            <div
                              key={notification.id}
                              className={`px-3 py-2 cursor-pointer hover:bg-tank-dark transition-colors border-b border-tank-light/50 last:border-b-0 ${!notification.read ? 'bg-tank-accent/5' : ''} ${isSelected ? 'bg-tank-accent/10' : ''}`}
                              onClick={() => {
                                if (isSelectMode) {
                                  toggleSelectNotification(notification.id)
                                } else {
                                  setExpandedNotificationId(isExpanded ? null : notification.id)
                                  if (!notification.read) markAsRead(notification.id)
                                }
                              }}
                            >
                              <div className="flex gap-2 items-start">
                                {isSelectMode && (
                                  <div className="flex items-center pt-0.5">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-tank-accent border-tank-accent' : 'border-gray-500'}`}>
                                      {isSelected && (
                                        <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {getNotificationIcon(notification.type)}
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium ${!notification.read ? 'text-white' : 'text-gray-300'}`}>
                                    {notification.title}
                                  </p>
                                  <p className={`text-[10px] text-gray-500 mt-0.5 ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}`}>
                                    {notification.message}
                                  </p>
                                  {isExpanded && !isSelectMode && (
                                    <p className="text-[9px] text-gray-600 mt-1">
                                      {new Date(notification.createdAt).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Celebrate Button - signed-in users, controlled by navbar 'mediaMessage' toggle */}
            {session && isNavbarItemEnabled('mediaMessage') && (
              <Link
                href="/ecard"
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-pink-500 hover:bg-pink-600 transition-colors"
                aria-label="Celebrate"
                title="Celebrate"
              >
                <span className="text-2xl leading-none">🎉</span>
              </Link>
            )}

            {/* eCard link - left of Chat when enabled */}
            {ecardEnabled && isNavbarItemEnabled('mediaMessage') && (
              <Link
                href="/ecard"
                className="h-9 px-2 flex items-center justify-center hover:bg-yellow-400 rounded-lg transition-colors bg-yellow-300"
                aria-label="eCard"
                title="eCard"
              >
                <span className="text-sm font-bold text-gray-900">eCard</span>
              </Link>
            )}
            {/* Chat Button */}
            {isNavbarItemEnabled('chat') && (
              <div className="relative">
                <button
                  onClick={() => setIsTalkChatOpen(!isTalkChatOpen)}
                  className="h-9 px-1 flex items-center justify-center hover:bg-yellow-400 rounded-lg transition-colors bg-yellow-300"
                  aria-label="Toggle Chat"
                  title="Toggle Chat"
                >
                  <span className="text-sm font-bold text-gray-900">Chat</span>
                </button>
                {/* Chat invite notification badge */}
                {chatInviteCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {chatInviteCount > 9 ? '9+' : chatInviteCount}
                  </span>
                )}
              </div>
            )}

            {status === 'loading' ? (
              <div className="w-8 h-8 rounded-full bg-tank-light animate-pulse" />
            ) : session ? (
              <>
                {/* Upload Button - redirects based on subscription status */}
                {isNavbarItemEnabled('upload') && (
                  <Link
                    href={isSubscriber ? "/upload" : "/pricing"}
                    className="upload-btn flex items-center justify-center h-9 rounded-lg
                      hover:scale-105 active:scale-95 transition-transform duration-200 ease-out
                      relative overflow-hidden"
                    style={{ paddingLeft: '7px', paddingRight: '7px' }}
                  >
                    <span className="upload-text text-sm font-bold">
                      Post
                    </span>
                  </Link>
                )}

                {/* Nickname Dropdown */}
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => {
                      setIsProfileOpen(!isProfileOpen)
                      setIsAlertsOpen(false)
                    }}
                    className="flex items-center p-1 rounded-lg hover:ring-2 hover:ring-tank-accent transition-all"
                    title={displayName}
                  >
                    {/* Avatar Only */}
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center text-sm font-bold">
                      {userData?.avatar ? (
                        <img 
                          src={`${userData.avatar}${userData.avatar.includes('?') ? '&' : '?'}t=${Date.now()}`}
                          alt={displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        displayName[0]?.toUpperCase() || '?'
                      )}
                    </div>
                  </button>

                  {isProfileOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-tank-dark border border-tank-light rounded-xl shadow-xl py-1">
                      <div className="px-4 py-1 border-b border-tank-light">
                        <p className="font-semibold">{userData?.username || session.user?.username || 'User'}</p>
                        <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
                          isAdmin ? 'bg-red-500/20 text-red-400' :
                          isSubscriber ? 'bg-tank-accent/20 text-tank-accent' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {session.user?.role}
                        </span>
                      </div>
                      <Link
                        href="/profile/edit"
                        className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </Link>
                      <Link
                        href={`/profile/${userData?.username || session.user?.username}`}
                        className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        My Contents
                      </Link>
                      <Link
                        href="/pricing"
                        className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        Membership
                      </Link>
                      <Link
                        href="/support"
                        className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Support
                      </Link>
                      <Link
                        href="/policy"
                        className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Policy
                      </Link>
                      {isAdmin && (
                        <Link
                          href="/admin"
                          className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors text-red-400"
                          onClick={() => setIsProfileOpen(false)}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Admin Panel
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          clearAppBadge() // Clear badge on sign out
                          signOut({ callbackUrl: '/' })
                        }}
                        className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors w-full text-left text-gray-400"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {isNavbarItemEnabled('signIn') && (
                  <Link
                    href="/login"
                    className="h-9 px-0.5 flex items-center justify-center text-blue-400 hover:text-blue-300 font-bold transition-colors text-sm"
                  >
                    Sign In
                  </Link>
                )}
                {isNavbarItemEnabled('signUp') && (
                  <Link
                    href="/register"
                    className="signup-btn h-9 px-0.5 flex items-center justify-center font-bold rounded-lg text-sm 
                      hover:scale-105 active:scale-95 transition-transform duration-200 ease-out
                      relative overflow-hidden"
                  >
                    <span className="signup-text font-bold">
                      Sign Up
                    </span>
                  </Link>
                )}
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              ref={mobileMenuButtonRef}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-gray-400 hover:text-white"
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              title={isMenuOpen ? "Close menu" : "Open menu"}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div ref={mobileMenuRef} className="md:hidden py-1 border-t border-tank-light">
            <div className="flex flex-col gap-[1px] items-end">
              {isNavbarItemEnabled('all') && (
                <MobileNavLink href="/" onClick={() => setIsMenuOpen(false)}>All</MobileNavLink>
              )}
              {isNavbarItemEnabled('videos') && (
                <MobileNavLink href="/?type=VIDEO" onClick={() => setIsMenuOpen(false)}>Videos</MobileNavLink>
              )}
              {isNavbarItemEnabled('images') && (
                <MobileNavLink href="/?type=IMAGE" onClick={() => setIsMenuOpen(false)}>Images</MobileNavLink>
              )}
              {isNavbarItemEnabled('about') && (
                <MobileNavLink href="/about" onClick={() => setIsMenuOpen(false)}>About</MobileNavLink>
              )}
              {isNavbarItemEnabled('play') && (
                <MobileNavLink href="/game" onClick={() => setIsMenuOpen(false)}>Play</MobileNavLink>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Talk Chat */}
      {isNavbarItemEnabled('chat') && isTalkChatOpen && (
        <TalkChat
          isOpen={isTalkChatOpen}
          onClose={() => setIsTalkChatOpen(false)}
        />
      )}

      {session && isNavbarItemEnabled('mediaMessage') && (
        <MediaMessageModal
          isOpen={isMediaMessageOpen}
          onClose={() => setIsMediaMessageOpen(false)}
          defaultRecipient="@aidog"
          myContentsHref={`/profile/${userData?.username || session?.user?.username || 'me'}`}
        />
      )}
    </nav>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [manualType, setManualType] = useState<string | undefined>(undefined)

  useEffect(() => {
    const onFilter = (e: Event) => {
      const type = (e as CustomEvent).detail?.type
      setManualType(type ?? '')
    }
    window.addEventListener('homeFilterChange', onFilter)
    return () => window.removeEventListener('homeFilterChange', onFilter)
  }, [])

  useEffect(() => {
    setManualType(undefined)
  }, [pathname, searchParams])

  const isActive = (() => {
    const currentSearch = manualType !== undefined
      ? (manualType ? `?type=${manualType}` : '')
      : (searchParams.toString() ? `?${searchParams.toString()}` : '')

    if (href === '/') {
      return pathname === '/' && !currentSearch
    } else if (href.startsWith('/?')) {
      return pathname === '/' && currentSearch === href.slice(1)
    } else {
      return pathname === href || pathname.startsWith(href + '/')
    }
  })()

  const handleClick = (e: React.MouseEvent) => {
    const isOnHomePage = window.location.pathname === '/'

    if (href === '/' || href.startsWith('/?')) {
      e.preventDefault()

      if (isOnHomePage) {
        window.history.replaceState(window.history.state, '', href)

        sessionStorage.removeItem('homeScrollState')
        clearHomeFeed()

        window.scrollTo({ top: 0, behavior: 'instant' })
        const url = new URL(href, window.location.origin)
        window.dispatchEvent(new CustomEvent('homeFilterChange', {
          detail: { type: url.searchParams.get('type') }
        }))
      } else {
        if (href === '/') {
          sessionStorage.removeItem('homeScrollState')
          clearHomeFeed()
        }
        window.location.href = href
      }
    }
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={`px-4 py-2 rounded-lg transition-all ${
        isActive
          ? 'text-tank-accent bg-tank-light font-semibold'
          : 'text-white hover:text-tank-accent hover:bg-tank-light'
      }`}
    >
      {children}
    </Link>
  )
}

function MobileNavLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    onClick()

    const isOnHomePage = window.location.pathname === '/'

    if ((href === '/' || href.startsWith('/?')) && isOnHomePage) {
      window.history.replaceState(window.history.state, '', href)

      sessionStorage.removeItem('homeScrollState')
      clearHomeFeed()

      window.scrollTo({ top: 0, behavior: 'instant' })
      const url = new URL(href, window.location.origin)
      window.dispatchEvent(new CustomEvent('homeFilterChange', {
        detail: { type: url.searchParams.get('type') }
      }))
    } else {
      if (href === '/') {
        sessionStorage.removeItem('homeScrollState')
        clearHomeFeed()
      }
      window.location.href = href
    }
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="px-4 py-px text-white hover:text-tank-accent hover:bg-tank-light rounded-lg transition-all text-right"
    >
      {children}
    </Link>
  )
}

