'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import EmailSupportModal from './EmailSupportModal'
import SignInModal from './SignInModal'

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

export default function Navbar() {
  const { data: session, status } = useSession()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isAlertsOpen, setIsAlertsOpen] = useState(false)
  const [isEmailSupportOpen, setIsEmailSupportOpen] = useState(false)
  const [isTalkChatOpen, setIsTalkChatOpen] = useState(true) // Always show chat
  const [isSignInOpen, setIsSignInOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [chatInviteCount, setChatInviteCount] = useState(0)
  const [userData, setUserData] = useState<{ name: string | null; username: string | null; avatar: string | null; membershipType: string | null; role: string | null } | null>(null)

  const profileRef = useRef<HTMLDivElement>(null)
  const alertsRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)

  // Check subscriber status from fetched data (more reliable than session)
  const isSubscriber = userData?.role === 'SUBSCRIBER' || userData?.role === 'ADMIN' || 
                       userData?.membershipType === 'BASIC' || userData?.membershipType === 'ADVANCED' || userData?.membershipType === 'PREMIUM' ||
                       session?.user?.role === 'SUBSCRIBER' || session?.user?.role === 'ADMIN'
  const isAdmin = userData?.role === 'ADMIN' || session?.user?.role === 'ADMIN'
  
  // Display name - show User ID (username) in navbar
  const displayName = userData?.username || session?.user?.username || 'User'

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false)
      }
      if (alertsRef.current && !alertsRef.current.contains(event.target as Node)) {
        setIsAlertsOpen(false)
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
      fetchChatInvites()
      const interval = setInterval(fetchChatInvites, 10000) // Check every 10 seconds
      return () => clearInterval(interval)
    }
  }, [session])

  const fetchUserData = async () => {
    try {
      const res = await fetch('/api/user/profile')
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
      const res = await fetch('/api/chat/invites')
      if (res.ok) {
        const data = await res.json()
        setChatInviteCount(data.invites?.length || 0)
      }
    } catch (error) {
      console.error('Error fetching chat invites:', error)
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-tank-dark/90 backdrop-blur-md border-b border-tank-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }}>
            <img 
              src="/logo.png" 
              alt="AiMediaTank" 
              className="h-9 w-auto"
            />
            <div className="hidden min-[200px]:flex flex-col text-[12px] font-bold leading-none">
              <span><span className="text-red-500">A</span><span className="text-white">i</span></span>
              <span><span className="text-green-500">M</span><span className="text-white">edia</span></span>
              <span><span className="text-blue-500">T</span><span className="text-white">ank</span></span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/?type=VIDEO">Videos</NavLink>
            <NavLink href="/?type=IMAGE">Images</NavLink>
            <NavLink href="/?type=MUSIC">Music</NavLink>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Chat Button - Always visible for all users */}
            <div className="relative">
              <button
                onClick={() => setIsTalkChatOpen(!isTalkChatOpen)}
                className="w-9 h-9 flex items-center justify-center hover:bg-yellow-400 rounded-lg transition-colors bg-yellow-300"
                aria-label="Toggle Chat"
                title="Toggle Chat"
              >
                <svg width="22" height="22" viewBox="0 0 100 60" fill="none">
                  <path d="M50 58C25 58 8 45 4 35C1 27 6 15 20 8C34 1 50 5 50 5C50 5 66 1 80 8C94 15 99 27 96 35C92 45 75 58 50 58Z" fill="#E91E63"/>
                  <path d="M22 26C22 26 35 36 50 36C65 36 78 26 78 26C78 26 68 44 50 44C32 44 22 26 22 26Z" fill="#1a1a1a"/>
                  <path d="M36 26C36 23 41 19 50 19C59 19 64 23 64 26C64 29 59 21 50 21C41 21 36 29 36 26Z" fill="white"/>
                  <path d="M40 39C40 37 44 34 50 34C56 34 60 37 60 39C60 41 56 37 50 37C44 37 40 41 40 39Z" fill="white"/>
                </svg>
              </button>
              {/* Chat invite notification badge */}
              {chatInviteCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {chatInviteCount > 9 ? '9+' : chatInviteCount}
                </span>
              )}
            </div>

            {status === 'loading' ? (
              <div className="w-8 h-8 rounded-full bg-tank-light animate-pulse" />
            ) : session ? (
              <>
                {/* Upload Button - redirects based on subscription status */}
                <Link
                  href={isSubscriber ? "/upload" : "/pricing"}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-tank-accent text-tank-black font-semibold rounded-lg hover:bg-tank-accent/90 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Upload
                </Link>

                {/* User ID Dropdown */}
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
                      {/* Notifications */}
                      <div className="relative" ref={alertsRef}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setIsAlertsOpen(!isAlertsOpen)
                          }}
                          className="flex items-center gap-3 px-4 py-0.5 hover:bg-tank-light transition-colors w-full text-left"
                        >
                          <div className="relative">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            {unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                {unreadCount > 9 ? '9+' : unreadCount}
                              </span>
                            )}
                          </div>
                          <span>Notifications</span>
                          {unreadCount > 0 && (
                            <span className="ml-auto text-xs text-red-400">{unreadCount} new</span>
                          )}
                        </button>
                        {/* Notifications Dropdown */}
                        {isAlertsOpen && (
                          <div className="absolute right-0 left-0 mt-1 mx-2 bg-tank-gray border border-tank-light rounded-lg shadow-xl overflow-hidden z-50">
                            <div className="px-3 py-2 border-b border-tank-light flex items-center justify-between bg-tank-dark">
                              <h3 className="font-semibold text-sm">Notifications</h3>
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
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                              {notifications.length > 0 ? (
                                notifications.slice(0, 5).map((notification) => (
                                  <div
                                    key={notification.id}
                                    className={`px-3 py-2 hover:bg-tank-light transition-colors border-b border-tank-light/50 cursor-pointer ${
                                      !notification.read ? 'bg-tank-accent/5' : ''
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      markAsRead(notification.id)
                                      if (notification.link) {
                                        window.location.href = notification.link
                                      }
                                      setIsAlertsOpen(false)
                                      setIsProfileOpen(false)
                                    }}
                                  >
                                    <div className="flex gap-2">
                                      {getNotificationIcon(notification.type)}
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-medium ${!notification.read ? 'text-white' : 'text-gray-300'}`}>
                                          {notification.title}
                                        </p>
                                        <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">
                                          {notification.message}
                                        </p>
                                      </div>
                                      {!notification.read && (
                                        <div className="w-1.5 h-1.5 bg-tank-accent rounded-full mt-1" />
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-4 text-center text-gray-500">
                                  <p className="text-xs">No notifications</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <Link
                        href="/profile/edit"
                        className="flex items-center gap-3 px-4 py-0.5 hover:bg-tank-light transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </Link>
                      <Link
                        href={`/profile/${userData?.username || session.user?.username}`}
                        className="flex items-center gap-3 px-4 py-0.5 hover:bg-tank-light transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        My Contents
                      </Link>
                      <Link
                        href="/pricing"
                        className="flex items-center gap-3 px-4 py-0.5 hover:bg-tank-light transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        Membership
                      </Link>
                      <button
                        onClick={() => {
                          setIsProfileOpen(false)
                          setIsEmailSupportOpen(true)
                        }}
                        className="flex items-center gap-3 px-4 py-0.5 hover:bg-tank-light transition-colors w-full text-left"
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Support
                      </button>
                      <Link
                        href="/policy"
                        className="flex items-center gap-3 px-4 py-0.5 hover:bg-tank-light transition-colors"
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
                          className="flex items-center gap-3 px-4 py-0.5 hover:bg-tank-light transition-colors text-red-400"
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
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="flex items-center gap-3 px-4 py-0.5 hover:bg-tank-light transition-colors w-full text-left text-gray-400"
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
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsSignInOpen(true)}
                  className="px-2 py-1 text-gray-300 hover:text-white transition-colors text-sm"
                >
                  Sign In
                </button>
                <Link
                  href="/register"
                  className="px-2 py-1 bg-tank-accent text-tank-black font-semibold rounded text-sm hover:bg-tank-accent/90 transition-all"
                >
                  Sign Up
                </Link>
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
              <MobileNavLink href="/" onClick={() => setIsMenuOpen(false)}>Home</MobileNavLink>
              <MobileNavLink href="/?type=VIDEO" onClick={() => setIsMenuOpen(false)}>Videos</MobileNavLink>
              <MobileNavLink href="/?type=IMAGE" onClick={() => setIsMenuOpen(false)}>Images</MobileNavLink>
              <MobileNavLink href="/?type=MUSIC" onClick={() => setIsMenuOpen(false)}>Music</MobileNavLink>
              <MobileNavLink href={isSubscriber ? "/upload" : "/pricing"} onClick={() => setIsMenuOpen(false)}>Upload</MobileNavLink>
            </div>
          </div>
        )}
      </div>

      {/* Email Support Modal */}
      <EmailSupportModal
        isOpen={isEmailSupportOpen}
        onClose={() => setIsEmailSupportOpen(false)}
        userName={userData?.name || session?.user?.name || displayName || 'there'}
      />

      {/* Talk Chat */}
      <TalkChat
        isOpen={isTalkChatOpen}
        onClose={() => setIsTalkChatOpen(false)}
      />

      {/* Sign In Modal */}
      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
      />
    </nav>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const handleClick = (e: React.MouseEvent) => {
    // For Home link, force a full page reload to clear filters
    if (href === '/') {
      e.preventDefault()
      window.location.href = '/'
    }
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="px-4 py-2 text-gray-400 hover:text-white hover:bg-tank-light rounded-lg transition-all"
    >
      {children}
    </Link>
  )
}

function MobileNavLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    onClick()
    window.location.href = href
  }
  
  return (
    <Link
      href={href}
      onClick={handleClick}
      className="px-4 py-0.5 text-gray-300 hover:text-white hover:bg-tank-light rounded-lg transition-all text-right"
    >
      {children}
    </Link>
  )
}

