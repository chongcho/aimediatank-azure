'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'

interface ChatMessage {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    username: string
    name: string | null
    avatar: string | null
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
  '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙',
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
  // Current user avatar
  const [userAvatar, setUserAvatar] = useState<string | null>(null)
  // @mention states
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionUsers, setMentionUsers] = useState<UserSuggestion[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  // Chat size state: 'max' (40vh) | 'medium' (30vh) | 'min' (hidden)
  const [chatSize, setChatSize] = useState<'max' | 'medium' | 'min'>('medium')
  // Inline notification message (replaces browser alerts)
  const [inlineNotice, setInlineNotice] = useState<string | null>(null)
  
  // Load chat size from localStorage on mount
  useEffect(() => {
    const savedSize = localStorage.getItem('talkChatSize')
    if (savedSize === 'max' || savedSize === 'medium' || savedSize === 'min') {
      setChatSize(savedSize)
    }
  }, [])
  
  // Save chat size to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('talkChatSize', chatSize)
  }, [chatSize])
  
  // Auto-dismiss inline notice after 3 seconds
  useEffect(() => {
    if (inlineNotice) {
      const timer = setTimeout(() => setInlineNotice(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [inlineNotice])
  
  // Fetch user avatar
  useEffect(() => {
    const fetchUserAvatar = async () => {
      if (!session?.user) return
      try {
        const res = await fetch('/api/user/profile')
        if (res.ok) {
          const data = await res.json()
          setUserAvatar(data.user?.avatar || null)
        }
      } catch (error) {
        console.error('Error fetching user avatar:', error)
      }
    }
    fetchUserAvatar()
    
    // Listen for profile update events
    const handleProfileUpdate = () => fetchUserAvatar()
    window.addEventListener('profileUpdated', handleProfileUpdate)
    return () => window.removeEventListener('profileUpdated', handleProfileUpdate)
  }, [session?.user])
  
  // Size control functions
  const pushDown = () => {
    if (chatSize === 'max') setChatSize('medium')
    else if (chatSize === 'medium') setChatSize('min')
  }
  
  const pushUp = () => {
    if (chatSize === 'min') setChatSize('medium')
    else if (chatSize === 'medium') setChatSize('max')
  }
  
  // Get height based on chat size
  const getChatHeight = () => {
    switch (chatSize) {
      case 'max': return '40vh'
      case 'medium': return '30vh'
      case 'min': return 'auto'
    }
  }
  
  const getChatMinHeight = () => {
    switch (chatSize) {
      case 'max': return '250px'
      case 'medium': return '200px'
      case 'min': return 'auto'
    }
  }
  
  const getMobileChatHeight = () => {
    switch (chatSize) {
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
  }>>([])
  const [loadingChatRecords, setLoadingChatRecords] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const mediaPickerRef = useRef<HTMLDivElement>(null)
  const mentionPickerRef = useRef<HTMLDivElement>(null)
  const userPickerRef = useRef<HTMLDivElement>(null)
  const chatRecordsRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

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

  // Load saved position and size from localStorage
  useEffect(() => {
    if (isDesktop) {
      const savedPosition = localStorage.getItem('talkChatPosition')
      const savedSize = localStorage.getItem('talkChatCustomSize')
      if (savedPosition) {
        try {
          const pos = JSON.parse(savedPosition)
          setPosition(pos)
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
        const newHeight = Math.max(250, Math.min(700, e.clientY - topEdge))
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
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
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
    
    // Refresh invites
    fetchChatInvites()
  }

  // Switch to private chat - shows chat records in main window
  const switchToPrivateChat = () => {
    if (!isSignedIn) {
      setInlineNotice('Please sign in to use Private Chat')
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
      setInlineNotice('Please sign in to use New Chat')
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

  const insertEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji)
    inputRef.current?.focus()
  }

  // Fetch user's media (uploads, purchased, and saved)
  const fetchUserMedia = async () => {
    if (!session?.user?.username) return
    setLoadingMedia(true)
    try {
      const allMedia: MediaItem[] = []
      
      // Fetch uploads
      const uploadsRes = await fetch(`/api/media?user=${session.user.username}&limit=20`)
      if (uploadsRes.ok) {
        const data = await uploadsRes.json()
        if (Array.isArray(data.media)) {
          data.media.forEach((m: MediaItem) => {
            allMedia.push({ ...m, source: 'uploads' })
          })
        }
      }
      
      // Fetch purchased
      const purchasedRes = await fetch('/api/user/purchases')
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
      const savedRes = await fetch('/api/user/saved')
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
      fetchUserMedia()
    }
    setShowMediaPicker(!showMediaPicker)
    setShowEmojiPicker(false)
    setShowMentionPicker(false)
  }

  // Insert media link into message (markdown format for clickable link)
  const insertMediaLink = (media: MediaItem) => {
    const mediaUrl = `${window.location.origin}/media/${media.id}`
    // Insert as [title](url) markdown format
    setNewMessage(prev => prev + (prev ? ' ' : '') + `[📎${media.title}](${mediaUrl})`)
    setShowMediaPicker(false)
    inputRef.current?.focus()
  }

  // Render message content with clickable links
  const renderMessageContent = (content: string) => {
    // Remove hashtags (e.g., #dog, #hashtag) from display
    const contentWithoutHashtags = content.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim()
    
    // Match markdown links [text](url) and plain URLs
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s]+)/g
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match

    while ((match = linkRegex.exec(contentWithoutHashtags)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(contentWithoutHashtags.slice(lastIndex, match.index))
      }

      if (match[1] && match[2]) {
        // Markdown link [text](url)
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
    if (lastIndex < contentWithoutHashtags.length) {
      parts.push(contentWithoutHashtags.slice(lastIndex))
    }

    return parts.length > 0 ? parts : contentWithoutHashtags
  }

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
    
    try {
      // If we have an active conversation, use the conversation API
      if (chatMode === 'private' && activeConversation) {
        const res = await fetch(`/api/chat/conversations/${activeConversation.id}`)
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.messages)) {
            setMessages(data.messages)
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
  }, [isInitialized, chatMode, selectedRecipients, activeConversation, session?.user?.id])

  // Initialize after mount
  useEffect(() => {
    setIsInitialized(true)
  }, [])

  // Fetch messages only after initialized
  useEffect(() => {
    if (!isInitialized) return
    fetchMessages()
    const interval = setInterval(fetchMessages, 5000)
    return () => clearInterval(interval)
  }, [isInitialized, fetchMessages])

  // Fetch chat invites periodically
  useEffect(() => {
    if (!isInitialized || !session?.user?.id) return
    fetchChatInvites()
    const interval = setInterval(fetchChatInvites, 10000) // Check every 10 seconds
    return () => clearInterval(interval)
  }, [isInitialized, session?.user?.id, fetchChatInvites])

  // Fetch chat records when in private mode without any recipients
  useEffect(() => {
    if (!isInitialized || !session?.user?.id) return
    if (chatMode === 'private' && selectedRecipients.length === 0) {
      fetchChatRecords()
    }
  }, [isInitialized, session?.user?.id, chatMode, selectedRecipients.length, fetchChatRecords])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isInitialized) {
      inputRef.current?.focus()
    }
  }, [isInitialized])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('sendMessage called, message:', newMessage, 'loading:', loading)
    
    if (!newMessage.trim() || loading) {
      console.log('Message empty or loading, returning')
      return
    }

    if (!session?.user) {
      alert('Please sign in to send messages')
      return
    }

    // For private chat, require at least one recipient or active conversation
    if (chatMode === 'private' && selectedRecipients.length === 0 && !activeConversation) {
      alert('Please select at least one user to chat with')
      return
    }

    setLoading(true)
    try {
      const messageContent = newMessage.trim()
      
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
      fetchMessages()
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message')
    } finally {
      setLoading(false)
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
      style={{
        position: 'fixed',
        ...(isDesktop && hasCustomPosition ? {
          top: position.y,
          left: position.x,
          bottom: 'auto',
          right: 'auto',
        } : {
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
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
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
            
            {/* Open Button */}
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
              Open
            </button>
            
            {/* Private Button - shows chat records, active when in private mode or new chat */}
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
                Private
              </button>
              {/* Invite notification badge on Private button */}
              {chatInvites.length > 0 && (
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
                  {chatInvites.length}
                </span>
              )}
            </div>

            {/* New Chat Button with Icon - purple when active to match Private button */}
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
              title="New Chat"
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
                title="Close chat"
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
                  disabled={chatSize === 'max'}
                  className="w-6 h-6"
                  style={{
                    borderRadius: '3px 0 0 3px',
                    border: 'none',
                    background: chatSize === 'max' ? '#94a3b8' : '#2563eb',
                    color: 'white',
                    cursor: chatSize === 'max' ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: chatSize === 'max' ? 0.5 : 1,
                  }}
                  title={chatSize === 'min' ? 'Medium size' : chatSize === 'medium' ? 'Max size' : 'Already at max'}
                >
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
                  title={chatSize === 'max' ? 'Medium size' : chatSize === 'medium' ? 'Minimize' : 'Already minimized'}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* New Chat Full Panel - Takes whole chat window when active */}
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
            {/* Chat title input with Start button */}
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
                placeholder="Enter chat title"
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
                      @{u.username}
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
                      <span style={{ fontSize: '14px', color: '#333' }}>@{user.username}</span>
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


        {/* Chat Invites Notification Panel - Hidden when New Chat is open */}
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
              {chatInvites.length} pending chat invite{chatInvites.length > 1 ? 's' : ''}
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
                      @{invite.sender.username}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      wants to chat with you
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
        
        {/* Inline Notice - shown within chat box, hidden when New Chat is open */}
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

        {/* Messages Area - Hidden when minimized or when New Chat is open */}
        {!showUserPicker && chatSize !== 'min' && (
        <div 
          className="chat-messages-scroll"
          onTouchMove={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 12px',
            background: '#f5f5f5',
            overscrollBehavior: 'contain',
          }}
        >
          <style>{`
            .chat-messages-scroll::-webkit-scrollbar {
              width: 6px;
            }
            .chat-messages-scroll::-webkit-scrollbar-track {
              background: #e0e0e0;
              border-radius: 3px;
            }
            .chat-messages-scroll::-webkit-scrollbar-thumb {
              background: #bbb;
              border-radius: 3px;
            }
            .chat-messages-scroll::-webkit-scrollbar-thumb:hover {
              background: #999;
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
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#7c3aed' }}>🔒 Select a conversation or start New Chat</span>
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
                    <p style={{ fontSize: '13px' }}>No private chats yet</p>
                    <p style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Click "New Chat" to start one</p>
                  </div>
                ) : (
                  chatRecords.map((record, index) => {
                    // Check for notifications from any member
                    const hasNotification = record.members 
                      ? chatInvites.some(invite => record.members!.some(m => m.id === invite.sender.id))
                      : record.user ? chatInvites.some(invite => invite.sender.id === record.user!.id) : false
                    
                    // Get display info
                    const isGroup = record.isGroup || (record.members && record.members.length > 1)
                    const displayUser = record.user || (record.members && record.members[0])
                    // Use chat title if available, otherwise show user names
                    const displayName = record.name 
                      ? record.name 
                      : (isGroup && record.members
                          ? record.members.map(m => `@${m.username}`).join(', ')
                          : displayUser ? `@${displayUser.username}` : 'Unknown')
                    
                    return (
                      <button
                        key={record.conversationId || (displayUser?.id) || index}
                        onClick={() => selectChatRecord(record)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          borderBottom: '1px solid #eee',
                          background: hasNotification ? '#fef2f2' : 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          textAlign: 'left',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = hasNotification ? '#fee2e2' : '#f3e8ff'}
                        onMouseLeave={(e) => e.currentTarget.style.background = hasNotification ? '#fef2f2' : 'white'}
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
                          {hasNotification && (
                            <span style={{
                              position: 'absolute',
                              top: '-4px',
                              right: '-4px',
                              width: '14px',
                              height: '14px',
                              background: '#ef4444',
                              borderRadius: '50%',
                              border: '2px solid white',
                            }}></span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isGroup && <span style={{ fontSize: '12px' }}>👥</span>}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {displayName}
                            </span>
                            {hasNotification && (
                              <span style={{
                                background: '#ef4444',
                                color: 'white',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                flexShrink: 0,
                              }}>
                                NEW
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
                    ? `Start a private conversation with @${selectedRecipients[0]?.username}`
                    : selectedRecipients.length > 1
                      ? `Send a group message to ${selectedRecipients.length} users`
                      : 'Select a user to chat with'
                  : 'No messages yet. Start the conversation!'}
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
                      @{r.username}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.user.id === session?.user?.id
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isOwn ? 'flex-end' : 'flex-start',
                  }}>
                    <p style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>
                      {msg.user.username}
                    </p>
                    <div style={{
                      padding: '1px 12px',
                      borderRadius: '6px',
                      backgroundColor: isOwn ? '#fef9c3' : '#e0f2fe',
                      color: '#1a1a1a',
                      border: 'none',
                    }}>
                      <p style={{ margin: 0, fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {renderMessageContent(msg.content)}
                      </p>
                    </div>
                    <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>
                      {formatTime(msg.createdAt)}
                    </p>
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
          <div ref={messagesEndRef} />
        </div>
        )}

        {/* Input Area - Hidden when minimized or when New Chat is open */}
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
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>@{user.username}</div>
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
                maxHeight: '280px',
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
                color: '#333',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                My Contents
                <span style={{ marginLeft: 'auto', fontSize: '9px', fontWeight: '400', color: '#888' }}>
                  ↑ Uploads · ⬇ Purchased · ♡ Saved
                </span>
              </div>
              <div 
                className="media-picker-scroll"
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  padding: '6px',
                }}
              >
                <style>{`
                  .media-picker-scroll::-webkit-scrollbar {
                    width: 6px;
                  }
                  .media-picker-scroll::-webkit-scrollbar-track {
                    background: #f0f0f0;
                    border-radius: 3px;
                  }
                  .media-picker-scroll::-webkit-scrollbar-thumb {
                    background: #ccc;
                    border-radius: 3px;
                  }
                  .media-picker-scroll::-webkit-scrollbar-thumb:hover {
                    background: #aaa;
                  }
                `}</style>
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
                ) : userMedia.length === 0 ? (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    padding: '30px',
                    color: '#999',
                    fontSize: '13px',
                  }}>
                    <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginBottom: '8px', opacity: 0.5 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    No media in My Contents
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '6px',
                  }}>
                    {userMedia.map((media) => (
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

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <div 
              ref={emojiPickerRef}
              style={{
                position: 'absolute',
                bottom: '52px',
                left: '54px',
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
                    width: 6px;
                  }
                  .emoji-picker-scroll::-webkit-scrollbar-track {
                    background: #f0f0f0;
                    border-radius: 3px;
                  }
                  .emoji-picker-scroll::-webkit-scrollbar-thumb {
                    background: #ccc;
                    border-radius: 3px;
                  }
                  .emoji-picker-scroll::-webkit-scrollbar-thumb:hover {
                    background: #aaa;
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
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                !isSignedIn 
                  ? "Sign in or Sign up to chat" 
                  : chatMode === 'private' && selectedRecipients.length === 0
                    ? "Select a user first..."
                    : chatMode === 'private'
                      ? selectedRecipients.length === 1
                        ? `Message @${selectedRecipients[0]?.username}...`
                        : `Message ${selectedRecipients.length} users...`
                      : "Type @ to mention..."
              }
              disabled={!isSignedIn || (chatMode === 'private' && selectedRecipients.length === 0)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                backgroundColor: isSignedIn ? '#fff' : '#f0f0f0',
                fontSize: '14px',
                outline: 'none',
                color: '#333',
              }}
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || loading || !isSignedIn}
              onClick={(e) => {
                console.log('Send button clicked')
                // Form submit will handle it, but log for debugging
              }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: newMessage.trim() && !loading && isSignedIn ? '#1e3a8a' : '#ddd',
                color: newMessage.trim() && !loading && isSignedIn ? '#fff' : '#999',
                cursor: newMessage.trim() && !loading && isSignedIn ? 'pointer' : 'default',
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

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Check isOpen to allow toggling visibility
  if (!mounted || !isOpen) {
    return null
  }

  return createPortal(
    <TalkChatContent onClose={onClose} />,
    document.body
  )
}

