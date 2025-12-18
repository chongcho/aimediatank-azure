'use client'

import { useState, useEffect, useRef } from 'react'
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

export default function LiveChat() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

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
            <div className="w-1/4 border-r border-tank-light/50 flex items-stretch p-2">
              {session ? (
                isSubscriber ? (
                  <textarea
                    id="chat-message"
                    name="chat-message"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    maxLength={500}
                    onKeyDown={(e) => {
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
                        {message.content}
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

