import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell loads the deployed Next.js app (remote URL mode).
 * Override for local dev: CAPACITOR_SERVER_URL=http://YOUR_LAN_IP:3000
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://aimediatank.com'

const config: CapacitorConfig = {
  appId: 'com.aimediatank.apple',
  appName: 'AiMediaTank',
  webDir: 'public',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  plugins: {},
}

export default config
