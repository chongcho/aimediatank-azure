/** Dispatched from homepage media cards (and elsewhere) to open the TalkChat panel in Navbar. */
export const OPEN_TALK_CHAT_EVENT = 'openTalkChat'

/** Open TalkChat voice panel (e.g. when a voice call becomes active). */
export const OPEN_VOICE_TALK_EVENT = 'openVoiceTalkPanel'

/** Close Talk/Chat panels (Navbar listens and dismisses overlays). */
export const CLOSE_TALK_CHAT_EVENT = 'closeTalkChat'

/** Expand a minimized Talk or Chat desktop panel (TalkChat listens per panel). */
export const RESTORE_TALK_CHAT_PANEL_EVENT = 'restoreTalkChatPanel'

/** Recompute minimized dock positions when either panel opens, closes, or resizes. */
export const TALKCHAT_DESKTOP_LAYOUT_EVENT = 'talkChatDesktopLayoutSync'

export const TALKCHAT_MINIMIZED_EDGE_INSET_PX = 12
export const TALKCHAT_MINIMIZED_GAP_PX = 12

/** Matches Tailwind `max-w-7xl` — primary app content column (navbar, profile, footer). */
export const APP_DISPLAY_MAX_WIDTH_PX = 1280

export const APP_DISPLAY_BOUNDS_SELECTOR = '[data-app-display-bounds]'

export type TalkChatPanelKind = 'chat' | 'voice'

export type TalkChatAppDisplayBounds = {
  left: number
  right: number
  width: number
}

/** Centered max-w-7xl column; measured from navbar when available. */
export function getTalkChatAppDisplayBounds(): TalkChatAppDisplayBounds {
  if (typeof window === 'undefined') {
    return { left: 0, right: APP_DISPLAY_MAX_WIDTH_PX, width: APP_DISPLAY_MAX_WIDTH_PX }
  }
  const el = document.querySelector(APP_DISPLAY_BOUNDS_SELECTOR)
  if (el instanceof HTMLElement) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) {
      return { left: rect.left, right: rect.right, width: rect.width }
    }
  }
  const vw = window.innerWidth
  const width = Math.min(APP_DISPLAY_MAX_WIDTH_PX, vw)
  const left = Math.max(0, (vw - width) / 2)
  return { left, right: left + width, width }
}

/** Keep floating desktop panels inside the app content column. */
export function clampTalkChatDesktopPanelPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  minY: number,
): { x: number; y: number } {
  const bounds = getTalkChatAppDisplayBounds()
  const minX = bounds.left
  const maxX = Math.max(minX, bounds.right - width)
  const maxY = Math.max(minY, window.innerHeight - height)
  return {
    x: Math.max(minX, Math.min(x, maxX)),
    y: Math.max(minY, Math.min(y, maxY)),
  }
}

/** Above navbar (100010) and feed chrome; below navbar dropdowns and voice-call popup. */
export const TALKCHAT_DESKTOP_Z_BACK = 100025
export const TALKCHAT_DESKTOP_Z_FRONT = 100026

/** Navbar dropdowns / notifications — above Talk/Chat; below voice-call popup (100050). */
export const NAVBAR_DROPDOWN_Z_INDEX = 100040
export const NAVBAR_DROPDOWN_PANEL_Z_INDEX = 100041

const DESKTOP_PANEL_STATE_KEY = 'talkChatDesktopPanels'

export type TalkChatDesktopPanelState = {
  chatPanelOpen: boolean
  voicePanelOpen: boolean
  frontPanel: 'chat' | 'voice' | null
}

const TALK_CHAT_URL_PARAMS = [
  'openChat',
  'conversationId',
  'chatUserId',
  'voiceIncoming',
  'callId',
] as const

export function requestOpenTalkChat(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_TALK_CHAT_EVENT))
}

export function requestOpenVoiceTalkPanel(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_VOICE_TALK_EVENT))
}

export function requestCloseTalkChat(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CLOSE_TALK_CHAT_EVENT))
}

