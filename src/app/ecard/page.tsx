'use client'

import Link from 'next/link'

export default function EcardPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-tank-dark/80 border border-tank-light rounded-2xl p-8 text-center space-y-6">
        <h1 className="text-2xl font-bold text-white">eCard</h1>
        <p className="text-gray-300">
          Open any media on the home feed, then click <strong className="text-white">Send card</strong> to create and send a celebration e-card by email or share link.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-tank-accent hover:bg-tank-accent/90 text-white font-medium rounded-lg transition-colors"
        >
          Browse media
        </Link>
      </div>
    </div>
  )
}
