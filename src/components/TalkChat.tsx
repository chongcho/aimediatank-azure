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
  mediaType: string
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const mediaPickerRef = useRef<HTMLDivElement>(null)
  const mentionPickerRef = useRef<HTMLDivElement>(null)

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
    }
    if (showEmojiPicker || showMediaPicker || showMentionPicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showEmojiPicker, showMediaPicker, showMentionPicker])

  const insertEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji)
    inputRef.current?.focus()
  }

  // Fetch user's media
  const fetchUserMedia = async () => {
    if (!session?.user?.id) return
    setLoadingMedia(true)
    try {
      const res = await fetch(`/api/media?userId=${session.user.id}&limit=20`)
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

  // Insert media link into message (with title as hyperlink text)
  const insertMediaLink = (media: MediaItem) => {
    const mediaUrl = `${window.location.origin}/media/${media.id}`
    // Insert as [title](url) markdown format or just title with URL
    setNewMessage(prev => prev + (prev ? ' ' : '') + `📎${media.title} ${mediaUrl}`)
    setShowMediaPicker(false)
    inputRef.current?.focus()
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
      const res = await fetch('/api/chat')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.messages)) {
          setMessages(data.messages)
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }, [isInitialized])

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
    if (!newMessage.trim() || loading) return

    if (!session?.user) {
      alert('Please sign in to send messages')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage.trim() }),
      })
      if (res.ok) {
        setNewMessage('')
        fetchMessages()
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
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      pointerEvents: 'none',
    }}>
      {/* Wrapper to match content area alignment */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6" style={{ pointerEvents: 'none' }}>
        {/* Chat container */}
        <div 
          style={{
            pointerEvents: 'auto',
            height: '35vh',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
            background: '#2a2a32',
          }}>
        {/* Header */}
        <div style={{
          background: '#111113',
          padding: '4px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #2a2a32',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Lip Chat Icon with yellow background */}
            <div style={{
              background: '#facc15',
              borderRadius: '6px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 100 60" fill="none">
                <path d="M50 60C22 60 5 45 2 35C0 28 5 15 20 8C35 1 50 5 50 5C50 5 65 1 80 8C95 15 100 28 98 35C95 45 78 60 50 60Z" fill="#E91E63"/>
                <path d="M20 25C20 25 35 35 50 35C65 35 80 25 80 25C80 25 70 45 50 45C30 45 20 25 20 25Z" fill="#1a1a1a"/>
                <path d="M35 25C35 22 40 18 50 18C60 18 65 22 65 25C65 28 60 20 50 20C40 20 35 28 35 25Z" fill="white"/>
                <path d="M38 40C38 38 43 35 50 35C57 35 62 38 62 40C62 42 57 38 50 38C43 38 38 42 38 40Z" fill="white"/>
              </svg>
            </div>
            <span style={{ color: 'white', fontWeight: '600', fontSize: '16px' }}>
              Open Chat
            </span>
          </div>
          
          {/* Close button - square blue */}
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '4px',
              border: 'none',
              background: '#2563eb',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages Area */}
        <div 
          className="chat-messages-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 12px',
            background: '#1a1a1f',
          }}
        >
          <style>{`
            .chat-messages-scroll::-webkit-scrollbar {
              width: 6px;
            }
            .chat-messages-scroll::-webkit-scrollbar-track {
              background: #2a2a32;
              border-radius: 3px;
            }
            .chat-messages-scroll::-webkit-scrollbar-thumb {
              background: #444;
              border-radius: 3px;
            }
            .chat-messages-scroll::-webkit-scrollbar-thumb:hover {
              background: #555;
            }
          `}</style>
          {messages.length === 0 ? (
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
              <p style={{ fontSize: '14px' }}>No messages yet. Start the conversation!</p>
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
                    marginBottom: '6px',
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
                    <p style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>
                      {msg.user.username}
                    </p>
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: isOwn ? '#00ff88' : '#2a2a32',
                      color: isOwn ? '#0a0a0b' : '#e0e0e0',
                    }}>
                      <p style={{ margin: 0, fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.content}
                      </p>
                    </div>
                    <p style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
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

        {/* Input Area */}
        <form onSubmit={sendMessage} style={{
          padding: '4px 12px',
          backgroundColor: '#111113',
          borderTop: '1px solid #2a2a32',
          position: 'relative',
        }}>
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
                            background: '#e0e0e0',
                          }}>
                            <svg width="24" height="24" fill="none" stroke="#999" viewBox="0 0 24 24">
                              {media.mediaType === 'VIDEO' ? (
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
                backgroundColor: showMediaPicker ? '#2a2a32' : '#1a1a1f',
                color: isSignedIn ? '#888' : '#444',
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
                backgroundColor: showEmojiPicker ? '#2a2a32' : '#1a1a1f',
                color: '#888',
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
              placeholder={isSignedIn ? "Type @ to mention..." : "Sign in or Sign up to chat"}
              disabled={!isSignedIn}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #2a2a32',
                backgroundColor: isSignedIn ? '#1a1a1f' : '#111113',
                fontSize: '14px',
                outline: 'none',
                color: '#fff',
              }}
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || loading || !isSignedIn}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: newMessage.trim() && !loading && isSignedIn ? '#00ff88' : '#2a2a32',
                color: newMessage.trim() && !loading && isSignedIn ? '#0a0a0b' : '#555',
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

  if (!isOpen || !mounted) {
    return null
  }

  return createPortal(
    <TalkChatContent onClose={onClose} />,
    document.body
  )
}

