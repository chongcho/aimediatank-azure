'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { setAppBadge, clearAppBadge, calculateTotalNotifications, isInstalledPWA, requestNotificationPermission } from '@/lib/appBadge'
import { playNotificationSound, unlockNotificationAudio } from '@/lib/notificationSound'
import { clearHomeFeed } from '@/lib/homePrefetchCache'
import { isAppAdminRole } from '@/lib/adminFreshStep2'
import { goToAdminPanel } from '@/lib/adminPanelNav'
import { useFeedCardTextMode } from '@/contexts/FeedCardTextModeContext'
import { useFeedGridAutoTranslation } from '@/hooks/useFeedGridAutoTranslation'
import { useGuestFeedLocalTargets } from '@/hooks/useGuestFeedLocalTargets'
import { useUiLocale } from '@/hooks/useUiLocale'
import { useLanguageModeList } from '@/hooks/useLanguageModeText'
import { useAppUpdate } from '@/hooks/useAppUpdate'
import {
  CLOSE_TALK_CHAT_EVENT,
  OPEN_TALK_CHAT_EVENT,
  OPEN_VOICE_TALK_EVENT,
  clearTalkChatDesktopPanelState,
  isTalkChatDesktopViewport,
  NAVBAR_DROPDOWN_PANEL_Z_INDEX,
  NAVBAR_DROPDOWN_Z_INDEX,
  readInitialTalkChatDesktopPanelState,
  readTalkChatPanelMinimized,
  requestCloseTalkChat,
  requestRestoreTalkChatPanel,
  stripTalkChatDeepLinkParams,
  writeTalkChatDesktopPanelState,
  requestTalkChatDesktopLayoutSync,
} from '@/lib/talkChatOpen'
import { VoiceCallProvider } from '@/contexts/VoiceCallContext'
import { feedCardT, type FeedCardKey } from '@/messages/feedCard'
import { navBarT, type NavBarKey } from '@/messages/navBar'
import { localLanguageModeLabel } from '@/lib/localeFromLocation'
import { calendarLocaleFromUiTag } from '@/lib/localeUi'
import { LanguageModeTrans } from '@/components/LanguageModeTrans'
import {
  OPEN_SOCIAL_SUBSCRIPTION_PROMPT_EVENT,
  type SocialSubscriptionAnchor,
  type SocialSubscriptionPromptDetail,
} from '@/lib/socialSubscriptionGate'
import SocialSubscriptionPrompt from '@/components/SocialSubscriptionPrompt'

/** Version panel — follows language mode (Local) like Membership/Pricing. */
const VERSION_PANEL_STRINGS = [
  'Version/Update',
  'Current version',
  'You are on the latest version',
  'A new version is available',
  'Update',
  'Updating…',
  'Close',
] as const

const V = {
  title: 0,
  currentVersion: 1,
  upToDate: 2,
  updateAvailable: 3,
  updateNow: 4,
  updating: 5,
  close: 6,
} as const

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
  return (
    <Suspense fallback={null}>
      <NavbarContent />
    </Suspense>
  )
}

function NavbarContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, status, update: updateSession } = useSession()
  // Age-based social hiding removed — Talk/Chat stay visible; subscription checked on click.
  const [restoreLoading, setRestoreLoading] = useState(false)
  const { localeTag, tNavbar: t } = useUiLocale()
  const trVersion = useLanguageModeList(VERSION_PANEL_STRINGS)
  const { version, updateAvailable, isUpdating, applyUpdate, checkForUpdate } = useAppUpdate()
  const feedAutoTranslation = useFeedGridAutoTranslation()
  const { mode: feedCardTextMode, setMode: setFeedCardTextMode } = useFeedCardTextMode()
  const { bundledTag, mtTag, ensureGuestGeoLoaded } = useGuestFeedLocalTargets(feedAutoTranslation)

  /** Filter links + profile menu follow language mode; Talk/Chat/Post stay English via `t` (tNavbar). */
  const chromeLocaleTag = useMemo(() => {
    if (!feedAutoTranslation) return localeTag
    return feedCardTextMode === 'original' ? 'en' : bundledTag
  }, [bundledTag, feedAutoTranslation, feedCardTextMode, localeTag])

  const tNavLink = useCallback(
    (key: NavBarKey) => navBarT(chromeLocaleTag, key),
    [chromeLocaleTag]
  )
  const tFeed = useCallback(
    (key: FeedCardKey, vars?: Record<string, string>) => feedCardT(chromeLocaleTag, key, vars),
    [chromeLocaleTag]
  )
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isAlertsOpen, setIsAlertsOpen] = useState(false)
  const [isVersionOpen, setIsVersionOpen] = useState(false)
  // IMPORTANT: keep panels closed by default to avoid background polling slowing the app.
  const [chatPanelOpen, setChatPanelOpen] = useState(
    () => readInitialTalkChatDesktopPanelState().chatPanelOpen,
  )
  const [voicePanelOpen, setVoicePanelOpen] = useState(
    () => readInitialTalkChatDesktopPanelState().voicePanelOpen,
  )
  /** Which TalkChat panel is on top when both are open. */
  const [frontPanel, setFrontPanel] = useState<'chat' | 'voice' | null>(
    () => readInitialTalkChatDesktopPanelState().frontPanel,
  )
  const [isPageVisible, setIsPageVisible] = useState(true)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [chatInviteCount, setChatInviteCount] = useState(0)
  const [notificationsOn, setNotificationsOn] = useState(true)
  const prevNotificationTotalRef = useRef<number | null>(null)
  const [expandedNotificationId, setExpandedNotificationId] = useState<string | null>(null)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [userData, setUserData] = useState<{
    name: string | null
    username: string | null
    avatar: string | null
    membershipType: string | null
    role: string | null
    accountDeactivatedAt: string | null
  } | null>(null)
  const [navbarMenuItems, setNavbarMenuItems] = useState<NavbarMenuItem[]>([])
  const [feedTextMenuOpen, setFeedTextMenuOpen] = useState(false)
  const [feedTextMenuPos, setFeedTextMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [profileMenuPos, setProfileMenuPos] = useState<{ top: number; left: number } | null>(null)
  const feedTextTriggerRef = useRef<HTMLButtonElement>(null)
  const feedTextMenuRef = useRef<HTMLDivElement>(null)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  /** Once per `?openChat=1` in the URL — avoids re-opening TalkChat when navbar settings refetch changes `isNavbarItemEnabled`. */
  const openChatDeepLinkConsumedRef = useRef(false)
  const prevPathnameRef = useRef(pathname)
  const navRef = useRef<HTMLElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const alertsPanelRef = useRef<HTMLDivElement>(null)
  const versionPanelRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const talkButtonRef = useRef<HTMLButtonElement>(null)
  const chatButtonRef = useRef<HTMLButtonElement>(null)
  const postButtonRef = useRef<HTMLAnchorElement>(null)
  const [socialSubPromptOpen, setSocialSubPromptOpen] = useState(false)
  const [socialSubPromptAnchor, setSocialSubPromptAnchor] = useState<SocialSubscriptionAnchor | null>(
    null,
  )

  const showSocialSubscriptionPrompt = useCallback((anchor?: SocialSubscriptionAnchor | null) => {
    setSocialSubPromptAnchor(anchor ?? 'chat')
    setSocialSubPromptOpen(true)
  }, [])

  const closeSocialSubscriptionPrompt = useCallback(() => {
    setSocialSubPromptOpen(false)
  }, [])

  const socialSubPromptAnchorEl =
    socialSubPromptAnchor === 'talk'
      ? talkButtonRef.current
      : socialSubPromptAnchor === 'post'
        ? postButtonRef.current
        : chatButtonRef.current

  const closeTalkChatPanels = useCallback(() => {
    setChatPanelOpen(false)
    setVoicePanelOpen(false)
    setFrontPanel(null)
    clearTalkChatDesktopPanelState()
  }, [])

  const talkChatPanelsOpen = chatPanelOpen || voicePanelOpen

  const isMobileViewport = useCallback(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
    [],
  )

  const dismissTalkChatForHomeNav = useCallback(() => {
    closeTalkChatPanels()
    stripTalkChatDeepLinkParams()
    openChatDeepLinkConsumedRef.current = true
  }, [closeTalkChatPanels])

  const goHome = useCallback(
    (options?: { refreshIfAlreadyHome?: boolean }) => {
      sessionStorage.removeItem('homeScrollState')
      clearHomeFeed()
      // Mobile: dismiss overlays immediately. Desktop keeps Talk/Chat open (match All/Videos nav).
      if (isMobileViewport()) {
        dismissTalkChatForHomeNav()
      } else {
        stripTalkChatDeepLinkParams()
        openChatDeepLinkConsumedRef.current = true
      }

      // Soft nav often leaves intercepted @modal shells (black screen) on mobile WebViews.
      // If a shell is still mounted — even when pathname is already "/" — hard-reload home.
      const hasInterceptedShell =
        typeof document !== 'undefined' &&
        Boolean(document.querySelector('.intercepted-page-shell'))

      if (hasInterceptedShell) {
        window.location.assign('/')
        return
      }

      if (pathname === '/') {
        document.body.scrollTop = 0
        if (options?.refreshIfAlreadyHome) {
          window.dispatchEvent(new Event('homeRefreshRequested'))
        }
        return
      }

      // After Post (/upload or /pricing) or media detail, soft router.push('/') can stall
      // or keep the @modal overlay on mobile WebViews.
      if (
        isMobileViewport() &&
        (pathname === '/upload' ||
          pathname === '/pricing' ||
          pathname.startsWith('/upload/') ||
          pathname.startsWith('/media/'))
      ) {
        window.location.assign('/')
        return
      }

      if (isMobileViewport()) {
        router.push('/')
        return
      }

      window.location.href = '/'
    },
    [pathname, dismissTalkChatForHomeNav, router, isMobileViewport],
  )

  // Mobile: close Talk/Chat on route change. Desktop keeps panels open (media/about modals, feed filters).
  useEffect(() => {
    if (prevPathnameRef.current === pathname) return
    prevPathnameRef.current = pathname
    if (isTalkChatDesktopViewport()) return
    closeTalkChatPanels()
  }, [pathname, closeTalkChatPanels])

  // NavLink / MobileNavLink and other callers can dismiss overlays without Navbar state access.
  useEffect(() => {
    const onClose = () => dismissTalkChatForHomeNav()
    window.addEventListener(CLOSE_TALK_CHAT_EVENT, onClose)
    return () => window.removeEventListener(CLOSE_TALK_CHAT_EVENT, onClose)
  }, [dismissTalkChatForHomeNav])

  // Desktop: persist panel state so language-mode / feed chrome changes do not lose open windows.
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return
    writeTalkChatDesktopPanelState({
      chatPanelOpen,
      voicePanelOpen,
      frontPanel,
    })
    requestTalkChatDesktopLayoutSync()
  }, [chatPanelOpen, voicePanelOpen, frontPanel])

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

  // If an interactive navbar item is disabled via Navbar Control, force-close it.
  useEffect(() => {
    if (!isNavbarItemEnabled('chat')) {
      setChatPanelOpen(false)
    }
    if (!isNavbarItemEnabled('phone')) {
      setVoicePanelOpen(false)
    }
    if (!isNavbarItemEnabled('notification')) {
      setIsAlertsOpen(false)
      setExpandedNotificationId(null)
      setIsSelectMode(false)
      setSelectedIds(new Set())
    }
  }, [isNavbarItemEnabled])

  // Keep front panel valid when only one TalkChat panel remains open.
  useEffect(() => {
    if (!chatPanelOpen && !voicePanelOpen) {
      setFrontPanel(null)
    } else if (!chatPanelOpen && voicePanelOpen) {
      setFrontPanel('voice')
    } else if (chatPanelOpen && !voicePanelOpen) {
      setFrontPanel('chat')
    }
  }, [chatPanelOpen, voicePanelOpen])

  const accountDeactivated = Boolean(
    userData?.accountDeactivatedAt || session?.user?.accountDeactivated,
  )

  // Check subscriber status from fetched data (more reliable than session)
  const isSubscriber =
    !accountDeactivated &&
    (userData?.role === 'SUBSCRIBER' ||
      userData?.role === 'ADMIN' ||
      userData?.membershipType === 'BASIC' ||
      userData?.membershipType === 'ADVANCED' ||
      userData?.membershipType === 'PREMIUM' ||
      session?.user?.role === 'SUBSCRIBER' ||
      session?.user?.role === 'ADMIN')

  // Homepage media card Chat button (and other callers) open TalkChat without toggling navbar button.
  useEffect(() => {
    const open = () => {
      if (!isSubscriber) {
        showSocialSubscriptionPrompt('chat')
        return
      }
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setVoicePanelOpen(false)
      }
      setChatPanelOpen(true)
      setFrontPanel('chat')
    }
    window.addEventListener(OPEN_TALK_CHAT_EVENT, open)
    return () => window.removeEventListener(OPEN_TALK_CHAT_EVENT, open)
  }, [isSubscriber, showSocialSubscriptionPrompt])

  // Deep link: /?openChat=1 (e.g. from /open-chat) opens TalkChat once while the param stays; not on every navbar refetch.
  useEffect(() => {
    if (searchParams.get('openChat') !== '1') {
      openChatDeepLinkConsumedRef.current = false
      return
    }
    if (!isNavbarItemEnabled('chat')) return
    if (openChatDeepLinkConsumedRef.current) return
    if (!isSubscriber) {
      openChatDeepLinkConsumedRef.current = true
      showSocialSubscriptionPrompt('chat')
      return
    }
    const conversationId = searchParams.get('conversationId')?.trim()
    if (conversationId) {
      try {
        localStorage.setItem('talkChatLastConversationId', conversationId)
      } catch {
        // ignore
      }
    }
    setChatPanelOpen(true)
    setFrontPanel('chat')
    openChatDeepLinkConsumedRef.current = true
  }, [searchParams, isNavbarItemEnabled, isSubscriber, showSocialSubscriptionPrompt])

  // When a voice call is active, open the Talk panel so in-call UI is not stuck behind a closed shell.
  useEffect(() => {
    const openVoice = () => {
      if (!isSubscriber) return
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setChatPanelOpen(false)
      }
      setVoicePanelOpen(true)
      setFrontPanel('voice')
    }
    window.addEventListener(OPEN_VOICE_TALK_EVENT, openVoice)
    return () => window.removeEventListener(OPEN_VOICE_TALK_EVENT, openVoice)
  }, [isSubscriber])

  // MediaCard / other callers: open the same subscription prompt (anchored under Talk/Chat on PC).
  useEffect(() => {
    const onPrompt = (e: Event) => {
      const detail = (e as CustomEvent<SocialSubscriptionPromptDetail>).detail
      showSocialSubscriptionPrompt(detail?.anchor ?? 'chat')
    }
    window.addEventListener(OPEN_SOCIAL_SUBSCRIPTION_PROMPT_EVENT, onPrompt)
    return () => window.removeEventListener(OPEN_SOCIAL_SUBSCRIPTION_PROMPT_EVENT, onPrompt)
  }, [showSocialSubscriptionPrompt])

  const handleToggleTalk = useCallback(() => {
    if (!isSubscriber) {
      showSocialSubscriptionPrompt('talk')
      return
    }
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    if (isMobile) {
      // Mobile: navbar selects the screen — no toggle-close; use panel X to dismiss.
      if (chatPanelOpen) setChatPanelOpen(false)
      setVoicePanelOpen(true)
      setFrontPanel('voice')
      return
    }
    if (voicePanelOpen) {
      if (readTalkChatPanelMinimized('voice')) {
        requestRestoreTalkChatPanel('voice')
        setFrontPanel('voice')
        return
      }
      setVoicePanelOpen(false)
      return
    }
    setVoicePanelOpen(true)
    setFrontPanel('voice')
  }, [isSubscriber, voicePanelOpen, chatPanelOpen, showSocialSubscriptionPrompt])

  const handleToggleChat = useCallback(() => {
    if (!isSubscriber) {
      showSocialSubscriptionPrompt('chat')
      return
    }
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    if (isMobile) {
      if (voicePanelOpen) setVoicePanelOpen(false)
      setChatPanelOpen(true)
      setFrontPanel('chat')
      return
    }
    if (chatPanelOpen) {
      if (readTalkChatPanelMinimized('chat')) {
        requestRestoreTalkChatPanel('chat')
        setFrontPanel('chat')
        return
      }
      setChatPanelOpen(false)
      return
    }
    setChatPanelOpen(true)
    setFrontPanel('chat')
  }, [chatPanelOpen, voicePanelOpen, isSubscriber, showSocialSubscriptionPrompt])

  const handleRestoreAccount = useCallback(async () => {
    setRestoreLoading(true)
    try {
      const res = await fetch('/api/user/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(typeof data.error === 'string' ? data.error : 'Could not restore account.')
        return
      }
      await updateSession({ user: { accountDeactivated: false } })
      window.dispatchEvent(new Event('profileUpdated'))
      setIsProfileOpen(false)
    } catch (e) {
      console.error(e)
      alert('Could not restore account.')
    } finally {
      setRestoreLoading(false)
    }
  }, [updateSession])

  const isAdmin = isAppAdminRole(userData?.role) || isAppAdminRole(session?.user?.role)

  const handlePostClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!isSubscriber) {
        e.preventDefault()
        showSocialSubscriptionPrompt('post')
        return
      }
      const href = '/upload'
      if (!isMobileViewport()) {
        return
      }
      e.preventDefault()
      if (talkChatPanelsOpen) closeTalkChatPanels()
      router.push(href)
    },
    [
      talkChatPanelsOpen,
      closeTalkChatPanels,
      router,
      isSubscriber,
      isMobileViewport,
      showSocialSubscriptionPrompt,
    ]
  )

  const handleHomeNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, refreshIfHome = false) => {
      e.preventDefault()
      goHome({ refreshIfAlreadyHome: refreshIfHome })
    },
    [goHome]
  )

  const handleHomeNavPointerDown = useCallback(() => {
    // Dismiss immediately on touch so mobile WebViews cannot show feed under an open chat shell.
    if (!isMobileViewport()) return
    dismissTalkChatForHomeNav()
  }, [dismissTalkChatForHomeNav, isMobileViewport])
  
  // Display name - show Nickname (username) in navbar
  const displayName = userData?.username || session?.user?.username || 'User'

  const localeBadgeCode = useMemo(() => {
    // Original mode mirrors feed chrome: show EN; Local shows the MT locale (e.g. KO).
    if (feedCardTextMode === 'original') return 'EN'
    const raw = (mtTag || 'en').trim() || 'en'
    const base = raw.split(/[-_]/)[0] || raw
    const two = base.slice(0, 2).toUpperCase()
    return two.length === 2 ? two : 'EN'
  }, [feedCardTextMode, mtTag])

  /** Menu #2: native local name (e.g. 日本), not the word "Local". */
  const localModeMenuLabel = useMemo(
    () => localLanguageModeLabel(mtTag || bundledTag),
    [bundledTag, mtTag]
  )

  const updateFeedTextMenuPosition = useCallback(() => {
    const el = feedTextTriggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const menuWidth = 148
    setFeedTextMenuPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8)),
    })
  }, [])

  const closeFeedTextMenu = useCallback(() => {
    setFeedTextMenuOpen(false)
    setFeedTextMenuPos(null)
  }, [])

  const updateProfileMenuPosition = useCallback(() => {
    const el = profileButtonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const menuWidth = 224
    setProfileMenuPos({
      top: r.bottom + 8,
      left: Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8)),
    })
  }, [])

  const closeProfileMenu = useCallback(() => {
    setIsProfileOpen(false)
    setProfileMenuPos(null)
  }, [])

  const closeAlertsPanel = useCallback(() => {
    setIsAlertsOpen(false)
    setExpandedNotificationId(null)
    setIsSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const closeVersionPanel = useCallback(() => {
    setIsVersionOpen(false)
  }, [])

  useEffect(() => {
    if (accountDeactivated) {
      closeAlertsPanel()
    }
  }, [accountDeactivated, closeAlertsPanel])

  const toggleFeedTextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      closeProfileMenu()
      setIsAlertsOpen(false)
      setIsVersionOpen(false)
      if (feedTextMenuOpen) {
        closeFeedTextMenu()
      } else {
        if (status === 'unauthenticated') void ensureGuestGeoLoaded()
        updateFeedTextMenuPosition()
        setFeedTextMenuOpen(true)
      }
    },
    [feedTextMenuOpen, closeFeedTextMenu, closeProfileMenu, updateFeedTextMenuPosition, ensureGuestGeoLoaded, status]
  )

  useEffect(() => {
    if (!isProfileOpen) return
    const onScrollResize = () => {
      closeProfileMenu()
    }
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
    }
  }, [isProfileOpen, closeProfileMenu])

  useEffect(() => {
    if (!feedTextMenuOpen) return
    const onScrollResize = () => {
      closeFeedTextMenu()
    }
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
    }
  }, [feedTextMenuOpen, closeFeedTextMenu])

  useEffect(() => {
    if (!feedTextMenuOpen) return
    const onDocDown = (e: MouseEvent) => {
      const node = e.target as Node
      if (feedTextTriggerRef.current?.contains(node)) return
      if (feedTextMenuRef.current?.contains(node)) return
      closeFeedTextMenu()
    }
    document.addEventListener('mousedown', onDocDown, true)
    return () => document.removeEventListener('mousedown', onDocDown, true)
  }, [feedTextMenuOpen, closeFeedTextMenu])

  useEffect(() => {
    if (!feedTextMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFeedTextMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [feedTextMenuOpen, closeFeedTextMenu])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const node = event.target as Node
      if (
        isProfileOpen &&
        profileRef.current &&
        !profileRef.current.contains(node) &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(node)
      ) {
        closeProfileMenu()
      }
      if (
        isAlertsOpen &&
        alertsPanelRef.current &&
        !alertsPanelRef.current.contains(node)
      ) {
        closeAlertsPanel()
      }
      if (
        isVersionOpen &&
        versionPanelRef.current &&
        !versionPanelRef.current.contains(node)
      ) {
        closeVersionPanel()
      }
      // Close mobile menu when clicking outside
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(node) &&
          mobileMenuButtonRef.current && !mobileMenuButtonRef.current.contains(node)) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isProfileOpen, isAlertsOpen, isVersionOpen, closeProfileMenu, closeAlertsPanel, closeVersionPanel])

  useEffect(() => {
    if (!isAlertsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAlertsPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isAlertsOpen, closeAlertsPanel])

  useEffect(() => {
    if (!isVersionOpen) return
    void checkForUpdate()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeVersionPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isVersionOpen, closeVersionPanel, checkForUpdate])

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

  // Fetch notifications + chat unread while signed in (sound/badge when counts rise).
  useEffect(() => {
    if (!session?.user || !isPageVisible) return

    const poll = () => {
      fetchNotifications()
      fetchChatInvites()
    }
    poll()
    const interval = setInterval(poll, 8000)
    return () => clearInterval(interval)
  }, [session, isPageVisible])

  // Legacy mount fetch (keeps first paint snappy before interval starts)
  useEffect(() => {
    if (session?.user) {
      fetchNotifications()
    }
  }, [session])

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

  useEffect(() => {
    const unlock = () => unlockNotificationAudio()
    window.addEventListener('pointerdown', unlock, { once: true, passive: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Update app badge when notification counts change (only if notifications are on)
  useEffect(() => {
    const totalCount = notificationsOn ? calculateTotalNotifications(unreadCount, chatInviteCount) : 0
    if (
      prevNotificationTotalRef.current !== null &&
      totalCount > prevNotificationTotalRef.current
    ) {
      playNotificationSound()
    }
    prevNotificationTotalRef.current = totalCount
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

  // Play in-app sound when a chat push arrives while the app is open (PWA / browser).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null
      if (data?.type === 'CHAT_MESSAGE_RECEIVED') {
        playNotificationSound()
      }
    }
    navigator.serviceWorker.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage)
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
          accountDeactivatedAt: data.user?.accountDeactivatedAt
            ? String(data.user.accountDeactivatedAt)
            : null,
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

  const feedTextModeButton = feedAutoTranslation ? (
    <button
      ref={feedTextTriggerRef}
      type="button"
      onClick={toggleFeedTextMenu}
      aria-haspopup="menu"
      aria-expanded={feedTextMenuOpen}
      aria-label={tFeed('cardTranslationToggleAria')}
      className="relative flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-gray-200 hover:text-white hover:bg-tank-light transition-colors [-webkit-tap-highlight-color:transparent]"
    >
      <svg
        className="pointer-events-none absolute inset-0.5 opacity-60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 010 18M12 3a15.3 15.3 0 000 18" />
      </svg>
      <span className="pointer-events-none relative z-[1] text-[10px] font-bold leading-none tracking-tight">
        {localeBadgeCode}
      </span>
    </button>
  ) : null

  const chatIsFront = chatPanelOpen && (!voicePanelOpen || frontPanel !== 'voice')
  const voiceIsFront = voicePanelOpen && frontPanel === 'voice'

  return (
    <VoiceCallProvider>
    <nav ref={navRef} className="fixed top-0 left-0 right-0 z-[100010] bg-tank-dark/90 backdrop-blur-md border-b border-tank-light pwa-navbar">
      <div className="max-w-7xl mx-auto pl-2 pr-4 sm:pl-3 sm:pr-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Home Icon */}
          <div className="navbar-brand flex items-center flex-shrink-0">
            <Link
              href="/"
              className="relative z-[2] flex touch-manipulation items-center [-webkit-tap-highlight-color:transparent]"
              onPointerDown={handleHomeNavPointerDown}
              onClick={(e) => handleHomeNavClick(e)}
            >
            <img 
              src="/logo.png" 
              alt="AI Media Tank (AMT)" 
              className="h-10 w-auto rounded-[6px]"
            />
            </Link>
            {/* Home Icon - wireframe only */}
            {isNavbarItemEnabled('home') && (
            <Link 
              href="/" 
              className="relative z-[2] ml-[20px] touch-manipulation text-gray-400 hover:text-white transition-colors [-webkit-tap-highlight-color:transparent]"
              onPointerDown={handleHomeNavPointerDown}
              onClick={(e) => handleHomeNavClick(e, true)}
              title={t('home')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </Link>
            )}
            </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {isNavbarItemEnabled('all') && <NavLink href="/">{tNavLink('all')}</NavLink>}
            {isNavbarItemEnabled('videos') && <NavLink href="/?type=VIDEO">{tNavLink('videos')}</NavLink>}
            {isNavbarItemEnabled('images') && <NavLink href="/?type=IMAGE">{tNavLink('images')}</NavLink>}
            {isNavbarItemEnabled('about') && <NavLink href="/about">{tNavLink('about')}</NavLink>}
            {isNavbarItemEnabled('play') && <NavLink href="/game">{tNavLink('play')}</NavLink>}
          </div>

          {/* Right Side */}
          <div className="navbar-actions flex items-center gap-2 flex-shrink-0">
            {isNavbarItemEnabled('phone') && (
              <button
                ref={talkButtonRef}
                type="button"
                onClick={handleToggleTalk}
                className="inline-flex h-9 w-10 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-emerald-600 px-px text-center hover:bg-emerald-700 transition-colors [-webkit-tap-highlight-color:transparent]"
                aria-label={t('phone')}
                title={t('phone')}
              >
                <span className="text-sm font-bold text-white">{t('phone')}</span>
              </button>
            )}
            {/* Chat (Talk chat) button */}
            {isNavbarItemEnabled('chat') && (
              <div className="relative">
                <button
                  ref={chatButtonRef}
                  type="button"
                  onClick={handleToggleChat}
                  className="inline-flex h-9 w-10 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-yellow-300 px-px text-center hover:bg-yellow-400 transition-colors [-webkit-tap-highlight-color:transparent]"
                  aria-label={t('kong')}
                  title={t('kong')}
                >
                  <span className="text-sm font-bold text-gray-900">{t('kong')}</span>
                </button>
                {/* My Chat invite notification badge */}
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
              <div className="flex items-center gap-2">
                {isNavbarItemEnabled('upload') && (
                  <Link
                    ref={postButtonRef}
                    href={isSubscriber ? '/upload' : '/pricing'}
                    onClick={handlePostClick}
                    className="relative z-[2] inline-flex h-9 w-10 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-blue-600 px-px text-center hover:bg-blue-700 transition-colors [-webkit-tap-highlight-color:transparent]"
                  >
                    <span className="text-sm font-bold text-white">{t('post')}</span>
                  </Link>
                )}
                {feedTextModeButton}
                <div className="relative" ref={profileRef}>
                  <button
                    ref={profileButtonRef}
                    type="button"
                    onClick={() => {
                      closeFeedTextMenu()
                      closeAlertsPanel()
                      closeVersionPanel()
                      if (isProfileOpen) {
                        closeProfileMenu()
                      } else {
                        updateProfileMenuPosition()
                        setIsProfileOpen(true)
                      }
                    }}
                    className="relative flex items-center p-0 rounded-lg hover:ring-2 hover:ring-tank-accent transition-all"
                    title={displayName}
                  >
                    {unreadCount > 0 && isNavbarItemEnabled('notification') && !accountDeactivated && (
                      <span className="absolute -top-0.5 -right-0.5 z-[1] min-w-[1rem] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center text-sm font-bold">
                      {userData?.avatar ? (
                        <img src={userData.avatar} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        displayName[0]?.toUpperCase() || '?'
                      )}
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {feedTextModeButton}
                {isNavbarItemEnabled('signIn') && (
                  <Link
                    href="/login"
                    className="h-9 px-0.5 flex items-center justify-center text-blue-400 hover:text-blue-300 font-bold transition-colors text-sm"
                  >
                    {t('signIn')}
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
                      {t('signUp')}
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
              aria-label={isMenuOpen ? t('closeMenu') : t('openMenu')}
              title={isMenuOpen ? t('closeMenu') : t('openMenu')}
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
                <MobileNavLink href="/" onClick={() => setIsMenuOpen(false)}>{tNavLink('all')}</MobileNavLink>
              )}
              {isNavbarItemEnabled('videos') && (
                <MobileNavLink href="/?type=VIDEO" onClick={() => setIsMenuOpen(false)}>{tNavLink('videos')}</MobileNavLink>
              )}
              {isNavbarItemEnabled('images') && (
                <MobileNavLink href="/?type=IMAGE" onClick={() => setIsMenuOpen(false)}>{tNavLink('images')}</MobileNavLink>
              )}
              {isNavbarItemEnabled('about') && (
                <MobileNavLink href="/about" onClick={() => setIsMenuOpen(false)}>{tNavLink('about')}</MobileNavLink>
              )}
              {isNavbarItemEnabled('play') && (
                <MobileNavLink href="/game" onClick={() => setIsMenuOpen(false)}>{tNavLink('play')}</MobileNavLink>
              )}
            </div>
          </div>
        )}
      </div>

      {feedTextMenuOpen &&
        feedTextMenuPos &&
        createPortal(
          <div
            ref={feedTextMenuRef}
            role="menu"
            tabIndex={-1}
            className="fixed min-w-[148px] rounded-lg border border-tank-light bg-tank-gray py-1 shadow-xl outline-none"
            style={{
              top: feedTextMenuPos.top,
              left: feedTextMenuPos.left,
              zIndex: NAVBAR_DROPDOWN_Z_INDEX,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-tank-light/30 ${feedCardTextMode === 'original' ? 'bg-tank-light/20 text-white font-medium' : 'text-white'}`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setFeedCardTextMode('original')
                closeFeedTextMenu()
              }}
            >
              English
            </button>
            <button
              type="button"
              role="menuitem"
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-tank-light/30 ${feedCardTextMode === 'local' ? 'bg-tank-light/20 text-white font-medium' : 'text-white'}`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (status === 'unauthenticated') void ensureGuestGeoLoaded()
                setFeedCardTextMode('local')
                closeFeedTextMenu()
              }}
            >
              {localModeMenuLabel}
            </button>
          </div>,
          document.body
        )}

      {session &&
        isProfileOpen &&
        profileMenuPos &&
        createPortal(
          <div
            ref={profileMenuRef}
            className="fixed w-56 rounded-xl border border-tank-light bg-tank-dark py-1 shadow-xl"
            style={{
              top: profileMenuPos.top,
              left: profileMenuPos.left,
              zIndex: NAVBAR_DROPDOWN_Z_INDEX,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-1 border-b border-tank-light">
              <p className="font-semibold">{userData?.username || session.user?.username || 'User'}</p>
              {accountDeactivated ? (
                <span className="mt-1 inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-400">
                  Account Deactivated
                </span>
              ) : (
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${
                    isAdmin
                      ? 'bg-red-500/20 text-red-400'
                      : isSubscriber
                        ? 'bg-tank-accent/20 text-tank-accent'
                        : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {session.user?.role}
                </span>
              )}
            </div>
            {accountDeactivated ? (
              <>
                <div className="border-b border-tank-light/40 px-4 py-2">
                  <button
                    type="button"
                    disabled={restoreLoading}
                    onClick={() => void handleRestoreAccount()}
                    className="w-full rounded-lg bg-green-500 py-2.5 text-center text-sm font-semibold text-black shadow hover:bg-green-400 disabled:cursor-wait disabled:opacity-60"
                  >
                    {restoreLoading ? '…' : 'Restore Account'}
                  </button>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors text-red-400 text-left"
                    onClick={() => {
                      closeProfileMenu()
                      goToAdminPanel()
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {tNavLink('adminPanel')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    clearAppBadge()
                    void fetch('/api/admin/clear-reauth-cookie', {
                      method: 'POST',
                      credentials: 'include',
                    }).finally(() => {
                      signOut({ callbackUrl: '/' })
                    })
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-400 hover:bg-tank-light transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {tNavLink('signOut')}
                </button>
              </>
            ) : (
              <>
                {isNavbarItemEnabled('notification') && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2 text-sm text-white hover:bg-tank-light/30 border-b border-tank-light/40"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeFeedTextMenu()
                      setExpandedNotificationId(null)
                      setIsSelectMode(false)
                      setSelectedIds(new Set())
                      closeProfileMenu()
                      setIsVersionOpen(false)
                      setIsAlertsOpen(true)
                    }}
                  >
                    <div className="relative flex h-5 w-5 shrink-0 items-center justify-center text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </div>
                    <span className="flex-1 text-left">{tNavLink('notifications')}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-white hover:bg-tank-light/30"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeFeedTextMenu()
                    setExpandedNotificationId(null)
                    setIsSelectMode(false)
                    setSelectedIds(new Set())
                    closeProfileMenu()
                    setIsAlertsOpen(false)
                    setIsVersionOpen(true)
                  }}
                >
                  <div className="relative flex h-5 w-5 shrink-0 items-center justify-center text-gray-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {updateAvailable && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-tank-accent" aria-hidden />
                    )}
                  </div>
                  <span className="flex-1 text-left">{tNavLink('versionUpdate')}</span>
                </button>
                <Link
                  href="/profile/edit"
                  className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors"
                  onClick={() => closeProfileMenu()}
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {tNavLink('profile')}
                </Link>
                <Link
                  href={`/profile/${userData?.username || session.user?.username}`}
                  className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors"
                  onClick={() => closeProfileMenu()}
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {tNavLink('myContents')}
                </Link>
                <Link
                  href="/pricing"
                  className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors"
                  onClick={() => closeProfileMenu()}
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  {tNavLink('membership')}
                </Link>
                <Link
                  href="/support"
                  className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors"
                  onClick={() => closeProfileMenu()}
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {tNavLink('support')}
                </Link>
                <Link
                  href="/policy?from=navbar"
                  className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors"
                  onClick={() => closeProfileMenu()}
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {tNavLink('policy')}
                </Link>
                {isAdmin && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors text-red-400 text-left"
                    onClick={() => {
                      closeProfileMenu()
                      goToAdminPanel()
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {tNavLink('adminPanel')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    clearAppBadge()
                    void fetch('/api/admin/clear-reauth-cookie', {
                      method: 'POST',
                      credentials: 'include',
                    }).finally(() => {
                      signOut({ callbackUrl: '/' })
                    })
                  }}
                  className="flex items-center gap-3 px-4 py-px hover:bg-tank-light transition-colors w-full text-left text-gray-400"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {tNavLink('signOut')}
                </button>
              </>
            )}
          </div>,
          document.body
        )}

      {session &&
        isNavbarItemEnabled('notification') &&
        !accountDeactivated &&
        isAlertsOpen &&
        createPortal(
          <div
            ref={alertsPanelRef}
            className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-16 sm:py-20"
            style={{ zIndex: NAVBAR_DROPDOWN_Z_INDEX }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="navbar-notifications-title"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label={tNavLink('closePanel')}
              onClick={closeAlertsPanel}
            />
            <div
              className="relative w-full max-w-md overflow-hidden rounded-xl border border-tank-light bg-tank-gray shadow-2xl"
              style={{ zIndex: NAVBAR_DROPDOWN_PANEL_Z_INDEX }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 border-b border-tank-light bg-tank-dark px-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h2 id="navbar-notifications-title" className="truncate text-sm font-semibold text-white">
                    {tNavLink('notifications')}
                  </h2>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleNotificationsOn()
                    }}
                    className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${notificationsOn ? 'bg-tank-accent text-black' : 'bg-tank-light/30 text-gray-400'}`}
                    aria-label={notificationsOn ? tNavLink('turnNotifOff') : tNavLink('turnNotifOn')}
                  >
                    {notificationsOn ? tNavLink('on') : tNavLink('off')}
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
                            setSelectedIds(new Set(visible.map((n) => n.id)))
                          }
                        }}
                        className="text-xs text-gray-400 hover:text-white"
                      >
                        {selectedIds.size === notifications.slice(0, 5).length
                          ? tNavLink('deselectAll')
                          : tNavLink('selectAll')}
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
                          {tNavLink('delete')} ({selectedIds.size})
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
                        {tNavLink('cancel')}
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
                          {tNavLink('delete')}
                        </button>
                      )}
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            markAllAsRead()
                          }}
                          className="text-xs text-tank-accent hover:underline"
                        >
                          {tNavLink('markAllRead')}
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeAlertsPanel()
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-tank-light/40 hover:text-white"
                    aria-label={tNavLink('closePanel')}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="max-h-[min(60vh,420px)] overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-3 py-8 text-center text-xs text-gray-500">{tNavLink('noNotifications')}</p>
                ) : (
                  notifications.slice(0, 5).map((notification) => {
                    const isExpanded = expandedNotificationId === notification.id
                    const isSelected = selectedIds.has(notification.id)
                    return (
                      <div
                        key={notification.id}
                        className={`cursor-pointer border-b border-tank-light/50 px-3 py-2 transition-colors last:border-b-0 hover:bg-tank-dark ${!notification.read ? 'bg-tank-accent/5' : ''} ${isSelected ? 'bg-tank-accent/10' : ''}`}
                        onClick={() => {
                          if (isSelectMode) {
                            toggleSelectNotification(notification.id)
                          } else {
                            setExpandedNotificationId(isExpanded ? null : notification.id)
                            if (!notification.read) markAsRead(notification.id)
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {isSelectMode && (
                            <div className="flex items-center pt-0.5">
                              <div
                                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${isSelected ? 'border-tank-accent bg-tank-accent' : 'border-gray-500'}`}
                              >
                                {isSelected && (
                                  <svg className="h-3 w-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-medium ${!notification.read ? 'text-white' : 'text-gray-300'}`}>
                              <LanguageModeTrans text={notification.title} />
                            </p>
                            <p className={`mt-0.5 text-[12px] text-gray-300 ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}`}>
                              <LanguageModeTrans text={notification.message} />
                            </p>
                            {!isSelectMode && (
                              <p className="mt-1 text-[12px] text-gray-300">
                                {new Date(notification.createdAt).toLocaleString(
                                  calendarLocaleFromUiTag(chromeLocaleTag)
                                )}
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
          </div>,
          document.body
        )}

      {session &&
        !accountDeactivated &&
        isVersionOpen &&
        createPortal(
          <div
            ref={versionPanelRef}
            className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-16 sm:py-20"
            style={{ zIndex: NAVBAR_DROPDOWN_Z_INDEX }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="navbar-version-title"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label={trVersion[V.close]}
              onClick={closeVersionPanel}
            />
            <div
              className="relative w-full max-w-md overflow-hidden rounded-xl border border-tank-light bg-tank-gray shadow-2xl"
              style={{ zIndex: NAVBAR_DROPDOWN_PANEL_Z_INDEX }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 border-b border-tank-light bg-tank-dark px-3 py-2">
                <h2 id="navbar-version-title" className="truncate text-sm font-semibold text-white">
                  {trVersion[V.title]}
                </h2>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeVersionPanel()
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-tank-light/40 hover:text-white"
                  aria-label={trVersion[V.close]}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4 px-4 py-6">
                <div>
                  <p className="text-xs text-gray-400">{trVersion[V.currentVersion]}</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-white">{version}</p>
                </div>
                <p className={`text-sm ${updateAvailable ? 'text-tank-accent' : 'text-gray-400'}`}>
                  {updateAvailable ? trVersion[V.updateAvailable] : trVersion[V.upToDate]}
                </p>
                <button
                  type="button"
                  disabled={!updateAvailable || isUpdating}
                  onClick={() => applyUpdate()}
                  className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    updateAvailable
                      ? 'bg-tank-accent text-black hover:bg-tank-accent/90'
                      : 'cursor-not-allowed bg-tank-light/30 text-gray-500'
                  } disabled:cursor-wait disabled:opacity-60`}
                >
                  {isUpdating ? trVersion[V.updating] : trVersion[V.updateNow]}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Chat and Talk — one stable instance per panel; isFront only changes z-index/stacking. */}
      {chatPanelOpen && (
        <TalkChat
          key="talkchat-chat"
          isOpen
          isFront={chatIsFront}
          onClose={() => setChatPanelOpen(false)}
          panelMode="chat"
          otherPanelOpen={voicePanelOpen}
        />
      )}
      {voicePanelOpen && (
        <TalkChat
          key="talkchat-voice"
          isOpen
          isFront={voiceIsFront}
          onClose={() => setVoicePanelOpen(false)}
          panelMode="voice"
          otherPanelOpen={chatPanelOpen}
        />
      )}

      <SocialSubscriptionPrompt
        open={socialSubPromptOpen}
        anchorEl={socialSubPromptAnchorEl}
        onClose={closeSocialSubscriptionPrompt}
      />

    </nav>
    </VoiceCallProvider>
  )
}

function dismissTalkChatBeforeHomeNav() {
  if (isTalkChatDesktopViewport()) return
  requestCloseTalkChat()
  stripTalkChatDeepLinkParams()
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
    // Leaving the standalone crop tool via client-side navigation can leave video/audio
    // capture + file inputs in a bad state; force a full load so other routes and Admin links
    // keep working reliably.
    if (pathname === '/crop-tool' && href !== '/crop-tool') {
      e.preventDefault()
      if (href === '/' || href.startsWith('/?')) {
        dismissTalkChatBeforeHomeNav()
        sessionStorage.removeItem('homeScrollState')
        clearHomeFeed()
      }
      window.location.assign(href)
      return
    }

    if (href === '/' || href.startsWith('/?')) {
      e.preventDefault()
      dismissTalkChatBeforeHomeNav()

      if (isOnHomePage) {
        window.history.replaceState(window.history.state, '', href)

        sessionStorage.removeItem('homeScrollState')
        clearHomeFeed()

        document.body.scrollTop = 0
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
    } else {
      document.body.scrollTop = 0
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
  const pathname = usePathname()
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    onClick()

    if (pathname === '/crop-tool' && href !== '/crop-tool') {
      if (href === '/' || href.startsWith('/?')) {
        dismissTalkChatBeforeHomeNav()
        sessionStorage.removeItem('homeScrollState')
        clearHomeFeed()
      }
      window.location.assign(href)
      return
    }

    const isOnHomePage = window.location.pathname === '/'

    if ((href === '/' || href.startsWith('/?')) && isOnHomePage) {
      dismissTalkChatBeforeHomeNav()
      window.history.replaceState(window.history.state, '', href)

      sessionStorage.removeItem('homeScrollState')
      clearHomeFeed()

      document.body.scrollTop = 0
      const url = new URL(href, window.location.origin)
      window.dispatchEvent(new CustomEvent('homeFilterChange', {
        detail: { type: url.searchParams.get('type') }
      }))
    } else {
      if (href === '/') {
        dismissTalkChatBeforeHomeNav()
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