export function readTalkChatPanelMinimized(panel: TalkChatPanelKind): boolean {
  if (typeof window === 'undefined') return false
  const key = panel === 'voice' ? 'talkVoicePanelSize' : 'talkChatPanelSize'
  const raw =
    localStorage.getItem(key) ??
    (panel === 'chat' ? localStorage.getItem('talkChatSize') : null)
  return raw === 'min'
}

export function requestRestoreTalkChatPanel(panel: TalkChatPanelKind): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(RESTORE_TALK_CHAT_PANEL_EVENT, { detail: { panel } }),
  )
}

export function requestTalkChatDesktopLayoutSync(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(TALKCHAT_DESKTOP_LAYOUT_EVENT))
}

export function readTalkChatPanelWidth(panel: TalkChatPanelKind, viewportWidth: number): number {
  const sizeKey = panel === 'voice' ? 'talkChatVoiceCustomSize' : 'talkChatCustomSize'
  const fallback =
    panel === 'voice'
      ? getTalkVoiceDesktopDefaultWidth(viewportWidth)
      : Math.min(500, getTalkChatDesktopMaxWidth(viewportWidth))
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(sizeKey)
    if (raw) {
      const parsed = JSON.parse(raw) as { width?: number }
      if (typeof parsed.width === 'number' && parsed.width > 0) return parsed.width
    }
  } catch {
    /* ignore */
  }
  return fallback
}

export type TalkChatMinimizedDockLayout = {
  chatX: number
  voiceX: number
  chatWidth: number
  voiceWidth: number
}

/** Side-by-side minimized Chat (left) and Talk (right) without overlap. */
export function getTalkChatMinimizedDockLayout(
  bounds: TalkChatAppDisplayBounds = getTalkChatAppDisplayBounds(),
): TalkChatMinimizedDockLayout {
  const edge = TALKCHAT_MINIMIZED_EDGE_INSET_PX
  const gap = TALKCHAT_MINIMIZED_GAP_PX
  let chatWidth = readTalkChatPanelWidth('chat', bounds.width)
  let voiceWidth = readTalkChatPanelWidth('voice', bounds.width)
  const available = Math.max(0, bounds.width - edge * 2 - gap)

  if (chatWidth + voiceWidth > available && available > 0) {
    const scale = available / (chatWidth + voiceWidth)
    chatWidth = Math.max(280, Math.floor(chatWidth * scale))
    voiceWidth = Math.max(280, Math.floor(voiceWidth * scale))
    const total = chatWidth + voiceWidth
    if (total > available) {
      const excess = total - available
      if (chatWidth >= voiceWidth) {
        chatWidth = Math.max(280, chatWidth - excess)
      } else {
        voiceWidth = Math.max(280, voiceWidth - excess)
      }
    }
  }

  return {
    chatX: bounds.left + edge,
    voiceX: bounds.left + bounds.width - voiceWidth - edge,
    chatWidth,
    voiceWidth,
  }
}

export type TalkChatMinimizedPanelRect = {
  x: number
  width: number
}

function talkChatPanelPositionKey(panel: TalkChatPanelKind): string {
  return panel === 'voice' ? 'talkChatVoicePosition' : 'talkChatPosition'
}

/** Live minimized bar rect from the portaled TalkChat container. */
export function readTalkChatMinimizedPanelRectFromDom(
  panel: TalkChatPanelKind,
): TalkChatMinimizedPanelRect | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector(
    `.talkchat-container[data-talkchat-panel="${panel}"]`,
  )
  if (!(el instanceof HTMLElement)) return null
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return null
  return { x: rect.left, width: rect.width }
}

