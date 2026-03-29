# KakaoTalk Share – AI Media Tank setup

This guide configures **Kakao Talk Share** so users can share media from **AI Media Tank** to KakaoTalk. You already created the Kakao developers app for this product on [developer.kakao.com](https://developer.kakao.com); follow these steps to enable sharing and connect the app.

---

## 1. Enable Kakao Talk Share and get keys

1. Open [developer.kakao.com](https://developer.kakao.com) and select your **AI Media Tank** app (ID 1398467).
2. In the left menu, go to **Product Settings** → **Kakao Talk Message** (or **Kakao Talk Share**).
3. Enable the product and complete any required agreement.
4. Go to **App Settings** → **App** (or **App** under App Settings).
5. Open **App key** (or **Platform key**) and copy the **JavaScript key**. You will use this as `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`.

---

## 2. Register your site domain (required)

1. Under **App Settings** → **App**, find **Platform** or **Web platform**.
2. Add your site domain(s), for example:
   - `https://www.aimediatank.com`
   - `https://aimediatank.com`
   - For local testing: `http://localhost:3000`
3. Save. The Kakao JS SDK will only work on these domains.

---

## 3. Link the product to your app (if needed)

1. In **Product Settings** → **Kakao Talk Message**, ensure the product is **Linked** to your app (e.g. “Product Link” or “Connect to app”).
2. If you use **Kakao Talk Share** (not Message), enable/link that product instead, per the console labels.

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

- **“Invalid domain” or share not opening**  
  Confirm the current origin (e.g. `https://www.aimediatank.com`) is registered in **App** → **Platform** → Web domain list.

- **Script / init errors**  
  Check the browser console. Ensure the JavaScript key is the **Web (JavaScript)** key, not the REST API or Admin key.

- **Docs**  
  [Kakao Talk Share – JavaScript](https://developers.kakao.com/docs/latest/en/kakaotalk-share/js-link), [JavaScript SDK](https://developers.kakao.com/docs/latest/en/javascript/getting-started).
