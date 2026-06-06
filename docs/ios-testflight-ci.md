# iOS TestFlight via GitHub Actions

Build the Capacitor iOS app on **macos-26** (Xcode 26) and upload to **TestFlight** — no MacinCloud/Xcode upgrade needed.

Workflow: `.github/workflows/ios-testflight.yml` (manual **Run workflow** only).

## One-time setup

### 1. App Store Connect API key (upload)

1. [App Store Connect](https://appstoreconnect.apple.com) → **Users and Access** → **Integrations** → **App Store Connect API**
2. **+** → name e.g. `GitHub Actions` → **Admin** or **App Manager**
3. Download **`.p8`** (once) and note **Issuer ID** + **Key ID**

### 2. GitHub repository secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Value |
|--------|--------|
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Base64 of `AppleDistribution.p12` |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | `.p12` export password |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64 of `AiMediaTank_AppStore.mobileprovision` |
| `IOS_DEVELOPER_TEAM_ID` | `Q96PN3KKZW` (James Cho team) |
| `IOS_PROVISIONING_PROFILE_NAME` | `AiMediaTank AppStore` (exact name in Apple portal) |
| `APPSTORE_ISSUER_ID` | From App Store Connect API page |
| `APPSTORE_KEY_ID` | From the API key you created |
| `APPSTORE_PRIVATE_KEY` | Full contents of the API `.p8` file |

#### Encode cert/profile on Windows (PowerShell)

Save to a file first (avoids clipboard line-wrap corrupting the secret):

```powershell
$p12 = "C:\path\to\AppleDistribution.p12"
$profile = "C:\path\to\AiMediaTank_AppStore.mobileprovision"

[Convert]::ToBase64String([IO.File]::ReadAllBytes($p12)) | Set-Content -NoNewline cert.b64.txt
[Convert]::ToBase64String([IO.File]::ReadAllBytes($profile)) | Set-Content -NoNewline profile.b64.txt
```

Open each `.b64.txt` in Notepad → **Select All** → paste into the GitHub secret. Must be **one continuous line** with no spaces or line breaks.

### 3. App Store Connect app

Create app **AiMediaTank** with bundle ID **`com.aimediatank.apple`** if it does not exist yet.

## Run a build

1. GitHub → **Actions** → **iOS TestFlight** → **Run workflow**
2. Optional: change **capacitor_server_url** (default `https://aimediatank.com`)
3. Wait ~15–30 minutes (first run may resolve Swift packages)
4. App Store Connect → **TestFlight** → install on iPhone when processing completes

## After TestFlight install

1. Set Azure `APNS_BUNDLE_ID=com.aimediatank.apple` and other `APNS_*` vars
2. `npx prisma migrate deploy` if not done
3. Test voice call → lock-screen CallKit UI on **TestFlight app** (not Safari PWA)

## Troubleshooting

| Failure | Fix |
|---------|-----|
| `no member reject` / Capacitor Swift errors | Workflow must use `macos-26`; check **Select Xcode** step |
| Provisioning profile mismatch | `IOS_PROVISIONING_PROFILE_NAME` must match portal exactly; profile must be for `com.aimediatank.apple` |
| Upload rejected | App record in App Store Connect must use same bundle ID |
| API key upload error | `APPSTORE_PRIVATE_KEY` must include `BEGIN/END` lines; key needs App Manager+ role |
