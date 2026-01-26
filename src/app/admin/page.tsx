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

type TabType = 'dashboard' | 'analytics' | 'users' | 'media' | 'chat' | 'membershipSales' | 'contentSales' | 'adSales' | 'membership' | 'promotions' | 'games' | 'navbar' | 'badges'

// Membership Plan type
interface MembershipPlan {
  id: string
  planId: string
  name: string
  monthlyPrice: number
  yearlyPrice: number
  freeUploads: number
  pricePerUpload: number | null
  viewContents: boolean
  buyContents: boolean
  sellContents: boolean
  sortOrder: number
}

// Promotion type
interface Promotion {
  id: string
  name: string
  description: string | null
  type: string
  discountType: string | null
  discountValue: number | null
  bonusUploads: number | null
  freeTrialDays: number | null
  applicablePlans: string
  promoCode: string | null
  startDate: string
  endDate: string | null
  usageLimit: number | null
  usageCount: number
  isActive: boolean
  showPopup: boolean
  popupTitle: string | null
  popupMessage: string | null
  popupButtonText: string | null
  popupImageUrl: string | null
  createdAt: string
}

// Game Setting type
interface GameSetting {
  id: string
  gameId: string
  name: string
  isEnabled: boolean
  sortOrder: number
}

interface NavbarMenuItem {
  id: string
  itemKey: string
  label: string
  isEnabled: boolean
  sortOrder: number
}

