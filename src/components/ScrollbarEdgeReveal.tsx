'use client'

import { useEffect } from 'react'

/** Right-edge width (px): when mouse is in this strip, scrollbar thumb shows as active (green). */
const RIGHT_EDGE_PX = 48
const CLASS_NAME = 'scrollbar-active'

function clearActive(html: HTMLElement, body: HTMLElement) {
  html.classList.remove(CLASS_NAME)
  body.classList.remove(CLASS_NAME)
}

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
        clearActive(html, body)
      }
    }

    /** Deactivate when pointer leaves the document (e.g. moved to another monitor). */
    const handleLeave = () => clearActive(html, body)
    /** Deactivate when window loses focus (e.g. user clicked on another monitor). */
    const handleBlur = () => clearActive(html, body)

    window.addEventListener('mousemove', handleMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', handleLeave)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      document.documentElement.removeEventListener('mouseleave', handleLeave)
      window.removeEventListener('blur', handleBlur)
      clearActive(html, body)
    }
  }, [])

  return null
}
