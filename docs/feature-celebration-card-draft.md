# Celebration Card Feature — Draft

> **Implementation completed.** Run `npx prisma migrate dev --name add_celebration_card` (with `DATABASE_URL` set) to create the `CelebrationCard` table, then use "Send card" on any media detail page.

## Overview

**Celebration Card** lets users send an electronic card via **email** and **major SNS platforms**. The e-card includes:

1. **Media content** — Rendered like a homepage tile (thumbnail, title, creator, type badge).
2. **Text-to-speech (TTS) message** — A personal message that can be played as audio alongside the media.

Recipients open a link to view the card in the browser; they can play the TTS message and see the media tile. Sending is done from the media detail page (or homepage card) with a “Send celebration card” action.

---

## User Flow (High Level)

1. User is on a **media detail page** (or selects media from profile/home).
2. User clicks **“Send celebration card”** (or “Share as card”).
3. **Compose step:**  
   - Optional: pick or confirm media (if not already on detail page).  
   - Enter **recipient email** and/or choose **SNS** (see below).  
   - Enter **TTS message** (text that will be read aloud; optional).  
   - Optional: short **card title** (e.g. “Happy Birthday!”).
4. User clicks **Send**.
5. System sends **email** (if provided) and/or provides **share links** for SNS. Recipients get a link to a **public card view** (e.g. `/card/[cardId]`).

---

## E-Card Content

### Visual (Homepage-Tile Style)

- **Thumbnail** — `media.thumbnailUrl` or `media.url` for images; aspect preserved, rounded corners.
- **Title** — Media title (strip hashtags), truncated if long.
- **Creator** — e.g. “by @username”.
- **Type badge** — VIDEO / IMAGE / MUSIC (same styling as `MediaCard`).
- Optional: **Card title** (e.g. “Happy Holidays!”) above the tile.

Layout should be a single, self-contained “tile” that looks like one card from the homepage, so it’s recognizable as content from this app.

### TTS Message

- **Stored:** Plain text only (e.g. “Happy birthday! Hope you enjoy this video.”).
- **Playback:**  
  - **Option A (recommended for MVP):** Use browser **Web Speech API** (`speechSynthesis`) on the card view page. No server-side TTS, no extra cost; works in most modern browsers.  
  - **Option B (later):** Server-side TTS (e.g. Azure Speech, Google TTS), store audio URL, embed `<audio>` in card view. Better consistency and offline play, but adds API cost and storage.

Recommendation: Start with **Option A**; add Option B if you need consistent voice or mobile support beyond Web Speech.

---

## Delivery Channels

### 1. Email

- Use existing **`sendEmail()`** in `src/lib/email.ts` (nodemailer/Gmail).
- **HTML body:** Inline the same “tile” layout (thumbnail image, title, creator, type) + card title + TTS message as text.  
- **CTA button:** “View your celebration card” → link to `https://<site>/card/<cardId>`.
- **Subject:** e.g. “You received a celebration card from [Sender]” or custom.

No new email provider required; reuse current SMTP setup.

### 2. SNS (Facebook, X/Twitter, WhatsApp, LinkedIn, etc.)

- **No server-side SNS APIs in MVP.**  
- Provide **share URLs** that open the native share dialog or pre-filled post:
  - **Web Share API** (mobile): `navigator.share({ url, title, text })`.
  - **Fallback:** Open platform-specific URLs with pre-filled text and card URL:
    - **Facebook:** `https://www.facebook.com/sharer/sharer.php?u=<encodedCardUrl>`
    - **X (Twitter):** `https://twitter.com/intent/tweet?url=<encodedCardUrl>&text=<encodedMessage>`
    - **WhatsApp:** `https://wa.me/?text=<encodedMessage>%20<cardUrl>`
    - **LinkedIn:** `https://www.linkedin.com/sharing/share-offsite/?url=<encodedCardUrl>`
- User copies the card link and pastes into SNS, or uses “Share” and picks an app. The **card view URL** is the single source of truth for the e-card content.

---

## Data Model

### Option A — Stateless (token in URL)

- **No DB table.**  
- Encode in a signed or opaque token: `mediaId`, optional `message`, optional `cardTitle`, optional `senderName`, expiry.  
- Route: `/card?token=<jwt_or_opaque>` or `/card/[token]`.  
- **Pros:** No storage, no cleanup. **Cons:** Hard to revoke or analytics; URL can be long.

### Option B — Stored cards (recommended)

- **New table: `CelebrationCard`**
  - `id` (uuid, PK)
  - `mediaId` (FK → Media)
  - `senderId` (FK → User, nullable for anonymous)
  - `recipientEmail` (nullable, if sent by email)
  - `cardTitle` (nullable, e.g. “Happy Birthday!”)
  - `ttsMessage` (text, nullable)
  - `createdAt`
  - Optional: `expiresAt` for time-limited links
- **Route:** `/card/[cardId]`. Load card by id; resolve media; render tile + TTS.
- **Pros:** Analytics, revoke by id, optional expiry. **Cons:** Storage and cleanup (e.g. delete cards older than 1 year).

