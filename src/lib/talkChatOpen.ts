/** Dispatched from homepage media cards (and elsewhere) to open the TalkChat panel in Navbar. */
export const OPEN_TALK_CHAT_EVENT = 'openTalkChat'

/** Open TalkChat voice panel (e.g. when a voice call becomes active). */
export const OPEN_VOICE_TALK_EVENT = 'openVoiceTalkPanel'

/** Close Talk/Chat panels (Navbar listens and dismisses overlays). */
export const CLOSE_TALK_CHAT_EVENT = 'closeTalkChat'

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
