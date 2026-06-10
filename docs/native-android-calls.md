# Native Android voice calls (FCM + ConnectionService)

AiMediaTank can ring on the **Android lock screen** when installed as the **native Capacitor app** from Google Play internal testing (not the home-screen PWA).

This mirrors the iPhone path documented in [native-ios-callkit.md](./native-ios-callkit.md).

## Architecture

1. **Native shell** (`android/`) loads the deployed site (`capacitor.config.ts` → `server.url`).
2. **FCM** registers a device token → stored in `VoipPushToken` with `platform=android` via `POST /api/push/voip-subscribe`.
3. On **incoming call**, the server sends:
   - Web Push (PWA fallback — unreliable on Android lock screen)
   - **FCM data push** (`type=call`) via `src/lib/fcmPush.ts` → Android **ConnectionService** incoming call UI
4. **Accept/Decline** on lock screen → `@kapsula-chat/capacitor-push-calls` → `useVoiceCall` → existing WebRTC flow.

## Prerequisites

- **Firebase project** with Cloud Messaging enabled
- Android app **`com.aimediatank.app`** registered in Firebase (matches Play Console draft)
- **`google-services.json`** in `android/app/`
- Google Play **internal testing** track (or sideload debug APK for dev)

## Azure / server environment variables

Add Firebase Admin credentials (service account JSON):

```env
# Inline JSON (escape newlines in private_key as \n)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",...}

# Or path on the build machine / Azure (less common)
# FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json
```

Existing APNS vars for iOS are unchanged. Voice calls use **both** paths when tokens exist.

## Build the Android app

```bash
npm install
npm run cap:sync
npm run cap:android
```

In Android Studio:

1. Open `android/`
2. Confirm **applicationId** `com.aimediatank.app` in `android/app/build.gradle`
3. Place **`google-services.json`** from Firebase in `android/app/`
4. Build → **Generate Signed Bundle / APK** (.aab for Play)

`MainActivity` registers the telecom phone account on startup (required for ConnectionService):

```kotlin
import com.capacitor.voipcalls.VoipConnectionService

override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    VoipConnectionService.registerPhoneAccount(this)
}
```

### Point at staging while testing

```powershell
$env:CAPACITOR_SERVER_URL="https://aimediatank-staging-gvg5drcbf2dpemh3.westus2-01.azurewebsites.net"
npm run cap:sync
```

## Test flow

1. Upload `.aab` to Play **Internal testing**; install on callee phone (YoungCloud).
2. Sign in once → allow notifications → confirm `VoipPushToken` row with `platform=android`.
3. Caller (LionKing) places voice call.
4. Callee should see **system incoming call UI** on lock screen (like KakaoTalk / phone app).

Optional server check:

```bash
node scripts/trace-voice-push.js LionKing YoungCloud
# Voip tokens section should show platform=android after sign-in
```

## Troubleshooting

| Symptom | Check |
|--------|--------|
| App icon tap, instant close | **MainActivity package** must match `applicationId` (`com.aimediatank.app`). Rebuild **1.0.5+** after `git pull`. Uninstall old app first. Update **Android System WebView** from Play Store. |
| Play shows "app has error" | Usually an old broken build still installed, or WebView disabled/outdated. Confirm version **1.0.5 (6)** under Settings → Apps → AiMediaTank. |
| No lock-screen ring | `VoipPushToken` with `platform=android`? **`FIREBASE_SERVICE_ACCOUNT_JSON` on production Azure** (`aimediatank-azure`)? App rebuilt with `google-services.json`? Disable battery optimization for AiMediaTank. |
| FCM trace shows `fcm_not_configured` | Add Firebase Admin JSON to **production** App Service → Configuration (same project as `google-services.json`: `aimediatank-20800`). |
| FCM trace shows `fcm_no_tokens` | Open native app, sign in as callee, allow notifications — confirm `VoipPushToken` row. |
| App closed, nothing on lock screen | Server FCM may succeed while **Samsung blocks delivery** — add AiMediaTank to **Never sleeping apps** (Battery → Background usage limits). Upload native **1.0.7+** (wake lock + MainActivity launch fix). After test call, trace should show `web_push_device_ack` with `fcm_received`. |
| FCM 201 but no UI | Install **native app**, not PWA. Phone account registered in `MainActivity`? |
| Call UI but no audio | Microphone permission; staging URL reachable from device |
| Caller cancel, UI stuck | Cancel uses FCM `action=cancel` (patched in `scripts/patch-android-fcm.js` on `npm install`) |

## PWA vs native

| Install | Lock-screen incoming call |
|---------|---------------------------|
| Chrome / home-screen PWA | **No** (Web Push does not wake SW when locked) |
| Play Store / internal test APK | **Yes** (FCM + ConnectionService) |

Users who need lock-screen calls on Android must install the **native app**, same as iPhone requires TestFlight/App Store instead of Safari PWA.

### Samsung: allow background FCM (required on many Galaxy phones)

1. **Settings → Battery and device care → Battery**
2. **Background usage limits** (or **More battery settings**)
3. **Never sleeping apps** → add **AiMediaTank**
4. Also: **Settings → Apps → AiMediaTank → Battery → Unrestricted**

Without this, FCM can show `ok: true` on the server but **never reach the phone** when the app is swiped away.
