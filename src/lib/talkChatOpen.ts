/** Dispatched from homepage media cards (and elsewhere) to open the TalkChat panel in Navbar. */
export const OPEN_TALK_CHAT_EVENT = 'openTalkChat'

export function requestOpenTalkChat(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_TALK_CHAT_EVENT))
}
