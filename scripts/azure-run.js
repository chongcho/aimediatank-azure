#!/usr/bin/env node
/**
 * Azure startup wrapper: logs uncaught errors so they appear in Log stream
 * and makes exit code visible. Set Startup Command in Azure to: node run.js
 */
const path = require('path')
const fs = require('fs')

process.env.NODE_ENV = process.env.NODE_ENV || 'production'

process.on('uncaughtException', (err) => {
  console.error('[azure-run] uncaughtException:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[azure-run] unhandledRejection:', reason)
  process.exit(1)
})

// If 'next' is missing, list cwd and node_modules so Log stream shows what was deployed
function checkNextModule() {
  const cwd = process.cwd()
  const nm = path.join(cwd, 'node_modules')
  const nextPath = path.join(nm, 'next')
  if (!fs.existsSync(nextPath)) {
    console.error('[azure-run] Cannot find node_modules/next at', nextPath)
    try {
      console.error('[azure-run] cwd:', cwd)
      console.error('[azure-run] cwd contents:', fs.readdirSync(cwd).join(', '))
      if (fs.existsSync(nm)) {
        console.error('[azure-run] node_modules contents (first 30):', fs.readdirSync(nm).slice(0, 30).join(', '))
      } else {
        console.error('[azure-run] node_modules directory does not exist')
      }
    } catch (e) {
      console.error('[azure-run] list error:', e.message)
    }
    console.error('[azure-run] Fix: Ensure deployment includes full deploy folder with node_modules. See AZURE-DEPLOYMENT.md (Cannot find module next).')
    process.exit(1)
  }
}

checkNextModule()
console.log('[azure-run] Starting server.js ...')
try {
  require('./server.js')
} catch (err) {
  console.error('[azure-run] Failed to load server:', err)
  process.exit(1)
}
