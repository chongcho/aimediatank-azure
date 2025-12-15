'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Message {
  id: string
  content: string
  isRead: boolean
  createdAt: string
  sender?: {
    id: string
    username: string
    name: string | null
    avatar: string | null
  }
  receiver?: {
    id: string
    username: string
    name: string | null
    avatar: string | null
  }
}

export default function MessagesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent'>('inbox')
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchMessages()
    }
  }, [session, activeTab])

  const fetchMessages = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/messages?type=${activeTab}`)
      const data = await res.json()
      setMessages(data.messages || [])
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (messageIds: string[]) => {
    try {
      await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds }),
      })
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  const handleSelectMessage = (message: Message) => {
    setSelectedMessage(message)
    if (!message.isRead && activeTab === 'inbox') {
      markAsRead([message.id])
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, isRead: true } : m))
      )
    }
  }

  const handleReply = async () => {
    if (!replyContent.trim() || !selectedMessage) return

    const receiverId =
      activeTab === 'inbox'
        ? selectedMessage.sender?.id
        : selectedMessage.receiver?.id

    if (!receiverId) return

    setSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId,
          content: replyContent,
        }),
      })

      if (res.ok) {
        setReplyContent('')
        alert('Reply sent!')
      }
    } catch (error) {
      console.error('Error sending reply:', error)
    } finally {
      setSending(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    }
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (!session) {
    return null
  }

  const unreadCount = messages.filter((m) => !m.isRead).length

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Messages</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Message List */}
        <div className="lg:col-span-1">
          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setActiveTab('inbox')
                setSelectedMessage(null)
              }}
              className={`flex-1 px-4 py-2 rounded-xl font-medium ${
                activeTab === 'inbox'
                  ? 'bg-tank-accent text-tank-black'
                  : 'bg-tank-gray text-gray-400'
              }`}
            >
              Inbox
              {activeTab === 'inbox' && unreadCount > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setActiveTab('sent')
                setSelectedMessage(null)
              }}
              className={`flex-1 px-4 py-2 rounded-xl font-medium ${
                activeTab === 'sent'
                  ? 'bg-tank-accent text-tank-black'
                  : 'bg-tank-gray text-gray-400'
              }`}
            >
              Sent
            </button>
          </div>

          {/* Messages */}
          <div className="card p-0 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="spinner mx-auto" />
              </div>
            ) : messages.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No messages yet
              </div>
            ) : (
              <div className="divide-y divide-tank-light max-h-[60vh] overflow-y-auto">
                {messages.map((message) => {
                  const otherUser =
                    activeTab === 'inbox' ? message.sender : message.receiver
                  return (
                    <button
                      key={message.id}
                      onClick={() => handleSelectMessage(message)}
                      className={`w-full p-4 text-left hover:bg-tank-light/50 transition-colors ${
                        selectedMessage?.id === message.id
                          ? 'bg-tank-light'
                          : ''
                      } ${!message.isRead && activeTab === 'inbox' ? 'bg-tank-accent/5' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-tank-accent to-purple-500 flex-shrink-0 flex items-center justify-center text-sm font-bold">
                          {otherUser?.name?.[0]?.toUpperCase() ||
                            otherUser?.username[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate">
                              {otherUser?.name || otherUser?.username}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDate(message.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400 truncate">
                            {message.content}
                          </p>
                        </div>
                        {!message.isRead && activeTab === 'inbox' && (
                          <div className="w-2 h-2 rounded-full bg-tank-accent flex-shrink-0 mt-2" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Message Detail */}
        <div className="lg:col-span-2">
          <div className="card h-full">
            {selectedMessage ? (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center gap-3 pb-4 border-b border-tank-light">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center font-bold">
                    {(activeTab === 'inbox'
                      ? selectedMessage.sender?.name?.[0]
                      : selectedMessage.receiver?.name?.[0]
                    )?.toUpperCase() ||
                      (activeTab === 'inbox'
                        ? selectedMessage.sender?.username[0]
                        : selectedMessage.receiver?.username[0]
                      )?.toUpperCase()}
                  </div>
                  <div>
                    <Link
                      href={`/profile/${
                        activeTab === 'inbox'
                          ? selectedMessage.sender?.username
                          : selectedMessage.receiver?.username
                      }`}
                      className="font-semibold hover:text-tank-accent"
                    >
                      {activeTab === 'inbox'
                        ? selectedMessage.sender?.name ||
                          selectedMessage.sender?.username
                        : selectedMessage.receiver?.name ||
                          selectedMessage.receiver?.username}
                    </Link>
                    <p className="text-sm text-gray-500">
                      {formatDate(selectedMessage.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 py-6">
                  <p className="text-gray-300 whitespace-pre-wrap">
                    {selectedMessage.content}
                  </p>
                </div>

                {/* Reply */}
                {activeTab === 'inbox' && (
                  <div className="pt-4 border-t border-tank-light">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Write a reply..."
                      rows={3}
                      className="mb-3 resize-none"
                    />
                    <button
                      onClick={handleReply}
                      disabled={!replyContent.trim() || sending}
                      className="btn-primary"
                    >
                      {sending ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                Select a message to view
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


