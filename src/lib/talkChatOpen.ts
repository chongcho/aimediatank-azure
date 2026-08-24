/** Dispatched from homepage media cards (and elsewhere) to open the TalkChat panel in Navbar. */
export const OPEN_TALK_CHAT_EVENT = 'openTalkChat'

/** Open TalkChat voice panel (e.g. when a voice call becomes active). */
export const OPEN_VOICE_TALK_EVENT = 'openVoiceTalkPanel'

export function requestOpenTalkChat(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_TALK_CHAT_EVENT))
}

export function requestOpenVoiceTalkPanel(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_VOICE_TALK_EVENT))
}
