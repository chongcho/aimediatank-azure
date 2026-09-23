# Apple App Store resubmission checklist

Use this after an App Store rejection. Code changes in this repo address most Guideline issues; complete the App Store Connect steps below before resubmitting.

## Code changes included

| Guideline | Fix |
|-----------|-----|
| **3.1.1 Payments** | Native iOS uses **Apple In-App Purchase** only for memberships + paid media. Stripe APIs return 403 on native iOS. Pricing/FAQ/copy on iOS do not mention Stripe. Batch checkout disabled on iOS. Stripe remains for web and Android. |
| **5.1.1 Account deletion** | Profile → Edit Profile → **Delete account** permanently deletes the user (not soft deactivate). |
| **1.2 UGC** | **Report** (TalkChat long-press); media **Save to My Contents** + **Block content** (inline next to Created by — no flag menu); TalkChat **Block user**. |
| **2.1 Login on iPad** | Native auth session uses a reliable presentation anchor; login links use full-page navigation in the native shell. |
| **2.1(a) Sign in with Apple** | Entra `domain_hint` uses lowercase `apple` (not `Apple`) + `prompt=login`; iOS `ASWebAuthenticationSession` is ephemeral so Safari Google SSO cannot hijack Apple. |
| **2.3.6 Age Rating** | Social Media + UGC + Age Assurance + Social disabled under 13 all **Yes** (ASC requires Age Assurance when social is disabled under 13). Age Assurance = Declared Age Range API + birthday gate — document how to locate in Review Notes. |
| **5 CallKit + China** | Talk button hidden for China (storefront **CHN** / region **CN\|CHN**). CallKit is **not active** there — no PushKit VoIP registration, no CallKit UI, no alternate in-app call UI. Outside China: single CallKit call stack. Chat remains available. Keep China listed. |

## App Store Connect — create IAP products (required before review)

Subscription group (e.g. `amt_membership`):

| Product ID | Type | List price (match Stripe) |
|------------|------|---------------------------|
| `com.aimediatank.apple.membership.basic.month.v2` | Auto-renewable | $1.99 / month |
| `com.aimediatank.apple.membership.basic.year.v2` | Auto-renewable | $19.99 / year |
| `com.aimediatank.apple.membership.advanced.month.v2` | Auto-renewable | $4.99 / month |
| `com.aimediatank.apple.membership.advanced.year.v2` | Auto-renewable | $49.99 / year |
| `com.aimediatank.apple.membership.premium.month.v2` | Auto-renewable | $7.99 / month |
| `com.aimediatank.apple.membership.premium.year.v2` | Auto-renewable | $79.99 / year |

(Original IDs without `.v2` were deleted in ASC; Apple does not allow reuse, so the app uses `.v2`.)

Consumable media unlock tiers (lowest tier ≥ media price; max $9.99 for now):

| Product ID | Price |
|------------|-------|
| `com.aimediatank.apple.media.unlock.099` | $0.99 |
| `com.aimediatank.apple.media.unlock.199` | $1.99 |
| `com.aimediatank.apple.media.unlock.299` | $2.99 |
| `com.aimediatank.apple.media.unlock.399` | $3.99 |
| `com.aimediatank.apple.media.unlock.499` | $4.99 |
| `com.aimediatank.apple.media.unlock.599` | $5.99 |
| `com.aimediatank.apple.media.unlock.699` | $6.99 |
| `com.aimediatank.apple.media.unlock.799` | $7.99 |
| `com.aimediatank.apple.media.unlock.899` | $8.99 |
| `com.aimediatank.apple.media.unlock.999` | $9.99 |

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

Migration: `20260903120000_apple_iap` (and later UGC migrations including `20260907140000_media_blocks`)

## Guideline 1.2 — UGC Safety (screen recording required)

Features in the app:

- **Terms:** Register requires a checked agreement (zero-tolerance language). Returning users log in without re-checking; Terms §6.1: no tolerance, Report/Block, **24-hour** remove + eject.
- **Save:** Media page → **Save to My Contents** (inline next to Created by).
- **Block content (media):** Same row → **Block content** — hides **this media only** for the blocker; notifies admin. Other posts from the same creator stay visible.
- **Report:** TalkChat → long-press message → **Report**.
- **Block user (chat):** TalkChat long-press → **Block user** — hides that person in the blocker’s feed/chat.
- **Filter:** Blocked media/users excluded from the viewer’s feed/chat APIs; automated content inspection where enabled.

### Physical iPhone recording (attach in App Review Information Notes)

1. Register → check Terms + open Terms (show §6.1 if possible)  
2. Open media → **Save to My Contents** / **Block content** (next to Created by)  
3. After Block content → leave detail; that item no longer appears in your feed (other posts from the creator can still appear)  
4. TalkChat long-press → Report / Block user  

### Resolution Center reply — UGC (Guideline 1.2)

```
Guideline 1.2 precautions are implemented:

1) EULA / Terms — Required checkbox on Register before account creation. Terms §6.1 state zero tolerance for objectionable content and abusive users, and that we act on reports within 24 hours by removing content and ejecting the offending user.

2) Flag / report — TalkChat: long-press message → Report. Reports go to admin moderation.

3) Block content — Media detail, next to Created by: Block content. Hides only that media item for the blocker and creates an admin report. Other content from the same creator remains visible. Public content for other users is unchanged. Save to My Contents is also shown inline on the same row.

4) Block users — TalkChat long-press → Block user. Hides that user’s content in the blocker’s feed and chat and creates an admin report.

5) Filtering — Blocked media and blocked users are excluded from the viewer’s feed and chat. Automated and manual moderation are used.

Screen recording on a physical device is attached in App Review Information Notes.
```