export function readTalkChatMinimizedPanelRect(
  panel: TalkChatPanelKind,
  bounds: TalkChatAppDisplayBounds = getTalkChatAppDisplayBounds(),
): TalkChatMinimizedPanelRect | null {
  if (!readTalkChatPanelMinimized(panel)) return null
  const fromDom = readTalkChatMinimizedPanelRectFromDom(panel)
  if (fromDom) return fromDom

  const width = readTalkChatPanelWidth(panel, bounds.width)
  const posKey = talkChatPanelPositionKey(panel)
  try {
    const raw = localStorage.getItem(posKey)
    if (raw) {
      const pos = JSON.parse(raw) as { x?: number }
      if (typeof pos.x === 'number') return { x: pos.x, width }
    }
  } catch {
    /* ignore */
  }

  const dock = getTalkChatMinimizedDockLayout(bounds)
  if (panel === 'chat') return { x: dock.chatX, width: dock.chatWidth }
  return { x: dock.voiceX, width: dock.voiceWidth }
}

function minimizedRectsOverlap(
  aLeft: number,
  aWidth: number,
  bLeft: number,
  bWidth: number,
  gap: number = TALKCHAT_MINIMIZED_GAP_PX,
): boolean {
  const aRight = aLeft + aWidth
  const bRight = bLeft + bWidth
  return !(aRight + gap <= bLeft || aLeft >= bRight + gap)
}

function resolveMinimizedPanelOverlapX(
  x: number,
  width: number,
  other: TalkChatMinimizedPanelRect,
  minX: number,
  maxX: number,
): number {
  const gap = TALKCHAT_MINIMIZED_GAP_PX
  const clamped = Math.max(minX, Math.min(x, maxX))
  if (!minimizedRectsOverlap(clamped, width, other.x, other.width, gap)) {
    return clamped
  }

  const otherRight = other.x + other.width
  const leftOption = Math.max(minX, Math.min(other.x - width - gap, maxX))
  const rightOption = Math.max(minX, Math.min(otherRight + gap, maxX))

  const leftValid = !minimizedRectsOverlap(leftOption, width, other.x, other.width, gap)
  const rightValid = !minimizedRectsOverlap(rightOption, width, other.x, other.width, gap)

  if (leftValid && rightValid) {
    return Math.abs(clamped - leftOption) <= Math.abs(clamped - rightOption)
      ? leftOption
      : rightOption
  }
  if (leftValid) return leftOption
  if (rightValid) return rightOption
  return Math.abs(clamped - minX) <= Math.abs(clamped - maxX) ? minX : maxX
}

/** Prevent minimized Chat/Talk header bars from overlapping when dragged. */
export function clampTalkChatMinimizedPanelX(
  panel: TalkChatPanelKind,
  proposedX: number,
  width: number,
  otherPanelOpen: boolean,
): number {
  const bounds = getTalkChatAppDisplayBounds()
  const minX = bounds.left
  const maxX = Math.max(minX, bounds.right - width)

  if (!otherPanelOpen) {
    return Math.max(minX, Math.min(proposedX, maxX))
  }

  const otherPanel: TalkChatPanelKind = panel === 'chat' ? 'voice' : 'chat'
  if (!readTalkChatPanelMinimized(otherPanel)) {
    return Math.max(minX, Math.min(proposedX, maxX))
  }

  const other = readTalkChatMinimizedPanelRect(otherPanel, bounds)
  if (!other) {
    return Math.max(minX, Math.min(proposedX, maxX))
  }

  return resolveMinimizedPanelOverlapX(proposedX, width, other, minX, maxX)
}

export function isTalkChatDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth >= 768
}

/** Narrow desktop: dock panels to sides so the feed stays visible (e.g. 1920×1080). */
export function isTalkChatNarrowDesktop(viewportWidth: number): boolean {
  return viewportWidth >= 768 && viewportWidth < 2200
}

/** Default centered Chat panel max width — scales down on smaller desktops. */
export function getTalkChatDesktopMaxWidth(viewportWidth: number): number {
  return Math.min(1000, Math.max(360, Math.round(viewportWidth * 0.42)))
}

/** Default Talk panel width before user resize. */
export function getTalkVoiceDesktopDefaultWidth(viewportWidth: number): number {
  return Math.min(500, Math.max(300, Math.round(viewportWidth * 0.26)))
}

export type TalkChatDesktopSizePreset = 'tall' | 'max' | 'medium' | 'min'

