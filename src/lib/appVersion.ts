/** Baked at build time via next.config.js */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'
/** Short git commit SHA — user-facing release identifier. */
export const APP_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'dev'
export const APP_RELEASE_VERSION = APP_BUILD_ID
