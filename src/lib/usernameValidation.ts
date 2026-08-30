export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 30
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,30}$/

export const USERNAME_HINT =
  '3–30 characters; letters, numbers, underscores, or hyphens only'

export const USERNAME_TOO_SHORT_MESSAGE = `Nickname must be at least ${USERNAME_MIN_LENGTH} characters`

export const USERNAME_FORMAT_MESSAGE =
  'Nickname must be 3–30 characters and use only letters, numbers, underscores, or hyphens'

export const USERNAME_TAKEN_MESSAGE = 'This Nickname is already taken'

export const USERNAME_AVAILABLE_MESSAGE = 'Nickname is available'

export const USERNAME_REQUIRED_MESSAGE = 'Nickname is required'

export const USERNAME_CHECKING_MESSAGE = 'Checking nickname availability…'

export function validateUsernameFormat(username: string): {
  valid: boolean
  message: string
} {
  if (!username) {
    return { valid: false, message: USERNAME_REQUIRED_MESSAGE }
  }
  if (username.length < USERNAME_MIN_LENGTH) {
    return { valid: false, message: USERNAME_TOO_SHORT_MESSAGE }
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { valid: false, message: USERNAME_FORMAT_MESSAGE }
  }
  return { valid: true, message: '' }
}

export function usernameSubmitErrorMessage(status: {
  checking?: boolean
  valid: boolean | null
  available: boolean | null
  message: string
}): string {
  if (status.checking) return USERNAME_CHECKING_MESSAGE
  if (status.message) return status.message
  if (status.available === false) return USERNAME_TAKEN_MESSAGE
  if (status.valid === false) return USERNAME_FORMAT_MESSAGE
  return USERNAME_REQUIRED_MESSAGE
}