interface MediaBadgeItem {
  id: string
  itemKey: string
  label: string
  isEnabled: boolean
  sortOrder: number
}

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
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([])
  const [membershipLoading, setMembershipLoading] = useState(false)
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [promotionsLoading, setPromotionsLoading] = useState(false)
  const [gameSettings, setGameSettings] = useState<GameSetting[]>([])
  const [gamesLoading, setGamesLoading] = useState(false)
  const [navbarMenuItems, setNavbarMenuItems] = useState<NavbarMenuItem[]>([])
  const [navbarLoading, setNavbarLoading] = useState(false)
  const [mediaBadgeItems, setMediaBadgeItems] = useState<MediaBadgeItem[]>([])
  const [mediaBadgeLoading, setMediaBadgeLoading] = useState(false)
  const [showPromotionModal, setShowPromotionModal] = useState(false)
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null)
  const [promotionForm, setPromotionForm] = useState({
    name: '',
    description: '',
    type: 'subscription_discount',
    discountType: 'percentage',
    discountValue: '',
    bonusUploads: '',
    freeTrialDays: '',
    applicablePlans: 'all',
    promoCode: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    usageLimit: '',
    isActive: true,
    showPopup: false,
    popupTitle: '',
    popupMessage: '',
    popupButtonText: 'Get Offer',
    popupImageUrl: '',
  })
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
  
  // Credit history modal state
  const [creditHistoryModal, setCreditHistoryModal] = useState<{
    show: boolean
    userId: string
    username: string
    totalCredits: number
    history: Array<{
      id: string
      amount: number
      type: string
      reason: string | null
      adminName: string | null
      createdAt: string
    }>
    loading: boolean
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
    email: string
  } | null>(null)
  const [creditsAmount, setCreditsAmount] = useState('')
  const [creditsComment, setCreditsComment] = useState('')
  const [creditsSendEmail, setCreditsSendEmail] = useState(true)
  
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
    email: string
  } | null>(null)
  const [chatWarningReason, setChatWarningReason] = useState('')
  const [chatWarningSendEmail, setChatWarningSendEmail] = useState(true)
  
  // Chat delete modal state
  const [chatDeleteModal, setChatDeleteModal] = useState<{
    show: boolean
    messageId: string
    messageContent: string
    userId: string
    username: string
    email: string
  } | null>(null)
  const [chatDeleteReason, setChatDeleteReason] = useState('')
  const [chatDeleteSendEmail, setChatDeleteSendEmail] = useState(true)
  
  // Clear warnings confirmation modal state
  const [clearWarningsConfirm, setClearWarningsConfirm] = useState<{
    show: boolean
    userId: string
    username: string
  } | null>(null)
  
  // Delete chat message confirmation modal state
  const [deleteChatConfirm, setDeleteChatConfirm] = useState<{
    show: boolean
    messageId: string
    username: string
    reason: string
    sendEmail: boolean
    email: string
  } | null>(null)
  
  // Send Warning to User modal state
  const [warningUserModal, setWarningUserModal] = useState<{
    show: boolean
    userId: string
    username: string
    legalName: string | null
    email: string
  } | null>(null)
  const [warningUserReason, setWarningUserReason] = useState('')
  const [warningUserSendEmail, setWarningUserSendEmail] = useState(true)
  
  // Suspend User modal state
  const [suspendUserModal, setSuspendUserModal] = useState<{
    show: boolean
    userId: string
    username: string
    legalName: string | null
    email: string
  } | null>(null)
  const [suspendUserReason, setSuspendUserReason] = useState('')
  const [suspendUserDuration, setSuspendUserDuration] = useState('')
  const [suspendUserSendEmail, setSuspendUserSendEmail] = useState(true)
  
  // Delete User modal state
  const [deleteUserModal, setDeleteUserModal] = useState<{
    show: boolean
    userId: string
    username: string
    legalName: string | null
    email: string
  } | null>(null)
  const [deleteUserReason, setDeleteUserReason] = useState('')
  const [deleteUserSendEmail, setDeleteUserSendEmail] = useState(true)
  
  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  
  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

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
      } else if (activeTab === 'membership') {
        const res = await fetch('/api/admin?action=membershipPlans')
        const data = await res.json()
        setMembershipPlans(data.plans || [])
      } else if (activeTab === 'promotions') {
        const res = await fetch('/api/admin?action=promotions')
        const data = await res.json()
        setPromotions(data.promotions || [])
      } else if (activeTab === 'games') {
        const res = await fetch('/api/admin?action=gameSettings')
        const data = await res.json()
        setGameSettings(data.games || [])
      } else if (activeTab === 'navbar') {
        const res = await fetch('/api/admin?action=navbarSettings')
        const data = await res.json()
        setNavbarMenuItems(data.items || [])
      } else if (activeTab === 'badges') {
        const res = await fetch('/api/admin?action=badgeSettings')
        const data = await res.json()
        setMediaBadgeItems(data.items || [])
      }
    } catch (error) {
      console.error('Error fetching admin data:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // Function to update membership plan field
  const updateMembershipPlan = async (planId: string, field: string, value: any) => {
    setMembershipLoading(true)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateMembershipPlan',
          data: { planId, field, value }
        })
      })
      const data = await res.json()
      if (res.ok) {
        // Refresh plans
        const refreshRes = await fetch('/api/admin?action=membershipPlans')
        const refreshData = await refreshRes.json()
        setMembershipPlans(refreshData.plans || [])
      } else {
        alert(data.error || 'Failed to update plan')
      }
    } catch (error) {
      console.error('Error updating plan:', error)
      alert('Failed to update plan')
    } finally {
      setMembershipLoading(false)
    }
  }
  
  // Function to reset membership plans to default
  const resetMembershipPlans = async () => {
    if (!confirm('Reset all membership plans to default values? This cannot be undone.')) return
    
    setMembershipLoading(true)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resetMembershipPlans' })
      })
      const data = await res.json()
      if (res.ok) {
        setMembershipPlans(data.plans || [])
      } else {
        alert(data.error || 'Failed to reset plans')
      }
    } catch (error) {
      console.error('Error resetting plans:', error)
      alert('Failed to reset plans')
    } finally {
      setMembershipLoading(false)
    }
  }
  
  // Promotion management functions
  const openCreatePromotion = () => {
    setEditingPromotion(null)
    setPromotionForm({
      name: '',
      description: '',
      type: 'subscription_discount',
      discountType: 'percentage',
      discountValue: '',
      bonusUploads: '',
      freeTrialDays: '',
      applicablePlans: 'all',
      promoCode: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      usageLimit: '',
      isActive: true,
      showPopup: false,
      popupTitle: '',
      popupMessage: '',
      popupButtonText: 'Get Offer',
      popupImageUrl: '',
    })
    setShowPromotionModal(true)
  }
  
  const openEditPromotion = (promo: Promotion) => {
    setEditingPromotion(promo)
    setPromotionForm({
      name: promo.name,
      description: promo.description || '',
      type: promo.type,
      discountType: promo.discountType || 'percentage',
      discountValue: promo.discountValue?.toString() || '',
      bonusUploads: promo.bonusUploads?.toString() || '',
      freeTrialDays: promo.freeTrialDays?.toString() || '',
      applicablePlans: promo.applicablePlans,
      promoCode: promo.promoCode || '',
      startDate: promo.startDate.split('T')[0],
      endDate: promo.endDate?.split('T')[0] || '',
      usageLimit: promo.usageLimit?.toString() || '',
      isActive: promo.isActive,
      showPopup: promo.showPopup,
      popupTitle: promo.popupTitle || '',
      popupMessage: promo.popupMessage || '',
      popupButtonText: promo.popupButtonText || 'Get Offer',
      popupImageUrl: promo.popupImageUrl || '',
    })
    setShowPromotionModal(true)
  }
  
  const savePromotion = async () => {
    setPromotionsLoading(true)
    try {
      const action = editingPromotion ? 'updatePromotion' : 'createPromotion'
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          data: editingPromotion 
            ? { promotionId: editingPromotion.id, ...promotionForm }
            : promotionForm
        })
      })
      const data = await res.json()
      if (res.ok) {
        setShowPromotionModal(false)
        // Refresh promotions
        const refreshRes = await fetch('/api/admin?action=promotions')
        const refreshData = await refreshRes.json()
        setPromotions(refreshData.promotions || [])
      } else {
        alert(data.error || 'Failed to save promotion')
      }
    } catch (error) {
      console.error('Error saving promotion:', error)
      alert('Failed to save promotion')
    } finally {
      setPromotionsLoading(false)
    }
  }
  
  const togglePromotion = async (promoId: string, isActive: boolean) => {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'togglePromotion',
          targetId: promoId,
          data: { isActive }
        })
      })
      if (res.ok) {
        setPromotions(prev => prev.map(p => p.id === promoId ? { ...p, isActive } : p))
      }
    } catch (error) {
      console.error('Error toggling promotion:', error)
    }
  }
  
  const deletePromotion = async (promoId: string) => {
    if (!confirm('Are you sure you want to delete this promotion?')) return
    
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deletePromotion',
          targetId: promoId
        })
      })
      if (res.ok) {
        setPromotions(prev => prev.filter(p => p.id !== promoId))
      }
    } catch (error) {
      console.error('Error deleting promotion:', error)
    }
  }
  
  // Toggle game on/off
  const toggleGame = async (gameId: string, isEnabled: boolean) => {
    setGamesLoading(true)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggleGame',
          data: { gameId, isEnabled }
        })
      })
      if (res.ok) {
        setGameSettings(prev => prev.map(g => g.gameId === gameId ? { ...g, isEnabled } : g))
      }
    } catch (error) {
      console.error('Error toggling game:', error)
    } finally {
      setGamesLoading(false)
    }
  }

  const toggleNavbarItem = async (itemKey: string, isEnabled: boolean) => {
    setNavbarLoading(true)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggleNavbarItem',
          data: { itemKey, isEnabled }
        })
      })
      if (res.ok) {
        setNavbarMenuItems(prev => prev.map(item => item.itemKey === itemKey ? { ...item, isEnabled } : item))
      }
    } catch (error) {
      console.error('Error toggling navbar item:', error)
    } finally {
      setNavbarLoading(false)
    }
  }

  const toggleBadgeItem = async (itemKey: string, isEnabled: boolean) => {
    setMediaBadgeLoading(true)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggleBadge',
          data: { itemKey, isEnabled }
        })
      })
      if (res.ok) {
        setMediaBadgeItems(prev => prev.map(item => item.itemKey === itemKey ? { ...item, isEnabled } : item))
      }
    } catch (error) {
      console.error('Error toggling badge:', error)
    } finally {
      setMediaBadgeLoading(false)
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
      
      // Use the corrected warningCount from the API (auto-synced with actual records)
      const actualWarningCount = data.warningCount ?? data.warnings?.length ?? 0
      
      setWarningModal(prev => prev ? {
        ...prev,
        history: data.warnings || [],
        warningCount: actualWarningCount,
        loading: false
      } : null)
      
      // If warning count was corrected (synced), refresh the users list
      if (actualWarningCount !== warningCount) {
        fetchData()
      }
    } catch (error) {
      console.error('Failed to fetch warning history:', error)
      setWarningModal(prev => prev ? { ...prev, loading: false } : null)
    }
  }

  const fetchCreditHistory = async (userId: string, username: string, totalCredits: number) => {
    setCreditHistoryModal({
      show: true,
      userId,
      username,
      totalCredits,
      history: [],
      loading: true
    })
    
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getCreditHistory', targetId: userId }),
      })
      const data = await res.json()
      
      setCreditHistoryModal(prev => prev ? {
        ...prev,
        history: data.creditHistory || [],
        loading: false
      } : null)
    } catch (error) {
      console.error('Failed to fetch credit history:', error)
      setCreditHistoryModal(prev => prev ? { ...prev, loading: false } : null)
    }
  }

  const handleAction = async (action: string, targetId: string, data?: any) => {
    // Note: deleteChatMessage has its own modal confirmation, so it's not in this list
    const confirmActions = ['deleteUser', 'suspendUser']
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
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[99999] px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-70">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
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
          { id: 'membership', label: 'Membership Management' },
          { id: 'promotions', label: 'Promotions' },
          { id: 'games', label: 'Game Control' },
          { id: 'navbar', label: 'Navbar Control' },
          { id: 'badges', label: 'Media Badge Control' },
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
                        <td className="p-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              fetchCreditHistory(user.id, user.username, user.bonusCredits + user.paidUploadCredits)
                            }}
                            className="text-tank-accent hover:text-tank-accent/80 hover:underline transition-colors font-medium"
                          >
                            {user.bonusCredits + user.paidUploadCredits}
                          </button>
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
                                username: msg.user.username,
                                email: (msg.user as any).email || ''
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
                                username: msg.user.username,
                                email: (msg.user as any).email || ''
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

          {/* Membership Management */}
          {activeTab === 'membership' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Membership Plans Configuration</h2>
                <button
                  onClick={resetMembershipPlans}
                  disabled={membershipLoading}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {membershipLoading ? 'Loading...' : '🔄 Reset to Default'}
                </button>
              </div>
              
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-tank-light bg-[#2a7b9b]">
                      <th className="text-left p-4 text-white font-bold whitespace-nowrap min-w-[180px]">Feature</th>
                      {membershipPlans.map((plan) => (
                        <th key={plan.planId} className="text-center p-4 text-white font-bold whitespace-nowrap min-w-[120px]">
                          {plan.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-[#b8c5cd]">
                    {/* Monthly Price */}
                    <tr className="border-b border-gray-400">
                      <td className="p-4 text-gray-800 font-medium">Monthly Price</td>
                      {membershipPlans.map((plan) => (
                        <td key={plan.planId} className="text-center p-3">
                          {plan.planId === 'viewer' ? (
                            <span className="text-gray-700 font-medium">Free</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-gray-700">$</span>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={plan.monthlyPrice}
                                onChange={(e) => updateMembershipPlan(plan.planId, 'monthlyPrice', e.target.value)}
                                disabled={membershipLoading}
                                className="w-16 px-2 py-1 text-center bg-white border border-gray-400 rounded text-gray-800 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                    
                    {/* Yearly Price */}
                    <tr className="border-b border-gray-400">
                      <td className="p-4 text-gray-800 font-medium">Yearly Price</td>
                      {membershipPlans.map((plan) => (
                        <td key={plan.planId} className="text-center p-3">
                          {plan.planId === 'viewer' ? (
                            <span className="text-gray-700 font-medium">Free</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-gray-700">$</span>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={plan.yearlyPrice}
                                onChange={(e) => updateMembershipPlan(plan.planId, 'yearlyPrice', e.target.value)}
                                disabled={membershipLoading}
                                className="w-16 px-2 py-1 text-center bg-white border border-gray-400 rounded text-gray-800 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                    
                    {/* Free Uploads */}
                    <tr className="border-b border-gray-400">
                      <td className="p-4 text-gray-800 font-medium">Free Uploads</td>
                      {membershipPlans.map((plan) => (
                        <td key={plan.planId} className="text-center p-3">
                          {plan.planId === 'premium' ? (
                            <span className="text-gray-700 font-medium">Unlimited</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              value={plan.freeUploads}
                              onChange={(e) => updateMembershipPlan(plan.planId, 'freeUploads', e.target.value)}
                              disabled={membershipLoading}
                              className="w-16 px-2 py-1 text-center bg-white border border-gray-400 rounded text-gray-800 focus:outline-none focus:border-blue-500"
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                    
                    {/* Price per Upload */}
                    <tr className="border-b border-gray-400">
                      <td className="p-4 text-gray-800 font-medium">Price per Upload</td>
                      {membershipPlans.map((plan) => (
                        <td key={plan.planId} className="text-center p-3">
                          {plan.planId === 'viewer' ? (
                            <span className="text-gray-500">—</span>
                          ) : plan.planId === 'premium' ? (
                            <span className="text-gray-700 font-medium">Free</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-gray-700">$</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={plan.pricePerUpload ?? ''}
                                onChange={(e) => updateMembershipPlan(plan.planId, 'pricePerUpload', e.target.value || null)}
                                disabled={membershipLoading}
                                className="w-16 px-2 py-1 text-center bg-white border border-gray-400 rounded text-gray-800 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                    
                    {/* View Contents */}
                    <tr className="border-b border-gray-400">
                      <td className="p-4 text-gray-800 font-medium">View Contents</td>
                      {membershipPlans.map((plan) => (
                        <td key={plan.planId} className="text-center p-3">
                          <select
                            value={plan.viewContents ? 'yes' : 'no'}
                            onChange={(e) => updateMembershipPlan(plan.planId, 'viewContents', e.target.value === 'yes')}
                            disabled={membershipLoading}
                            className="px-3 py-1 bg-white border border-gray-400 rounded text-gray-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                          >
                            <option value="yes">✓ Yes</option>
                            <option value="no">✗ No</option>
                          </select>
                        </td>
                      ))}
                    </tr>
                    
                    {/* Buy Contents */}
                    <tr className="border-b border-gray-400">
                      <td className="p-4 text-gray-800 font-medium">Buy Contents</td>
                      {membershipPlans.map((plan) => (
                        <td key={plan.planId} className="text-center p-3">
                          <select
                            value={plan.buyContents ? 'yes' : 'no'}
                            onChange={(e) => updateMembershipPlan(plan.planId, 'buyContents', e.target.value === 'yes')}
                            disabled={membershipLoading}
                            className="px-3 py-1 bg-white border border-gray-400 rounded text-gray-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                          >
                            <option value="yes">✓ Yes</option>
                            <option value="no">✗ No</option>
                          </select>
                        </td>
                      ))}
                    </tr>
                    
                    {/* Sell Contents */}
                    <tr>
                      <td className="p-4 text-gray-800 font-medium">Sell Contents</td>
                      {membershipPlans.map((plan) => (
                        <td key={plan.planId} className="text-center p-3">
                          <select
                            value={plan.sellContents ? 'yes' : 'no'}
                            onChange={(e) => updateMembershipPlan(plan.planId, 'sellContents', e.target.value === 'yes')}
                            disabled={membershipLoading}
                            className="px-3 py-1 bg-white border border-gray-400 rounded text-gray-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                          >
                            <option value="yes">✓ Yes</option>
                            <option value="no">✗ No</option>
                          </select>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <p className="text-gray-400 text-sm mt-4">
                💡 Changes are saved automatically. Updates will be reflected immediately in the Pricing page.
              </p>
            </div>
          )}

          {/* Promotions Management */}
          {activeTab === 'promotions' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Promotional Campaigns</h2>
                <button
                  onClick={openCreatePromotion}
                  className="px-4 py-2 bg-tank-accent hover:bg-tank-accent/80 text-black rounded-lg font-medium transition-colors"
                >
                  + Create Promotion
                </button>
              </div>
              
              {promotions.length === 0 ? (
                <div className="card p-8 text-center text-gray-400">
                  <p className="text-4xl mb-4">🎉</p>
                  <p className="text-lg">No promotions yet</p>
                  <p className="text-sm">Create your first promotional campaign to attract new users!</p>
                </div>
              ) : (
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-tank-light bg-[#2a7b9b]">
                        <th className="text-left p-3 text-white font-medium">Name</th>
                        <th className="text-left p-3 text-white font-medium">Type</th>
                        <th className="text-left p-3 text-white font-medium">Value</th>
                        <th className="text-left p-3 text-white font-medium">Code</th>
                        <th className="text-left p-3 text-white font-medium">Validity</th>
                        <th className="text-left p-3 text-white font-medium">Usage</th>
                        <th className="text-left p-3 text-white font-medium">Popup</th>
                        <th className="text-center p-3 text-white font-medium">Status</th>
                        <th className="text-center p-3 text-white font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promotions.map((promo) => (
                        <tr key={promo.id} className="border-b border-tank-light/30 hover:bg-tank-light/10">
                          <td className="p-3">
                            <p className="font-medium text-white">{promo.name}</p>
                            {promo.description && (
                              <p className="text-xs text-gray-400 truncate max-w-[200px]">{promo.description}</p>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              promo.type === 'subscription_discount' ? 'bg-blue-500/20 text-blue-400' :
                              promo.type === 'bonus_uploads' ? 'bg-green-500/20 text-green-400' :
                              'bg-purple-500/20 text-purple-400'
                            }`}>
                              {promo.type === 'subscription_discount' ? '💰 Discount' :
                               promo.type === 'bonus_uploads' ? '📤 Bonus Uploads' :
                               '🎁 Free Trial'}
                            </span>
                          </td>
                          <td className="p-3 text-gray-300">
                            {promo.type === 'subscription_discount' && promo.discountValue && (
                              <span>
                                {promo.discountType === 'percentage' ? `${promo.discountValue}% off` :
                                 promo.discountType === 'fixed_amount' ? `$${promo.discountValue} off` :
                                 `${promo.discountValue} free month(s)`}
                              </span>
                            )}
                            {promo.type === 'bonus_uploads' && promo.bonusUploads && (
                              <span>{promo.bonusUploads} uploads</span>
                            )}
                            {promo.type === 'free_trial' && promo.freeTrialDays && (
                              <span>{promo.freeTrialDays} days</span>
                            )}
                          </td>
                          <td className="p-3">
                            {promo.promoCode ? (
                              <code className="px-2 py-1 bg-tank-dark rounded text-tank-accent text-xs">{promo.promoCode}</code>
                            ) : (
                              <span className="text-gray-500 text-xs">Auto-apply</span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-gray-400">
                            <div>{new Date(promo.startDate).toLocaleDateString()}</div>
                            <div className="text-gray-500">
                              {promo.endDate ? `to ${new Date(promo.endDate).toLocaleDateString()}` : 'No end date'}
                            </div>
                          </td>
                          <td className="p-3 text-gray-300">
                            {promo.usageCount}{promo.usageLimit ? ` / ${promo.usageLimit}` : ' / ∞'}
                          </td>
                          <td className="p-3">
                            {promo.showPopup ? (
                              <span className="text-green-400">✓ Yes</span>
                            ) : (
                              <span className="text-gray-500">No</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => togglePromotion(promo.id, !promo.isActive)}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                promo.isActive 
                                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                                  : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                              }`}
                            >
                              {promo.isActive ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => openEditPromotion(promo)}
                                className="text-blue-400 hover:text-blue-300"
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => deletePromotion(promo.id)}
                                className="text-red-400 hover:text-red-300"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              <p className="text-gray-400 text-sm mt-4">
                💡 Promotions with &quot;Popup&quot; enabled will show a marketing popup on the Home page.
              </p>
            </div>
          )}

          {/* Game Control */}
          {activeTab === 'games' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">🎮 Game Control</h2>
                <p className="text-gray-400 text-sm">Toggle games ON/OFF to show or hide them from the Play page</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {gameSettings.map((game) => (
                  <div
                    key={game.gameId}
                    className={`rounded-xl p-4 border-2 transition-all ${
                      game.isEnabled 
                        ? 'bg-tank-gray border-green-500/50' 
                        : 'bg-tank-dark border-gray-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">
                          {game.gameId === 'tetris' ? '🧱' :
                           game.gameId === 'minesweeper' ? '💣' :
                           game.gameId === 'donkeykong' ? '🦍' :
                           game.gameId === 'pacman' ? '👻' :
                           game.gameId === 'breakout' ? '🏓' :
                           game.gameId === 'pong' ? '🎾' : '🎮'}
                        </span>
                        <div>
                          <h3 className="font-bold text-white">{game.name}</h3>
                          <p className="text-xs text-gray-400">/game/{game.gameId}</p>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => toggleGame(game.gameId, !game.isEnabled)}
                        disabled={gamesLoading}
                        className={`relative w-14 h-7 rounded-full transition-colors ${
                          game.isEnabled ? 'bg-green-500' : 'bg-gray-600'
                        } ${gamesLoading ? 'opacity-50' : ''}`}
                      >
                        <div
                          className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform shadow ${
                            game.isEnabled ? 'translate-x-8' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        game.isEnabled 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {game.isEnabled ? '✓ Visible' : '✗ Hidden'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 p-4 bg-tank-dark rounded-lg border border-tank-light">
                <h4 className="font-medium text-white mb-2">📋 Quick Stats</h4>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-green-400 font-bold">{gameSettings.filter(g => g.isEnabled).length}</span>
                    <span className="text-gray-400 ml-1">Active Games</span>
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">{gameSettings.filter(g => !g.isEnabled).length}</span>
                    <span className="text-gray-400 ml-1">Hidden Games</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navbar Control */}
          {activeTab === 'navbar' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">🧭 Navbar Control</h2>
                <p className="text-gray-400 text-sm">Toggle navbar items ON/OFF to show or hide them in the menu</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {navbarMenuItems.map((item) => (
                  <div
                    key={item.itemKey}
                    className={`rounded-xl p-4 border-2 transition-all ${
                      item.isEnabled
                        ? 'bg-tank-gray border-green-500/50'
                        : 'bg-tank-dark border-gray-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🧩</span>
                        <div>
                          <h3 className="font-bold text-white">{item.label}</h3>
                          <p className="text-xs text-gray-400">{item.itemKey}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleNavbarItem(item.itemKey, !item.isEnabled)}
                        disabled={navbarLoading}
                        className={`relative w-14 h-7 rounded-full transition-colors ${
                          item.isEnabled ? 'bg-green-500' : 'bg-gray-600'
                        } ${navbarLoading ? 'opacity-50' : ''}`}
                      >
                        <div
                          className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform shadow ${
                            item.isEnabled ? 'translate-x-8' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.isEnabled
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {item.isEnabled ? '✓ Visible' : '✗ Hidden'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-tank-dark rounded-lg border border-tank-light">
                <h4 className="font-medium text-white mb-2">📋 Quick Stats</h4>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-green-400 font-bold">{navbarMenuItems.filter(i => i.isEnabled).length}</span>
                    <span className="text-gray-400 ml-1">Visible Items</span>
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">{navbarMenuItems.filter(i => !i.isEnabled).length}</span>
                    <span className="text-gray-400 ml-1">Hidden Items</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Media Badge Control */}
          {activeTab === 'badges' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">🏷️ Media Badge Control</h2>
                <p className="text-gray-400 text-sm">Toggle badge items ON/OFF to show or hide them on media tiles</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mediaBadgeItems.map((item) => (
                  <div
                    key={item.itemKey}
                    className={`rounded-xl p-4 border-2 transition-all ${
                      item.isEnabled
                        ? 'bg-tank-gray border-green-500/50'
                        : 'bg-tank-dark border-gray-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🏷️</span>
                        <div>
                          <h3 className="font-bold text-white">{item.label}</h3>
                          <p className="text-xs text-gray-400">{item.itemKey}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleBadgeItem(item.itemKey, !item.isEnabled)}
                        disabled={mediaBadgeLoading}
                        className={`relative w-14 h-7 rounded-full transition-colors ${
                          item.isEnabled ? 'bg-green-500' : 'bg-gray-600'
                        } ${mediaBadgeLoading ? 'opacity-50' : ''}`}
                      >
                        <div
                          className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform shadow ${
                            item.isEnabled ? 'translate-x-8' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.isEnabled
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {item.isEnabled ? '✓ Visible' : '✗ Hidden'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-tank-dark rounded-lg border border-tank-light">
                <h4 className="font-medium text-white mb-2">📋 Quick Stats</h4>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-green-400 font-bold">{mediaBadgeItems.filter(i => i.isEnabled).length}</span>
                    <span className="text-gray-400 ml-1">Visible Badges</span>
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">{mediaBadgeItems.filter(i => !i.isEnabled).length}</span>
                    <span className="text-gray-400 ml-1">Hidden Badges</span>
                  </div>
                </div>
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
              <span className="text-3xl">{warningModal.warningCount === 0 && !warningModal.loading ? '✅' : '⚠️'}</span>
              <div>
                <h2 className={`text-xl font-bold ${warningModal.warningCount === 0 && !warningModal.loading ? 'text-green-400' : 'text-yellow-400'}`}>
                  {warningModal.warningCount === 0 && !warningModal.loading ? 'Status: Active' : 'Warning Details'}
                </h2>
                <p className="text-gray-400">@{warningModal.username}</p>
              </div>
              <div className="ml-auto text-right">
                <p className={`text-2xl font-bold ${warningModal.warningCount === 0 && !warningModal.loading ? 'text-green-400' : 'text-yellow-400'}`}>
                  {warningModal.warningCount}
                </p>
                <p className="text-xs text-gray-400">Total Warnings</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {warningModal.loading ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              ) : warningModal.history.length === 0 ? (
                <div className="text-center py-8">
                  {warningModal.warningCount === 0 ? (
                    <div className="space-y-2">
                      <span className="text-4xl">✅</span>
                      <p className="text-green-400 font-medium">All issues have been resolved!</p>
                      <p className="text-gray-400 text-sm">User status has been updated to Active.</p>
                    </div>
                  ) : (
                    <p className="text-gray-400">No warning history found</p>
                  )}
                </div>
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
            
            <div className="flex gap-3 mt-4">
              {warningModal.warningCount > 0 && (
                <button
                  onClick={() => {
                    setClearWarningsConfirm({
                      show: true,
                      userId: warningModal.userId,
                      username: warningModal.username
                    })
                  }}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 px-4 transition-colors font-medium"
                >
                  ✅ Clear Warnings
                </button>
              )}
              <button
                onClick={() => setWarningModal(null)}
                className={`${warningModal.warningCount > 0 ? 'flex-1' : 'w-full'} bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-2 px-4 transition-colors`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Warnings Confirmation Modal */}
      {clearWarningsConfirm?.show && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" onClick={() => setClearWarningsConfirm(null)}>
          <div className="bg-tank-gray rounded-xl p-6 max-w-md w-full shadow-2xl border border-tank-light" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Clear All Warnings?</h2>
                <p className="text-gray-400">@{clearWarningsConfirm.username}</p>
              </div>
            </div>
            
            <p className="text-gray-300 mb-6">
              Are you sure you want to clear all warnings for this user? Their status will change to <span className="text-green-400 font-medium">Active</span>.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setClearWarningsConfirm(null)}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-3 px-4 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/admin', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'clearWarnings',
                        targetId: clearWarningsConfirm.userId,
                      }),
                    })
                    if (res.ok) {
                      setClearWarningsConfirm(null)
                      setWarningModal(null)
                      // Refresh users list to show Active status
                      fetchData()
                    }
                  } catch (err) {
                    console.error('Failed to clear warnings:', err)
                  }
                }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-3 px-4 transition-colors font-medium"
              >
                Yes, Clear Warnings
              </button>
            </div>
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

      {/* Credit History Modal */}
      {creditHistoryModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setCreditHistoryModal(null)}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col border border-gray-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-xl">💳</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-tank-accent">Credit History</h2>
                <p className="text-gray-400 text-sm">@{creditHistoryModal.username}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-3xl font-bold text-tank-accent">{creditHistoryModal.totalCredits}</p>
                <p className="text-xs text-gray-400">Total Credits</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {creditHistoryModal.loading ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              ) : (
                <div className="border border-gray-600 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-600 bg-[#252540]">
                        <th className="text-center py-3 px-4 text-gray-400 font-medium w-24">Credits</th>
                        <th className="text-center py-3 px-4 text-gray-400 font-medium w-32">Date</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditHistoryModal.history.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-gray-500">
                            No credit history found
                          </td>
                        </tr>
                      ) : (
                        [...creditHistoryModal.history].reverse().map((entry) => (
                          <tr key={entry.id} className="border-b border-gray-700/50 hover:bg-[#252540]/50">
                            <td className="text-center py-3 px-4">
                              <span className="text-white font-medium">{entry.amount}</span>
                            </td>
                            <td className="text-center py-3 px-4 text-white">
                              {new Date(entry.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                            </td>
                            <td className="text-left py-3 px-4 text-white font-medium">
                              {entry.reason || (entry.type === 'bonus' ? 'Admin bonus credits' : entry.type === 'used' ? 'Credit used' : entry.type)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
            <button
              onClick={() => setCreditHistoryModal(null)}
              className="w-full mt-4 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-3 px-4 transition-colors"
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
                    currentCredits: (selectedUser.bonusCredits || 0) + (selectedUser.paidUploadCredits || 0),
                    email: selectedUser.email
                  })
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 px-4 font-medium transition-colors"
              >
                🎁 Give Credits
              </button>

              {/* Send Warning - Yellow/Gold */}
              <button
                onClick={() => {
                  setWarningUserModal({
                    show: true,
                    userId: selectedUser.id,
                    username: selectedUser.username,
                    legalName: selectedUser.legalName,
                    email: selectedUser.email
                  })
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
                    setSuspendUserModal({
                      show: true,
                      userId: selectedUser.id,
                      username: selectedUser.username,
                      legalName: selectedUser.legalName,
                      email: selectedUser.email
                    })
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 px-4 font-medium transition-colors"
                >
                  🚫 Suspend User
                </button>
              )}

              {/* Delete User - Dark Maroon */}
              <button
                onClick={() => {
                  setDeleteUserModal({
                    show: true,
                    userId: selectedUser.id,
                    username: selectedUser.username,
                    legalName: selectedUser.legalName,
                    email: selectedUser.email
                  })
                }}
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
                  if (res.ok) {
                    setToast({ message: 'Content deleted successfully', type: 'success' })
                    fetchData()
                  } else {
                    setToast({ message: 'Failed to delete content', type: 'error' })
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setCreditsModal(null); setCreditsAmount(''); setCreditsComment(''); setCreditsSendEmail(true); }}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 max-w-md w-full border border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6 text-tank-accent">🎁 Give Credits</h2>
            
            <div className="space-y-4 mb-6">
              {/* User Info */}
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">User:</p>
                <p className="font-bold text-white text-lg">{creditsModal.legalName || creditsModal.username}</p>
                <p className="text-gray-400">@{creditsModal.username}</p>
              </div>
              
              {/* Comments */}
              <div className="bg-tank-dark rounded-lg p-4">
                <label className="block text-white font-medium mb-2">Comments</label>
                <textarea
                  value={creditsComment}
                  onChange={(e) => setCreditsComment(e.target.value)}
                  placeholder="Enter reason for giving credits..."
                  className="w-full bg-transparent border-none outline-none text-gray-300 resize-none h-16"
                />
              </div>
              
              {/* Number of Credits */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">Number of credits to give:</label>
                <input
                  type="number"
                  min="1"
                  value={creditsAmount}
                  onChange={(e) => setCreditsAmount(e.target.value)}
                  placeholder="Enter number of credits..."
                  className="w-full bg-tank-dark border-2 border-tank-accent rounded-lg px-4 py-3 text-white focus:outline-none"
                  autoFocus
                />
              </div>
              
              {/* Send Email Checkbox */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={creditsSendEmail}
                  onChange={(e) => setCreditsSendEmail(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-tank-dark text-tank-accent focus:ring-tank-accent"
                />
                <span className="text-gray-300">Send notification email to creator</span>
              </label>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setCreditsModal(null); setCreditsAmount(''); setCreditsComment(''); setCreditsSendEmail(true); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-white rounded-lg py-3 px-4 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const credits = parseInt(creditsAmount)
                  if (credits > 0) {
                    await handleAction('giveCredits', creditsModal.userId, { 
                      credits, 
                      reason: creditsComment || 'Admin bonus credits',
                      sendEmail: creditsSendEmail,
                      email: creditsModal.email
                    })
                    setCreditsModal(null)
                    setCreditsAmount('')
                    setCreditsComment('')
                    setCreditsSendEmail(true)
                  }
                }}
                disabled={!creditsAmount || parseInt(creditsAmount) <= 0}
                className="flex-1 bg-tank-accent hover:bg-tank-accent/80 text-black rounded-lg py-3 px-4 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Give Credits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Warning Modal */}
      {chatWarningModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setChatWarningModal(null); setChatWarningReason(''); setChatWarningSendEmail(true); }}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 max-w-lg w-full border border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6 text-yellow-400">⚠️ Warning Chat User</h2>
            
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
                  className="w-full bg-tank-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500 resize-none h-24"
                />
              </div>
              
              {/* Send Email Checkbox */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chatWarningSendEmail}
                  onChange={(e) => setChatWarningSendEmail(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-tank-dark text-yellow-500 focus:ring-yellow-500"
                />
                <span className="text-gray-300">Send notification email to creator</span>
              </label>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setChatWarningModal(null); setChatWarningReason(''); setChatWarningSendEmail(true); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-3 px-4 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleAction('warnChatUser', chatWarningModal.userId, {
                    messageId: chatWarningModal.messageId,
                    messageContent: chatWarningModal.messageContent,
                    reason: chatWarningReason,
                    sendEmail: chatWarningSendEmail,
                    email: chatWarningModal.email
                  })
                  setChatWarningModal(null)
                  setChatWarningReason('')
                  setChatWarningSendEmail(true)
                }}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg py-3 px-4 font-medium"
              >
                Send Warning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Delete Modal */}
      {chatDeleteModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setChatDeleteModal(null); setChatDeleteReason(''); setChatDeleteSendEmail(true); }}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 max-w-lg w-full border border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6 text-red-400">🗑️ Delete Chat Message</h2>
            
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
                  className="w-full bg-tank-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 resize-none h-24"
                />
              </div>
              
              {/* Send Email Checkbox */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chatDeleteSendEmail}
                  onChange={(e) => setChatDeleteSendEmail(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-tank-dark text-red-500 focus:ring-red-500"
                />
                <span className="text-gray-300">Send notification email to creator</span>
              </label>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setChatDeleteModal(null); setChatDeleteReason(''); setChatDeleteSendEmail(true); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-3 px-4 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDeleteChatConfirm({
                    show: true,
                    messageId: chatDeleteModal.messageId,
                    username: chatDeleteModal.username,
                    reason: chatDeleteReason,
                    sendEmail: chatDeleteSendEmail,
                    email: chatDeleteModal.email
                  })
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-3 px-4 font-medium"
              >
                Delete Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Chat Message Confirmation Modal */}
      {deleteChatConfirm?.show && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" onClick={() => setDeleteChatConfirm(null)}>
          <div className="bg-tank-gray rounded-xl p-6 max-w-md w-full shadow-2xl border border-tank-light" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="text-2xl">🗑️</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Delete Message?</h2>
                <p className="text-gray-400">@{deleteChatConfirm.username}</p>
              </div>
            </div>
            
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete this message? This action cannot be undone.
              {chatDeleteModal && chatDeleteModal.messageContent && (
                <span className="block mt-2 text-gray-500 text-sm italic">"{chatDeleteModal.messageContent.substring(0, 50)}{chatDeleteModal.messageContent.length > 50 ? '...' : ''}"</span>
              )}
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteChatConfirm(null)}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-3 px-4 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (chatDeleteModal) {
                    await handleAction('deleteChatMessage', deleteChatConfirm.messageId, {
                      reason: deleteChatConfirm.reason,
                      userId: chatDeleteModal.userId,
                      username: deleteChatConfirm.username,
                      sendEmail: deleteChatConfirm.sendEmail,
                      email: deleteChatConfirm.email
                    })
                  }
                  setDeleteChatConfirm(null)
                  setChatDeleteModal(null)
                  setChatDeleteReason('')
                  setChatDeleteSendEmail(true)
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-3 px-4 transition-colors font-medium"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Warning to User Modal */}
      {warningUserModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setWarningUserModal(null); setWarningUserReason(''); setWarningUserSendEmail(true); }}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 max-w-md w-full border border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6 text-amber-400">⚠️ Send Warning</h2>
            
            <div className="space-y-4 mb-6">
              {/* User Info */}
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">User:</p>
                <p className="font-bold text-white text-lg">{warningUserModal.legalName || warningUserModal.username}</p>
                <p className="text-gray-400">@{warningUserModal.username}</p>
              </div>
              
              {/* Reason */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">Reason for Warning:</label>
                <textarea
                  value={warningUserReason}
                  onChange={(e) => setWarningUserReason(e.target.value)}
                  placeholder="Enter the reason for warning this user..."
                  className="w-full bg-tank-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500 resize-none h-24"
                  autoFocus
                />
              </div>
              
              {/* Send Email Checkbox */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={warningUserSendEmail}
                  onChange={(e) => setWarningUserSendEmail(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-tank-dark text-amber-500 focus:ring-amber-500"
                />
                <span className="text-gray-300">Send notification email to user</span>
              </label>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setWarningUserModal(null); setWarningUserReason(''); setWarningUserSendEmail(true); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-white rounded-lg py-3 px-4 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (warningUserReason.trim()) {
                    const res = await fetch('/api/admin', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        action: 'warnUser', 
                        targetId: warningUserModal.userId, 
                        data: { 
                          reason: warningUserReason,
                          sendEmail: warningUserSendEmail
                        }
                      }),
                    })
                    if (res.ok) {
                      setToast({ message: 'Warning sent successfully', type: 'success' })
                      fetchData()
                    } else {
                      setToast({ message: 'Failed to send warning', type: 'error' })
                    }
                    setWarningUserModal(null)
                    setWarningUserReason('')
                    setWarningUserSendEmail(true)
                    setShowUserModal(false)
                  }
                }}
                disabled={!warningUserReason.trim()}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg py-3 px-4 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Warning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend User Modal */}
      {suspendUserModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setSuspendUserModal(null); setSuspendUserReason(''); setSuspendUserDuration(''); setSuspendUserSendEmail(true); }}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 max-w-md w-full border border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6 text-red-400">🚫 Suspend User</h2>
            
            <div className="space-y-4 mb-6">
              {/* User Info */}
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">User:</p>
                <p className="font-bold text-white text-lg">{suspendUserModal.legalName || suspendUserModal.username}</p>
                <p className="text-gray-400">@{suspendUserModal.username}</p>
              </div>
              
              {/* Reason */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">Reason for Suspension:</label>
                <textarea
                  value={suspendUserReason}
                  onChange={(e) => setSuspendUserReason(e.target.value)}
                  placeholder="Enter the reason for suspending this user..."
                  className="w-full bg-tank-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 resize-none h-24"
                  autoFocus
                />
              </div>
              
              {/* Duration */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">Duration (days):</label>
                <input
                  type="number"
                  min="1"
                  value={suspendUserDuration}
                  onChange={(e) => setSuspendUserDuration(e.target.value)}
                  placeholder="Leave empty for permanent suspension"
                  className="w-full bg-tank-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty for permanent suspension</p>
              </div>
              
              {/* Send Email Checkbox */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={suspendUserSendEmail}
                  onChange={(e) => setSuspendUserSendEmail(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-tank-dark text-red-500 focus:ring-red-500"
                />
                <span className="text-gray-300">Send notification email to user</span>
              </label>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setSuspendUserModal(null); setSuspendUserReason(''); setSuspendUserDuration(''); setSuspendUserSendEmail(true); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-white rounded-lg py-3 px-4 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (suspendUserReason.trim()) {
                    await handleAction('suspendUser', suspendUserModal.userId, { 
                      reason: suspendUserReason,
                      duration: suspendUserDuration ? parseInt(suspendUserDuration) : null,
                      sendEmail: suspendUserSendEmail
                    })
                    setSuspendUserModal(null)
                    setSuspendUserReason('')
                    setSuspendUserDuration('')
                    setSuspendUserSendEmail(true)
                    setShowUserModal(false)
                    fetchData()
                  }
                }}
                disabled={!suspendUserReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-3 px-4 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suspend User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deleteUserModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setDeleteUserModal(null); setDeleteUserReason(''); setDeleteUserSendEmail(true); }}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 max-w-md w-full border border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6 text-red-500">🗑️ Delete User</h2>
            
            <div className="space-y-4 mb-6">
              {/* User Info */}
              <div className="bg-tank-dark rounded-lg p-4">
                <p className="text-gray-400 text-sm">User:</p>
                <p className="font-bold text-white text-lg">{deleteUserModal.legalName || deleteUserModal.username}</p>
                <p className="text-gray-400">@{deleteUserModal.username}</p>
              </div>
              
              {/* Warning */}
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
                <p className="text-red-400 text-sm font-medium">⚠️ Warning: This action is permanent!</p>
                <p className="text-red-300 text-xs mt-1">All user data, media, and content will be permanently deleted and cannot be recovered.</p>
              </div>
              
              {/* Reason */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">Reason for Deletion:</label>
                <textarea
                  value={deleteUserReason}
                  onChange={(e) => setDeleteUserReason(e.target.value)}
                  placeholder="Enter the reason for deleting this user..."
                  className="w-full bg-tank-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 resize-none h-24"
                  autoFocus
                />
              </div>
              
              {/* Send Email Checkbox */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteUserSendEmail}
                  onChange={(e) => setDeleteUserSendEmail(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-tank-dark text-red-500 focus:ring-red-500"
                />
                <span className="text-gray-300">Send notification email to user</span>
              </label>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteUserModal(null); setDeleteUserReason(''); setDeleteUserSendEmail(true); }}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-white rounded-lg py-3 px-4 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleAction('deleteUser', deleteUserModal.userId, { 
                    reason: deleteUserReason,
                    sendEmail: deleteUserSendEmail,
                    email: deleteUserModal.email,
                    username: deleteUserModal.username
                  })
                  setDeleteUserModal(null)
                  setDeleteUserReason('')
                  setDeleteUserSendEmail(true)
                  setShowUserModal(false)
                  fetchData()
                }}
                className="flex-1 bg-red-700 hover:bg-red-800 text-white rounded-lg py-3 px-4 font-medium"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promotion Create/Edit Modal */}
      {showPromotionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowPromotionModal(false)}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 max-w-2xl w-full border border-gray-700 my-8" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6 text-tank-accent">
              {editingPromotion ? '✏️ Edit Promotion' : '🎉 Create Promotion'}
            </h2>
            
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Name *</label>
                  <input
                    type="text"
                    value={promotionForm.name}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., New Year Sale"
                    className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Promo Code (optional)</label>
                  <input
                    type="text"
                    value={promotionForm.promoCode}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, promoCode: e.target.value.toUpperCase() }))}
                    placeholder="e.g., NEWYEAR2026"
                    className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent uppercase"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Description</label>
                <textarea
                  value={promotionForm.description}
                  onChange={(e) => setPromotionForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of the promotion..."
                  className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent resize-none h-16"
                />
              </div>
              
              {/* Promotion Type */}
              <div className="bg-tank-dark rounded-lg p-4">
                <label className="block text-gray-400 text-sm mb-2">Promotion Type *</label>
                <div className="flex gap-2">
                  {[
                    { value: 'subscription_discount', label: '💰 Subscription Discount', desc: 'Discount on subscription fees' },
                    { value: 'bonus_uploads', label: '📤 Bonus Uploads', desc: 'Free upload credits' },
                    { value: 'free_trial', label: '🎁 Free Trial', desc: 'Extended free trial' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPromotionForm(prev => ({ ...prev, type: opt.value }))}
                      className={`flex-1 p-3 rounded-lg border transition-colors ${
                        promotionForm.type === opt.value 
                          ? 'border-tank-accent bg-tank-accent/10' 
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Type-specific fields */}
              {promotionForm.type === 'subscription_discount' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Discount Type</label>
                    <select
                      value={promotionForm.discountType}
                      onChange={(e) => setPromotionForm(prev => ({ ...prev, discountType: e.target.value }))}
                      className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                    >
                      <option value="percentage">Percentage Off</option>
                      <option value="fixed_amount">Fixed Amount Off</option>
                      <option value="free_months">Free Month(s)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">
                      {promotionForm.discountType === 'percentage' ? 'Discount %' : 
                       promotionForm.discountType === 'fixed_amount' ? 'Amount ($)' : 
                       'Free Months'}
                    </label>
                    <input
                      type="number"
                      value={promotionForm.discountValue}
                      onChange={(e) => setPromotionForm(prev => ({ ...prev, discountValue: e.target.value }))}
                      placeholder={promotionForm.discountType === 'percentage' ? 'e.g., 50' : 'e.g., 2'}
                      className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                    />
                  </div>
                </div>
              )}
              
              {promotionForm.type === 'bonus_uploads' && (
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Bonus Uploads</label>
                  <input
                    type="number"
                    value={promotionForm.bonusUploads}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, bonusUploads: e.target.value }))}
                    placeholder="e.g., 20"
                    className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                  />
                </div>
              )}
              
              {promotionForm.type === 'free_trial' && (
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Free Trial Days</label>
                  <input
                    type="number"
                    value={promotionForm.freeTrialDays}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, freeTrialDays: e.target.value }))}
                    placeholder="e.g., 30"
                    className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                  />
                </div>
              )}
              
              {/* Applicable Plans */}
              <div>
                <label className="block text-gray-400 text-sm mb-1">Applicable Plans</label>
                <select
                  value={promotionForm.applicablePlans}
                  onChange={(e) => setPromotionForm(prev => ({ ...prev, applicablePlans: e.target.value }))}
                  className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                >
                  <option value="all">All Plans</option>
                  <option value="basic">Basic Only</option>
                  <option value="advanced">Advanced Only</option>
                  <option value="premium">Premium Only</option>
                  <option value="basic,advanced">Basic & Advanced</option>
                  <option value="advanced,premium">Advanced & Premium</option>
                </select>
              </div>
              
              {/* Validity Period */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Start Date</label>
                  <input
                    type="date"
                    value={promotionForm.startDate}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">End Date (optional)</label>
                  <input
                    type="date"
                    value={promotionForm.endDate}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                  />
                </div>
              </div>
              
              {/* Usage Limit */}
              <div>
                <label className="block text-gray-400 text-sm mb-1">Usage Limit (optional)</label>
                <input
                  type="number"
                  value={promotionForm.usageLimit}
                  onChange={(e) => setPromotionForm(prev => ({ ...prev, usageLimit: e.target.value }))}
                  placeholder="Leave empty for unlimited"
                  className="w-full bg-tank-dark border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                />
              </div>
              
              {/* Popup Settings */}
              <div className="bg-tank-dark rounded-lg p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={promotionForm.showPopup}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, showPopup: e.target.checked }))}
                    className="w-5 h-5 rounded border-gray-600 bg-tank-dark text-tank-accent focus:ring-tank-accent"
                  />
                  <span className="text-white font-medium">Show Marketing Popup on Home Page</span>
                </label>
                
                {promotionForm.showPopup && (
                  <div className="space-y-3 pt-3 border-t border-gray-700">
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">Popup Title</label>
                      <input
                        type="text"
                        value={promotionForm.popupTitle}
                        onChange={(e) => setPromotionForm(prev => ({ ...prev, popupTitle: e.target.value }))}
                        placeholder="e.g., 🎉 Special Offer!"
                        className="w-full bg-tank-gray border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">Popup Message</label>
                      <textarea
                        value={promotionForm.popupMessage}
                        onChange={(e) => setPromotionForm(prev => ({ ...prev, popupMessage: e.target.value }))}
                        placeholder="Describe your offer..."
                        className="w-full bg-tank-gray border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent resize-none h-20"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-400 text-sm mb-1">Button Text</label>
                        <input
                          type="text"
                          value={promotionForm.popupButtonText}
                          onChange={(e) => setPromotionForm(prev => ({ ...prev, popupButtonText: e.target.value }))}
                          placeholder="Get Offer"
                          className="w-full bg-tank-gray border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 text-sm mb-1">Image URL (optional)</label>
                        <input
                          type="text"
                          value={promotionForm.popupImageUrl}
                          onChange={(e) => setPromotionForm(prev => ({ ...prev, popupImageUrl: e.target.value }))}
                          placeholder="https://..."
                          className="w-full bg-tank-gray border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-tank-accent"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Active Status */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={promotionForm.isActive}
                  onChange={(e) => setPromotionForm(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-600 bg-tank-dark text-tank-accent focus:ring-tank-accent"
                />
                <span className="text-white">Active (promotion is live)</span>
              </label>
            </div>
            
            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-700">
              <button
                onClick={() => setShowPromotionModal(false)}
                className="flex-1 bg-tank-dark hover:bg-tank-light text-gray-300 rounded-lg py-3 px-4 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={savePromotion}
                disabled={promotionsLoading || !promotionForm.name}
                className="flex-1 bg-tank-accent hover:bg-tank-accent/80 text-black rounded-lg py-3 px-4 font-medium transition-colors disabled:opacity-50"
              >
                {promotionsLoading ? 'Saving...' : editingPromotion ? 'Update Promotion' : 'Create Promotion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
