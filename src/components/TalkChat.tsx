'use client'

import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { stripHashtags } from '@/lib/text'
import { compressMedia, type QualitySettings } from '@/lib/mediaCompression'
import { buildUploadFileSizeExceededMessage } from '@/lib/uploadPlanConfig'

interface ChatMessage {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    username: string
    name: string | null
    avatar: string | null
    warningCount?: number
  }
}

interface MediaItem {
  id: string
  title: string
  url: string
  thumbnailUrl: string | null
  type: string
  source?: 'uploads' | 'purchased' | 'saved'
}

interface MediaPreview {
  id: string
  title: string
  url: string
  thumbnailUrl: string | null
  type: string
  missing?: boolean
}

interface TalkChatProps {
  isOpen: boolean
  onClose: () => void
}

// Common emojis organized by category
const EMOJI_LIST = [
  // Smileys
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊',
  '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜',
  '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐',
  '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪',
  '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴',
  '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁',
  '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥',
  '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱',
  // Gestures
  '👍', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙',
  '👈', '👉', '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖',
  '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿',
  // Hearts & Symbols
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
  '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
  '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐',
  // Objects & Activities
  '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⚽', '🏀',
  '🎮', '🎲', '🎯', '🎭', '🎨', '🎬', '🎤', '🎧', '🎵', '🎶',
  '💻', '📱', '📷', '📹', '💡', '🔦', '📚', '📖', '✏️', '📝',
  // Food & Drink
  '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑',
  '🍕', '🍔', '🍟', '🌭', '🍿', '🧁', '🍩', '🍪', '🎂', '🍰',
  '☕', '🍵', '🧃', '🥤', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸',
  // Nature & Animals
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
  '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
  '🌸', '💐', '🌹', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳',
  '☀️', '🌙', '⭐', '🌈', '☁️', '⛈️', '❄️', '💧', '🔥', '✨',
]

interface UserSuggestion {
  id: string
  username: string
  name: string | null
  avatar: string | null
}

interface Conversation {
  id: string
  name: string | null
  isGroup: boolean
  members: UserSuggestion[]
}

type MediaPickerSourceTab = 'all' | 'uploads' | 'purchased' | 'saved'

function inferQuickUploadMediaType(file: File): 'IMAGE' | 'VIDEO' | 'MUSIC' | null {
  const t = (file.type || '').split(';')[0].trim().toLowerCase()
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(t)) return 'IMAGE'
  if (['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'].includes(t)) return 'VIDEO'
  if (['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/mp4', 'audio/aac'].includes(t)) return 'MUSIC'
  return null
}

function titleFromUploadFilename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() || name
  return base.replace(/\.[^.]+$/, '').trim() || 'Untitled'
}

