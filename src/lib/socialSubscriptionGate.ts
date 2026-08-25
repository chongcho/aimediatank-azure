/** Shown when a free/guest user taps Talk, Chat, or other social actions. */
export const SOCIAL_SUBSCRIPTION_REQUIRED_MESSAGE =
  'Talk, Chat, and related social features are available to subscription members only. Please upgrade your membership to use them.'

export function isSocialSubscriberRole(role: string | null | undefined): boolean {
  return role === 'SUBSCRIBER' || role === 'ADMIN'
}

export function isSocialSubscriberMembership(membershipType: string | null | undefined): boolean {
  const t = (membershipType || '').trim().toUpperCase()
  return t === 'BASIC' || t === 'ADVANCED' || t === 'PREMIUM'
}