## Before resubmit — App Store Connect

1. **China / CallKit (Guideline 5)** — keep China available  
   - Ship a new iOS build: Talk button blocked for China; CallKit not active (no PushKit VoIP / no CallKit UI / no in-app call fallback)  
   - In **App Review Information** and Resolution Center reply, confirm CallKit is not active in China (template below)  
   - Optional fallback only: Pricing and Availability → remove **China**

2. **Age Rating (2.3.6)** — fix ASC validation + review  
   - Step 1 must be **Yes** for: **Social Media**, **User-Generated Content**, **Age Assurance**, and **Social Media Disabled for Users Under 13**  
   - ASC will not Save if social-under-13 is Yes but Age Assurance is None  
   - In Review Notes / Resolution Center, tell reviewers how to locate Age Assurance (Declared Age Range + birthday) — template below  
   - Calculated rating **13+** is expected; leave override **Not Applicable** unless you want higher

3. **App Review Information**  
   - Demo account (VIEWER is enough for free UGC; or purchase Basic via sandbox IAP)  
   - Steps: Pricing → subscribe via IAP; media → Buy with IAP; TalkChat → Report/Block  
   - Note: Talk/CallKit unavailable for China; iOS payments use Apple IAP only  
   - Attach **Guideline 1.2** screen recording (physical device)

4. **Screen recording (Guideline 1.2)** — see section above  

5. **New iOS build**  
   - Push to staging → Azure deploy  
   - Run **iOS TestFlight** workflow  
   - Attach new build + IAP products → Submit for Review

## Resolution Center reply — Age Rating / Age Assurance (Guideline 2.3.6)

```
Age Assurance is implemented and Age Rating selections are Yes for Social Media, User-Generated Content, Age Assurance, and Social Media Disabled for Users Under 13.

How to locate Age Assurance on a review device (iPhone, iOS 26+):

1) Sign in with the demo account (birthday must be 13+).
2) Tap Talk or Chat in the navbar. On first use (or when required), the system Declared Age Range sheet appears — this is our Age Assurance check before social features are enabled.
3) If Declared Age Range is declined or the account is under 13, Talk / Chat / Post remain unavailable.
4) Registration also requires a birthday that meets our minimum age (social floor 13).

We do not ship a separate Parental Controls settings screen; Age Assurance is the Declared Age Range API plus account age gating for social features.
```

## Resolution Center reply — Sign in with Apple (Guideline 2.1(a))

```
We fixed the bug where Continue with Apple could open Google sign-in.

Root cause: our Entra External ID authorize URL used domain_hint=Apple (capitalized). Entra External ID expects lowercase domain_hint=apple; an unrecognized hint was ignored and Safari SSO could resume a Google session.

Fix in this build:
1) domain_hint is now lowercase (apple / google / facebook / microsoft) with prompt=login
2) iOS ASWebAuthenticationSession uses an ephemeral session so a prior Google Safari session cannot hijack Apple

Please retest Continue with Apple on iPhone and iPad — it should open Apple’s sign-in, not Google.
```

## Resolution Center reply — CallKit (Guideline 5)

```
CallKit is not active for China App Store users. We detect China via:

1) StoreKit storefront country code CHN
2) Device locale region CN / CHN

When either matches:
• The Talk (voice/video calling) button is hidden
• PushKit VoIP is not registered
• CallKit UI is never presented
• There is no alternate in-app Accept/Decline calling UI

Chat messaging remains available. Outside China, Talk uses a single CallKit-based call stack for all other territories. China remains an available App Store territory for this app.
```

## Resolution Center reply — Payments (Guideline 3.1.1)

```
The iOS app uses Apple In-App Purchase for all digital goods purchased in the app:

• Memberships (Basic / Advanced / Premium, monthly and yearly) — StoreKit / Apple IAP only
• Paid media unlocks — consumable IAP price-tier products only

Stripe checkout, Stripe Customer Portal, and batch Stripe checkout are disabled in the native iOS app (UI gated + API returns 403). The Pricing screen and in-app help on iOS describe Apple In-App Purchase only — they do not offer or promote an alternate payment mechanism inside the app.

Web and Android continue to use Stripe. Content purchased on other platforms remains available in the iOS app under guideline 3.1.3(b) because the same digital goods are also offered via IAP.
```

## Review Notes template

```
Demo account: [email] / [password]

Account deletion: Profile menu → Edit Profile → Delete account (permanent).

UGC safety (Guideline 1.2):
- Register: required Terms checkbox (zero tolerance + 24h moderation in Terms §6.1).
- Media: next to Created by → Save to My Contents / Block content (hides this item only for you).
- TalkChat: long-press message → Report content / Block user.
Blocking hides content immediately for the viewer; reports go to admin (act within 24 hours).
Attach physical-device screen recording in Notes.

Payments (3.1.1): iOS uses Apple IAP for memberships and paid media. Stripe is web/Android only.

CallKit (Guideline 5): For China (storefront CHN or region CN/CHN), Talk is unavailable and CallKit is not active. Outside China, Talk uses CallKit. Chat remains available in China.

Age Assurance: Yes in Age Rating (required with Social Media disabled under 13). Locate via Talk/Chat → Declared Age Range sheet + registration birthday ≥13. Not a separate Parental Controls screen.
```