function TalkChatContent({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const [userMedia, setUserMedia] = useState<MediaItem[]>([])
  const [loadingMedia, setLoadingMedia] = useState(false)
  const [mediaPickerSourceTab, setMediaPickerSourceTab] = useState<MediaPickerSourceTab>('all')
  const [mediaPickerQuickUploading, setMediaPickerQuickUploading] = useState(false)
  const [mediaPickerQuickUploadError, setMediaPickerQuickUploadError] = useState('')
  const [maxQuickUploadBytes, setMaxQuickUploadBytes] = useState(10 * 1024 * 1024)
  const [quickCompressQuality, setQuickCompressQuality] = useState<QualitySettings>({})
  const pickerCropSettingsLoadedRef = useRef(false)
  const [mediaPreviews, setMediaPreviews] = useState<Record<string, MediaPreview>>({})
  const [missingPreviewIds, setMissingPreviewIds] = useState<Record<string, true>>({})
  const [attachedMediaIds, setAttachedMediaIds] = useState<string[]>([])
  const [attachedMediaInfo, setAttachedMediaInfo] = useState<Record<string, { title: string; thumbnailUrl?: string | null }>>({})
  // Current user avatar and username (fetched fresh from API)
  const [userAvatar, setUserAvatar] = useState<string | null>(null)
  const [currentUsername, setCurrentUsername] = useState<string | null>(null)
  // @mention states
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionUsers, setMentionUsers] = useState<UserSuggestion[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  // Chat size state: 'tall' (align with navbar) | 'max' (40vh) | 'medium' (30vh) | 'min' (hidden)
  const [chatSize, setChatSize] = useState<'tall' | 'max' | 'medium' | 'min'>('medium')
  const [isPageVisible, setIsPageVisible] = useState(true)
  // Detect if running as PWA (standalone mode)
  const [isPWA, setIsPWA] = useState(false)
  
  useEffect(() => {
    // Check for PWA standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true // iOS Safari
    setIsPWA(isStandalone)
  }, [])
  // Inline notification message (replaces browser alerts)
  const [inlineNotice, setInlineNotice] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingMessageText, setEditingMessageText] = useState('')
  const [messageActionLoadingId, setMessageActionLoadingId] = useState<string | null>(null)
  const [messageMenu, setMessageMenu] = useState<{
    show: boolean
    x: number
    y: number
    message: ChatMessage | null
  }>({ show: false, x: 0, y: 0, message: null })

  useEffect(() => {
    if (!showMediaPicker || pickerCropSettingsLoadedRef.current) return
    pickerCropSettingsLoadedRef.current = true
    fetch('/api/ui/crop-settings')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.maxUploadFileBytes === 'number' && data.maxUploadFileBytes > 0) {
          setMaxQuickUploadBytes(data.maxUploadFileBytes)
        }
        if (data.settings) {
          setQuickCompressQuality({
            imageQuality: data.settings.freeImageQuality,
            videoBitrateMbps: data.settings.freeVideoBitrateMbps,
            videoFps: data.settings.freeVideoFps,
            audioBitrateKbps: data.settings.freeAudioBitrateKbps,
          })
        }
      })
      .catch(() => {})
  }, [showMediaPicker])

  const filteredPickerMedia = useMemo(() => {
    if (mediaPickerSourceTab === 'all') return userMedia
    return userMedia.filter((m) => m.source === mediaPickerSourceTab)
  }, [userMedia, mediaPickerSourceTab])
  
  // Return username as-is (trimmed) for display
  const formatDisplayUsername = (username?: string | null) => {
    if (!username) return ''
    return username.trim()
  }

  const isOwnMessage = useCallback((message: ChatMessage) => {
    const currentUserId = session?.user?.id
    if (currentUserId) {
      return message.user.id === currentUserId
    }
    if (currentUsername) {
      return message.user.username === currentUsername
    }
    return false
  }, [session?.user?.id, currentUsername])

  // Load chat size from localStorage on mount
  useEffect(() => {
    const savedSize = localStorage.getItem('talkChatSize')
    if (savedSize === 'tall' || savedSize === 'max' || savedSize === 'medium' || savedSize === 'min') {
      setChatSize(savedSize)
    } else if (savedSize === 'fullscreen') {
      // Convert old fullscreen setting to tall
      setChatSize('tall')
    }
  }, [])
  
  // Save chat size to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('talkChatSize', chatSize)
  }, [chatSize])

  // Pause polling when tab is hidden (major perf win)
  useEffect(() => {
    const update = () => setIsPageVisible(!document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  
  // Auto-dismiss inline notice after 3 seconds
  useEffect(() => {
    if (inlineNotice) {
      const timer = setTimeout(() => setInlineNotice(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [inlineNotice])
  
  // Fetch user avatar and username (fresh from API)
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!session?.user) return
      try {
        // Add timestamp to prevent any caching
        const res = await fetch(`/api/user/profile?t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setUserAvatar(data.user?.avatar || null)
          setCurrentUsername(data.user?.username || null)
        }
      } catch (error) {
        console.error('Error fetching user profile:', error)
      }
    }
    fetchUserProfile()
    
    // Listen for profile update events
    const handleProfileUpdate = () => fetchUserProfile()
    window.addEventListener('profileUpdated', handleProfileUpdate)
    return () => window.removeEventListener('profileUpdated', handleProfileUpdate)
  }, [session?.user])
  
  // Size control functions (tall aligns with navbar, max is 40vh/50vh)
  const pushDown = () => {
    if (chatSize === 'tall') setChatSize('max')
    else if (chatSize === 'max') setChatSize('medium')
    else if (chatSize === 'medium') setChatSize('min')
  }
  
  const pushUp = () => {
    if (chatSize === 'min') setChatSize('medium')
    else if (chatSize === 'medium') setChatSize('max')
    else if (chatSize === 'max') setChatSize('tall')
  }
  
  // Get height based on chat size
  const getChatHeight = () => {
    switch (chatSize) {
      case 'tall': return '70vh' // Desktop tall
      case 'max': return '40vh'
      case 'medium': return '30vh'
      case 'min': return 'auto'
    }
  }
  
  const getChatMinHeight = () => {
    switch (chatSize) {
      case 'tall': return '400px'
      case 'max': return '250px'
      case 'medium': return '200px'
      case 'min': return 'auto'
    }
  }
  
  const getMobileChatHeight = () => {
    switch (chatSize) {
      case 'tall': return isPWA ? 'calc(100dvh - 88px)' : 'calc(100dvh - 65px)' // PWA: 23px shorter
      case 'max': return '50vh'
      case 'medium': return '35vh'
      case 'min': return 'auto'
    }
  }
  // Chat mode: 'open' or 'private'
  const [chatMode, setChatModeState] = useState<'open' | 'private'>('open')
  // Private chat recipients (supports multiple for group chat)
  const [selectedRecipients, setSelectedRecipients] = useState<UserSuggestion[]>([])
  // For backward compatibility, derive single recipient for 1-on-1 chat
  const privateRecipient = selectedRecipients.length === 1 ? selectedRecipients[0] : null
  // Active conversation (for group chat or 1-on-1)
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  
  // Load chat mode from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('talkChatMode')
    if (savedMode === 'open' || savedMode === 'private') {
      setChatModeState(savedMode)
    }
  }, [])
  
  // Wrapper to save chat mode to localStorage
  const setChatMode = (mode: 'open' | 'private') => {
    setChatModeState(mode)
    localStorage.setItem('talkChatMode', mode)
  }
  // Show user picker for private chat
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [searchedUsers, setSearchedUsers] = useState<UserSuggestion[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  // Chat title for new private chat
  const [chatTitle, setChatTitle] = useState('')
  // Private chat invites
  const [chatInvites, setChatInvites] = useState<Array<{
    notificationId: string
    sender: UserSuggestion
    message: string
    createdAt: string
  }>>([])
  const [showInvites, setShowInvites] = useState(false)
  // Unread private message count (includes invites + unread messages)
  const [unreadPrivateCount, setUnreadPrivateCount] = useState(0)
  // Chat records state
  const [showChatRecords, setShowChatRecords] = useState(false)
  const [chatRecords, setChatRecords] = useState<Array<{
    conversationId?: string
    isGroup?: boolean
    name?: string | null  // Chat title
    user: UserSuggestion | null
    members?: UserSuggestion[]
    lastMessage: string
    lastMessageAt: string
    unreadCount?: number  // Unread message count for this conversation
    priority?: boolean  // Priority flag for this conversation
  }>>([])
  const [loadingChatRecords, setLoadingChatRecords] = useState(false)
  const didAutoOpenLastChatRef = useRef(false)
  
  // Context menu state for chat records
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    record: typeof chatRecords[0] | null
  }>({ show: false, x: 0, y: 0, record: null })
  const [editingChatName, setEditingChatName] = useState<string | null>(null) // conversationId being edited
  const [newChatName, setNewChatName] = useState('')
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const messageLongPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const messageMenuOpenedAtRef = useRef(0)
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ show: false, title: '', message: '', onConfirm: () => {} })
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const isAutoScrollEnabledRef = useRef(true)
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastAutoScrolledMessageIdRef = useRef<string | null>(null)
  const shouldScrollToBottomOnNextMessagesRef = useRef(true)
  const scrollSettleTimersRef = useRef<number[]>([])
  const resizeScrollRafRef = useRef<number | null>(null)
  const [didInitialScroll, setDidInitialScroll] = useState(false)
  const hasUserScrollIntentRef = useRef(false)
  const ignoreInitialScrollRef = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const emojiToggleRef = useRef<HTMLButtonElement>(null)
  const mediaPickerRef = useRef<HTMLDivElement>(null)
  const quickUploadInputRef = useRef<HTMLInputElement>(null)
  const mentionPickerRef = useRef<HTMLDivElement>(null)
  const userPickerRef = useRef<HTMLDivElement>(null)
  const chatRecordsRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottomInstant = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [])

  const clearScrollSettleTimers = useCallback(() => {
    scrollSettleTimersRef.current.forEach((t) => window.clearTimeout(t))
    scrollSettleTimersRef.current = []
    if (resizeScrollRafRef.current !== null) {
      cancelAnimationFrame(resizeScrollRafRef.current)
      resizeScrollRafRef.current = null
    }
  }, [])

  const settleScrollToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      clearScrollSettleTimers()

      const tryScroll = (b: ScrollBehavior) => {
        if (chatSize === 'min') return
        if (showUserPicker) return
        if (!isAutoScrollEnabledRef.current) return
        messagesEndRef.current?.scrollIntoView({ behavior: b })
      }

      // Do an immediate scroll + a few delayed retries to account for
      // late image/thumbnail loading changing scrollHeight.
      tryScroll(behavior)
      scrollSettleTimersRef.current.push(
        window.setTimeout(() => tryScroll('auto'), 50),
        window.setTimeout(() => tryScroll('auto'), 250),
        window.setTimeout(() => tryScroll('auto'), 900)
      )
    },
    [chatSize, showUserPicker, clearScrollSettleTimers]
  )

  // Keep bottom pinned while auto-scroll is enabled, even when thumbnails/images load later.
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return

    const obs = new ResizeObserver(() => {
      if (!isAutoScrollEnabledRef.current) return
      if (chatSize === 'min' || showUserPicker) return
      if (resizeScrollRafRef.current !== null) return
      resizeScrollRafRef.current = requestAnimationFrame(() => {
        resizeScrollRafRef.current = null
        // Use auto so we don't animate/jank during layout changes.
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      })
    })

    obs.observe(el)
    return () => {
      obs.disconnect()
      if (resizeScrollRafRef.current !== null) {
        cancelAnimationFrame(resizeScrollRafRef.current)
        resizeScrollRafRef.current = null
      }
    }
  }, [chatSize, showUserPicker])

  const isSignedIn = !!session?.user

  // Desktop drag and resize state
  const [isDesktop, setIsDesktop] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 500, height: 400 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizingWidth, setIsResizingWidth] = useState(false)
  const [isResizingHeight, setIsResizingHeight] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [hasCustomPosition, setHasCustomPosition] = useState(false)

  // Detect desktop
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 768)
    }
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])

  useEffect(() => {
    if (!isDesktop) setShowEmojiPicker(false)
  }, [isDesktop])

  // Load saved position and size from localStorage
  useEffect(() => {
    if (isDesktop) {
      const savedPosition = localStorage.getItem('talkChatPosition')
      const savedSize = localStorage.getItem('talkChatCustomSize')
      
      // First load size (needed for position constraint)
      let loadedWidth = 500
      let loadedHeight = 400
      if (savedSize) {
        try {
          const s = JSON.parse(savedSize)
          loadedWidth = s.width || 500
          loadedHeight = s.height || 400
          setSize(s)
        } catch {}
      }
      
      if (savedPosition) {
        try {
          const pos = JSON.parse(savedPosition)
          // Constrain position to current viewport
          const maxX = Math.max(0, window.innerWidth - loadedWidth)
          const maxY = Math.max(0, window.innerHeight - loadedHeight)
          setPosition({
            x: Math.max(0, Math.min(pos.x, maxX)),
            y: Math.max(0, Math.min(pos.y, maxY))
          })
          setHasCustomPosition(true)
        } catch {}
      }
      if (savedSize) {
        try {
          const sz = JSON.parse(savedSize)
          setSize(sz)
        } catch {}
      }
    }
  }, [isDesktop])

  // Save position and size to localStorage
  useEffect(() => {
    if (isDesktop && hasCustomPosition) {
      localStorage.setItem('talkChatPosition', JSON.stringify(position))
    }
  }, [position, isDesktop, hasCustomPosition])

  // Keep chat visible when window is resized
  useEffect(() => {
    if (!isDesktop || !hasCustomPosition) return

    const handleWindowResize = () => {
      setPosition(prev => {
        const maxX = Math.max(0, window.innerWidth - size.width)
        const maxY = Math.max(0, window.innerHeight - size.height)
        return {
          x: Math.max(0, Math.min(prev.x, maxX)),
          y: Math.max(0, Math.min(prev.y, maxY))
        }
      })
    }

    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [isDesktop, hasCustomPosition, size])

  useEffect(() => {
    if (isDesktop) {
      localStorage.setItem('talkChatCustomSize', JSON.stringify(size))
    }
  }, [size, isDesktop])

  // Drag handlers
  const handleDragStart = (e: React.MouseEvent) => {
    if (!isDesktop) return
    e.preventDefault()
    setIsDragging(true)
    setHasCustomPosition(true)
    const rect = chatContainerRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y
      // Constrain to viewport
      const maxX = window.innerWidth - size.width
      const maxY = window.innerHeight - size.height
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset, size])

  // Resize handlers - separate for each edge
  const [resizeDirection, setResizeDirection] = useState<'left' | 'right' | 'top' | 'bottom' | null>(null)

  const handleResizeWidthStart = (e: React.MouseEvent) => {
    if (!isDesktop) return
    e.preventDefault()
    e.stopPropagation()
    setResizeDirection('left')
    setIsResizingWidth(true)
  }

  const handleResizeWidthRightStart = (e: React.MouseEvent) => {
    if (!isDesktop) return
    e.preventDefault()
    e.stopPropagation()
    setResizeDirection('right')
    setIsResizingWidth(true)
  }

  const handleResizeHeightStart = (e: React.MouseEvent) => {
    if (!isDesktop) return
    e.preventDefault()
    e.stopPropagation()
    setResizeDirection('top')
    setIsResizingHeight(true)
  }

  const handleResizeHeightBottomStart = (e: React.MouseEvent) => {
    if (!isDesktop) return
    e.preventDefault()
    e.stopPropagation()
    setResizeDirection('bottom')
    setIsResizingHeight(true)
  }

  // Width resize effect
  useEffect(() => {
    if (!isResizingWidth) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = chatContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      
      if (resizeDirection === 'left') {
        // Left edge - drag left to make wider, right edge stays fixed
        const rightEdge = hasCustomPosition ? position.x + size.width : rect.right
        const newWidth = Math.max(350, Math.min(800, rightEdge - e.clientX))
        if (hasCustomPosition) {
          const newX = rightEdge - newWidth
          setPosition(prev => ({ ...prev, x: Math.max(0, newX) }))
        }
        setSize(prev => ({ ...prev, width: newWidth }))
      } else if (resizeDirection === 'right') {
        // Right edge - drag right to make wider, left edge stays fixed
        const leftEdge = hasCustomPosition ? position.x : rect.left
        const newWidth = Math.max(350, Math.min(800, e.clientX - leftEdge))
        setSize(prev => ({ ...prev, width: newWidth }))
      }
    }

    const handleMouseUp = () => {
      setIsResizingWidth(false)
      setResizeDirection(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingWidth, resizeDirection, position, hasCustomPosition, size.width])

  // Height resize effect
  useEffect(() => {
    if (!isResizingHeight) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = chatContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      
      if (resizeDirection === 'top') {
        // Top edge - drag up to make taller, bottom edge stays fixed
        const bottomEdge = hasCustomPosition ? position.y + size.height : rect.bottom
        const newHeight = Math.max(250, Math.min(700, bottomEdge - e.clientY))
        if (hasCustomPosition) {
          const newY = bottomEdge - newHeight
          setPosition(prev => ({ ...prev, y: Math.max(0, newY) }))
        }
        setSize(prev => ({ ...prev, height: newHeight }))
      } else if (resizeDirection === 'bottom') {
        // Bottom edge - drag down to make taller, top edge stays fixed
        const topEdge = hasCustomPosition ? position.y : rect.top
        // Also constrain to not go below viewport
        const maxBottomHeight = window.innerHeight - topEdge
        const newHeight = Math.max(250, Math.min(700, maxBottomHeight, e.clientY - topEdge))
        setSize(prev => ({ ...prev, height: newHeight }))
      }
    }

    const handleMouseUp = () => {
      setIsResizingHeight(false)
      setResizeDirection(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingHeight, resizeDirection, position, hasCustomPosition, size.height])

  // Reset position (double-click header)
  const handleResetPosition = () => {
    if (!isDesktop) return
    setHasCustomPosition(false)
    setPosition({ x: 0, y: 0 })
    localStorage.removeItem('talkChatPosition')
  }

  // Block background scroll when touch starts inside chat and moves
  useEffect(() => {
    let touchStartedInChat = false
    let startY = 0

    const handleTouchStart = (e: TouchEvent) => {
      const chatEl = chatContainerRef.current
      if (!chatEl) return
      
      // Check if touch started inside chat container
      touchStartedInChat = chatEl.contains(e.target as Node)
      if (touchStartedInChat) {
        startY = e.touches[0].clientY
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      // Only block if touch started inside chat
      if (!touchStartedInChat) return
      
      const target = e.target as HTMLElement
      const scrollableParent = target.closest('.chat-messages-scroll, .emoji-picker-scroll, .media-picker-scroll, [data-scrollable]') as HTMLElement
      
      if (scrollableParent) {
        const { scrollTop, scrollHeight, clientHeight } = scrollableParent
        const currentY = e.touches[0].clientY
        const deltaY = startY - currentY
        
        const atTop = scrollTop <= 0 && deltaY < 0
        const atBottom = scrollTop + clientHeight >= scrollHeight && deltaY > 0
        
        if (!atTop && !atBottom) {
          return // Allow internal scroll
        }
      }
      
      // Prevent background scroll
      e.preventDefault()
    }

    const handleTouchEnd = () => {
      touchStartedInChat = false
    }

    // Add listeners to document to catch all touch events
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(target) &&
        !emojiToggleRef.current?.contains(target)
      ) {
        setShowEmojiPicker(false)
      }
      if (mediaPickerRef.current && !mediaPickerRef.current.contains(event.target as Node)) {
        setShowMediaPicker(false)
      }
      if (mentionPickerRef.current && !mentionPickerRef.current.contains(event.target as Node)) {
        setShowMentionPicker(false)
      }
      if (userPickerRef.current && !userPickerRef.current.contains(event.target as Node)) {
        setShowUserPicker(false)
      }
      if (chatRecordsRef.current && !chatRecordsRef.current.contains(event.target as Node)) {
        setShowChatRecords(false)
      }
    }
    if (showEmojiPicker || showMediaPicker || showMentionPicker || showUserPicker || showChatRecords) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showEmojiPicker, showMediaPicker, showMentionPicker, showUserPicker, showChatRecords])

  // Prevent wheel/touch scroll on Chat Records popup from scrolling main page
  useEffect(() => {
    const chatRecordsEl = chatRecordsRef.current
    if (!chatRecordsEl || !showChatRecords) return

    let startY = 0

    const handleWheel = (e: WheelEvent) => {
      const scrollableEl = chatRecordsEl.querySelector('[data-scrollable]') as HTMLElement
      if (scrollableEl) {
        const { scrollTop, scrollHeight, clientHeight } = scrollableEl
        const atTop = scrollTop === 0 && e.deltaY < 0
        const atBottom = scrollTop + clientHeight >= scrollHeight && e.deltaY > 0
        
        if (!atTop && !atBottom) {
          return
        }
      }
      e.preventDefault()
      e.stopPropagation()
    }

    const handleTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      const scrollableEl = chatRecordsEl.querySelector('[data-scrollable]') as HTMLElement
      const currentY = e.touches[0].clientY
      const deltaY = startY - currentY
      
      if (scrollableEl) {
        const { scrollTop, scrollHeight, clientHeight } = scrollableEl
        const atTop = scrollTop === 0 && deltaY < 0
        const atBottom = scrollTop + clientHeight >= scrollHeight && deltaY > 0
        
        if (!atTop && !atBottom) {
          return
        }
      }
      e.preventDefault()
      e.stopPropagation()
    }

    chatRecordsEl.addEventListener('wheel', handleWheel, { passive: false })
    chatRecordsEl.addEventListener('touchstart', handleTouchStart, { passive: true })
    chatRecordsEl.addEventListener('touchmove', handleTouchMove, { passive: false })
    
    return () => {
      chatRecordsEl.removeEventListener('wheel', handleWheel)
      chatRecordsEl.removeEventListener('touchstart', handleTouchStart)
      chatRecordsEl.removeEventListener('touchmove', handleTouchMove)
    }
  }, [showChatRecords])

  // Search users for private chat
  const searchUsersForPrivateChat = async (query: string) => {
    if (!query.trim()) {
      setSearchedUsers([])
      return
    }
    setSearchingUsers(true)
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        // Filter out current user
        const filtered = (data.users || []).filter((u: UserSuggestion) => u.id !== session?.user?.id)
        setSearchedUsers(filtered)
      }
    } catch (error) {
      console.error('Error searching users:', error)
    } finally {
      setSearchingUsers(false)
    }
  }

  // Handle private chat user selection (supports multiple recipients for group chat)
  const selectPrivateRecipient = (user: UserSuggestion) => {
    // Check if user is already selected
    if (selectedRecipients.some(r => r.id === user.id)) {
      return // Already selected
    }
    setSelectedRecipients(prev => [...prev, user])
    setUserSearchQuery('')
    setSearchedUsers([])
    // Don't close picker - allow adding more users
    // Auto-focus the input for next user entry
    setTimeout(() => {
      const input = document.getElementById('member-search-input')
      if (input) input.focus()
    }, 50)
  }
  
  // Remove a recipient from selection
  const removeRecipient = (userId: string) => {
    setSelectedRecipients(prev => prev.filter(r => r.id !== userId))
  }
  
  // Start chat with selected recipients (create/find conversation)
  const startChatWithSelected = async () => {
    if (selectedRecipients.length === 0) return
    
    try {
      // Create or find conversation
      const memberIds = selectedRecipients.map(r => r.id)
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          memberIds,
          name: chatTitle.trim() || null, // Pass chat title
        }),
      })
      
      if (res.ok) {
        const data = await res.json()
        setActiveConversation(data.conversation)
        setShowUserPicker(false)
        setMessages([]) // Clear messages, will be fetched
        
        // Fetch messages for this conversation
        fetchConversationMessages(data.conversation.id)
      } else {
        const error = await res.json()
        setInlineNotice(error.error || 'Failed to start conversation')
      }
    } catch (error) {
      console.error('Error starting conversation:', error)
      setInlineNotice('Failed to start conversation')
    }
  }
  
  // Fetch messages for a specific conversation
  const fetchConversationMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        if (data.conversation) {
          setActiveConversation(data.conversation)
          // Update selected recipients from conversation members
          setSelectedRecipients(data.conversation.members || [])
        }
      }
    } catch (error) {
      console.error('Error fetching conversation messages:', error)
    }
  }, [])

  // Switch to open chat
  const switchToOpenChat = () => {
    setChatMode('open')
    setSelectedRecipients([])
    setActiveConversation(null)
    setMessages([])
    // Close all popups
    setShowUserPicker(false)
    setShowChatRecords(false)
  }

  // Fetch private chat invites
  const fetchChatInvites = useCallback(async () => {
    if (!session?.user?.id) return
    try {
      const res = await fetch('/api/chat/invites')
      if (res.ok) {
        const data = await res.json()
        setChatInvites(data.invites || [])
        // Dispatch event to notify Navbar about notification changes
        window.dispatchEvent(new CustomEvent('notificationUpdate'))
      }
    } catch (error) {
      console.error('Error fetching chat invites:', error)
    }
  }, [session?.user?.id])

  // Fetch unread private message count
  const fetchUnreadCount = useCallback(async () => {
    if (!session?.user?.id) return
    try {
      const res = await fetch('/api/chat/unread')
      if (res.ok) {
        const data = await res.json()
        setUnreadPrivateCount(data.unreadCount || 0)
      }
    } catch (error) {
      console.error('Error fetching unread count:', error)
    }
  }, [session?.user?.id])

  // Accept chat invite and start private chat
  const acceptChatInvite = async (sender: UserSuggestion) => {
    // Mark notification as read
    try {
      await fetch('/api/chat/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: sender.id }),
      })
    } catch (error) {
      console.error('Error marking invite as read:', error)
    }
    
    // Start private chat with sender
    setSelectedRecipients([sender])
    setChatMode('private')
    setShowInvites(false)
    setShowUserPicker(false)
    
    // Refresh invites and unread count
    fetchChatInvites()
    fetchUnreadCount()
  }

  // Switch to private chat - shows chat records in main window
  const switchToPrivateChat = () => {
    if (!isSignedIn) {
      setInlineNotice('Please sign in to use My Kong')
      return
    }
    setChatMode('private')
    setSelectedRecipients([]) // Clear recipients to show chat records
    setActiveConversation(null) // Clear active conversation
    fetchChatRecords() // Fetch chat records to display in main window
    // Close all popups
    setShowUserPicker(false)
    setShowChatRecords(false)
    setShowInvites(false)
  }

  // Fetch chat records (previous private chat conversations)
  const fetchChatRecords = useCallback(async () => {
    if (!session?.user?.id) return
    setLoadingChatRecords(true)
    try {
      // Try to fetch conversations first (new API)
      const convRes = await fetch('/api/chat/conversations')
      if (convRes.ok) {
        const convData = await convRes.json()
        // Transform conversations to chat records format
        const records = (convData.conversations || []).map((conv: any) => ({
          conversationId: conv.id,
          isGroup: conv.isGroup,
          name: conv.name || null, // Chat title
          user: conv.members[0] || null, // First member for display
          members: conv.members,
          lastMessage: conv.lastMessage?.content || '',
          lastMessageAt: conv.lastMessage?.createdAt || conv.updatedAt,
          unreadCount: conv.unreadCount || 0, // Unread message count
          priority: conv.priority || false, // Priority flag
        }))
        setChatRecords(records)
        return
      }
      
      // Fallback to old API
      const res = await fetch('/api/chat/records')
      if (res.ok) {
        const data = await res.json()
        setChatRecords(data.records || [])
      }
    } catch (error) {
      console.error('Error fetching chat records:', error)
    } finally {
      setLoadingChatRecords(false)
    }
  }, [session?.user?.id])

  // Toggle new chat picker (renamed from chat records)
  const toggleNewChat = () => {
    if (!isSignedIn) {
      setInlineNotice('Please sign in to use New Kong')
      return
    }
    setChatMode('private')
    const newState = !showUserPicker
    setShowUserPicker(newState)
    // Reset form when opening
    if (newState) {
      setChatTitle('')
      setSelectedRecipients([])
      setUserSearchQuery('')
      setSearchedUsers([])
    }
    // Close other popups
    setShowChatRecords(false)
  }

  // Select a chat record to continue conversation
  const selectChatRecord = async (record: { conversationId?: string; isGroup?: boolean; user: UserSuggestion | null; members?: UserSuggestion[] }) => {
    // If this is a conversation (new system)
    if (record.conversationId) {
      try {
        localStorage.setItem('talkChatLastConversationId', record.conversationId)
      } catch {
        // ignore
      }
      // Clear any invites from members
      for (const member of (record.members || [])) {
        const hasInvite = chatInvites.some(invite => invite.sender.id === member.id)
    if (hasInvite) {
      try {
        await fetch('/api/chat/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ senderId: member.id }),
        })
          } catch (error) {
            console.error('Error clearing invite:', error)
          }
        }
      }
      fetchChatInvites()
      fetchUnreadCount()
      
      // Mark conversation as read
      try {
        await fetch('/api/chat/unread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: record.conversationId }),
        })
        fetchUnreadCount() // Refresh after marking as read
      } catch (error) {
        console.error('Error marking conversation as read:', error)
      }
      
      // Set the conversation
      setActiveConversation({
        id: record.conversationId,
        name: null,
        isGroup: record.isGroup || false,
        members: record.members || [],
      })
      setSelectedRecipients(record.members || [])
      setChatMode('private')
      setShowChatRecords(false)
      setMessages([])
      
      // Fetch messages for this conversation
      fetchConversationMessages(record.conversationId)
      return
    }
    
    // Legacy: single user record (backward compatibility)
    if (record.user) {
      const hasInvite = chatInvites.some(invite => invite.sender.id === record.user!.id)
      if (hasInvite) {
        try {
          await fetch('/api/chat/invites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderId: record.user.id }),
          })
        fetchChatInvites()
        fetchUnreadCount()
      } catch (error) {
        console.error('Error clearing invite:', error)
      }
    }
    
      setSelectedRecipients([record.user])
      setActiveConversation(null)
    setChatMode('private')
    setShowChatRecords(false)
      setMessages([])
    }
  }

  // When entering Private chat, automatically open the most recent conversation (or the last one you opened)
  useEffect(() => {
    if (!isSignedIn) return

    if (chatMode !== 'private') {
      didAutoOpenLastChatRef.current = false
      return
    }

    if (didAutoOpenLastChatRef.current) return
    if (showUserPicker) return
    if (loadingChatRecords) return
    if (activeConversation) {
      didAutoOpenLastChatRef.current = true
      return
    }
    if (selectedRecipients.length !== 0) return
    if (chatRecords.length === 0) return

    let preferredId: string | null = null
    try {
      preferredId = localStorage.getItem('talkChatLastConversationId')
    } catch {
      // ignore
    }

    const preferred = preferredId ? chatRecords.find((r) => r.conversationId === preferredId) : undefined
    const newest = preferred || chatRecords.find((r) => r.conversationId) || chatRecords[0]
    if (!newest?.conversationId) return

    didAutoOpenLastChatRef.current = true
    // Fire and forget
    selectChatRecord({
      conversationId: newest.conversationId,
      isGroup: newest.isGroup,
      user: newest.user,
      members: newest.members,
    })
  }, [
    isSignedIn,
    chatMode,
    chatRecords,
    loadingChatRecords,
    activeConversation,
    selectedRecipients.length,
    showUserPicker,
  ])

  // Context menu handlers for chat records
  const handleContextMenu = (e: React.MouseEvent, record: typeof chatRecords[0]) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      record,
    })
  }

  const handleTouchStart = (record: typeof chatRecords[0]) => {
    longPressTimerRef.current = setTimeout(() => {
      // Position popup within TalkChat box for mobile
      const rect = chatContainerRef.current?.getBoundingClientRect()
      if (rect) {
        // Menu bar height is about 44px from top of chat container
        const menuBarHeight = 44
        const menuWidth = 180
        // Position shifted 30px to the right from center
        const x = Math.max(rect.left + 10, Math.min(rect.left + (rect.width - menuWidth) / 2 + 30, rect.right - menuWidth - 10))
        // Position aligned with menubar bottom edge
        const y = rect.top + menuBarHeight
        setContextMenu({
          show: true,
          x,
          y,
          record,
        })
      } else {
        setContextMenu({
          show: true,
          x: 130,
          y: 100,
          record,
        })
      }
    }, 600) // 600ms long press
  }

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const closeContextMenu = () => {
    setContextMenu({ show: false, x: 0, y: 0, record: null })
  }

  const closeMessageMenu = () => {
    setMessageMenu({ show: false, x: 0, y: 0, message: null })
  }

  const handleEditChatName = () => {
    if (contextMenu.record?.conversationId) {
      setEditingChatName(contextMenu.record.conversationId)
      setNewChatName(contextMenu.record.name || '')
    }
    closeContextMenu()
  }

  const handleTogglePriority = async () => {
    if (!contextMenu.record?.conversationId) {
      closeContextMenu()
      return
    }
    
    const conversationId = contextMenu.record.conversationId
    const currentPriority = contextMenu.record.priority || false
    const newPriority = !currentPriority
    closeContextMenu()
    
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority }),
      })
      if (res.ok) {
        // Update local state and re-sort (priority first)
        setChatRecords(prev => {
          const updated = prev.map(r => 
            r.conversationId === conversationId 
              ? { ...r, priority: newPriority }
              : r
          )
          // Sort: priority first, then keep original order
          return updated.sort((a, b) => {
            if (a.priority && !b.priority) return -1
            if (!a.priority && b.priority) return 1
            return 0
          })
        })
      }
    } catch (error) {
      console.error('Error updating priority:', error)
    }
  }

  const saveEditedChatName = async () => {
    if (!editingChatName) return
    try {
      const res = await fetch(`/api/chat/conversations/${editingChatName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newChatName.trim() || null }),
      })
      if (res.ok) {
        // Update local state
        setChatRecords(prev => prev.map(r => 
          r.conversationId === editingChatName 
            ? { ...r, name: newChatName.trim() || null }
            : r
        ))
      }
    } catch (error) {
      console.error('Error updating chat name:', error)
    }
    setEditingChatName(null)
    setNewChatName('')
  }

  const handleLeaveChat = () => {
    if (!contextMenu.record?.conversationId) {
      closeContextMenu()
      return
    }
    
    const conversationId = contextMenu.record.conversationId
    closeContextMenu()
    
    setConfirmModal({
      show: true,
      title: 'Leave My Kong',
      message: 'Are you sure you want to leave this My Kong? You will no longer see messages from it.',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/chat/conversations/${conversationId}`, {
            method: 'DELETE',
          })
          if (res.ok) {
            // Remove from local state
            setChatRecords(prev => prev.filter(r => r.conversationId !== conversationId))
            // Refresh unread count
            fetchUnreadCount()
          }
        } catch (error) {
          console.error('Error leaving chat:', error)
        }
        setConfirmModal(prev => ({ ...prev, show: false }))
      },
    })
  }

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      // Prevent immediate close from the same gesture that opened the message menu.
      if (Date.now() - messageMenuOpenedAtRef.current < 350) {
        return
      }
      if (contextMenu.show) {
        closeContextMenu()
      }
      if (messageMenu.show) {
        closeMessageMenu()
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      if (messageLongPressTimerRef.current) {
        clearTimeout(messageLongPressTimerRef.current)
        messageLongPressTimerRef.current = null
      }
    }
  }, [contextMenu.show, messageMenu.show])

  const insertEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji)
    inputRef.current?.focus()
  }

  // Fetch user's media (uploads, purchased, and saved)
  const fetchUserMedia = async () => {
    // Use currentUsername (fresh from API) instead of session username
    const username = currentUsername || session?.user?.username
    if (!username) return
    setLoadingMedia(true)
    try {
      const allMedia: MediaItem[] = []
      
      // Fetch uploads — match profile My Contents: recent-first, full cap, include processing for owner
      // (default API sort is popular + limit 20, which hides low-view new uploads from the picker)
      const uploadsParams = new URLSearchParams({
        user: username,
        limit: '100',
        sort: 'recent',
        includeProcessing: '1',
      })
      const uploadsRes = await fetch(`/api/media?${uploadsParams}`, { cache: 'no-store' })
      if (uploadsRes.ok) {
        const data = await uploadsRes.json()
        if (Array.isArray(data.media)) {
          data.media.forEach((m: MediaItem) => {
            allMedia.push({ ...m, source: 'uploads' })
          })
        }
      }
      
      // Fetch purchased
      const purchasedRes = await fetch('/api/user/purchases', { cache: 'no-store' })
      if (purchasedRes.ok) {
        const data = await purchasedRes.json()
        if (Array.isArray(data.purchases)) {
          data.purchases.forEach((p: any) => {
            if (p.media) {
              allMedia.push({
                id: p.media.id,
                title: p.media.title,
                url: p.media.url,
                thumbnailUrl: p.media.thumbnailUrl,
                type: p.media.type,
                source: 'purchased'
              })
            }
          })
        }
      }
      
      // Fetch saved
      const savedRes = await fetch('/api/user/saved', { cache: 'no-store' })
      if (savedRes.ok) {
        const data = await savedRes.json()
        if (Array.isArray(data.saved)) {
          data.saved.forEach((s: any) => {
            if (s.media) {
              // Avoid duplicates (media already in uploads or purchased)
              const exists = allMedia.some(m => m.id === s.media.id)
              if (!exists) {
                allMedia.push({
                  id: s.media.id,
                  title: s.media.title,
                  url: s.media.url,
                  thumbnailUrl: s.media.thumbnailUrl,
                  type: s.media.type,
                  source: 'saved'
                })
              }
            }
          })
        }
      }
      
      setUserMedia(allMedia)
    } catch (error) {
      console.error('Error fetching user media:', error)
    } finally {
      setLoadingMedia(false)
    }
  }

  // Handle media picker toggle
  const toggleMediaPicker = () => {
    if (!showMediaPicker) {
      setMediaPickerQuickUploadError('')
      setMediaPickerSourceTab('all')
      fetchUserMedia()
    }
    setShowMediaPicker(!showMediaPicker)
    setShowEmojiPicker(false)
    setShowMentionPicker(false)
  }

  const toggleEmojiPicker = () => {
    if (!isDesktop) return
    setShowEmojiPicker((open) => {
      if (!open) {
        setShowMediaPicker(false)
        setShowMentionPicker(false)
      }
      return !open
    })
  }

  // Attach media without injecting file URLs into the message text
  const insertMediaLink = (media: MediaItem) => {
    setAttachedMediaIds((prev) => (prev.includes(media.id) ? prev : [...prev, media.id]))
    setAttachedMediaInfo((prev) => ({
      ...prev,
      [media.id]: {
        title: media.title,
        thumbnailUrl: media.thumbnailUrl || null,
      },
    }))
    setShowMediaPicker(false)
    inputRef.current?.focus()
  }

  const handleQuickUploadFromPicker = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return

    const username = currentUsername || session?.user?.username
    if (!username) {
      setMediaPickerQuickUploadError('Sign in to upload.')
      return
    }

    const mediaKind = inferQuickUploadMediaType(picked)
    if (!mediaKind) {
      setMediaPickerQuickUploadError('Use a supported image, video, or audio type (same as the Upload page).')
      return
    }

    setMediaPickerQuickUploading(true)
    setMediaPickerQuickUploadError('')
    try {
      let toSend: File = picked
      if (mediaKind === 'IMAGE') {
        toSend = await compressMedia(picked, 'IMAGE', undefined, undefined, quickCompressQuality)
      }

      if (toSend.size > maxQuickUploadBytes) {
        setMediaPickerQuickUploadError(buildUploadFileSizeExceededMessage(maxQuickUploadBytes, toSend.size))
        return
      }

      const sasResponse = await fetch('/api/upload/sas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: toSend.name || picked.name,
          contentType: (toSend.type || picked.type).split(';')[0].trim(),
          fileType: mediaKind,
          fileSize: toSend.size,
        }),
      })
      if (!sasResponse.ok) {
        const err = await sasResponse.json().catch(() => ({}))
        setMediaPickerQuickUploadError(typeof (err as { error?: string }).error === 'string' ? (err as { error: string }).error : 'Could not start upload.')
        return
      }
      const { uploadUrl, blobUrl } = await sasResponse.json()
      const baseContentType = (toSend.type || picked.type).split(';')[0].trim()
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': baseContentType,
          'x-ms-blob-cache-control': 'public, max-age=31536000',
        },
        body: toSend,
      })
      if (!putRes.ok) {
        setMediaPickerQuickUploadError('Upload to storage failed.')
        return
      }

      const completeRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleFromUploadFilename(picked.name),
          description: '',
          type: mediaKind,
          url: blobUrl,
          thumbnailUrl: null,
          isPublic: true,
        }),
      })
      const result = await completeRes.json()
      if (!completeRes.ok) {
        setMediaPickerQuickUploadError(typeof result.error === 'string' ? result.error : 'Could not save media.')
        return
      }
      if (!result.media?.id) {
        setMediaPickerQuickUploadError('Upload saved but response was incomplete.')
        return
      }

      const m: MediaItem = {
        id: result.media.id,
        title: result.media.title || titleFromUploadFilename(picked.name),
        url: result.media.url,
        thumbnailUrl: result.media.thumbnailUrl ?? null,
        type: result.media.type || mediaKind,
        source: 'uploads',
      }
      setUserMedia((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev
        return [m, ...prev]
      })
      insertMediaLink(m)
    } catch (err) {
      console.error(err)
      setMediaPickerQuickUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setMediaPickerQuickUploading(false)
    }
  }

  const removeAttachedMedia = (mediaId: string) => {
    setAttachedMediaIds((prev) => prev.filter((id) => id !== mediaId))
    setAttachedMediaInfo((prev) => {
      const next = { ...prev }
      delete next[mediaId]
      return next
    })
  }

  // Render message content with clickable links
  const renderMessageContent = (content: string) => {
    // Remove hashtags (e.g., #dog, #hashtag) from display
    const contentWithoutHashtags = content.replace(/#\w+/g, '')
    const contentWithoutMediaTokens = contentWithoutHashtags
      .replace(/\[\[media:[^\]]+\]\]/g, '')
      .replace(/\[[^\]]+\]\([^)]*\/media\/[^)]+\)/g, '')
      .replace(/https?:\/\/[^\s]*\/media\/[^\s]+/g, '')
    const normalizedContent = contentWithoutMediaTokens.replace(/\s+/g, ' ').trim()
    
    // Match markdown links [text](url) and plain URLs
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s]+)/g
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match

    while ((match = linkRegex.exec(normalizedContent)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(normalizedContent.slice(lastIndex, match.index))
      }

      if (match[1] && match[2]) {
        // Markdown link [text](url)
        if (match[2].includes('/media/')) {
          lastIndex = match.index + match[0].length
          continue
        }
        parts.push(
          <a
            key={match.index}
            href={match[2]}
            style={{
              color: 'inherit',
              textDecoration: 'underline',
              fontWeight: '500',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {match[1]}
          </a>
        )
      } else if (match[3]) {
        // Plain URL
        if (match[3].includes('/media/')) {
          lastIndex = match.index + match[0].length
          continue
        }
        parts.push(
          <a
            key={match.index}
            href={match[3]}
            style={{
              color: 'inherit',
              textDecoration: 'underline',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {match[3]}
          </a>
        )
      }

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < normalizedContent.length) {
      parts.push(normalizedContent.slice(lastIndex))
    }

    if (!normalizedContent) {
      return null
    }

    return parts.length > 0 ? parts : normalizedContent
  }

  const extractMediaIds = (content: string) => {
    const ids: string[] = []
    const regex = /\/media\/([a-zA-Z0-9_-]+)|\[\[media:([a-zA-Z0-9_-]+)\]\]/g
    let match
    while ((match = regex.exec(content)) !== null) {
      ids.push(match[1] || match[2])
    }
    return Array.from(new Set(ids))
  }

  const stripMediaMarkers = (content: string) => {
    return content
      .replace(/\s*\[\[media:[a-zA-Z0-9_-]+\]\]\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  const renderMediaPreviews = (content: string) => {
    const ids = extractMediaIds(content)
    const previews = ids
      .map((id) => mediaPreviews[id])
      .filter((preview) => preview && !preview.missing)
    if (previews.length === 0) return null

    return (
      <div style={{ marginTop: '6px', display: 'grid', gap: '6px' }}>
        {previews.map((preview) => (
          <a
            key={preview.id}
            href={`/media/${preview.id}`}
            className="no-touch-callout"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 8px',
              borderRadius: '8px',
              background: '#0f172a',
              color: 'white',
              textDecoration: 'none',
              overflow: 'hidden',
              maxWidth: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {(preview.thumbnailUrl || (preview.type === 'IMAGE' && preview.url)) ? (
              <img
                src={preview.thumbnailUrl || preview.url}
                alt={preview.title}
                style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: preview.type === 'VIDEO'
                  ? 'linear-gradient(135deg, #ef4444, #f97316)'
                  : 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                color: 'white',
                fontSize: '10px',
                fontWeight: '600',
                flexShrink: 0,
              }}>
                {preview.type}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
              <div
                style={{ fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={stripHashtags(preview.title)}
              >
                {stripHashtags(preview.title)}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>View media</div>
            </div>
          </a>
        ))}
      </div>
    )
  }

  useEffect(() => {
    const ids = new Set<string>()
    messages.slice(-50).forEach((msg) => {
      extractMediaIds(msg.content).forEach((id) => ids.add(id))
    })
    const missing = Array.from(ids).filter((id) => !mediaPreviews[id] && !missingPreviewIds[id])
    if (missing.length === 0) return

    let isActive = true
    const fetchPreviews = async () => {
      // Cap batch size to keep payloads small and avoid a big burst of work.
      const batchIds = missing.slice(0, 25)
      try {
        const res = await fetch('/api/media/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ ids: batchIds }),
        })

        // If auth/session isn't ready, don't permanently mark previews as missing.
        if (!res.ok) {
          return
        }

        const data = (await res.json()) as { previews?: MediaPreview[]; missing?: string[] }
        const previews = Array.isArray(data.previews) ? data.previews : []
        const missingIds = Array.isArray(data.missing) ? data.missing : []

        if (!isActive) return

        if (previews.length) {
          setMediaPreviews((prev) => {
            const next = { ...prev }
            previews.forEach((p) => {
              if (p?.id) next[p.id] = p
            })
            return next
          })
        }

        if (missingIds.length) {
          setMissingPreviewIds((prev) => {
            const next = { ...prev }
            missingIds.forEach((id) => {
              next[id] = true
            })
            return next
          })
        }
      } catch (error) {
        console.error('Error fetching media previews:', error)
      }
    }

    fetchPreviews()
    return () => {
      isActive = false
    }
  }, [messages, mediaPreviews, missingPreviewIds])

  // Search users for @mention
  const searchMentionUsers = async (query: string) => {
    if (!query) {
      setMentionUsers([])
      return
    }
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=5`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.users)) {
          setMentionUsers(data.users)
          setMentionIndex(0)
        }
      }
    } catch (error) {
      console.error('Error searching users:', error)
    }
  }

  // Handle input change with @mention detection
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setNewMessage(value)

    // Detect @mention
    const cursorPos = e.target.selectionStart || value.length
    const textBeforeCursor = value.slice(0, cursorPos)
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/)

    if (mentionMatch) {
      const query = mentionMatch[1]
      setMentionQuery(query)
      setShowMentionPicker(true)
      setShowEmojiPicker(false)
      setShowMediaPicker(false)
      searchMentionUsers(query)
    } else {
      setShowMentionPicker(false)
      setMentionQuery('')
    }
  }

  // Insert @mention
  const insertMention = (user: UserSuggestion) => {
    const cursorPos = inputRef.current?.selectionStart || newMessage.length
    const textBeforeCursor = newMessage.slice(0, cursorPos)
    const textAfterCursor = newMessage.slice(cursorPos)
    const newTextBefore = textBeforeCursor.replace(/@\w*$/, `@${user.username} `)
    setNewMessage(newTextBefore + textAfterCursor)
    setShowMentionPicker(false)
    setMentionQuery('')
    inputRef.current?.focus()
  }

  // Handle keyboard navigation in mention picker
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionPicker && mentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(prev => (prev + 1) % mentionUsers.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(prev => (prev - 1 + mentionUsers.length) % mentionUsers.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionUsers[mentionIndex])
      } else if (e.key === 'Escape') {
        setShowMentionPicker(false)
      }
    }
  }

  // Only fetch when component is mounted and initialized
  const fetchMessages = useCallback(async () => {
    if (!isInitialized) return
    if (!isPageVisible) return
    if (chatSize === 'min') return
    
    try {
      // If we have an active conversation, use the conversation API
      if (chatMode === 'private' && activeConversation) {
        const res = await fetch(`/api/chat/conversations/${activeConversation.id}`)
        if (res.ok) {
          const data = await res.json()
          // Messages are inside data.conversation.messages
          if (data.conversation && Array.isArray(data.conversation.messages)) {
            setMessages(data.conversation.messages)
          }
        }
        return
      }
      
      // For open chat or legacy 1-on-1 private chat
      let url = '/api/chat?mode=open'
      
      // For private chat with single recipient (legacy support)
      if (chatMode === 'private' && selectedRecipients.length === 1 && !activeConversation && session?.user?.id) {
        url = `/api/chat?mode=private&recipientId=${selectedRecipients[0].id}`
      }
      
      // Don't fetch for private mode without conversation or recipient
      if (chatMode === 'private' && selectedRecipients.length === 0 && !activeConversation) {
        return
      }
      
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.messages)) {
          setMessages(data.messages)
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }, [isInitialized, chatMode, selectedRecipients, activeConversation, session?.user?.id, isPageVisible, chatSize])

  // Initialize after mount
  useEffect(() => {
    setIsInitialized(true)
  }, [])

  // Fetch messages only after initialized
  useEffect(() => {
    if (!isInitialized) return
    fetchMessages()
    const interval = setInterval(fetchMessages, 15000)
    return () => clearInterval(interval)
  }, [isInitialized, fetchMessages])

  useEffect(() => {
    setDidInitialScroll(false)
    isAutoScrollEnabledRef.current = true
    hasUserScrollIntentRef.current = false
    ignoreInitialScrollRef.current = true
    shouldScrollToBottomOnNextMessagesRef.current = true
    lastAutoScrolledMessageIdRef.current = null
  }, [chatMode, activeConversation?.id, selectedRecipients.length])

  // If user un-minimizes chat, ensure we scroll to bottom once when messages are visible again
  useEffect(() => {
    if (chatSize !== 'min') {
      shouldScrollToBottomOnNextMessagesRef.current = true
      isAutoScrollEnabledRef.current = true
    }
  }, [chatSize])

  // Fetch chat invites periodically
  useEffect(() => {
    if (!isInitialized || !session?.user?.id) return
    if (!isPageVisible || chatSize === 'min') return
    fetchChatInvites()
    const interval = setInterval(fetchChatInvites, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [isInitialized, session?.user?.id, fetchChatInvites, isPageVisible, chatSize])

  // Fetch unread count periodically
  useEffect(() => {
    if (!isInitialized || !session?.user?.id) return
    if (!isPageVisible || chatSize === 'min') return
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [isInitialized, session?.user?.id, fetchUnreadCount, isPageVisible, chatSize])

  // Fetch chat records when in private mode without any recipients
  useEffect(() => {
    if (!isInitialized || !session?.user?.id) return
    if (chatMode === 'private' && selectedRecipients.length === 0) {
      fetchChatRecords()
    }
  }, [isInitialized, session?.user?.id, chatMode, selectedRecipients.length, fetchChatRecords])

  useEffect(() => {
    const lastId = messages.length ? (messages[messages.length - 1] as any)?.id : null
    if (!lastId) return

    // On open / chat switch: force one scroll-to-bottom once we have messages rendered.
    if (shouldScrollToBottomOnNextMessagesRef.current) {
      if (chatSize !== 'min' && !showUserPicker) {
        shouldScrollToBottomOnNextMessagesRef.current = false
        isAutoScrollEnabledRef.current = true
        lastAutoScrolledMessageIdRef.current = lastId
        // Ensure we hit the true bottom even if thumbnails load a moment later.
        settleScrollToBottom('auto')
      }
      return
    }

    // Track latest message id even when auto-scroll is disabled.
    if (!isAutoScrollEnabledRef.current) {
      lastAutoScrolledMessageIdRef.current = lastId
      return
    }

    // Only scroll when the *last message* changes (prevents polling refresh from yanking you).
    if (lastAutoScrolledMessageIdRef.current === null) {
      lastAutoScrolledMessageIdRef.current = lastId
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      return
    }

    if (lastAutoScrolledMessageIdRef.current !== lastId) {
      lastAutoScrolledMessageIdRef.current = lastId
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, chatSize, showUserPicker, settleScrollToBottom])

  useLayoutEffect(() => {
    if (didInitialScroll || messages.length === 0) return
    if (showUserPicker || chatSize === 'min') return
    ignoreInitialScrollRef.current = true
    scrollToBottomInstant()
    const raf = requestAnimationFrame(() => {
      scrollToBottomInstant()
      ignoreInitialScrollRef.current = false
      setDidInitialScroll(true)
    })
    return () => cancelAnimationFrame(raf)
  }, [messages.length, didInitialScroll, showUserPicker, chatSize, scrollToBottomInstant])

  useEffect(() => {
    if (isInitialized) {
      inputRef.current?.focus()
    }
  }, [isInitialized])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('sendMessage called, message:', newMessage, 'loading:', loading)
    
    if ((!newMessage.trim() && attachedMediaIds.length === 0) || loading) {
      console.log('Message empty or loading, returning')
      return
    }

    if (!session?.user) {
      alert('Please sign in to send messages in Kong')
      return
    }

    // For private chat, require at least one recipient or active conversation
    if (chatMode === 'private' && selectedRecipients.length === 0 && !activeConversation) {
      alert('Please select at least one person for My Kong')
      return
    }

    setLoading(true)
    // Return to last message immediately when user sends a new message
    isAutoScrollEnabledRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    try {
      const textContent = newMessage.trim()
      const mediaMarkers = attachedMediaIds.map((id) => `[[media:${id}]]`).join(' ')
      const messageContent = [textContent, mediaMarkers].filter(Boolean).join(' ').trim()
      
      // If we have an active conversation, use the conversation API
      if (chatMode === 'private' && activeConversation) {
        const res = await fetch(`/api/chat/conversations/${activeConversation.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: messageContent }),
        })
        
        if (!res.ok) {
          const errorData = await res.json()
          console.error('Failed to send message:', errorData)
          alert(errorData.error || 'Failed to send message')
          setLoading(false)
          return
      }
      
        console.log('Message sent to conversation')
        
        // Clear invites from conversation members if any
        for (const member of activeConversation.members) {
          const hasInvite = chatInvites.some(invite => invite.sender.id === member.id)
          if (hasInvite) {
            try {
              await fetch('/api/chat/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senderId: member.id }),
      })
            } catch (err) {
              console.error('Error clearing invite:', err)
            }
          }
        }
        fetchChatInvites()
        fetchUnreadCount()
      } else if (chatMode === 'private' && selectedRecipients.length > 0 && !activeConversation) {
        // Create conversation first, then send message
        const memberIds = selectedRecipients.map(r => r.id)
        const convRes = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberIds }),
        })
        
        if (!convRes.ok) {
          const error = await convRes.json()
          alert(error.error || 'Failed to create conversation')
          setLoading(false)
          return
        }
        
        const convData = await convRes.json()
        setActiveConversation(convData.conversation)
        
        // Now send message to the conversation
        const res = await fetch(`/api/chat/conversations/${convData.conversation.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: messageContent }),
        })
      
      if (!res.ok) {
        const errorData = await res.json()
        console.error('Failed to send message:', errorData)
        alert(errorData.error || 'Failed to send message')
          setLoading(false)
        return
      }
      
        console.log('Conversation created and message sent')
        setShowUserPicker(false)
      
        // Clear invites
        for (const recipient of selectedRecipients) {
          const hasInvite = chatInvites.some(invite => invite.sender.id === recipient.id)
        if (hasInvite) {
          try {
            await fetch('/api/chat/invites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senderId: recipient.id }),
            })
          } catch (err) {
            console.error('Error clearing invite:', err)
          }
        }
      }
        fetchChatInvites()
        fetchUnreadCount()
      } else {
        // Open chat - single message
        const body = {
          content: messageContent,
          isPrivate: false,
        }
        
        console.log('Sending message:', body)
        
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        
        console.log('Response status:', res.status)
        
        if (!res.ok) {
          const errorData = await res.json()
          console.error('Failed to send message:', errorData)
          alert(errorData.error || 'Failed to send message')
          setLoading(false)
          return
        }
        
        const result = await res.json()
        console.log('Message sent successfully:', result)
      }
      
      setNewMessage('')
      setAttachedMediaIds([])
      setAttachedMediaInfo({})
      fetchMessages()
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  const startEditMessage = (message: ChatMessage) => {
    setEditingMessageId(message.id)
    setEditingMessageText(stripMediaMarkers(message.content))
  }

  const cancelEditMessage = () => {
    setEditingMessageId(null)
    setEditingMessageText('')
  }

  const saveEditedMessage = async (messageId: string) => {
    const nextContent = editingMessageText.trim()
    if (!nextContent) {
      alert('Message cannot be empty')
      return
    }

    const originalMessage = messages.find((m) => m.id === messageId)
    const preservedMediaMarkers = originalMessage
      ? extractMediaIds(originalMessage.content).map((id) => `[[media:${id}]]`).join(' ')
      : ''
    const payloadContent = [nextContent, preservedMediaMarkers].filter(Boolean).join(' ').trim()

    setMessageActionLoadingId(messageId)
    try {
      const res = await fetch('/api/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, content: payloadContent }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data?.error || 'Failed to edit message')
        return
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: data.message.content } : m))
      )
      setEditingMessageId(null)
      setEditingMessageText('')
      closeMessageMenu()
    } catch (error) {
      console.error('Error editing message:', error)
      alert('Failed to edit message')
    } finally {
      setMessageActionLoadingId(null)
    }
  }

  const deleteMessage = async (messageId: string) => {
    setMessageActionLoadingId(messageId)
    try {
      const res = await fetch('/api/chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data?.error || 'Failed to delete message')
        return
      }

      setMessages((prev) => prev.filter((m) => m.id !== messageId))
      if (editingMessageId === messageId) {
        cancelEditMessage()
      }
      closeMessageMenu()
    } catch (error) {
      console.error('Error deleting message:', error)
      alert('Failed to delete message')
    } finally {
      setMessageActionLoadingId(null)
    }
  }

  const openMessageMenuAt = (message: ChatMessage, x: number, y: number) => {
    if (!isOwnMessage(message)) return
    messageMenuOpenedAtRef.current = Date.now()
    setMessageMenu({
      show: true,
      x: Math.max(8, x),
      y: Math.max(8, y),
      message,
    })
  }

  const handleMessageContextMenu = (e: React.MouseEvent, message: ChatMessage) => {
    if (!isOwnMessage(message) || editingMessageId === message.id) return
    e.preventDefault()
    e.stopPropagation()
    closeContextMenu()
    openMessageMenuAt(message, e.clientX, e.clientY)
  }

  const handleMessageTouchStart = (e: React.TouchEvent, message: ChatMessage) => {
    if (!isOwnMessage(message) || editingMessageId === message.id) return
    const touch = e.touches[0]
    if (!touch) return
    if (messageLongPressTimerRef.current) {
      clearTimeout(messageLongPressTimerRef.current)
    }
    const x = touch.clientX
    const y = touch.clientY
    messageLongPressTimerRef.current = setTimeout(() => {
      closeContextMenu()
      openMessageMenuAt(message, x, y)
    }, 550)
  }

  const handleMessageTouchEnd = () => {
    if (messageLongPressTimerRef.current) {
      clearTimeout(messageLongPressTimerRef.current)
      messageLongPressTimerRef.current = null
    }
  }

  const formatTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div 
      className="talkchat-container"
      onContextMenu={(e) => e.preventDefault()} // Disable right-click on entire TalkChat except chat records
      style={{
        position: 'fixed',
        ...(isDesktop && hasCustomPosition ? {
          top: position.y,
          left: position.x,
          bottom: 'auto',
          right: 'auto',
        } : {
          // Normal positioning from bottom
          bottom: 'env(safe-area-inset-bottom, 0px)',
          left: 0,
          right: 0,
        }),
        zIndex: 99999,
        pointerEvents: 'none',
      }}>
      {/* Wrapper to center chat - 2 tile width */}
      <div className="chat-wrapper-responsive" style={{ 
        position: 'relative',
        bottom: 0,
        left: 0,
        right: 0,
        display: isDesktop && hasCustomPosition ? 'block' : 'flex',
        justifyContent: 'center',
        background: 'transparent',
      }}>
        <style>{`
          .chat-wrapper-responsive {
            padding: 0;
          }
          @media (max-width: 640px) {
            .chat-wrapper-responsive {
              padding: 0;
            }
          }
        `}</style>
        {/* Chat container - always visible, 2 tile width */}
        <div 
          ref={chatContainerRef}
          className="chat-container-responsive"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            height: isDesktop && hasCustomPosition ? size.height : getChatHeight(),
            minHeight: isDesktop ? 'auto' : getChatMinHeight(),
            width: isDesktop && hasCustomPosition ? size.width : '100%',
            maxWidth: isDesktop && hasCustomPosition ? 'none' : '1000px',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 0,
            overflow: 'hidden',
            boxShadow: isDesktop && hasCustomPosition ? '0 4px 30px rgba(0, 0, 0, 0.2)' : '0 -4px 20px rgba(0, 0, 0, 0.15)',
            background: '#f0f0f0',
            transition: isDragging || isResizingWidth || isResizingHeight ? 'none' : 'height 0.3s ease-in-out',
            pointerEvents: 'auto',
            overscrollBehavior: 'contain',
            boxSizing: 'border-box',
          }}>
          <style>{`
            @media (max-width: 767px) {
              .chat-container-responsive {
                height: ${getMobileChatHeight()} !important;
                border-radius: 0 !important;
                max-width: 100% !important;
              }
            }
          `}</style>
        {/* Header - draggable on desktop */}
        <div 
          className="chat-header-responsive" 
          onMouseDown={isDesktop ? handleDragStart : undefined}
          onDoubleClick={isDesktop ? handleResetPosition : undefined}
          style={{
          background: '#e8e8e8',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #ccc',
          gap: '2px',
            cursor: isDesktop ? (isDragging ? 'grabbing' : 'grab') : 'default',
            userSelect: 'none',
        }}>
          <style>{`
            @media (min-width: 768px) {
              .chat-header-responsive {
                padding: 4px 8px !important;
                gap: 4px !important;
              }
            }
          `}</style>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1, minWidth: 0 }}>
            {/* User Avatar */}
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              overflow: 'hidden',
              background: session?.user ? 'linear-gradient(135deg, #8b5cf6, #a855f7)' : '#6b7280',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {userAvatar ? (
                <img 
                  src={`${userAvatar}${userAvatar.includes('?') ? '&' : '?'}t=${Date.now()}`}
                  alt="" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'white',
                }}>
                  {session?.user?.name?.[0]?.toUpperCase() || session?.user?.username?.[0]?.toUpperCase() || '?'}
                </span>
              )}
            </div>
            
            {/* Pub Kong (public / open chat) */}
            <button
              onClick={switchToOpenChat}
              className="chat-btn-responsive"
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: 'none',
                background: chatMode === 'open' ? '#10b981' : 'transparent',
                color: chatMode === 'open' ? 'white' : '#666',
                fontWeight: '700',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              Pub Kong
            </button>
            
            {/* My Kong (private chat) — records / DMs */}
            <div style={{ position: 'relative' }}>
            <button
              onClick={switchToPrivateChat}
              className="chat-btn-responsive"
              style={{
                  padding: '4px 8px',
                borderRadius: '4px',
                border: 'none',
                  background: chatMode === 'private' ? '#8b5cf6' : 'transparent',
                  color: chatMode === 'private' ? 'white' : '#666',
                fontWeight: '700',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
                My Kong
            </button>
              {/* Unread private message badge on My Kong button */}
              {unreadPrivateCount > 0 && (
                <span
                  onClick={(e) => { e.stopPropagation(); switchToPrivateChat(); }}
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: '#ef4444',
                    color: 'white',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    animation: 'pulse 2s infinite',
                  }}
                >
                  {unreadPrivateCount > 9 ? '9+' : unreadPrivateCount}
                </span>
              )}
            </div>

            {/* New Kong (+) — purple when active to match My Kong */}
            <button
              onClick={toggleNewChat}
              className="chat-btn-responsive"
              style={{
                padding: '4px 6px',
                borderRadius: '4px',
                border: 'none',
                background: showUserPicker ? '#8b5cf6' : '#facc15',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="New Kong"
            >
              {/* Chat bubble with plus icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={showUserPicker ? 'white' : '#1a1a1a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="12" y1="8" x2="12" y2="14" />
                <line x1="9" y1="11" x2="15" y2="11" />
              </svg>
            </button>
            
            {/* Member count - shown when in private chat with recipients */}
            {chatMode === 'private' && selectedRecipients.length > 0 && (
              <div style={{
                marginLeft: '8px',
                paddingLeft: '8px',
                borderLeft: '1px solid #ccc',
                fontSize: '13px',
                fontWeight: '700',
                color: '#333',
              }}>
                {selectedRecipients.length} member{selectedRecipients.length > 1 ? 's' : ''}
            </div>
            )}
          </div>
          
          {/* Size control buttons - different for desktop vs mobile */}
          <div style={{ display: 'flex', gap: '1px', flexShrink: 0 }}>
            {isDesktop ? (
              /* Desktop: Close button - hides entire chat popup */
              <button
                onClick={onClose}
                className="h-6 sm:h-7 w-7 sm:w-8"
                style={{
                  borderRadius: '4px',
                  border: 'none',
                  background: '#2563eb',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Close Kong"
              >
                {/* Minimize/close icon - horizontal line */}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" d="M6 19h12" />
                </svg>
              </button>
            ) : (
              /* Mobile: Up/Down buttons */
              <>
            <button
              onClick={pushUp}
              disabled={chatSize === 'tall'}
                  className="w-6 h-6"
              style={{
                borderRadius: '3px 0 0 3px',
                border: 'none',
                background: chatSize === 'tall' ? '#94a3b8' : '#2563eb',
                color: 'white',
                cursor: chatSize === 'tall' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: chatSize === 'tall' ? 0.5 : 1,
              }}
              title={chatSize === 'min' ? 'Medium size' : chatSize === 'medium' ? 'Max size' : chatSize === 'max' ? 'Tall (align with navbar)' : 'Already at tallest'}
            >
              {/* Up arrow */}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={pushDown}
              disabled={chatSize === 'min'}
                  className="w-6 h-6"
              style={{
                borderRadius: '0 3px 3px 0',
                border: 'none',
                background: chatSize === 'min' ? '#94a3b8' : '#2563eb',
                color: 'white',
                cursor: chatSize === 'min' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: chatSize === 'min' ? 0.5 : 1,
              }}
              title={chatSize === 'tall' ? 'Max size' : chatSize === 'max' ? 'Medium size' : chatSize === 'medium' ? 'Minimize' : 'Already minimized'}
            >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
              </>
            )}
          </div>
        </div>

        {/* New Kong picker — full panel when active */}
        {showUserPicker && (
            <div
              ref={userPickerRef}
              style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: '#fafafa',
                overflow: 'hidden',
              }}
            >
            {/* Optional My Kong title + Start */}
              <div style={{
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#fafafa',
              borderBottom: '1px solid #e0e0e0',
              }}>
              <input
                type="text"
                value={chatTitle}
                onChange={(e) => setChatTitle(e.target.value)}
                placeholder="Optional My Kong title (e.g. group name)"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '2px solid #10b981',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  background: 'white',
                  color: '#333',
                }}
              />
                  <button
                onClick={startChatWithSelected}
                disabled={selectedRecipients.length === 0}
                    style={{
                  background: selectedRecipients.length > 0 ? '#10b981' : '#9ca3af',
                      color: 'white',
                      border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: selectedRecipients.length > 0 ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                    }}
                  >
                Start
                  </button>
                </div>
            
            {/* Combined input box - type @userid directly */}
            <div style={{
              padding: '8px 12px',
              background: '#fafafa',
            }}>
              <div style={{
                background: 'white',
                border: '2px solid #10b981',
                borderRadius: '6px',
                minHeight: '44px',
                maxHeight: '80px',
                overflowY: 'auto',
                padding: '8px 10px',
              }}>
                {/* Display selected users inline with input */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                  {selectedRecipients.map(u => (
                    <span
                      key={u.id}
                      onClick={() => removeRecipient(u.id)}
                      style={{
                        color: '#333',
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                      title="Click to remove"
                    >
                      @{formatDisplayUsername(u.username)}
                    </span>
                  ))}
                <input
                    id="member-search-input"
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => {
                    const value = e.target.value
                    setUserSearchQuery(value)
                    const searchTerm = value.startsWith('@') ? value.slice(1) : value
                    searchUsersForPrivateChat(searchTerm)
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                    placeholder={selectedRecipients.length === 0 ? "@user1 @user2 @user3 ..." : ""}
                  autoFocus
                  style={{
                      flex: 1,
                      minWidth: '80px',
                      padding: '4px',
                      border: 'none',
                      fontSize: '14px',
                    outline: 'none',
                      background: 'transparent',
                    color: '#333',
                  }}
                />
              </div>
              </div>
            </div>
            
            {/* Search results - fills remaining space */}
              <div style={{
              flex: 1,
                overflowY: 'auto',
              background: 'white',
              borderTop: '1px solid #eee',
              }}>
                {searchingUsers ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                    Searching...
                  </div>
                ) : searchedUsers.length === 0 && userSearchQuery ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                    No users found
                  </div>
              ) : searchedUsers.length === 0 && !userSearchQuery ? (
                null
              ) : (
                searchedUsers.map((user) => {
                  const isSelected = selectedRecipients.some(r => r.id === user.id)
                  return (
                    <button
                      key={user.id}
                      onClick={() => {
                        if (isSelected) {
                          removeRecipient(user.id)
                        } else {
                          selectPrivateRecipient(user)
                        }
                        setUserSearchQuery('')
                        setSearchedUsers([])
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: 'none',
                        borderBottom: '1px solid #f0f0f0',
                        background: isSelected ? '#dcfce7' : 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '3px',
                        border: isSelected ? 'none' : '2px solid #ccc',
                        background: isSelected ? '#10b981' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {isSelected && (
                          <svg width="10" height="10" fill="white" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <span style={{ fontSize: '14px', color: '#333' }}>@{formatDisplayUsername(user.username)}</span>
                      {user.name && <span style={{ fontSize: '12px', color: '#888' }}>({user.name})</span>}
                    </button>
                  )
                })
                )}
              </div>
            
            {/* Bottom area */}
            <div 
              style={{
                padding: '8px',
                background: '#e8e8e8',
                borderTop: '1px solid #ccc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
            </div>
          </div>
        )}


        {/* My Kong invites — hidden when New Kong picker is open */}
        {!showUserPicker && chatInvites.length > 0 && chatMode === 'private' && !privateRecipient && (
          <div style={{
            background: '#fef3c7',
            padding: '10px 12px',
            borderBottom: '1px solid #fbbf24',
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              {chatInvites.length} pending My Kong invite{chatInvites.length > 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {chatInvites.map((invite) => (
                <button
                  key={invite.notificationId}
                  onClick={() => acceptChatInvite(invite.sender)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid #fbbf24',
                    borderRadius: '6px',
                    background: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#fef9c3'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    background: '#8b5cf6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}>
                    {invite.sender.avatar ? (
                      <img src={invite.sender.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      invite.sender.username?.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#333' }}>
                      @{formatDisplayUsername(invite.sender.username)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      invited you to My Kong
                    </div>
                  </div>
                  <span style={{
                    background: '#10b981',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                  }}>
                    Accept
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Inline notice — hidden when New Kong picker is open */}
        {!showUserPicker && inlineNotice && (
          <div style={{
            padding: '10px 16px',
            background: '#fef3c7',
            borderBottom: '1px solid #fbbf24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" fill="#d97706" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span style={{ fontSize: '13px', fontWeight: '500', color: '#92400e' }}>{inlineNotice}</span>
            </div>
            <button
              onClick={() => setInlineNotice(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" fill="#92400e" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* Messages — hidden when minimized or when New Kong picker is open */}
        {!showUserPicker && chatSize !== 'min' && (
        <div 
          ref={messagesContainerRef}
          className="chat-messages-scroll"
          onTouchMove={(e) => e.stopPropagation()}
          onWheel={() => {
            hasUserScrollIntentRef.current = true
          }}
          onTouchStart={() => {
            hasUserScrollIntentRef.current = true
          }}
          onMouseDown={() => {
            hasUserScrollIntentRef.current = true
          }}
          onScroll={() => {
            const el = messagesContainerRef.current
            if (!el) return
            if (ignoreInitialScrollRef.current) return
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
            isAutoScrollEnabledRef.current = distanceFromBottom < 80
            if (!isAutoScrollEnabledRef.current) {
              if (autoScrollTimeoutRef.current) {
                clearTimeout(autoScrollTimeoutRef.current)
              }
              // IMPORTANT: do not auto-jump back to bottom after a timeout.
              // Keep the user's scroll position until they scroll back near the bottom.
              autoScrollTimeoutRef.current = null
            }
          }}
          style={{
            flex: 1,
            overflowY: 'auto',
            // Keep only a small bottom gap so the last message sits at the bottom.
            padding: '4px 12px 4px',
            scrollPaddingBottom: '4px',
            background: '#f5f5f5',
            overscrollBehavior: 'contain',
          }}
        >
          <style>{`
            .chat-messages-scroll::-webkit-scrollbar {
              width: 10px;
            }
            .chat-messages-scroll::-webkit-scrollbar-track {
              background: #e0e0e0;
              border-radius: 5px;
            }
            .chat-messages-scroll::-webkit-scrollbar-thumb {
              background: #888;
              border-radius: 5px;
              min-height: 40px;
            }
            .chat-messages-scroll::-webkit-scrollbar-thumb:hover {
              background: #666;
            }
          `}</style>
          {chatMode === 'private' && selectedRecipients.length === 0 ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              height: '100%',
            }}>
              <div style={{ 
                padding: '8px 12px', 
                background: '#f3e8ff', 
                borderBottom: '1px solid #e9d5ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#7c3aed' }}>🔒 Select a conversation or tap New Kong (+)</span>
                <button
                  onClick={() => switchToOpenChat()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6b7280',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Close"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loadingChatRecords ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#999' }}>Loading...</div>
                ) : chatRecords.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#999' }}>
                    <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', opacity: 0.4 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p style={{ fontSize: '13px' }}>No My Kong conversations yet</p>
                    <p style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Use the yellow New Kong (+) button to start one</p>
                  </div>
                ) : (
                  chatRecords.map((record, index) => {
                    // Check for notifications from any member (invites)
                    const hasInviteNotification = record.members 
                      ? chatInvites.some(invite => record.members!.some(m => m.id === invite.sender.id))
                      : record.user ? chatInvites.some(invite => invite.sender.id === record.user!.id) : false
                    
                    // Unread count from conversation
                    const unreadCount = record.unreadCount || 0
                    const hasUnread = unreadCount > 0 || hasInviteNotification
                    
                    // Get display info
                    const isGroup = record.isGroup || (record.members && record.members.length > 1)
                    const displayUser = record.user || (record.members && record.members[0])
                    // Use chat title if available, otherwise show user names
                    const displayName = record.name 
                      ? (record.isGroup ? record.name : formatDisplayUsername(record.name))
                      : (isGroup && record.members
                          ? record.members.map(m => `@${formatDisplayUsername(m.username)}`).join(', ')
                          : displayUser ? `@${formatDisplayUsername(displayUser.username)}` : 'Unknown')
                    
                    return (
                      <button
                        key={record.conversationId || (displayUser?.id) || index}
                        onClick={() => {
                          // Close context menu if clicking another record
                          if (contextMenu.show) {
                            closeContextMenu()
                            return
                          }
                          selectChatRecord(record)
                        }}
                        onContextMenu={(e) => handleContextMenu(e, record)}
                        onTouchStart={() => handleTouchStart(record)}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchEnd}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          borderBottom: '1px solid #eee',
                          background: contextMenu.show && contextMenu.record?.conversationId === record.conversationId 
                            ? '#ddd6fe' // Purple highlight for context menu target
                            : editingChatName === record.conversationId 
                              ? '#e0f2fe' 
                              : (hasUnread ? '#fef2f2' : 'white'),
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          textAlign: 'left',
                          transition: 'background 0.15s',
                          // Prevent iOS copy/writing tools popup on long-press
                          WebkitTouchCallout: 'none',
                          WebkitUserSelect: 'none',
                          userSelect: 'none',
                        }}
                        onMouseEnter={(e) => {
                          if (contextMenu.show && contextMenu.record?.conversationId === record.conversationId) return
                          e.currentTarget.style.background = editingChatName === record.conversationId ? '#e0f2fe' : (hasUnread ? '#fee2e2' : '#f3e8ff')
                        }}
                        onMouseLeave={(e) => {
                          if (contextMenu.show && contextMenu.record?.conversationId === record.conversationId) {
                            e.currentTarget.style.background = '#ddd6fe'
                            return
                          }
                          e.currentTarget.style.background = editingChatName === record.conversationId ? '#e0f2fe' : (hasUnread ? '#fef2f2' : 'white')
                        }}
                      >
                        <div style={{
                          position: 'relative',
                          width: '44px',
                          height: '44px',
                          borderRadius: '8px',
                          overflow: 'visible',
                          background: isGroup ? '#10b981' : '#8b5cf6',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <div style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            {isGroup ? (
                              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                                {record.members?.length || 2}
                              </span>
                            ) : displayUser?.avatar ? (
                              <img src={displayUser.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>
                                {displayUser?.username?.[0]?.toUpperCase() || '?'}
                              </span>
                            )}
                          </div>
                          {hasUnread && (
                            <span style={{
                              position: 'absolute',
                              top: '-6px',
                              right: '-6px',
                              minWidth: '20px',
                              height: '20px',
                              background: '#ef4444',
                              borderRadius: '10px',
                              border: '2px solid white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              padding: '0 4px',
                            }}>
                              {unreadCount > 9 ? '9+' : (unreadCount || '!')}
                            </span>
                          )}
                          {/* Priority flag on left side */}
                          {record.priority && (
                            <span style={{
                              position: 'absolute',
                              top: '-4px',
                              left: '-8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <svg width="16" height="16" fill="#ef4444" stroke="#ef4444" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isGroup && <span style={{ fontSize: '12px' }}>👥</span>}
                            {editingChatName === record.conversationId ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }} onClick={e => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={newChatName}
                                  onChange={(e) => setNewChatName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditedChatName()
                                    if (e.key === 'Escape') { setEditingChatName(null); setNewChatName('') }
                                  }}
                                  autoFocus
                                  placeholder="My Kong title..."
                                  style={{
                                    flex: 1,
                                    padding: '4px 8px',
                                    fontSize: '14px',
                                    border: '1px solid #8b5cf6',
                                    borderRadius: '4px',
                                    outline: 'none',
                                  }}
                                />
                                <button
                                  onClick={(e) => { e.stopPropagation(); saveEditedChatName() }}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingChatName(null); setNewChatName('') }}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#6b7280',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {displayName}
                              </span>
                            )}
                            {hasUnread && editingChatName !== record.conversationId && (
                              <span style={{
                                background: '#ef4444',
                                color: 'white',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                flexShrink: 0,
                              }}>
                                {unreadCount > 0 ? `${unreadCount} NEW` : 'NEW'}
                              </span>
                            )}
                          </div>
                          <div style={{ 
                            fontSize: '13px', 
                            color: '#666', 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            marginTop: '2px',
                          }}>
                            {record.lastMessage}
                          </div>
                        </div>
                        <svg width="20" height="20" fill="none" stroke="#999" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )
                  })
                )}
              </div>
              
              {/* Context menu for My Kong conversation list */}
              {contextMenu.show && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    background: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                    zIndex: 100000,
                    minWidth: '160px',
                    maxWidth: '200px',
                    overflow: 'hidden',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <button
                    onClick={handleTogglePriority}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      background: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      color: contextMenu.record?.priority ? '#ef4444' : '#333',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <svg width="18" height="18" fill={contextMenu.record?.priority ? '#ef4444' : 'none'} stroke={contextMenu.record?.priority ? '#ef4444' : 'currentColor'} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                    </svg>
                    {contextMenu.record?.priority ? 'Remove Priority' : 'Priority'}
                  </button>
                  <div style={{ height: '1px', background: '#e5e7eb' }} />
                  <button
                    onClick={handleEditChatName}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      background: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      color: '#333',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit My Kong title
                  </button>
                  <div style={{ height: '1px', background: '#e5e7eb' }} />
                  <button
                    onClick={handleLeaveChat}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      background: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      color: '#ef4444',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Leave My Kong
                  </button>
                  <div style={{ height: '1px', background: '#e5e7eb' }} />
                  <button
                    onClick={closeContextMenu}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      background: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      color: '#6b7280',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Close
                  </button>
                </div>
              )}

              {/* Confirmation Modal */}
              {confirmModal.show && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 100001,
                  }}
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: 'white',
                      borderRadius: '12px',
                      padding: '20px',
                      maxWidth: '320px',
                      width: '90%',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                    }}
                  >
                    <h3 style={{
                      margin: '0 0 12px 0',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#333',
                    }}>
                      {confirmModal.title}
                    </h3>
                    <p style={{
                      margin: '0 0 20px 0',
                      fontSize: '14px',
                      color: '#666',
                      lineHeight: '1.5',
                    }}>
                      {confirmModal.message}
                    </p>
                    <div style={{
                      display: 'flex',
                      gap: '10px',
                      justifyContent: 'flex-end',
                    }}>
                      <button
                        onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                        style={{
                          padding: '8px 16px',
                          border: '1px solid #d1d5db',
                          background: 'white',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: 'pointer',
                          color: '#374151',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmModal.onConfirm}
                        style={{
                          padding: '8px 16px',
                          border: 'none',
                          background: '#ef4444',
                          color: 'white',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: 'pointer',
                        }}
                      >
                        Leave
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : messages.length === 0 ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              color: '#666',
            }}>
              <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginBottom: '12px', opacity: 0.3 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p style={{ fontSize: '14px', textAlign: 'center' }}>
                {chatMode === 'private' 
                  ? selectedRecipients.length === 1
                    ? `Start My Kong with @${formatDisplayUsername(selectedRecipients[0]?.username)}`
                    : selectedRecipients.length > 1
                      ? `Group My Kong — message ${selectedRecipients.length} people`
                      : 'Pick someone for My Kong'
                  : 'No messages in Pub Kong yet. Say something!'}
              </p>
              {chatMode === 'private' && selectedRecipients.length > 1 && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                  marginTop: '8px',
                  justifyContent: 'center',
                }}>
                  {selectedRecipients.map(r => (
                    <span key={r.id} style={{
                      background: '#e0e7ff',
                      color: '#5b21b6',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '500',
                    }}>
                      @{formatDisplayUsername(r.username)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = isOwnMessage(msg)
              const isEditing = editingMessageId === msg.id
              const showInlineActions =
                !isEditing &&
                isOwn &&
                messageMenu.show &&
                messageMenu.message?.id === msg.id
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    marginBottom: '2px',
                    justifyContent: isOwn ? 'flex-end' : 'flex-start',
                  }}
                >
                  {/* Avatar - left side for others */}
                  {!isOwn && (
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      background: '#6b7280',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {msg.user.avatar ? (
                        <img src={msg.user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '13px' }}>
                          {msg.user.username?.[0]?.toUpperCase() || '?'}
                        </span>
                      )}
                    </div>
                  )}
                  
                  <div style={{ 
                    maxWidth: '70%',
                    width: isEditing ? '100%' : undefined,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isOwn ? 'flex-end' : 'flex-start',
                  }}
                  onContextMenu={(e) => handleMessageContextMenu(e, msg)}
                  onTouchStart={(e) => handleMessageTouchStart(e, msg)}
                  onTouchEnd={handleMessageTouchEnd}
                  onTouchMove={handleMessageTouchEnd}
                  onTouchCancel={handleMessageTouchEnd}
                  >
                    <p style={{ fontSize: '10px', color: '#666', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {formatDisplayUsername(msg.user.username)}
                      {typeof msg.user.warningCount === 'number' && msg.user.warningCount > 0 && (
                        <span style={{
                          backgroundColor: '#fef3c7',
                          color: '#d97706',
                          fontSize: '9px',
                          padding: '1px 4px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                        }}>
                          ⚠️{msg.user.warningCount}
                        </span>
                      )}
                    </p>
                    <div style={{
                      width: isEditing ? '100%' : undefined,
                      padding: '1px 12px',
                      borderRadius: '6px',
                      backgroundColor: isOwn ? '#fef9c3' : '#e0f2fe',
                      color: '#1a1a1a',
                      border: 'none',
                      boxSizing: 'border-box',
                      userSelect: isEditing ? 'text' : 'none',
                      WebkitUserSelect: isEditing ? 'text' as const : 'none' as const,
                      WebkitTouchCallout: isEditing ? 'default' as const : 'none' as const,
                    }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                          <textarea
                            value={editingMessageText}
                            onChange={(e) => setEditingMessageText(e.target.value)}
                            rows={4}
                            style={{
                              width: '100%',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              padding: '6px 8px',
                              fontSize: '13px',
                              lineHeight: 1.4,
                              outline: 'none',
                              resize: 'vertical',
                              minHeight: '88px',
                            }}
                          />
                          {/* Keep visual footprint consistent with non-edit mode */}
                          {renderMediaPreviews(msg.content)}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={cancelEditMessage}
                              disabled={messageActionLoadingId === msg.id}
                              style={{
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                background: 'white',
                                color: '#374151',
                                fontSize: '11px',
                                padding: '2px 8px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditedMessage(msg.id)}
                              disabled={messageActionLoadingId === msg.id || !editingMessageText.trim()}
                              style={{
                                border: 'none',
                                borderRadius: '6px',
                                background: '#2563eb',
                                color: 'white',
                                fontSize: '11px',
                                padding: '3px 8px',
                                cursor: 'pointer',
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {(() => {
                            const renderedContent = renderMessageContent(msg.content)
                            return renderedContent ? (
                              <p
                                onMouseDown={(e) => e.preventDefault()}
                                onTouchStart={(e) => e.preventDefault()}
                                style={{
                                  margin: 0,
                                  fontSize: '13px',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  userSelect: 'none',
                                  WebkitUserSelect: 'none' as const,
                                  WebkitTouchCallout: 'none' as const,
                                }}
                              >
                                {renderedContent}
                              </p>
                            ) : null
                          })()}
                          {renderMediaPreviews(msg.content)}
                        </>
                      )}
                    </div>
                    <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>
                      {formatTime(msg.createdAt)}
                    </p>
                    {showInlineActions && (
                      <div
                        style={{
                          marginTop: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          justifyContent: isOwn ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            startEditMessage(msg)
                            closeMessageMenu()
                          }}
                          style={{
                            border: '1px solid #dbeafe',
                            background: '#eff6ff',
                            color: '#2563eb',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '3px 10px',
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closeMessageMenu()
                            if (window.confirm('Delete this message?')) {
                              deleteMessage(msg.id)
                            }
                          }}
                          style={{
                            border: '1px solid #fecaca',
                            background: '#fef2f2',
                            color: '#dc2626',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '3px 10px',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={closeMessageMenu}
                          style={{
                            border: '1px solid #e5e7eb',
                            background: 'white',
                            color: '#6b7280',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '3px 10px',
                            cursor: 'pointer',
                          }}
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Avatar - right side for own */}
                  {isOwn && (
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      background: '#0d9488',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {msg.user.avatar ? (
                        <img src={msg.user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '13px' }}>
                          {msg.user.username?.[0]?.toUpperCase() || '?'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
          {/* Tiny spacer so scrollIntoView doesn't clip last message */}
          <div ref={messagesEndRef} style={{ height: 4, flexShrink: 0 }} />
        </div>
        )}

        {/* Composer — hidden when minimized or when New Kong picker is open */}
        {!showUserPicker && chatSize !== 'min' && (
        <form 
          onSubmit={sendMessage} 
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '4px 12px',
            backgroundColor: '#e8e8e8',
            borderTop: '1px solid #ccc',
            position: 'relative',
          }}
        >
          {/* @Mention Picker */}
          {showMentionPicker && mentionUsers.length > 0 && (
            <div 
              ref={mentionPickerRef}
              style={{
                position: 'absolute',
                bottom: '54px',
                left: '12px',
                width: '220px',
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                border: '1px solid #ddd',
                overflow: 'hidden',
                zIndex: 10,
              }}
            >
              <div style={{
                padding: '6px 10px',
                borderBottom: '1px solid #eee',
                fontSize: '11px',
                fontWeight: '600',
                color: '#666',
              }}>
                Users
              </div>
              {mentionUsers.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => insertMention(user)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: 'none',
                    background: index === mentionIndex ? '#f0f0f0' : 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    textAlign: 'left',
                  }}
                  onMouseEnter={() => setMentionIndex(index)}
                >
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    background: '#6b7280',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {user.avatar ? (
                      <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ color: 'white', fontWeight: 'bold', fontSize: '12px' }}>
                        {user.username?.[0]?.toUpperCase() || '?'}
                      </span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>@{formatDisplayUsername(user.username)}</div>
                    {user.name && <div style={{ fontSize: '11px', color: '#888' }}>{user.name}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Media Picker */}
          {showMediaPicker && (
            <div 
              ref={mediaPickerRef}
              style={{
                position: 'absolute',
                bottom: '52px',
                left: '12px',
                width: '320px',
                maxHeight: '320px',
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                border: '1px solid #ddd',
                overflow: 'hidden',
                zIndex: 10,
              }}
            >
              <input
                ref={quickUploadInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v,audio/mpeg,audio/wav,audio/ogg,audio/mp3,audio/mp4,audio/aac"
                style={{ display: 'none' }}
                onChange={handleQuickUploadFromPicker}
              />
              <div style={{
                padding: '10px 10px 8px',
                borderBottom: '1px solid #eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}>
                <button
                  type="button"
                  onClick={() => setMediaPickerSourceTab('all')}
                  style={{
                    minWidth: '112px',
                    padding: '4px 12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    border: '1px solid #d8d8d8',
                    borderRadius: '6px',
                    background: '#fff',
                    color: '#222',
                    cursor: 'pointer',
                  }}
                >
                  My Contents
                </button>
                <button
                  type="button"
                  disabled={mediaPickerQuickUploading}
                  onClick={() => quickUploadInputRef.current?.click()}
                  style={{
                    minWidth: '112px',
                    padding: '4px 12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    border: '1px solid #d8d8d8',
                    borderRadius: '6px',
                    background: '#fff',
                    color: '#222',
                    cursor: mediaPickerQuickUploading ? 'not-allowed' : 'pointer',
                    opacity: mediaPickerQuickUploading ? 0.6 : 1,
                  }}
                >
                  Phone/PC
                </button>
              </div>
              {mediaPickerQuickUploadError ? (
                <div style={{ padding: '4px 10px', fontSize: '10px', color: '#b91c1c', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                  {mediaPickerQuickUploadError}
                </div>
              ) : null}
              <div 
                className="media-picker-scroll"
                style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  padding: '6px',
                  position: 'relative',
                }}
              >
                <style>{`
                  .media-picker-scroll::-webkit-scrollbar {
                    width: 10px;
                  }
                  .media-picker-scroll::-webkit-scrollbar-track {
                    background: #f0f0f0;
                    border-radius: 5px;
                  }
                  .media-picker-scroll::-webkit-scrollbar-thumb {
                    background: #888;
                    border-radius: 5px;
                    min-height: 40px;
                  }
                  .media-picker-scroll::-webkit-scrollbar-thumb:hover {
                    background: #666;
                  }
                `}</style>
                {mediaPickerQuickUploading ? (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(255,255,255,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#555',
                  }}>
                    Uploading…
                  </div>
                ) : null}
                {loadingMedia ? (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    padding: '30px',
                    color: '#999',
                  }}>
                    Loading...
                  </div>
                ) : filteredPickerMedia.length === 0 ? (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    padding: '24px 16px',
                    color: '#999',
                    fontSize: '13px',
                    textAlign: 'center',
                    gap: '10px',
                  }}>
                    <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.5 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>
                      {userMedia.length === 0
                        ? 'No media in My Contents yet.'
                        : 'Nothing in this tab.'}
                    </span>
                    {userMedia.length === 0 ? (
                      <>
                        <button
                          type="button"
                          disabled={mediaPickerQuickUploading}
                          onClick={() => quickUploadInputRef.current?.click()}
                          style={{
                            padding: '8px 14px',
                            fontSize: '12px',
                            fontWeight: '600',
                            border: 'none',
                            borderRadius: '6px',
                            background: '#2563eb',
                            color: 'white',
                            cursor: mediaPickerQuickUploading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Upload a personal file
                        </button>
                        <span style={{ fontSize: '11px', color: '#aaa' }}>
                          Same limits as{' '}
                          <a href="/upload" style={{ color: '#2563eb' }} onClick={(e) => e.stopPropagation()}>Upload</a>
                          {' '}(title, pricing, crop).
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#aaa' }}>Try another tab or upload something new.</span>
                    )}
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '6px',
                  }}>
                    {filteredPickerMedia.map((media) => (
                      <button
                        key={media.id}
                        type="button"
                        onClick={() => insertMediaLink(media)}
                        style={{
                          border: 'none',
                          background: '#f5f5f5',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          aspectRatio: '1',
                          position: 'relative',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.03)'
                          e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      >
                        {(media.thumbnailUrl || (media.type === 'IMAGE' && media.url)) ? (
                          <img 
                            src={media.thumbnailUrl || media.url} 
                            alt={media.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: media.type === 'VIDEO' 
                              ? 'linear-gradient(135deg, #ef4444, #f97316)' 
                              : 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                          }}>
                            <svg width="32" height="32" fill="none" stroke="white" viewBox="0 0 24 24">
                              {media.type === 'VIDEO' ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              )}
                            </svg>
                          </div>
                        )}
                        {/* Source badge */}
                        {media.source && (
                          <div style={{
                            position: 'absolute',
                            top: '2px',
                            left: '2px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontSize: '8px',
                            fontWeight: '600',
                            color: 'white',
                            background: media.source === 'uploads' ? '#22c55e' 
                              : media.source === 'purchased' ? '#f59e0b' 
                              : '#3b82f6',
                          }}>
                            {media.source === 'uploads' ? '↑' : media.source === 'purchased' ? '⬇' : '♡'}
                          </div>
                        )}
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          padding: '4px',
                          background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                          color: 'white',
                          fontSize: '10px',
                          textAlign: 'center',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {media.title}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Emoji Picker — desktop (md+) only; mobile uses OS keyboard */}
          {isDesktop && showEmojiPicker && (
            <div 
              ref={emojiPickerRef}
              style={{
                position: 'absolute',
                bottom: '52px',
                left: '50px',
                width: '300px',
                maxHeight: '220px',
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                border: '1px solid #ddd',
                overflow: 'hidden',
                zIndex: 10,
              }}
            >
              <div style={{
                padding: '6px 10px',
                borderBottom: '1px solid #eee',
                fontSize: '11px',
                fontWeight: '600',
                color: '#666',
              }}>
                Emojis
              </div>
              <div 
                className="emoji-picker-scroll"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(8, 1fr)',
                  gap: '1px',
                  padding: '6px',
                  maxHeight: '170px',
                  overflowY: 'auto',
                }}
              >
                <style>{`
                  .emoji-picker-scroll::-webkit-scrollbar {
                    width: 10px;
                  }
                  .emoji-picker-scroll::-webkit-scrollbar-track {
                    background: #f0f0f0;
                    border-radius: 5px;
                  }
                  .emoji-picker-scroll::-webkit-scrollbar-thumb {
                    background: #888;
                    border-radius: 5px;
                    min-height: 40px;
                  }
                  .emoji-picker-scroll::-webkit-scrollbar-thumb:hover {
                    background: #666;
                  }
                `}</style>
                {EMOJI_LIST.map((emoji, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      insertEmoji(emoji)
                      setShowEmojiPicker(false)
                    }}
                    style={{
                      width: '32px',
                      height: '32px',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {attachedMediaIds.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                marginBottom: '6px',
              }}
            >
              {attachedMediaIds.map((id) => {
                const info = attachedMediaInfo[id]
                return (
                  <div
                    key={id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      maxWidth: '100%',
                    }}
                  >
                    {info?.thumbnailUrl ? (
                      <img
                        src={info.thumbnailUrl}
                        alt=""
                        style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '4px',
                          background: '#dbeafe',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#1e3a8a',
                          fontSize: '10px',
                          fontWeight: 700,
                        }}
                      >
                        M
                      </div>
                    )}
                    <span
                      style={{
                        fontSize: '12px',
                        color: '#111827',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '180px',
                      }}
                      title={info?.title ? stripHashtags(info.title) : 'Selected media'}
                    >
                      {info?.title ? stripHashtags(info.title) : 'Selected media'}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachedMedia(id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#6b7280',
                        cursor: 'pointer',
                        fontSize: '14px',
                        lineHeight: 1,
                      }}
                      aria-label="Remove media"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Media Attach Button */}
            <button
              type="button"
              onClick={toggleMediaPicker}
              disabled={!isSignedIn}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isSignedIn ? '#1e3a8a' : '#ddd',
                color: isSignedIn ? '#fff' : '#aaa',
                cursor: isSignedIn ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              title="Attach Media"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {isDesktop && (
              <button
                ref={emojiToggleRef}
                type="button"
                onClick={toggleEmojiPicker}
                disabled={!isSignedIn}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor:
                    isSignedIn && showEmojiPicker ? '#0f766e' : isSignedIn ? '#14b8a6' : '#ddd',
                  color: isSignedIn ? '#fff' : '#aaa',
                  cursor: isSignedIn ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                title="Emoji"
                aria-expanded={showEmojiPicker}
                aria-haspopup="grid"
              >
                <span style={{ fontSize: '18px', lineHeight: 1 }} aria-hidden>
                  😀
                </span>
              </button>
            )}
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                !isSignedIn 
                  ? "Sign in or sign up to use Kong" 
                  : chatMode === 'private' && selectedRecipients.length === 0
                    ? "Pick someone for My Kong first..."
                    : chatMode === 'private'
                      ? selectedRecipients.length === 1
                      ? `Message @${formatDisplayUsername(selectedRecipients[0]?.username)}...`
                        : `Message ${selectedRecipients.length} people...`
                      : "Pub Kong: type @ to mention..."
              }
              disabled={!isSignedIn || (chatMode === 'private' && selectedRecipients.length === 0)}
              style={{
                flex: 1,
                height: '32px',
                padding: '0 12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                backgroundColor: isSignedIn ? '#fff' : '#f0f0f0',
                fontSize: '14px',
                outline: 'none',
                color: '#333',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={
                loading ||
                !isSignedIn ||
                (chatMode === 'private' && selectedRecipients.length === 0) ||
                (!newMessage.trim() && attachedMediaIds.length === 0)
              }
              onClick={(e) => {
                console.log('Send button clicked')
                // Form submit will handle it, but log for debugging
              }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor:
                  (newMessage.trim() || attachedMediaIds.length > 0) &&
                  !loading &&
                  isSignedIn &&
                  !(chatMode === 'private' && selectedRecipients.length === 0)
                    ? '#1e3a8a'
                    : '#ddd',
                color:
                  (newMessage.trim() || attachedMediaIds.length > 0) &&
                  !loading &&
                  isSignedIn &&
                  !(chatMode === 'private' && selectedRecipients.length === 0)
                    ? '#fff'
                    : '#999',
                cursor:
                  (newMessage.trim() || attachedMediaIds.length > 0) &&
                  !loading &&
                  isSignedIn &&
                  !(chatMode === 'private' && selectedRecipients.length === 0)
                    ? 'pointer'
                    : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
        )}

        {/* Resize handles - desktop only, full edge areas */}
        {isDesktop && hasCustomPosition && (
          <>
            {/* Left edge - full height for horizontal resize (width) */}
            <div
              onMouseDown={handleResizeWidthStart}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '6px',
                height: '100%',
                cursor: 'ew-resize',
                background: 'transparent',
              }}
              title="Drag to resize width"
            />
            {/* Right edge - full height for horizontal resize (width) */}
            <div
              onMouseDown={handleResizeWidthRightStart}
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                width: '6px',
                height: '100%',
                cursor: 'ew-resize',
                background: 'transparent',
              }}
              title="Drag to resize width"
            />
            {/* Top edge - full width for vertical resize (height) */}
            <div
              onMouseDown={handleResizeHeightStart}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '6px',
                cursor: 'ns-resize',
                background: 'transparent',
              }}
              title="Drag to resize height"
            />
            {/* Bottom edge - full width for vertical resize (height) */}
            <div
              onMouseDown={handleResizeHeightBottomStart}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                height: '6px',
                cursor: 'ns-resize',
                background: 'transparent',
              }}
              title="Drag to resize height"
            />
          </>
        )}
        </div>
      </div>
    </div>
  )
}

export default function TalkChat({ isOpen, onClose }: TalkChatProps) {
  const [mounted, setMounted] = useState(false)
  const [isFullscreenActive, setIsFullscreenActive] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    if (!mounted || !isOpen) return
    const updateFullscreenState = () => {
      const isNativeFullscreen = Boolean(document.fullscreenElement)
      const isMediaFullscreen = document.body.dataset.mediaFullscreen === 'true'
      setIsFullscreenActive(isNativeFullscreen || isMediaFullscreen)
    }

    updateFullscreenState()
    document.addEventListener('fullscreenchange', updateFullscreenState)
    const observer = new MutationObserver(updateFullscreenState)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-media-fullscreen'] })
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState)
      observer.disconnect()
    }
  }, [mounted, isOpen])

  // Check isOpen to allow toggling visibility
  if (!mounted || !isOpen || isFullscreenActive) {
    return null
  }

  return createPortal(
    <TalkChatContent onClose={onClose} />,
    document.body
  )
}

