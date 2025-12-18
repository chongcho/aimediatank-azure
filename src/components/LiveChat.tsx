'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface ChatMessage {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    username: string
    name: string | null
    avatar: string | null
    role: string
  }
}

interface MentionUser {
  id: string
  username: string
  name: string | null
  role: string
}

export default function LiveChat() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([])
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionStartIndex, setMentionStartIndex] = useState(-1)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)

  const isSubscriber = session?.user?.role === 'SUBSCRIBER' || session?.user?.role === 'ADMIN'

  // Fetch messages on mount and poll for updates
  useEffect(() => {
    fetchMessages()
    
    // Poll for new messages every 3 seconds
    const interval = setInterval(() => {
      fetchMessages(true)
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  // Search users for @mention autocomplete
  const searchMentionUsers = useCallback(async (query: string) => {
    if (query.length === 0) {
      // Show recent chat participants when @ is typed with no query
      const uniqueUsers = messages.reduce((acc: MentionUser[], msg) => {
        if (!acc.find(u => u.id === msg.user.id)) {
          acc.push({ id: msg.user.id, username: msg.user.username, name: msg.user.name, role: msg.user.role })
        }
        return acc
      }, []).slice(0, 5)
      setMentionUsers(uniqueUsers)
      return
    }
    
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=5`)
      if (res.ok) {
        const data = await res.json()
        setMentionUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error searching users:', error)
    }
  }, [messages])

  // Handle message input changes and detect @mentions
  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart || 0
    setNewMessage(value)

    // Find if we're typing a mention
    const textBeforeCursor = value.slice(0, cursorPos)
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/)

    if (mentionMatch) {
      const query = mentionMatch[1]
      const startIndex = cursorPos - query.length - 1 // -1 for @
      setMentionQuery(query)
      setMentionStartIndex(startIndex)
      setShowMentionDropdown(true)
      setSelectedMentionIndex(0)
      searchMentionUsers(query)
    } else {
      setShowMentionDropdown(false)
      setMentionQuery('')
      setMentionStartIndex(-1)
    }
  }

  // Insert selected mention into message
  const insertMention = (username: string) => {
    if (mentionStartIndex === -1) return
    
    const before = newMessage.slice(0, mentionStartIndex)
    const after = newMessage.slice(mentionStartIndex + mentionQuery.length + 1) // +1 for @
    const newText = `${before}@${username} ${after}`
    
    setNewMessage(newText)
    setShowMentionDropdown(false)
    setMentionQuery('')
    setMentionStartIndex(-1)
    
    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus()
      const newCursorPos = before.length + username.length + 2 // @ + username + space
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!isMinimized) {
      scrollToBottom()
    }
  }, [messages, isMinimized])

  const fetchMessages = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await fetch('/api/chat?limit=50')
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || sending || !isSubscriber) return

    setSending(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage }),
      })

      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => [...prev, data.message])
        setNewMessage('')
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'text-red-400'
      case 'SUBSCRIBER':
        return 'text-tank-accent'
      default:
        return 'text-gray-400'
    }
  }

  // Parse message content and highlight @mentions
  const renderMessageContent = (content: string) => {
    // Regex to match @username (alphanumeric and underscores)
    const mentionRegex = /(@\w+)/g
    const parts = content.split(mentionRegex)
    
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const username = part.slice(1) // Remove @ symbol
        return (
          <Link
            key={index}
            href={`/profile/${username}`}
            className="text-yellow-400 font-semibold hover:underline hover:text-yellow-300"
          >
            {part}
          </Link>
        )
      }
      return <span key={index}>{part}</span>
    })
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className={`flex ${isMinimized ? 'h-14' : 'h-36'} bg-tank-dark/70 backdrop-blur-sm border border-b-0 border-tank-light/50 overflow-hidden transition-all duration-300`}>
        {/* Left: Live Feed Label */}
        <button
          type="button"
          className="w-10 bg-tank-accent/70 flex flex-col items-center justify-center cursor-pointer flex-shrink-0 px-0.5 border-0"
          onClick={() => setIsMinimized(!isMinimized)}
          aria-label={isMinimized ? "Expand live feed" : "Minimize live feed"}
          title={isMinimized ? "Expand live feed" : "Minimize live feed"}
        >
          <span className="font-bold text-tank-black text-[14px] leading-tight">Live</span>
          <span className="font-bold text-tank-black text-[14px] leading-tight">Feed</span>
          <svg className={`w-3 h-3 text-tank-black transition-transform ${isMinimized ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Chat Content - Hidden when minimized */}
        {!isMinimized && (
          <>
            {/* Middle: Input Area */}
            <div className="w-1/4 border-r border-tank-light/50 flex items-stretch p-2 relative">
              {session ? (
                isSubscriber ? (
                  <div className="relative w-full h-full">
                    <textarea
                      ref={textareaRef}
                      id="chat-message"
                      name="chat-message"
                      value={newMessage}
                      onChange={handleMessageChange}
                      placeholder="Type a message... (use @ to mention)"
                      maxLength={500}
                      onKeyDown={(e) => {
                        // Handle mention dropdown navigation
                        if (showMentionDropdown && mentionUsers.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            setSelectedMentionIndex(prev => 
                              prev < mentionUsers.length - 1 ? prev + 1 : 0
                            )
                            return
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            setSelectedMentionIndex(prev => 
                              prev > 0 ? prev - 1 : mentionUsers.length - 1
                            )
                            return
                          }
                          if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault()
                            insertMention(mentionUsers[selectedMentionIndex].username)
                            return
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            setShowMentionDropdown(false)
                            return
                          }
                        }
                        // Normal Enter to send
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (newMessage.trim() && !sending) {
                            handleSend(e as any)
                          }
                        }
                      }}
                      className="w-full h-full bg-tank-gray/50 border border-tank-light/50 rounded-none focus:outline-none focus:border-tank-accent text-gray-300 placeholder-gray-400 text-xs resize-none p-2"
                      aria-label="Chat message"
                    />
                    {/* Mention Autocomplete Dropdown */}
                    {showMentionDropdown && mentionUsers.length > 0 && (
                      <div className="absolute bottom-full left-0 w-full mb-1 bg-tank-dark border border-tank-accent/50 rounded shadow-lg z-50 max-h-32 overflow-y-auto">
                        {mentionUsers.map((user, index) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => insertMention(user.username)}
                            className={`w-full px-2 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-tank-accent/20 ${
                              index === selectedMentionIndex ? 'bg-tank-accent/30' : ''
                            }`}
                          >
                            <span className={`font-semibold ${getRoleColor(user.role)}`}>
                              @{user.username}
                            </span>
                            {user.name && (
                              <span className="text-gray-500 truncate">({user.name})</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-500 text-xs flex items-center">
                    <Link href="/pricing" className="text-tank-accent hover:underline">Subscribe</Link>&nbsp;to chat
                  </div>
                )
              ) : (
                <div className="text-gray-500 text-xs flex items-center">
                  <Link href="/login" className="text-tank-accent hover:underline">Sign in</Link>&nbsp;to chat
                </div>
              )}
            </div>

            {/* Right: Messages Display - Scrollable */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto px-2 py-[1px]"
            >
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="spinner" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-gray-600 text-xs h-full flex items-center">No messages yet</div>
              ) : (
                <div className="space-y-0.5">
                  {messages.map((message) => (
                    <div key={message.id} className="flex items-baseline gap-1 text-xs">
                      <Link
                        href={`/profile/${message.user.username}`}
                        className={`font-semibold hover:underline flex-shrink-0 ${getRoleColor(message.user.role)}`}
                      >
                        {message.user.username}
                      </Link>
                      <span className="text-gray-600">:</span>
                      <span className="text-gray-300 break-words">
                        {renderMessageContent(message.content)}
                      </span>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  )
}

