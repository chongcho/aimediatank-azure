'use client'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function SupportPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userName = session?.user?.username || session?.user?.name || 'Guest'

  return (
    <div className="max-w-md mx-auto p-0 m-0 pb-[500px] pt-[25px]">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1" />
        <h1 className="text-[18px] font-bold">Support</h1>
        <div className="flex-1 flex justify-end">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>

      <div className="bg-tank-dark border border-tank-light rounded-2xl shadow-2xl overflow-hidden">
        {/* Top Label Bar - User Chat Service */}
        <div className="bg-gradient-to-r from-tank-accent via-emerald-500 to-teal-500 px-4 py-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="font-bold text-black text-sm tracking-wide">USER SUPPORT SERVICE</span>
          </div>
        </div>

        {/* Header */}
        <div className="bg-gradient-to-r from-tank-dark to-tank-gray px-4 py-4 border-b border-tank-light flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-white text-lg">Email Support</h3>
            <p className="text-sm text-gray-400">We&apos;re here to help!</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-300 mb-4">
            Hello <span className="text-tank-accent font-semibold">{userName}</span>! 👋
          </p>
          <p className="text-gray-400 text-sm mb-6">
            Have a question or need assistance? Send us an email and we&apos;ll get back to you as soon as possible.
          </p>

          {/* Email Info */}
          <div className="bg-tank-gray rounded-xl p-4 mb-6">
            <p className="text-xs text-gray-500 mb-1">Contact Email</p>
            <p className="text-lg font-semibold text-tank-accent">support@aimediatank.com</p>
          </div>

          {/* Response Time */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Typical response time: within 24 hours</span>
          </div>

          {/* Send Email Button */}
          <a
            href="mailto:support@aimediatank.com"
            className="block w-full py-3 bg-tank-accent text-black font-semibold text-center rounded-xl hover:bg-tank-accent/90 transition-colors"
          >
            Send Email
          </a>
        </div>
      </div>
    </div>
  )
}

