import { NextResponse } from 'next/server'

/**
 * Digital Asset Links for Android App Links.
 * Upload-key SHA-256 is from the Play-uploaded release AAB (upload signing key).
 * If Play App Signing uses a different app signing key, add that SHA-256 via
 * ANDROID_ASSETLINKS_SHA256 (comma-separated) in Azure App Settings.
 *
 * Play Console → Setup → App integrity → App signing → copy SHA-256
 * (or the whole Digital Asset Links JSON fingerprint list).
 */
const PACKAGE_NAME = 'com.aimediatank.app'

const BUILTIN_SHA256_FINGERPRINTS = [
  // Upload key (AiMediaTank release keystore / CI-signed AAB)
  'B4:DD:67:F8:DE:5E:0E:FB:61:44:0F:B6:11:86:DE:6F:96:79:C8:26:44:F2:FB:1C:D5:8A:10:56:71:E6:0B:69',
]

function collectFingerprints(): string[] {
  const fromEnv = (process.env.ANDROID_ASSETLINKS_SHA256 || '')
    .split(/[\s,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  const merged = [...BUILTIN_SHA256_FINGERPRINTS.map((s) => s.toUpperCase()), ...fromEnv]
  return [...new Set(merged)]
}

export function GET() {
  const fingerprints = collectFingerprints()
  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
