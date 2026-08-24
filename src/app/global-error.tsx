'use client'

import { useEffect } from 'react'
import {
  installChunkLoadRecovery,
  isChunkLoadFailure,
  recoverFromStaleChunk,
} from '@/lib/chunkLoadRecovery'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    installChunkLoadRecovery()
    if (isChunkLoadFailure(error.message, error.name)) {
      recoverFromStaleChunk()
    }
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center max-w-md space-y-4">
          <p className="text-lg">Something went wrong.</p>
          <button
            type="button"
            className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
            onClick={() => reset()}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
