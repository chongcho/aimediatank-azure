'use client'

import { useEffect } from 'react'
import { installVideoCaptionGuard } from '@/lib/disableVideoTextTracks'

/** Globally suppress embedded video captions on all players (feed + detail). */
export default function VideoCaptionGuard() {
  useEffect(() => installVideoCaptionGuard(), [])
  return null
}
