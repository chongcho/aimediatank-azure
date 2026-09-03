# Apple App Store resubmission checklist

Use this after an App Store rejection. Code changes in this repo address most Guideline issues; complete the App Store Connect steps below before resubmitting.

## Code changes included

| Guideline | Fix |
|-----------|-----|
| **3.1.1 Payments** | Native iOS uses **Apple In-App Purchase** for memberships + paid media unlocks. Stripe remains for web and Android. Stripe checkout APIs stay blocked on native iOS. |
| **5.1.1 Account deletion** | Profile → Edit Profile → **Delete account** permanently deletes the user (not soft deactivate). |
| **1.2 UGC** | **Report** (media + chat) and **Block user** (instant feed/chat hide + admin report). |
| **2.1 Login on iPad** | Native auth session uses a reliable presentation anchor; login links use full-page navigation in the native shell. |
| **5 CallKit + China** | `isCallKitAllowed()` disables CallKit when App Store storefront is **CHN** or device region is **CN/CHN**. VoIP keeps working with in-app UI. Keep China listed; do not remove the territory. |

## App Store Connect — create IAP products (required before review)

Subscription group (e.g. `amt_membership`):

| Product ID | Type | List price (match Stripe) |
|------------|------|---------------------------|
| `com.aimediatank.apple.membership.basic.month` | Auto-renewable | $2 / month |
| `com.aimediatank.apple.membership.basic.year` | Auto-renewable | $20 / year |
| `com.aimediatank.apple.membership.advanced.month` | Auto-renewable | $5 / month |
| `com.aimediatank.apple.membership.advanced.year` | Auto-renewable | $50 / year |
| `com.aimediatank.apple.membership.premium.month` | Auto-renewable | $8 / month |
| `com.aimediatank.apple.membership.premium.year` | Auto-renewable | $80 / year |

Consumable media unlock tiers (nearest tier ≥ media price):

| Product ID | Price |
|------------|-------|
| `com.aimediatank.apple.media.unlock.099` | $0.99 |
| `com.aimediatank.apple.media.unlock.199` | $1.99 |
| `com.aimediatank.apple.media.unlock.299` | $2.99 |
| `com.aimediatank.apple.media.unlock.499` | $4.99 |
| `com.aimediatank.apple.media.unlock.999` | $9.99 |
| `com.aimediatank.apple.media.unlock.1999` | $19.99 |
| `com.aimediatank.apple.media.unlock.4999` | $49.99 |

Submit each IAP with the app binary (or “Ready to Submit”).

### Server env (Azure)

```
APPLE_BUNDLE_ID=com.aimediatank.apple
APPLE_IAP_ISSUER_ID=...
APPLE_IAP_KEY_ID=...
APPLE_IAP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Create an **In-App Purchase** key in App Store Connect → Users and Access → Integrations → In-App Purchase.

### Database

```bash
npx prisma migrate deploy
```

Migration: `20260903120000_apple_iap`

## Guideline 1.2 — UGC Safety (screen recording required)

Features in the app:

- **Terms:** Register requires a checked agreement; Login requires a checked agreement (zero-tolerance language). Terms §6.1: no tolerance, Report/Block, **24-hour** remove + eject.
- **Report:** Media page → **Report content**; TalkChat → long-press message → **Report**.
- **Block:** **Block user** — hides feed/chat immediately and notifies admin.
- **Filter:** Blocked users excluded from feed/chat APIs; automated content inspection where enabled.

### Physical iPhone recording (attach in App Review Information Notes)

1. Register or Login → check Terms + open Terms (show §6.1 if possible)  
2. Open media → Report content → submit  
3. Block user → confirm content disappears  
4. Optional: TalkChat long-press → Report / Block  

### Resolution Center reply — UGC (Guideline 1.2)

```
Guideline 1.2 precautions are implemented:

1) EULA / Terms — Required checkbox on Register and Login before account access. Terms §6.1 state zero tolerance for objectionable content and abusive users, and that we act on reports within 24 hours by removing content and ejecting the offending user.

2) Flag content — Report content on media pages; long-press a message in TalkChat → Report. Reports go to admin moderation.

3) Block users — Block user on media and TalkChat. Blocking immediately hides that user’s content from the blocker’s feed and chat and creates an admin report.

4) Filtering — Blocked users are excluded from the viewer’s feed and chat. Automated and manual moderation are used.

Screen recording on a physical device is attached in App Review Information Notes.
```

## Before resubmit — App Store Connect

1. **China / CallKit (Guideline 5)** — keep China available  
   - Ship a new iOS build with CallKit gated by StoreKit storefront `CHN` + locale `CN`/`CHN`  
   - In **App Review Information** and Resolution Center reply, confirm CallKit is off for China (template below)  
   - Optional fallback only: Pricing and Availability → remove **China**

2. **Age Rating (2.3.6)**  
   - App Information → Age Rating → set **Age Assurance** to **None**

3. **App Review Information**  
   - Demo account (VIEWER is enough for free UGC; or purchase Basic via sandbox IAP)  
   - Steps: Pricing → subscribe via IAP; media → Buy with IAP; TalkChat → Report/Block  
   - Note: CallKit disabled for China; iOS payments use Apple IAP only  
   - Attach **Guideline 1.2** screen recording (physical device)

4. **Screen recording (Guideline 1.2)** — see section above  

5. **New iOS build**  
   - Push to staging → Azure deploy  
   - Run **iOS TestFlight** workflow  
   - Attach new build + IAP products → Submit for Review

## Resolution Center reply — CallKit (Guideline 5)

```
CallKit is programmatically disabled for China App Store users. We detect China via:

1) StoreKit storefront country code CHN
2) Device locale region CN / CHN

When either matches, the app never presents CallKit UI. Voice/video (VoIP) still works with our in-app Accept/Decline UI only — no CallKit lock-screen or system calling UI.

CallKit remains enabled for all other territories. China remains an available App Store territory for this app.
```

## Resolution Center reply — Payments (Guideline 3.1.1)

```
The iOS app uses Apple In-App Purchase for digital goods:

• Memberships (Basic / Advanced / Premium, monthly and yearly)
• Paid media unlocks (consumable price-tier products)

Stripe checkout is disabled in the native iOS app. Web and Android continue to use Stripe. Content purchased on other platforms remains available in the iOS app under guideline 3.1.3(b) because the same digital goods are also offered via IAP.
```

## Review Notes template

```
Demo account: [email] / [password]

Account deletion: Profile menu → Edit Profile → Delete account (permanent).

UGC safety (Guideline 1.2):
- Login/Register: required Terms checkbox (zero tolerance + 24h moderation in Terms §6.1).
- Media: Safety section → Report content / Block user.
- TalkChat: long-press message → Report content / Block user.
Blocking hides content immediately; reports go to admin (act within 24 hours).
Attach physical-device screen recording in Notes.

Payments (3.1.1): iOS uses Apple IAP for memberships and paid media. Stripe is web/Android only.

CallKit (Guideline 5): Disabled when App Store storefront is CHN or device region is CN/CHN. VoIP continues in-app without CallKit UI.

Age Assurance: Set to None in Age Rating.
```
