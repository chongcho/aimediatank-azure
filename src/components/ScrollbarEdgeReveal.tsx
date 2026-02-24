'use client'

import { useEffect } from 'react'

const EDGE_THRESHOLD_PX = 32
const CLASS_NAME = 'scrollbar-near-edge'

export default function ScrollbarEdgeReveal() {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body

    const handleMove = (e: MouseEvent) => {
      const nearRight = e.clientX >= window.innerWidth - EDGE_THRESHOLD_PX
      if (nearRight) {
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
