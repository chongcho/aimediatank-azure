import { useEffect, useMemo, useState, type RefObject } from 'react'
import { getMediaGridColumns } from '@/lib/mediaGridLayout'

/** Tracks masonry/grid column count from container width; sets `--media-grid-cols` for CSS. */
export function useMediaGridColumns(gridRef: RefObject<HTMLElement | null>) {
  const [columns, setColumns] = useState(1)

  useEffect(() => {
    const updateColumns = () => {
      const w =
        gridRef.current?.clientWidth ??
        (typeof window !== 'undefined' ? window.innerWidth : 640)
      setColumns((prev) => {
        const next = getMediaGridColumns(w)
        return next !== prev ? next : prev
      })
    }

    updateColumns()
    const el = gridRef.current
    const ro = el ? new ResizeObserver(updateColumns) : null
    if (el) ro?.observe(el)
    window.addEventListener('resize', updateColumns)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', updateColumns)
    }
  }, [gridRef])

  const gridStyle = useMemo(
    () => ({ '--media-grid-cols': columns }) as React.CSSProperties,
    [columns],
  )

  return { columns, gridStyle }
}
