# KakaoTalk Share – AI Media Tank (AiM) setup

This guide configures **Kakao Talk Share** so users can share media from **AI Media Tank (AiM)** to KakaoTalk. You already created the Kakao developers app for this product on [developer.kakao.com](https://developer.kakao.com); follow these steps to enable sharing and connect the app.

---

## 1. Enable Kakao Talk Share and get keys

1. Open [developer.kakao.com](https://developer.kakao.com) and select your **AI Media Tank (AiM)** app (ID 1398467).
2. In the left menu, go to **Product Settings** → **Kakao Talk Message** (or **Kakao Talk Share**).
3. Enable the product and complete any required agreement.
4. Go to **App Settings** → **App** (or **App** under App Settings).
5. Open **App key** (or **Platform key**) and copy the **JavaScript key**. You will use this as `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`.

---

## 2. Register your site domain (required) — TWO places

Kakao validates the calling domain in **two separate places**. If either is missing you will see Kakao's red "Failed request — Verification failed due to an incorrect request" page on `sharer.kakao.com/picker/link?app_key=…` (Kakao error `-401 domain mismatched` / `4019`, or `4002` for Product Link).

### 2a. App Platform → Web (JavaScript SDK domain)

1. **My Application** → select **AI Media Tank (AiM)** (ID 1398467).
2. **App Settings** → **Platform** → **Web**.
3. Add every origin the SDK will run from, with scheme but no path/trailing slash:
   - `https://www.aimediatank.com`
   - `https://aimediatank.com`
   - `https://staging-aimediatank.azurewebsites.net` (or your staging slot URL)
   - For local testing: `http://localhost:3000`
4. Save.

### 2b. Product Settings → Kakao Talk Sharing → Domain (Product Link)

1. **My Application** → AiM app → **Product Settings** → **Kakao Talk Sharing** (or **Kakao Talk Share** / **Kakao Talk Message**, depending on console language).
2. Enable the product if not already enabled.
3. Under **Domain** (a.k.a. **Product Link**), add the **same domains** you used in 2a — this is the domain of the URL you pass into `link.webUrl` / `link.mobileWebUrl`. Missing this is what triggers Kakao error `4002`.
4. Save and wait ~1 minute for Kakao to propagate.

> Both lists must contain the current page origin. They are checked independently — registering the App Platform domain alone is **not** enough on the latest Kakao console.

---

## 4. Set the JavaScript key in this project

1. In the project root, copy `env-example.txt` to `.env` (or `.env.local`) if you have not already.
2. Add or edit:

```env
# Kakao Talk Share (optional – omit to hide KakaoTalk in Share list)
NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY="your_javascript_key_here"
```

3. Replace `your_javascript_key_here` with the **JavaScript key** from step 1.
4. Restart the dev server or rebuild so the env var is picked up.

---

## 5. Verify in the app

1. Open a media page (e.g. `/media/[id]`).
2. Click **Share** to open the share modal.
3. You should see **KakaoTalk** in the share list.
4. Click **KakaoTalk**; the Kakao share flow should open (browser or KakaoTalk app) with title, thumbnail, and link to the media page.

---

## Troubleshooting

- **KakaoTalk button not visible**  
  Ensure `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` is set and the app was restarted/rebuilt after adding it.

- **"Failed request — Verification failed due to an incorrect request" on `sharer.kakao.com/picker/link`**  
  This is Kakao's server-side domain check failing. It is **not** a bug in this app. Fix:
  1. In **App Settings → Platform → Web**, confirm the current page origin (open browser devtools → `location.origin`) is in the list.
  2. In **Product Settings → Kakao Talk Sharing → Domain**, confirm the same origin is in the list (this is the new requirement that catches most teams).
  3. If you use a `www.` and an apex variant, register **both**.
  4. Save and re-test in an incognito window (Kakao caches the failure).
  5. Confirm the `app_key` in the failing URL matches `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` for the AiM app — if it's a different app's key, you registered the domain on the wrong app.

- **"Invalid domain" / `-401 domain mismatched! caller=…`**  
  Same as above — Kakao is reporting the `caller` origin it received. Add that exact origin (scheme + host, no path) to both lists in §2.

- **Script / init errors**  
  Check the browser console. Ensure the JavaScript key is the **Web (JavaScript)** key, not the REST API or Admin key. The key must be the one shown on the Kakao app whose domains you registered.

- **Image not appearing in the Kakao card**  
  The image URL must be HTTPS and reachable from the public internet (Kakao's scraper fetches it server-side). Private/firewalled URLs and `http://` are rejected. The app already filters `imageUrl` to require `https://`.

- **Docs**  
  [Kakao Talk Share – JavaScript](https://developers.kakao.com/docs/latest/en/kakaotalk-share/js-link), [JavaScript SDK](https://developers.kakao.com/docs/latest/en/javascript/getting-started), [Kakao Talk Share troubleshooting](https://developers.kakao.com/docs/en/kakaotalk-share/trouble-shooting).