/** Matches desktop navbar height (`h-16`). */
export const TALKCHAT_DESKTOP_NAVBAR_BOTTOM_PX = 64

/** Keep floating panel bottom above viewport edge (e.g. 1920×1080 + taskbar). */
export const TALKCHAT_DESKTOP_BOTTOM_INSET_PX = 12

/** Max panel height that fits below the navbar with a bottom inset. */
export function getTalkChatDesktopMaxPanelHeightPx(
  viewportHeight: number,
  navbarBottomPx: number = TALKCHAT_DESKTOP_NAVBAR_BOTTOM_PX,
): number {
  return Math.max(
    240,
    viewportHeight - navbarBottomPx - TALKCHAT_DESKTOP_BOTTOM_INSET_PX,
  )
}

export function clampTalkChatDesktopPanelHeightPx(
  heightPx: number,
  viewportHeight: number,
  navbarBottomPx: number = TALKCHAT_DESKTOP_NAVBAR_BOTTOM_PX,
): number {
  return Math.min(heightPx, getTalkChatDesktopMaxPanelHeightPx(viewportHeight, navbarBottomPx))
}

/** Viewport-aware panel height (px) for floating desktop panels. */
export function getTalkChatDesktopPanelHeightPx(
  size: TalkChatDesktopSizePreset,
  viewportHeight: number,
  viewportWidth: number,
  navbarBottomPx: number = TALKCHAT_DESKTOP_NAVBAR_BOTTOM_PX,
): number {
  if (size === 'min') return 72
  const narrow = viewportWidth < 2100
  const fraction =
    size === 'tall'
      ? narrow
        ? 0.52
        : 0.63
      : size === 'max'
        ? narrow
          ? 0.29
          : 0.36
        : narrow
          ? 0.22
          : 0.27
  const raw = Math.round(viewportHeight * fraction)
  return clampTalkChatDesktopPanelHeightPx(raw, viewportHeight, navbarBottomPx)
}

export function readTalkChatDesktopPanelState(): TalkChatDesktopPanelState | null {
  if (!isTalkChatDesktopViewport()) return null
  try {
    const raw = window.sessionStorage.getItem(DESKTOP_PANEL_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TalkChatDesktopPanelState
    if (typeof parsed !== 'object' || parsed === null) return null
    return {
      chatPanelOpen: Boolean(parsed.chatPanelOpen),
      voicePanelOpen: Boolean(parsed.voicePanelOpen),
      frontPanel:
        parsed.frontPanel === 'chat' || parsed.frontPanel === 'voice'
          ? parsed.frontPanel
          : null,
    }
  } catch {
    return null
  }
}

/** Sync init for Navbar — avoids a persist effect clearing sessionStorage before hydrate runs. */
export function readInitialTalkChatDesktopPanelState(): TalkChatDesktopPanelState {
  const saved = readTalkChatDesktopPanelState()
  return {
    chatPanelOpen: saved?.chatPanelOpen ?? false,
    voicePanelOpen: saved?.voicePanelOpen ?? false,
    frontPanel: saved?.frontPanel ?? null,
  }
}

export function writeTalkChatDesktopPanelState(state: TalkChatDesktopPanelState): void {
  if (!isTalkChatDesktopViewport()) return
  try {
    if (!state.chatPanelOpen && !state.voicePanelOpen) {
      window.sessionStorage.removeItem(DESKTOP_PANEL_STATE_KEY)
      return
    }
    window.sessionStorage.setItem(DESKTOP_PANEL_STATE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function clearTalkChatDesktopPanelState(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(DESKTOP_PANEL_STATE_KEY)
  } catch {
    /* ignore */
  }
}

/** Remove chat/voice deep-link query params so home navigation does not reopen TalkChat. */
export function stripTalkChatDeepLinkParams(): boolean {
  if (typeof window === 'undefined') return false
  const url = new URL(window.location.href)
  let changed = false
  for (const key of TALK_CHAT_URL_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }
  if (!changed) return false
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', next)
  return true
}
