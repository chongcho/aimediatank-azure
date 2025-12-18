'use client'

import { useState, useEffect, useRef } from 'react'

interface Message {
  id: string
  sender: 'user' | 'support'
  text: string
  timestamp: Date
}

interface LiveChatSupportProps {
  isOpen: boolean
  onClose: () => void
  userName: string
}

export default function LiveChatSupport({ isOpen, onClose, userName }: LiveChatSupportProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize chat with greeting
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const greeting: Message = {
        id: '1',
        sender: 'support',
        text: `Hello ${userName}! How can I help you?`,
        timestamp: new Date(),
      }
      setMessages([greeting])
    }
  }, [isOpen, userName, messages.length])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!inputValue.trim()) return

    const messageText = inputValue.trim()
    
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: messageText,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    // AI-assisted intelligent response generation
    setTimeout(() => {
      const userText = messageText.toLowerCase()
      let aiResponse = ''
      
      // Intelligent response based on user input
      if (userText.includes('upload') || userText.includes('video') || userText.includes('image') || userText.includes('music')) {
        aiResponse = "I can help you with uploading content! 🎬 As a member, you get 5 free uploads. After that, upload fees apply based on your plan. Would you like me to explain the upload process or membership options?"
      } else if (userText.includes('price') || userText.includes('cost') || userText.includes('plan') || userText.includes('membership') || userText.includes('subscribe')) {
        aiResponse = "Great question about our plans! 💳 We offer:\n\n• **Viewer** - Free (5 uploads, no downloads)\n• **Basic** - $9.99/mo ($1/upload after free)\n• **Advanced** - $19.99/mo ($0.50/upload)\n• **Premium** - $29.99/mo (unlimited)\n\nWould you like help choosing the right plan?"
      } else if (userText.includes('download')) {
        aiResponse = "For downloads, you'll need a paid membership (Basic, Advanced, or Premium). 📥 Each plan includes unlimited downloads. Would you like to know more about our membership tiers?"
      } else if (userText.includes('payment') || userText.includes('pay') || userText.includes('stripe') || userText.includes('card')) {
        aiResponse = "We use Stripe for secure payments. 🔒 All transactions are encrypted and we never store your full card details. If you're having payment issues, please try refreshing the page or contact support@aimediatank.com"
      } else if (userText.includes('account') || userText.includes('profile') || userText.includes('password')) {
        aiResponse = "For account-related matters, you can update your profile from the Profile page. 👤 If you're having trouble with your password or account access, please email support@aimediatank.com for assistance."
      } else if (userText.includes('hello') || userText.includes('hi') || userText.includes('hey')) {
        aiResponse = `Hello again, ${userName}! 👋 I'm your AI assistant. How can I help you today? Feel free to ask about uploads, memberships, or any other questions!`
      } else if (userText.includes('thank')) {
        aiResponse = "You're welcome! 😊 Is there anything else I can help you with?"
      } else if (userText.includes('bye') || userText.includes('goodbye')) {
        aiResponse = `Goodbye, ${userName}! 👋 Feel free to come back anytime. Have a great day!`
      } else if (userText.includes('help')) {
        aiResponse = "I'm here to help! 🤖 I can assist you with:\n\n• Uploading content\n• Membership & pricing\n• Downloads\n• Payment issues\n• Account settings\n\nWhat would you like to know more about?"
      } else {
        // Default intelligent responses
        const defaultResponses = [
          `Thank you for your message, ${userName}! 🤔 I'm analyzing your query. Could you provide a bit more detail so I can assist you better?`,
          "I understand you need assistance. Let me help you with that! Could you tell me more specifically what you're looking to do?",
          "Great question! 💡 To give you the best answer, could you provide a few more details about what you're trying to accomplish?",
          "I'm here to help! 🙌 Based on your question, it seems you might need assistance with our platform. What specific feature or process can I help explain?",
        ]
        aiResponse = defaultResponses[Math.floor(Math.random() * defaultResponses.length)]
      }
      
      const supportMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'support',
        text: aiResponse,
        timestamp: new Date(),
      }
      
      setIsTyping(false)
      setMessages(prev => [...prev, supportMessage])
    }, 1000 + Math.random() * 1000) // Variable response time for realism
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-tank-dark border border-tank-light rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 100px)' }}>
        {/* Top Label Bar - User Chat Service */}
        <div className="bg-gradient-to-r from-tank-accent via-emerald-500 to-teal-500 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span className="font-bold text-black text-base tracking-wide">USER CHAT SERVICE</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-black/20 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Header - AiMediaTank AI Assistant */}
        <div className="bg-gradient-to-r from-tank-dark to-tank-gray px-4 py-4 border-b border-tank-light flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-tank-accent to-emerald-600 flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-white text-lg flex items-center gap-2">
              AiMediaTank
              <span className="px-2 py-0.5 bg-purple-500/30 text-purple-300 text-xs font-medium rounded">AI</span>
            </h3>
            <p className="text-sm text-gray-400">LLM AI-Assisted Intelligent Chat</p>
            <p className="text-sm text-green-400 flex items-center gap-1 mt-0.5">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Online
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                  message.sender === 'user'
                    ? 'bg-tank-accent text-black rounded-br-md'
                    : 'bg-tank-light text-white rounded-bl-md'
                }`}
              >
                <p className="text-base leading-relaxed whitespace-pre-line">{message.text}</p>
                <p className={`text-xs mt-2 ${message.sender === 'user' ? 'text-black/60' : 'text-gray-500'}`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-tank-light px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-tank-light">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="flex-1 px-4 py-3 bg-tank-gray border border-tank-light rounded-xl text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tank-accent focus:border-transparent"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="p-3 bg-tank-accent text-black rounded-xl hover:bg-tank-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-3 text-center">
            Or email us at <a href="mailto:support@aimediatank.com" className="text-tank-accent hover:underline">support@aimediatank.com</a>
          </p>
        </div>
      </div>
    </div>
  )
}

