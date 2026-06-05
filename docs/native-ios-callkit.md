# Native iOS voice calls (CallKit + PushKit)

AiMediaTank can ring on the **iPhone lock screen** when installed as a **native Capacitor app** from the App Store (not the home-screen PWA alone).

## Architecture

1. **Native shell** (`ios/`) loads the deployed site (`capacitor.config.ts` → `server.url`).
2. **PushKit** registers a VoIP device token → stored in `VoipPushToken` via `POST /api/push/voip-subscribe`.
3. On **incoming call**, the server sends:
   - Web Push (PWA fallback, silent on iOS)
   - **VoIP push** (`src/lib/voipPush.ts`) → CallKit full-screen incoming call UI
4. **Accept/Decline** on lock screen → `@kapsula-chat/capacitor-push-calls` → `useVoiceCall` → existing WebRTC flow.

## Prerequisites

- Mac with **Xcode 16+**
- **Apple Developer Program** membership
- App ID with **Push Notifications** + **Background Modes → Voice over IP**
- APNs **Auth Key** (.p8) from Apple Developer → Keys

## Azure / server environment variables

```env
APNS_TEAM_ID=XXXXXXXXXX
APNS_KEY_ID=XXXXXXXXXX
APNS_BUNDLE_ID=com.aimediatank.app
APNS_SIGNING_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
# Or: APNS_SIGNING_KEY_PATH=/path/to/AuthKey_XXXX.p8
APNS_PRODUCTION=false   # true for App Store / TestFlight production pushes
```

Run migration:

```bash
npx prisma migrate deploy
```

## Build the iOS app (on Mac)

```bash
npm install
npm run cap:sync
npm run cap:ios
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities**
2. Set your Team and bundle ID `com.aimediatank.app`
3. Add capabilities: **Push Notifications**, **Background Modes** → *Voice over IP*, *Audio*
4. Build to a **physical iPhone** (CallKit / PushKit do not work in Simulator for VoIP)

### Point at staging while testing

```bash
# PowerShell
$env:CAPACITOR_SERVER_URL="https://your-staging-url.azurewebsites.net"
npm run cap:sync
```

## Test flow

1. Install the native app on two iPhones (or one iPhone + desktop caller).
2. Sign in on the native app → allow notifications → use the app once (loads VoIP registration).
3. Confirm a row exists in `VoipPushToken` for that user.
4. Place a voice call from another account.
5. Callee should see **system incoming call UI** on the lock screen with ringtone.

## Troubleshooting

| Symptom | Check |
|--------|--------|
| No lock-screen ring | VoIP token in DB? APNS_* env vars set? TestFlight build uses `APNS_PRODUCTION=true`? |
| CallKit UI but no audio after accept | Microphone permission; WebRTC / staging URL reachable from device |
| VoIP push rejected by Apple | Payload must include valid UUID `callId`, `handle`, `displayName` |
| Still using PWA | Home-screen Safari PWA **cannot** use CallKit — install the **native app** |

## App Store notes

Apple requires VoIP pushes to be used for **real-time voice/video calls** only. Document this in App Review notes and Privacy Nutrition labels (microphone, push tokens).
