# Android Closed Testing via GitHub Actions

Build the Capacitor Android app with the **AiMediaTank logo**, upload to **Google Play Closed testing** (track **AiMediaTank**), and email testers via **Firebase App Distribution** (TestFlight-style).

Workflow: `.github/workflows/android-internal.yml` → **Android Closed Testing** → **Run workflow** (manual).

## What each upload does

| Channel | Artifact | Tester experience |
|--------|----------|-------------------|
| **Play Closed testing** | `.aab` | Update in **Google Play Store** (no email per build) |
| **Firebase App Distribution** | `.apk` | **Email** + install/update via **Firebase App Tester** |

Play remains the store path. Firebase is the email notifier + quick install link (like TestFlight).

## One-time GitHub secrets

Repo → **Settings** → **Secrets and variables** → **Actions**

| Secret | Value |
|--------|--------|
| `ANDROID_KEYSTORE_BASE64` | Base64 of `aimediatank-release.jks` (see below) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | Key password (often same as keystore) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Full JSON from Google Cloud service account linked to Play Console |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Service account JSON with **Firebase App Distribution Admin** (same project as FCM; see below) |

If `FIREBASE_SERVICE_ACCOUNT_JSON` is missing, the workflow still uploads to Play and skips Firebase (with a warning).

### Encode the keystore (PowerShell)

```powershell
$jks = "C:\path\to\aimediatank-release.jks"
[Convert]::ToBase64String([IO.File]::ReadAllBytes($jks)) | Set-Content -NoNewline android-keystore.b64.txt
```

Paste the one-line contents of `android-keystore.b64.txt` into `ANDROID_KEYSTORE_BASE64`.

### Play Console service account

1. [Google Play Console](https://play.google.com/console) → **Setup** → **API access**
2. Link a Google Cloud project → create **Service account** with **Release to testing tracks** (or Admin)
3. Download JSON key → paste entire file into `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

### Firebase App Distribution (email testers)

Same Firebase project as FCM: **`aimediatank-20800`**.

1. [Firebase Console](https://console.firebase.google.com/) → project **aimediatank-20800** → **App Distribution**
2. Enable App Distribution for Android app `com.aimediatank.app`
3. **Testers & Groups** → create group alias **`closed-testers`**
4. Add tester emails to that group (they get an invite email once, then a new email on every CI upload)
5. [Google Cloud Console](https://console.cloud.google.com/) → project **aimediatank-20800** → **IAM & Admin** → **Service accounts**
6. Create (or reuse) a service account with role **Firebase App Distribution Admin**
7. Create a JSON key → paste entire file into GitHub secret `FIREBASE_SERVICE_ACCOUNT_JSON`

You can reuse the same JSON as Azure `FIREBASE_SERVICE_ACCOUNT_JSON` **only if** that account also has **Firebase App Distribution Admin**. Otherwise create a dedicated key for GitHub.

## Run a release

1. Bump **`android/version.properties`** → `VERSION_NAME` (single source of truth for Play + app Settings).
2. Commit and push to `main` (or run from that branch).
3. **Actions** → **Android Closed Testing** → **Run workflow**
4. Defaults:
   - `capacitor_server_url`: `https://aimediatank.com`
   - `play_track`: `AiMediaTank` (must match the Closed testing track name exactly)
   - `firebase_groups`: `closed-testers`
   - `release_notes`: shown in the Firebase email / App Tester
   - `skip_firebase_distribution`: `false` (set `true` for Play-only)
5. `versionCode` is set automatically from the workflow run number (`run_number + 10`; must always increase on Play)

## After upload — how testers update

### Via Firebase (email — closest to TestFlight)

1. Open the **new build email** from Firebase
2. Or open **Firebase App Tester** on the phone and install/update
3. First time: accept the invite and allow install from the Firebase link

### Via Play Store (Closed testing track)

1. Play Console → **Testing** → **Closed testing** → confirm new release is available
2. Testers use the **Closed testing opt-in link** (one-time)
3. Update from **Google Play Store** → **Updates**

Phone **Settings → Apps → AiMediaTank** version should match `VERSION_NAME` after install.

Home screen should show the **AiMediaTank logo** (not the default Capacitor icon).

## Local build (without CI)

```bash
npm install
npm run icons:generate
npm run cap:sync
```

Android Studio → **Build** → **Generate Signed Bundle / APK** → upload `.aab` to Closed testing manually.

## Troubleshooting

| Symptom | Check |
|--------|--------|
| Workflow fails at keystore step | Add all `ANDROID_*` secrets |
| Upload fails `403` (Play) | Service account invited in Play Console API access |
| Upload fails unknown track | Set `play_track` to the exact Closed testing track name in Play Console |
| `versionCode` already used | Re-run workflow (run number increases) or bump in `build.gradle` |
| Phone still on old Play version | Confirm Closed testing shows the new release; use Closed opt-in account; Update in Play Store |
| No Firebase email | Add `FIREBASE_SERVICE_ACCOUNT_JSON`; create group `closed-testers`; add tester emails; grant **Firebase App Distribution Admin** |
| Firebase upload `403` | Wrong GCP project, or service account missing App Distribution Admin |
| Old icon on phone | Uninstall app → reinstall from Play or Firebase after new release |
| Play vs Firebase both installed | Prefer one channel; uninstall the other to avoid duplicate apps |
