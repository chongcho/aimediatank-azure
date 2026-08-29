/** Gap between media grid cards (matches `0.625rem` in globals.css). */
export const MEDIA_GRID_GAP_PX = 10

/** Target minimum card width — more columns on narrower desktops, capped at max. */
export const MEDIA_GRID_MIN_CARD_PX = 280

export const MEDIA_GRID_MAX_COLUMNS = 6

/** Fluid column count from container width (home feed, profile, etc.). */
export function getMediaGridColumns(containerWidth: number): number {
  const w = Math.max(0, containerWidth)
  if (w < 640) return 1
  const cols = Math.floor((w + MEDIA_GRID_GAP_PX) / (MEDIA_GRID_MIN_CARD_PX + MEDIA_GRID_GAP_PX))
  return Math.max(1, Math.min(MEDIA_GRID_MAX_COLUMNS, cols))
}
