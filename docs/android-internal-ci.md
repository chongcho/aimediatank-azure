# Android Internal Testing via GitHub Actions

Build the Capacitor Android app with the **AiMediaTank logo** and upload to **Google Play Internal testing**.

Workflow: `.github/workflows/android-internal.yml` → **Run workflow** (manual).

## One-time GitHub secrets

Repo → **Settings** → **Secrets and variables** → **Actions**

| Secret | Value |
|--------|--------|
| `ANDROID_KEYSTORE_BASE64` | Base64 of `aimediatank-release.jks` (see below) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | Key password (often same as keystore) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Full JSON from Google Cloud service account linked to Play Console |

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

## Run a release

1. **Actions** → **Android Internal Testing** → **Run workflow**
2. Default `capacitor_server_url`: `https://aimediatank.com`
3. Default `version_name`: `1.0.10` (bump when needed)
4. `versionCode` is set automatically from the workflow run number (must always increase)

## After upload

1. Play Console → **Testing** → **Internal testing** → confirm new release
2. Testers (e.g. `youngkcloud@gmail.com`) open the **opt-in link** → update from Play Store
3. Home screen should show the **AiMediaTank logo** (not the default Capacitor icon)

## Local build (without CI)

```bash
npm install
npm run icons:generate
npm run cap:sync
```

Android Studio → **Build** → **Generate Signed Bundle / APK** → upload `.aab` to Internal testing manually.

## Troubleshooting

| Symptom | Check |
|--------|--------|
| Workflow fails at keystore step | Add all `ANDROID_*` secrets |
| Upload fails `403` | Service account invited in Play Console API access |
| `versionCode` already used | Re-run workflow (run number increases) or bump in `build.gradle` |
| Old icon on phone | Uninstall app → reinstall from Play after new internal release |
