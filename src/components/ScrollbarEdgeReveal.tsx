'use client'

import { useEffect } from 'react'

/** Right-edge width (px): when mouse is in this strip, scrollbar thumb shows as active (green). */
const RIGHT_EDGE_PX = 48
const CLASS_NAME = 'scrollbar-active'

export default function ScrollbarEdgeReveal() {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body

    const handleMove = (e: MouseEvent) => {
      const inRightEdge = e.clientX >= window.innerWidth - RIGHT_EDGE_PX
      if (inRightEdge) {
        html.classList.add(CLASS_NAME)
        body.classList.add(CLASS_NAME)
      } else {
        html.classList.remove(CLASS_NAME)
        body.classList.remove(CLASS_NAME)
      }
    }

    window.addEventListener('mousemove', handleMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handleMove)
      html.classList.remove(CLASS_NAME)
      body.classList.remove(CLASS_NAME)
    }
  }, [])

  return null
}
