'use client'

import { useEffect } from 'react'
import { installChunkLoadRecovery } from '@/lib/chunkLoadRecovery'

/** Soft-nav / hydration backup when an early inline installer did not run. */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    installChunkLoadRecovery()
  }, [])

  return null
}
