/** Dispatched from homepage media cards (and elsewhere) to open the TalkChat panel in Navbar. */
export const OPEN_TALK_CHAT_EVENT = 'openTalkChat'

/** Open TalkChat voice panel (e.g. when a voice call becomes active). */
export const OPEN_VOICE_TALK_EVENT = 'openVoiceTalkPanel'

/** Close Talk/Chat panels (Navbar listens and dismisses overlays). */
export const CLOSE_TALK_CHAT_EVENT = 'closeTalkChat'

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

/** Viewport-aware panel height (px) for floating desktop panels. */
export function getTalkChatDesktopPanelHeightPx(
  size: TalkChatDesktopSizePreset,
  viewportHeight: number,
  viewportWidth: number,
): number {
  if (size === 'min') return 72
  const narrow = viewportWidth < 2100
  const fraction =
    size === 'tall'
      ? narrow
        ? 0.58
        : 0.7
      : size === 'max'
        ? narrow
          ? 0.32
          : 0.4
        : narrow
          ? 0.24
          : 0.3
  return Math.round(viewportHeight * fraction)
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
