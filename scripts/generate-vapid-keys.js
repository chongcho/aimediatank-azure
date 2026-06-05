#!/usr/bin/env node
/**
 * Generate VAPID keys for Web Push (PWA incoming voice call alerts).
 * Add to Azure App Settings:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT (optional, e.g. mailto:you@example.com)
 */
const webpush = require('web-push')
const keys = webpush.generateVAPIDKeys()
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey)
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey)
console.log('VAPID_SUBJECT=mailto:support@aimediatank.com')
