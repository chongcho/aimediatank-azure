/** Gap between media grid cards (matches `0.625rem` in globals.css). */
export const MEDIA_GRID_GAP_PX = 10

/** Target minimum card width — more columns on narrower desktops, capped at max. */
export const MEDIA_GRID_MIN_CARD_PX = 280

export const MEDIA_GRID_MAX_COLUMNS = 6

/**
 * ~1080p-class desktop (e.g. 1920×1080 at 100% zoom): render feed tiles at ~80% of the
 * default column width by laying out as if the container were wider.
 */
export const MEDIA_GRID_DESKTOP_TILE_SCALE = 0.8

/** Allow extra columns when desktop tile scale is active (6 cols @ 100% → ~8 @ 80%). */
export const MEDIA_GRID_DESKTOP_MAX_COLUMNS = 10

function isDesktop1080ClassWidth(containerWidth: number): boolean {
  return containerWidth >= 1024 && containerWidth < 2200
}

/** Fluid column count from container width (home feed, profile, etc.). */
export function getMediaGridColumns(containerWidth: number): number {
  const w = Math.max(0, containerWidth)
  if (w < 640) return 1

  const baseCols = Math.floor(
    (w + MEDIA_GRID_GAP_PX) / (MEDIA_GRID_MIN_CARD_PX + MEDIA_GRID_GAP_PX),
  )
  const cappedBase = Math.max(1, Math.min(MEDIA_GRID_MAX_COLUMNS, baseCols))

  if (isDesktop1080ClassWidth(w) && cappedBase > 1) {
    const scaledCols = Math.min(
      MEDIA_GRID_DESKTOP_MAX_COLUMNS,
      Math.max(cappedBase + 1, Math.floor(cappedBase / MEDIA_GRID_DESKTOP_TILE_SCALE)),
    )
    return scaledCols
  }

  return cappedBase
}
