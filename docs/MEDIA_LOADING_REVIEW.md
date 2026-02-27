# Media page loading – why it’s slow and how to improve

## Current flow

1. User navigates to `/media/[mediaId]`.
2. **Server** (page.tsx) runs `getMediaForMeta(mediaId)` for metadata/SEO (one DB read).
3. **Client** (MediaPageClient) mounts with `loading: true`, then in one `useEffect`:
   - `fetchMedia(signal)` → **GET /api/media/[mediaId]** (blocking)
   - `fetchReactions(signal)` (parallel)
   - `fetchSavedStatus(signal)` if logged in (parallel)
4. Only when **fetchMedia** finishes does `setLoading(false)` run and the player render.
5. MediaPlayer mounts, sets `<video src={url}>`, waits for `loadedmetadata` then `play()`; buffering shows until enough data is loaded.

So “time to first frame” = **time for GET /api/media/[mediaId]** + **time for video to buffer**. The first part is what makes the spinner feel long.

---

## Why the media API is slow

### 1. One heavy response blocks the player

The client waits for the **full** media response before showing the player. That response includes:

- Full media row + **user** (id, username, name, avatar, bio)
- **All comments** (with each comment’s user)
- **All ratings** (with each rating’s user)
- **_count** (comments, ratings)
- **versions** (all transcoded versions)

The player only needs: `id`, `type`, `url` / `streamUrl`, `thumbnailUrl`, `processingStatus`, `title`, and minimal user (e.g. username). Comments and ratings could load after.

### 2. Sequential work on the server

In `src/app/api/media/[mediaId]/route.ts` GET:

1. `prisma.media.findUnique` with all includes (one big read).
2. **Then** `prisma.media.update` for view count (extra write before responding).
3. For VIDEO: **then** `getServerSession`, **then** purchase lookup, **then** `CropToolSetting.findFirst`, then build `streamUrl`.

Session, purchase, and crop settings could run in parallel with each other (and the view increment could be deferred), so the response is sent earlier.

### 3. View count blocks the response

View count is updated with `await prisma.media.update(...)` before `NextResponse.json()`. That write adds latency to every page load. It could be done after sending the response (e.g. fire-and-forget or background job) so the client gets the JSON sooner.

### 4. No “player-only” or minimal payload

There is no lightweight endpoint that returns only what’s needed to render the player and start the video request. So the first byte of the response is delayed by building and sending a large payload (comments, ratings, versions, etc.).

### 5. Duplicate media fetch

- **Server**: `getMediaForMeta(mediaId)` for metadata/JSON-LD.
- **Client**: `fetchMedia()` for full detail.

The client does not reuse the server result; it always does a second full fetch. That’s two independent media reads per visit.

---

## Recommended improvements (in order of impact)

### 1. **Lightweight “play” or minimal media endpoint (biggest win)**

- Add **GET /api/media/[mediaId]/play** (or `GET /api/media/[mediaId]?minimal=1`) that returns only:
  - `id`, `type`, `url`, `streamUrl`, `thumbnailUrl`, `processingStatus`, `title`, `views`, `price`, `isSold`, etc. (what the player and header need)
  - Minimal `user`: e.g. `id`, `username`, `name`, `avatar`
  - No comments, no ratings, no versions list (or only what’s needed for stream URL resolution).
- **MediaPageClient**: first request uses this endpoint; set `loading: false` when it returns and render the player immediately. In parallel (or after), request full media (or only comments/ratings) for the rest of the page.
- Effect: Smaller, faster first response → spinner disappears sooner and video can start loading earlier.

### 2. **Defer view count increment**

- After building the JSON payload, call `NextResponse.json(payload)` and send the response.
- Then run `prisma.media.update({ views: { increment: 1 } })` without awaiting it (fire-and-forget), or move it to a short background step.
- Effect: Slightly faster time-to-first-byte and less blocking on a write that doesn’t affect the response.

### 3. **Parallelize session, purchase, and crop settings (VIDEO)**

- For VIDEO, once you have `media`, run in parallel:
  - `getServerSession(authOptions)`
  - `prisma.purchase.findFirst(...)` (only if you have a session)
  - `prisma.cropToolSetting.findFirst()`
- Then compute `streamUrl` from the results.
- Effect: Shorter server-side wall clock before building the response.

### 4. **Split comments/ratings from initial load**

- Option A: In the **existing** GET, add `?include=comments,ratings` (or similar). When absent, omit comments and ratings from the query and payload so the default is a slimmer response.
- Option B: Keep the “play” endpoint minimal (no comments/ratings). Have the client call **GET /api/media/[mediaId]/comments** (and ratings if you have such an endpoint) after the player is visible, or include them only in the “full” media fetch.
- Effect: First response is smaller and faster; comments/ratings no longer block the player.

### 5. **Prefetch on hover or in-view (optional)**

- When a media card is hovered (or enters the viewport), prefetch **GET /api/media/[id]** or the minimal play payload so that on click the data is in cache or almost ready.
- Effect: On navigation, the client often gets data from cache or a very fast response, so the spinner is shorter or gone.

### 6. **Reuse server-fetched media on the client (optional)**

- The server already calls `getMediaForMeta(mediaId)`. You could pass a minimal `initialMedia` prop from the server component to `MediaPageClient` (e.g. id, type, url, thumbnailUrl, title, user). The client uses it to render the player immediately and optionally refetches for full detail (comments, ratings, streamUrl if not in initial).
- Effect: One less round-trip for “above the fold” data when the server already has it; requires aligning `getMediaForMeta` with what the player needs (e.g. streamUrl may still need an API call for auth/crop logic).

---

## Summary

| Cause | Fix |
|-------|-----|
| Full payload (comments, ratings, versions) blocks player | Minimal “play” endpoint or `?minimal=1`; load comments/ratings after |
| View increment blocks response | Defer view update (fire-and-forget or background) after sending response |
| Session + purchase + crop done in sequence | Run in parallel for VIDEO |
| No minimal media API | Add /api/media/[id]/play or minimal query and use it for first paint |
| Optional | Prefetch on card hover; reuse server `getMediaForMeta` for initial client state |

Implementing **1 (minimal endpoint)** and **2 (defer view)** will give the largest perceived improvement with minimal risk. **3** is a small code change on the server. **4** and **5** further reduce payload and improve perceived speed.
