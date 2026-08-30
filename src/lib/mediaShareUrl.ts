const MEDIA_ID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Accept raw UUID or slug-prefixed share paths from `[mediaId]` routes. */
export function parseMediaIdFromRouteParam(param: string): string {
  const trimmed = param.trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed
  }
  const match = trimmed.match(MEDIA_ID_RE)
  return match ? match[0] : trimmed
}
