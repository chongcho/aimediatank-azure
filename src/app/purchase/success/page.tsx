'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [loading, setLoading] = useState(true)
  const [purchase, setPurchase] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (sessionId) {
      verifyPurchase()
    } else {
      setLoading(false)
      setError('No session ID provided')
    }
  }, [sessionId])

  const verifyPurchase = async () => {
    try {
      const res = await fetch(`/api/purchase/verify?session_id=${sessionId}`)
      const data = await res.json()

      if (res.ok) {
        setPurchase(data.purchase)
      } else {
        setError(data.error || 'Failed to verify purchase')
      }
    } catch (error) {
      setError('Failed to verify purchase')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" />
          <p className="text-gray-400">Verifying your purchase...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <Link href="/" className="btn-primary">
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4">
      <div className="text-center max-w-md">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center animate-bounce">
          <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold mb-2">Purchase Successful!</h1>
        <p className="text-gray-400 mb-8">
          Thank you for your purchase. You now have access to this content.
        </p>

        {purchase && (
          <div className="bg-tank-gray rounded-xl p-6 mb-8 text-left">
            <h3 className="font-semibold mb-4">Purchase Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Item</span>
                <span className="font-medium">{purchase.media?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount</span>
                <span className="font-medium text-tank-accent">${purchase.amount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                  Completed
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          {purchase?.media && (
            <a
              href={`/api/download/${purchase.media.id}`}
              className="flex-1 btn-primary flex items-center justify-center gap-2"
              download
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Content
            </a>
          )}
          <Link href="/" className="flex-1 btn-secondary">
            Browse More
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function PurchaseSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}