Recommendation: **Option B** so you can support “View your card” emails and SNS links that point to a stable URL.

---

## API Routes

1. **`POST /api/celebration-card`** (auth optional or required)
   - Body: `{ mediaId, recipientEmail?, cardTitle?, ttsMessage? }`
   - Creates a `CelebrationCard` row; returns `{ cardId, cardUrl }`.
   - If `recipientEmail` provided: call `sendEmail()` with HTML body (tile + message + CTA to `cardUrl`).
   - Response includes `cardUrl` for the client to use for SNS share links.

2. **`GET /api/celebration-card/[cardId]`** (public)
   - Returns card + media (title, thumbnailUrl, type, user.username, etc.) for the card view page.  
   - 404 if not found or expired.

---

## UI Components & Pages

### 1. Entry point

- **Media detail page** (`MediaPageClient.tsx`): Add a “Send celebration card” (or “Share as card”) button near existing Share / Save / Buy actions.
- Optional: Same action on **MediaCard** (e.g. in a dropdown or secondary action) linking to a compose flow with `mediaId` pre-filled.

### 2. Compose modal or page

- **Compose flow:**  
  - Show media tile preview (reuse `MediaCard`-like layout or a small inline version).  
  - Inputs: **Recipient email** (optional), **Card title** (optional), **TTS message** (textarea, optional).  
  - Buttons: **Send by email** (if email entered), **Copy link**, **Share** (opens Web Share or list of SNS icons with share URLs).
- After send: “Card sent! Link copied” and show the card URL for sharing.

### 3. Public card view page

- **Route:** `src/app/card/[cardId]/page.tsx` (server) + optional client component for TTS.
- **Layout:**  
  - Card title (if set).  
  - One “tile” (thumbnail, media title, by @username, type badge) — reuse styles from `MediaCard` or a shared `CelebrationCardTile` component.  
  - TTS message as text; **Play** button that uses `speechSynthesis.speak()` with the message text.  
  - Optional: “View full media” link to `/media/[mediaId]`.
- **SEO:** Meta title/description from media title and card title; og:image = media thumbnail.

---

## Email HTML Template

- Add a function in `src/lib/email.ts`, e.g. `generateCelebrationCardEmail(senderName, cardTitle, ttsMessage, cardUrl, mediaTitle, thumbnailUrl, creatorUsername)`.
- Body: Same gradient header style as existing emails; card title; tile block (image, title, creator); TTS message as paragraph; CTA button “View your celebration card” → `cardUrl`.
- Use inline styles and absolute URLs for images (thumbnail) so email clients render correctly.

---

## Text-to-Speech (MVP)

- **Client-side only:** On the card view page, a “Play message” button that runs:
  `window.speechSynthesis.speak(new SpeechSynthesisUtterance(ttsMessage))`.
- Optional: language selector (e.g. `utterance.lang = 'en-US'`).
- No server-side TTS or audio storage for MVP.

---

## Security & Privacy

- Card view is **public** (anyone with link). Do not put sensitive data in `ttsMessage` or `cardTitle`.
- Rate limit: **POST /api/celebration-card** (e.g. 10 per user per hour) to avoid spam.
- Optional: Require auth to create cards so sender is stored; or allow anonymous and only store `recipientEmail` when sending email.

---

## Implementation Order (Suggested)

1. **Data:** Add `CelebrationCard` model and migration; `POST /api/celebration-card`, `GET /api/celebration-card/[cardId]`.
2. **Card view page:** `/card/[cardId]` with tile + TTS message + Play (Web Speech API).
3. **Email:** `generateCelebrationCardEmail()` + call from POST handler when `recipientEmail` is provided.
4. **Compose UI:** Modal or small page for “Send celebration card” from media detail; wire to API and show card URL.
5. **SNS:** Add “Share” with Web Share API and fallback share URLs (Facebook, X, WhatsApp, LinkedIn).
6. **Polish:** Rate limit, optional expiry, analytics (e.g. card views).

---

## Files to Add or Touch

| Area              | Action |
|-------------------|--------|
| `prisma/schema.prisma` | Add `CelebrationCard` model |
| `src/lib/email.ts`     | Add `generateCelebrationCardEmail()` |
| `src/app/api/celebration-card/route.ts` | POST create + send email |
| `src/app/api/celebration-card/[cardId]/route.ts` | GET card + media |
| `src/app/card/[cardId]/page.tsx` | Public card view (tile + TTS) |
| `src/app/media/[mediaId]/MediaPageClient.tsx` | “Send celebration card” button + compose modal |
| Optional: `src/components/CelebrationCardTile.tsx` | Reusable tile for card view and email HTML |

---

## Summary

- **E-card** = homepage-style media tile + optional TTS message.
- **Send via:** Email (existing SMTP) and SNS (share links / Web Share).
- **TTS:** Browser Web Speech API on card view (MVP); optional server TTS later.
- **Stored cards** with a public `/card/[cardId]` view keep links stable and enable analytics and optional expiry.

This draft is ready to be refined (e.g. copy, limits, or SNS list) and then implemented step by step.
