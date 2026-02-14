#!/usr/bin/env node
/**
 * Azure startup wrapper: logs uncaught errors so they appear in Log stream
 * and makes exit code visible. Set Startup Command in Azure to: node run.js
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'production'

process.on('uncaughtException', (err) => {
  console.error('[azure-run] uncaughtException:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[azure-run] unhandledRejection:', reason)
  process.exit(1)
})

console.log('[azure-run] Starting server.js ...')
try {
  require('./server.js')
} catch (err) {
  console.error('[azure-run] Failed to load server:', err)
  process.exit(1)
}
