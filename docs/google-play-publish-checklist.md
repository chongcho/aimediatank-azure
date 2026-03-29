# Google Play — Publish AI Media Tank Checklist

Your app **AI Media Tank** (`com.aimediatank.app`; legal entity **AI Media Tank, LLC**) is in **Draft** with **Internal testing**. Use this checklist to get it listed on Google Play.

---

## 1. Developer account (one-time)

- [ ] **Account type** — Personal or Organization set and verified.
- [ ] **Payment profile** — Google payment profile linked; payment method added if you sell in-app.
- [ ] **Contact** — Developer email and phone shown on Play are correct.
- [ ] **Legal** — Legal name and address accurate. Organization accounts: D-U-N-S and Dun & Bradstreet details up to date.

---

## 2. App content & store listing

In Play Console: **Grow** → **Main store listing** (and **Store settings**).

- [ ] **App name** — Max 50 characters (e.g. “AI Media Tank”).
- [ ] **Short description** — Max 80 characters; clear pitch.
- [ ] **Full description** — Max 4,000 characters; what the app does, features, audience.
- [ ] **App icon** — 512×512 px, PNG, max 1 MB (no transparency for main icon).
- [ ] **Screenshots** — At least 2 (phone); add 7" and 10" tablet if you support them. Use real UI, no misleading graphics.
- [ ] **Category** — e.g. “Social” or “Entertainment” (or most accurate).
- [ ] **Contact** — Email (e.g. `support@aimediatank.com`) and optionally website `https://www.aimediatank.com`.

**Metadata rules:** No emojis/ALL CAPS in title, no fake badges or “#1” claims, no unattributed testimonials.

---

## 3. Privacy & data safety

- [ ] **Privacy policy URL** — Add:  
  `https://www.aimediatank.com/privacy`  
  (Policy page already exists in this repo.)
- [ ] **Data safety** — In **App content** → **Data safety**:
  - Declare what data you collect (e.g. email, name, profile photo, usage/analytics).
  - For each: purpose, whether it’s shared, whether it’s required, and whether users can request deletion.
  - Align with your [Privacy Policy](https://www.aimediatank.com/privacy) and [Terms](https://www.aimediatank.com/terms).

---

## 4. Policy & compliance

- [ ] **Content rating** — **App content** → **Content rating**. Complete the questionnaire; get and apply the rating (e.g. Everyone, Teen).
- [ ] **Target audience** — Set age groups. If under 13: comply with [Families policy](https://support.google.com/googleplay/android-developer/answer/9893335).
- [ ] **Ads (if any)** — If you show ads, declare in Data safety and follow [Ads policy](https://support.google.com/googleplay/android-developer/answer/9857753).
- [ ] **Developer Program Policies** — App (and any SDKs/ads) must comply:  
  [Developer Program Policies](https://play.google.com/about/developer-content-policy/).

---

## 5. Review support (required before production)

- [ ] **Demo account** — Create a test account for Google reviewers.
- [ ] **Login credentials** — In **App content** → **App access** (or equivalent): provide email + password (or instructions if login is complex).
- [ ] **QR code / test link** — If your app is a TWA or needs a specific URL, provide a link or QR code so reviewers can open the same experience.

---

## 6. Build & release

- [ ] **App bundle** — You need at least one **Android App Bundle** (.aab) or APK. If AI Media Tank is distributed as a web app, this comes from a wrapper (e.g. TWA, Capacitor, PWA Builder).
- [ ] **Internal testing** — **Testing** → **Internal testing** → create a release, upload the .aab, add testers (email list). Install and smoke-test.
- [ ] **Production release** — When ready:
  1. **Release** → **Production** → **Create new release**.
  2. Reuse the same (or updated) .aab from internal testing.
  3. Add release name and release notes.
  4. Review and **Start rollout to Production** (optionally use staged rollout %).
- [ ] **Managed publishing** (optional) — Under **Release** → **Production** → **Set up** you can choose “Managed publishing” so the app goes live only when you press “Publish” after approval.

---

## 7. After you submit

- **Review time** — Often a few hours to a few days.
- **Pre-launch report** — Check **Release** → **Pre-launch report** for crashes/compatibility on devices.
- **Android Vitals** — After publish, monitor **Quality** → **Android Vitals** for stability and performance.

---

## Quick reference — AI Media Tank URLs

| Item        | URL |
|------------|-----|
| Privacy    | https://www.aimediatank.com/privacy |
| Terms      | https://www.aimediatank.com/terms  |
| Policy hub | https://www.aimediatank.com/policy |
| Support    | support@aimediatank.com |

---

## Order of operations (suggested)

1. Finish **store listing** (name, descriptions, icon, screenshots, category).
2. Set **Privacy policy** and **Data safety**.
3. Complete **Content rating** and **Target audience**.
4. Add **Demo account** and **App access** for reviewers.
5. Upload **.aab** to **Internal testing** and test.
6. Create **Production** release with same/updated .aab and submit.
7. Fix any rejection feedback and resubmit.

Once all required sections in the left menu of Play Console show a green check (or “Complete”), you can submit the production release. Google will then review and list the app on Google Play.
