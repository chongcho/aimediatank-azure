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
  thumbnailUrl: string | null
  type: string
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
  // @mention states
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionUsers, setMentionUsers] = useState<UserSuggestion[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  // Chat size state: 'max' (40vh) | 'medium' (30vh) | 'min' (hidden)
  const [chatSize, setChatSize] = useState<'max' | 'medium' | 'min'>('medium')
  
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
  const [chatMode, setChatMode] = useState<'open' | 'private'>('open')
  // Private chat recipient
  const [privateRecipient, setPrivateRecipient] = useState<UserSuggestion | null>(null)
  // Show user picker for private chat
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [searchedUsers, setSearchedUsers] = useState<UserSuggestion[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
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
    user: UserSuggestion
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

  const isSignedIn = !!session?.user

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

  // Handle private chat user selection
  const selectPrivateRecipient = (user: UserSuggestion) => {
    setPrivateRecipient(user)
    setShowUserPicker(false)
    setUserSearchQuery('')
    setSearchedUsers([])
    setMessages([]) // Clear messages when switching
  }

  // Switch to open chat
  const switchToOpenChat = () => {
    setChatMode('open')
    setPrivateRecipient(null)
    setMessages([])
  }

  // Fetch private chat invites
  const fetchChatInvites = useCallback(async () => {
    if (!session?.user?.id) return
    try {
      const res = await fetch('/api/chat/invites')
      if (res.ok) {
        const data = await res.json()
        setChatInvites(data.invites || [])
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
    setPrivateRecipient(sender)
    setChatMode('private')
    setShowInvites(false)
    setShowUserPicker(false)
    
    // Refresh invites
    fetchChatInvites()
  }

  // Switch to private chat
  const switchToPrivateChat = () => {
    if (!isSignedIn) {
      alert('Please sign in to use private chat')
      return
    }
    setChatMode('private')
    setShowUserPicker(true)
    setShowInvites(false)
  }

  // Fetch chat records (previous private chat conversations)
  const fetchChatRecords = useCallback(async () => {
    if (!session?.user?.id) return
    setLoadingChatRecords(true)
    try {
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

  // Toggle chat records dropdown
  const toggleChatRecords = () => {
    if (!isSignedIn) {
      alert('Please sign in to view chat records')
      return
    }
    if (!showChatRecords) {
      fetchChatRecords()
    }
    setShowChatRecords(!showChatRecords)
  }

  // Select a chat record to continue conversation
  const selectChatRecord = async (user: UserSuggestion) => {
    // Check if this user has a pending invite and clear it
    const hasInvite = chatInvites.some(invite => invite.sender.id === user.id)
    if (hasInvite) {
      try {
        await fetch('/api/chat/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ senderId: user.id }),
        })
        // Refresh invites
        fetchChatInvites()
      } catch (error) {
        console.error('Error clearing invite:', error)
      }
    }
    
    setPrivateRecipient(user)
    setChatMode('private')
    setShowChatRecords(false)
    setMessages([]) // Clear messages, will be fetched
  }

  const insertEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji)
    inputRef.current?.focus()
  }

  // Fetch user's media
  const fetchUserMedia = async () => {
    if (!session?.user?.username) return
    setLoadingMedia(true)
    try {
      const res = await fetch(`/api/media?user=${session.user.username}&limit=20`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.media)) {
          setUserMedia(data.media)
        }
      }
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
      let url = '/api/chat?mode=open'
      
      // For private chat, include mode and recipientId
      if (chatMode === 'private' && privateRecipient && session?.user?.id) {
        url = `/api/chat?mode=private&recipientId=${privateRecipient.id}`
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
  }, [isInitialized, chatMode, privateRecipient, session?.user?.id])

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

    // For private chat, require a recipient
    if (chatMode === 'private' && !privateRecipient) {
      alert('Please select a user to chat with')
      return
    }

    setLoading(true)
    try {
      const body: { content: string; isPrivate: boolean; recipientId?: string } = {
        content: newMessage.trim(),
        isPrivate: chatMode === 'private',
      }
      
      // Include recipientId for private chat
      if (chatMode === 'private' && privateRecipient) {
        body.recipientId = privateRecipient.id
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
        return
      }
      
      const result = await res.json()
      console.log('Message sent successfully:', result)
      
      setNewMessage('')
      fetchMessages()
      
      // Clear notification from this recipient if replying in private chat
      if (chatMode === 'private' && privateRecipient) {
        const hasInvite = chatInvites.some(invite => invite.sender.id === privateRecipient.id)
        if (hasInvite) {
          try {
            await fetch('/api/chat/invites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ senderId: privateRecipient.id }),
            })
            fetchChatInvites()
          } catch (err) {
            console.error('Error clearing invite:', err)
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
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
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        pointerEvents: 'none', // Allow clicks to pass through to background
      }}>
      {/* Wrapper to center chat - 2 tile width */}
      <div style={{ 
        position: 'relative',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 16px',
      }}>
        {/* Chat container - always visible, 2 tile width */}
        <div 
          className="chat-container-responsive"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            height: getChatHeight(),
            minHeight: getChatMinHeight(),
            width: '100%',
            maxWidth: '800px',
            display: 'flex',
            flexDirection: 'column',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
            background: '#f0f0f0',
            transition: 'height 0.3s ease-in-out',
            pointerEvents: 'auto', // Only chat container captures clicks
          }}>
          <style>{`
            @media (max-width: 640px) {
              .chat-container-responsive {
                height: ${getMobileChatHeight()} !important;
                border-radius: 0 !important;
              }
            }
          `}</style>
        {/* Header */}
        <div className="chat-header-responsive" style={{
          background: '#e8e8e8',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #ccc',
          gap: '2px',
        }}>
          <style>{`
            @media (min-width: 640px) {
              .chat-header-responsive {
                padding: 4px 8px !important;
                gap: 4px !important;
              }
            }
          `}</style>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1, minWidth: 0 }}>
            {/* Lip Chat Icon with yellow background */}
            <div className="chat-icon-responsive" style={{
              background: '#facc15',
              borderRadius: '4px',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 100 60" fill="none">
                <path d="M50 60C22 60 5 45 2 35C0 28 5 15 20 8C35 1 50 5 50 5C50 5 65 1 80 8C95 15 100 28 98 35C95 45 78 60 50 60Z" fill="#E91E63"/>
                <path d="M20 25C20 25 35 35 50 35C65 35 80 25 80 25C80 25 70 45 50 45C30 45 20 25 20 25Z" fill="#1a1a1a"/>
                <path d="M35 25C35 22 40 18 50 18C60 18 65 22 65 25C65 28 60 20 50 20C40 20 35 28 35 25Z" fill="white"/>
                <path d="M38 40C38 38 43 35 50 35C57 35 62 38 62 40C62 42 57 38 50 38C43 38 38 42 38 40Z" fill="white"/>
              </svg>
            </div>
            
            {/* Open Chat Button */}
            <button
              onClick={switchToOpenChat}
              className="chat-btn-responsive"
              style={{
                padding: '4px 6px',
                borderRadius: '4px',
                border: 'none',
                background: chatMode === 'open' ? '#10b981' : 'transparent',
                color: chatMode === 'open' ? 'white' : '#666',
                fontWeight: '600',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              Open Chat
            </button>
            
            {/* Private Chat Button */}
            <button
              onClick={switchToPrivateChat}
              className="chat-btn-responsive"
              style={{
                padding: '4px 6px',
                borderRadius: '4px',
                border: 'none',
                background: chatMode === 'private' ? '#8b5cf6' : 'transparent',
                color: chatMode === 'private' ? 'white' : '#666',
                fontWeight: '600',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              Private Chat
            </button>

            {/* Chat Record Button with invite badge */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={toggleChatRecords}
                className="chat-btn-responsive"
                style={{
                  padding: '4px 6px',
                  borderRadius: '4px',
                  border: 'none',
                  background: showChatRecords ? '#10b981' : 'transparent',
                  color: showChatRecords ? 'white' : '#666',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                Chat Record
              </button>
              {/* Invite notification badge */}
              {chatInvites.length > 0 && (
                <span
                  onClick={(e) => { e.stopPropagation(); toggleChatRecords(); }}
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: '#ef4444',
                    color: 'white',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    animation: 'pulse 2s infinite',
                  }}
                >
                  {chatInvites.length}
                </span>
              )}

              {/* Chat Records Dropdown */}
              {showChatRecords && (
                <div
                  ref={chatRecordsRef}
                  className="chat-dropdown-responsive"
                  style={{
                    position: 'absolute',
                    top: '36px',
                    left: '0',
                    width: '280px',
                    maxWidth: 'calc(100vw - 32px)',
                    background: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                    border: '1px solid #ddd',
                    zIndex: 100,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid #eee',
                    background: '#f0fdf4',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>
                      📋 Chat Records
                    </span>
                    <button
                      onClick={() => setShowChatRecords(false)}
                      style={{
                        background: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Close
                    </button>
                  </div>
                  <div style={{
                    maxHeight: '250px',
                    overflowY: 'auto',
                  }}>
                    {loadingChatRecords ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                        Loading...
                      </div>
                    ) : chatRecords.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                        No chat records yet
                      </div>
                    ) : (
                      chatRecords.map((record, index) => {
                        const hasNotification = chatInvites.some(invite => invite.sender.id === record.user.id)
                        return (
                          <button
                            key={record.user.id || index}
                            onClick={() => selectChatRecord(record.user)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              border: 'none',
                              background: hasNotification ? '#fef2f2' : 'white',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              textAlign: 'left',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = hasNotification ? '#fee2e2' : '#ecfdf5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = hasNotification ? '#fef2f2' : 'white'}
                          >
                            <div style={{
                              position: 'relative',
                              width: '36px',
                              height: '36px',
                              borderRadius: '6px',
                              overflow: 'visible',
                              background: '#10b981',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <div style={{
                                width: '100%',
                                height: '100%',
                                borderRadius: '6px',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                {record.user.avatar ? (
                                  <img src={record.user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                                    {record.user.username?.[0]?.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              {hasNotification && (
                                <span style={{
                                  position: 'absolute',
                                  top: '-4px',
                                  right: '-4px',
                                  width: '12px',
                                  height: '12px',
                                  background: '#ef4444',
                                  borderRadius: '50%',
                                  border: '2px solid white',
                                }}></span>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: '500', color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                @{record.user.username}
                                {hasNotification && (
                                  <span style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    padding: '1px 5px',
                                    borderRadius: '8px',
                                  }}>
                                    NEW
                                  </span>
                                )}
                              </div>
                              <div style={{ 
                                fontSize: '12px', 
                                color: '#888', 
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis' 
                              }}>
                                {record.lastMessage}
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Size control buttons */}
          <div style={{ display: 'flex', gap: '1px', flexShrink: 0 }}>
            {/* Push Up button */}
            <button
              onClick={pushUp}
              disabled={chatSize === 'max'}
              className="w-6 h-6 sm:w-7 sm:h-8"
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
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            
            {/* Push Down button */}
            <button
              onClick={pushDown}
              disabled={chatSize === 'min'}
              className="w-6 h-6 sm:w-7 sm:h-8"
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
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Chat Invites Notification Panel */}
        {chatInvites.length > 0 && chatMode === 'private' && !privateRecipient && (
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
        
        {/* User Picker for Private Chat */}
        {showUserPicker && chatMode === 'private' && (
          <div
            ref={userPickerRef}
            className="chat-dropdown-responsive"
            style={{
              position: 'absolute',
              top: '50px',
              left: '8px',
              width: '280px',
              maxWidth: 'calc(100vw - 32px)',
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              border: '1px solid #ddd',
              zIndex: 100,
              overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '10px 12px',
              borderBottom: '1px solid #eee',
              background: '#f9fafb',
            }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#333', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🔒 New Private Chat to ...</span>
                <button
                  onClick={() => setShowUserPicker(false)}
                  style={{
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => {
                  const value = e.target.value
                  setUserSearchQuery(value)
                  // Remove @ if present and search
                  const searchTerm = value.startsWith('@') ? value.slice(1) : value
                  searchUsersForPrivateChat(searchTerm)
                }}
                placeholder="@username..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
            }}>
              {searchingUsers ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                  Searching...
                </div>
              ) : searchedUsers.length === 0 && userSearchQuery ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                  No users found
                </div>
              ) : searchedUsers.length > 0 ? (
                searchedUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => selectPrivateRecipient(user)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      background: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3e8ff'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      background: '#8b5cf6',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {user.avatar ? (
                        <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                          {user.username?.[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>@{user.username}</div>
                      {user.name && <div style={{ fontSize: '12px', color: '#888' }}>{user.name}</div>}
                    </div>
                  </button>
                ))
              ) : null}
            </div>
          </div>
        )}

        {/* Messages Area - Hidden when minimized */}
        {chatSize !== 'min' && (
        <div 
          className="chat-messages-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 12px',
            background: '#f5f5f5',
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
          {chatMode === 'private' && !privateRecipient ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              color: '#8b5cf6',
            }}>
              <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginBottom: '12px', opacity: 0.5 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p style={{ fontSize: '14px', fontWeight: '500' }}>Select a user to start private chat</p>
              <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>Messages will be visible only to you and them</p>
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
              <p style={{ fontSize: '14px' }}>
                {chatMode === 'private' 
                  ? `Start a private conversation with @${privateRecipient?.username}` 
                  : 'No messages yet. Start the conversation!'}
              </p>
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
                      backgroundColor: isOwn ? '#10b981' : '#fff',
                      color: isOwn ? '#fff' : '#333',
                      border: isOwn ? 'none' : '1px solid #ddd',
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

        {/* Input Area - Hidden when minimized */}
        {chatSize !== 'min' && (
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
                My Media
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
                    No media uploaded yet
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
                        {media.thumbnailUrl ? (
                          <img 
                            src={media.thumbnailUrl} 
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
                backgroundColor: showMediaPicker ? '#ddd' : '#f0f0f0',
                color: isSignedIn ? '#10b981' : '#aaa',
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

            {/* Emoji Button */}
            <button
              type="button"
              onClick={() => {
                setShowEmojiPicker(!showEmojiPicker)
                setShowMediaPicker(false)
                setShowMentionPicker(false)
              }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: showEmojiPicker ? '#ddd' : '#f0f0f0',
                color: '#10b981',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              title="Emoji"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none"/>
                <circle cx="15" cy="9" r="1.5" fill="currentColor" stroke="none"/>
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
                  : chatMode === 'private' && !privateRecipient
                    ? "Select a user first..."
                    : chatMode === 'private'
                      ? `Message @${privateRecipient?.username}...`
                      : "Type @ to mention..."
              }
              disabled={!isSignedIn || (chatMode === 'private' && !privateRecipient)}
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
                backgroundColor: newMessage.trim() && !loading && isSignedIn ? '#10b981' : '#ddd',
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

