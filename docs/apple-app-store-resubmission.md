# Apple App Store resubmission checklist

Use this after an App Store rejection. Code changes in this repo address most Guideline issues; complete the App Store Connect steps below before resubmitting.

## Code changes included

| Guideline | Fix |
|-----------|-----|
| **3.1.1 Payments** | Stripe checkout blocked on native iOS (UI hidden + API 403). Users subscribe/buy on web only. |
| **5.1.1 Account deletion** | Profile → Edit Profile → **Delete account** permanently deletes the user (not soft deactivate). |
| **1.2 UGC** | **Report** (media + chat) and **Block user** (instant feed/chat hide + admin report). |
| **2.1 Login on iPad** | Native auth session uses a reliable presentation anchor; login links use full-page navigation in the native shell. |
| **5 CallKit + China** | `isCallKitAllowed()` disables CallKit when device region is CN (ship new iOS build). |

## Before resubmit — App Store Connect

1. **China / CallKit (Guideline 5)**  
   - **Option A (fast):** Pricing and Availability → remove **China**  
   - **Option B:** Keep China; upload new build with CallKit CN disable; note in Review Information

2. **Age Rating (2.3.6)**  
   - App Information → Age Rating → set **Age Assurance** to **None** (unless you add visible in-app parental controls)

3. **App Review Information**  
   - Demo account with **active membership** (Basic+) so reviewer can use Talk/Chat  
   - Steps: sign in → browse feed → open TalkChat → report/block demo  
   - Note: iOS app does not sell subscriptions in-app; purchases on https://aimediatank.com  
   - Note: Delete account at Profile → Edit Profile → Delete account  

4. **Screen recording (Guideline 1.2)**  
   On a physical iPhone, record:  
   - Register/login showing Terms + Privacy acceptance  
   - Report on media or chat message  
   - Block user  
   Upload to App Review Information → Notes (or attach in Resolution Center reply)

5. **Database migration**  
   Run on production before deploy:  
   `npx prisma migrate deploy`

6. **New iOS build**  
   - Push web changes to staging (Azure deploy)  
   - Run **iOS TestFlight** workflow → new build  
   - Attach new build to the App Store version → Submit for Review

## Review Notes template

```
Demo account: [email] / [password] — active Basic membership.

Account deletion: Profile menu → Edit Profile → Delete account (permanent).

UGC safety: Report and Block user on media pages and TalkChat (long-press message).

iOS purchases: Subscriptions and paid media checkout are disabled in the iOS app; use aimediatank.com in Safari.

CallKit: Disabled for China (device region CN). VoIP calls still work in-app without CallKit UI.

Age Assurance: Set to None in Age Rating (no in-app parental control product).
```
