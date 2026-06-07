# iOS TestFlight via GitHub Actions

Build the Capacitor iOS app and upload to **TestFlight**.

Workflow: `.github/workflows/ios-testflight.yml` (manual **Run workflow** only).

## Which runner to use

| Runner | When to use |
|--------|-------------|
| **self-hosted** (default) | **Recommended.** MacinCloud Mac registered as a GitHub Actions runner. |
| **github-hosted** | Fallback on `macos-26` (same `xcodebuild` limits as below). |

## Capacitor SPM vs CocoaPods

The repo must use **CocoaPods** for CI builds. Capacitor 8 defaults to **Swift Package Manager (SPM)**, but on MacinCloud/Xcode 26.5, `xcodebuild` crashes with **exit 133** (Trace/BPT trap) as soon as it loads the SPM `App.xcodeproj` — even in an interactive Terminal:

```bash
xcodebuild -list -project App.xcodeproj
# zsh: trace trap  xcodebuild ...
```

That is an SPM + `xcodebuild` issue on this Mac, not a GitHub Actions runner issue.

### Fix: migrate to CocoaPods (one time, on MacinCloud)

```bash
cd ~/actions-runner/_work/aimediatank-azure/aimediatank-azure
git pull
bash scripts/migrate-ios-to-cocoapods.sh
```

If the script ends with `xcodebuild -list` succeeding, commit and push the new `ios/` folder (Podfile, `App.xcworkspace`, etc.), then re-run **iOS TestFlight**.

Install CocoaPods first if needed: `brew install cocoapods`

### Alternative: Xcode GUI only

Open `ios/App/App.xcodeproj` in Xcode → **Product → Archive** → **Distribute App** → App Store Connect. Skip CI until CocoaPods migration is done.

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

### 4. Self-hosted runner on MacinCloud (recommended)

Register your MacinCloud Mac so builds run under a logged-in user session (avoids the headless `xcodebuild` crash).

#### Prerequisites on the Mac

- **Xcode 26.5** installed and selected:
  ```bash
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  xcodebuild -version   # should show 26.5
  sudo xcodebuild -license accept
  ```
- **Node.js 22** (workflow uses `npm ci`):
  ```bash
  brew install node@22
  ```
- Stay **logged in** to the Mac (do not log out — the runner needs an active user session).

#### Register the runner

1. GitHub repo → **Settings** → **Actions** → **Runners** → **New self-hosted runner**
2. Select **macOS** → **ARM64** (Apple Silicon) or **x64** to match your MacinCloud machine
3. On the MacinCloud Mac, create a folder and run the commands GitHub shows, for example:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-osx-arm64-2.XXX.X.tar.gz -L https://github.com/actions/runner/releases/download/v2.XXX.X/actions-runner-osx-arm64-2.XXX.X.tar.gz
tar xzf ./actions-runner-osx-arm64-2.XXX.X.tar.gz

./config.sh --url https://github.com/chongcho/aimediatank-azure --token <TOKEN_FROM_GITHUB> --labels self-hosted,macOS --name macincloud-ios
```

Use the exact download URL and token from the GitHub UI (they change per registration).

#### Start the runner (must run as the logged-in user)

Interactive (good for first test):

```bash
cd ~/actions-runner
./run.sh
```

Keep the Terminal window open. When a workflow runs, you will see job output here.

Persistent background service:

```bash
cd ~/actions-runner
./svc.sh install
./svc.sh start
./svc.sh status   # should show running
```

If `xcodebuild` still crashes with **exit 133**, stop the service and run the runner **interactively** in Terminal instead (keeps a full user session):

```bash
cd ~/actions-runner
./svc.sh stop
./run.sh
```

Leave that Terminal window open while builds run.

**Quick test on the Mac** (outside the runner) to confirm Xcode can load the project:

```bash
cd ~/actions-runner/_work/aimediatank-azure/aimediatank-azure/ios/App
xcodebuild -list -project App.xcodeproj
```

- If that **also** exits 133 in Terminal → archive in **Xcode GUI** (Product → Archive), then use a manual IPA upload.
- If it **works** in Terminal but fails in CI → use `./run.sh` (not `./svc.sh`).

#### Verify the runner appears

GitHub → **Settings** → **Actions** → **Runners** → should show **macincloud-ios** with labels `self-hosted`, `macOS`, and status **Idle**.

## Run a build

1. GitHub → **Actions** → **iOS TestFlight** → **Run workflow**
2. **runner**: leave as **self-hosted** (or pick **github-hosted** to retry on GitHub's Mac)
3. Optional: change **capacitor_server_url** (default `https://aimediatank.com`)
4. Wait ~15–30 minutes (first run may resolve Swift packages)
5. App Store Connect → **TestFlight** → install on iPhone when processing completes

## After TestFlight install

1. Set Azure `APNS_BUNDLE_ID=com.aimediatank.apple` and other `APNS_*` vars
2. `npx prisma migrate deploy` if not done
3. Test voice call → lock-screen CallKit UI on **TestFlight app** (not Safari PWA)

## Troubleshooting

| Failure | Fix |
|---------|-----|
| Job queued, never starts | Self-hosted runner offline — open MacinCloud, log in, run `./svc.sh start` or `./run.sh` |
| `no member reject` / Capacitor Swift errors | Xcode must be **26+**; run `xcodebuild -version` on the Mac |
| `exit code 133` / `trace trap` on `xcodebuild` | Capacitor **SPM** project — run `bash scripts/migrate-ios-to-cocoapods.sh` on MacinCloud |
| Workflow says "Run migrate-ios-to-cocoapods.sh" | `ios/` is still SPM — complete CocoaPods migration and push |
| Provisioning profile mismatch | `IOS_PROVISIONING_PROFILE_NAME` must match portal exactly; profile must be for `com.aimediatank.apple` |
| Upload rejected | App record in App Store Connect must use same bundle ID |
| API key upload error | `APPSTORE_PRIVATE_KEY` must include `BEGIN/END` lines; key needs App Manager+ role |
| Runner service stops after logout | Re-log into MacinCloud and run `./svc.sh start`; keep session active |
