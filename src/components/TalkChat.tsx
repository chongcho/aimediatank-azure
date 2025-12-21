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

interface TalkChatProps {
  isOpen: boolean
  onClose: () => void
}

function TalkChatContent({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isSignedIn = !!session?.user

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
      display: 'flex',
      justifyContent: 'center',
      padding: '0 16px',
    }}>
      {/* Chat container - bottom half */}
      <div style={{
        pointerEvents: 'auto',
        height: '50vh',
        width: '100%',
        maxWidth: '1280px',
        display: 'flex',
        flexDirection: 'column',
        borderTopLeftRadius: '16px',
        borderTopRightRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
        background: '#2a2a2a',
      }}>
        {/* Header */}
        <div style={{
          background: '#333',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #444',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Lip Chat Icon */}
            <svg width="28" height="28" viewBox="0 0 100 60" fill="none">
              <path d="M50 60C22 60 5 45 2 35C0 28 5 15 20 8C35 1 50 5 50 5C50 5 65 1 80 8C95 15 100 28 98 35C95 45 78 60 50 60Z" fill="#E91E63"/>
              <path d="M20 25C20 25 35 35 50 35C65 35 80 25 80 25C80 25 70 45 50 45C30 45 20 25 20 25Z" fill="#1a1a1a"/>
              <path d="M35 25C35 22 40 18 50 18C60 18 65 22 65 25C65 28 60 20 50 20C40 20 35 28 35 25Z" fill="white"/>
              <path d="M38 40C38 38 43 35 50 35C57 35 62 38 62 40C62 42 57 38 50 38C43 38 38 42 38 40Z" fill="white"/>
            </svg>
            <span style={{ color: 'white', fontWeight: '600', fontSize: '16px' }}>
              Open Chat
            </span>
          </div>
          
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: '#444',
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
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          background: '#e8e8e8',
        }}>
          {messages.length === 0 ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              color: '#999',
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
                    gap: '10px',
                    marginBottom: '14px',
                    justifyContent: isOwn ? 'flex-end' : 'flex-start',
                  }}
                >
                  {/* Avatar - left side for others */}
                  {!isOwn && (
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
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
                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
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
                    <p style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                      {msg.user.username}
                    </p>
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: '16px',
                      backgroundColor: isOwn ? '#0d9488' : 'white',
                      color: isOwn ? 'white' : '#1a1a1a',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }}>
                      <p style={{ margin: 0, fontSize: '14px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.content}
                      </p>
                    </div>
                    <p style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>

                  {/* Avatar - right side for own */}
                  {isOwn && (
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
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
                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
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
          padding: '12px 16px',
          backgroundColor: 'white',
          borderTop: '1px solid #ddd',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={isSignedIn ? "Type a message..." : "Sign in or Sign up to chat"}
              disabled={!isSignedIn}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '24px',
                border: '1px solid #ddd',
                backgroundColor: isSignedIn ? '#f5f5f5' : '#eee',
                fontSize: '14px',
                outline: 'none',
                color: '#000',
              }}
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || loading || !isSignedIn}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: newMessage.trim() && !loading && isSignedIn ? '#0d9488' : '#ccc',
                color: 'white',
                cursor: newMessage.trim() && !loading && isSignedIn ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
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

