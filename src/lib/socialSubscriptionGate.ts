/** Shown when a free/guest user taps Talk, Chat, or other social actions. */
export const SOCIAL_SUBSCRIPTION_REQUIRED_MESSAGE =
  'Talk, Chat, and related social features are available to subscription members only. Please upgrade your membership to use them.'

/** Register link in the subscription prompt — membership plans. */
export const SOCIAL_SUBSCRIPTION_REGISTER_HREF = '/pricing'

export const OPEN_SOCIAL_SUBSCRIPTION_PROMPT_EVENT = 'open-social-subscription-prompt'

export type SocialSubscriptionAnchor = 'talk' | 'chat' | 'post'

export type SocialSubscriptionPromptDetail = {
  /** Prefer anchoring under this navbar control on desktop. */
  anchor?: SocialSubscriptionAnchor | null
}

export function openSocialSubscriptionPrompt(detail?: SocialSubscriptionPromptDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<SocialSubscriptionPromptDetail>(OPEN_SOCIAL_SUBSCRIPTION_PROMPT_EVENT, {
      detail: detail ?? {},
    }),
  )
}

export function isSocialSubscriberRole(role: string | null | undefined): boolean {
  return role === 'SUBSCRIBER' || role === 'ADMIN'
}

export function isSocialSubscriberMembership(membershipType: string | null | undefined): boolean {
  const t = (membershipType || '').trim().toUpperCase()
  return t === 'BASIC' || t === 'ADVANCED' || t === 'PREMIUM'
}
