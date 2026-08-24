/** Dispatched from homepage media cards (and elsewhere) to open the TalkChat panel in Navbar. */
export const OPEN_TALK_CHAT_EVENT = 'openTalkChat'

/** Close Talk/Voice panels so the feed stays visible (e.g. during an active call overlay). */
export const CLOSE_TALK_CHAT_EVENT = 'closeTalkChat'

export function requestOpenTalkChat(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_TALK_CHAT_EVENT))
}

export function requestCloseTalkChatPanels(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CLOSE_TALK_CHAT_EVENT))
}
