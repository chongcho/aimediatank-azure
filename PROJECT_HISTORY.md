# AiMediaTank Project Development History

## Project Overview
**Platform**: AiMediaTank - Community platform for AI Creators and Digital Art Enthusiasts  
**Tech Stack**: Next.js 14, Prisma, NextAuth.js, Tailwind CSS, Azure App Services, Azure Blob Storage  
**Repository**: aimediatank-azure  

---

## Development Timeline

### Phase 1: Project Reset & Foundation
**Starting Point**: Reverted to commit `fb2701f` to continue development

---

### Phase 2: Core Feature Fixes

#### Save to My Contents Feature
- **Issue**: Saved media not displaying in "My Contents - Saved" section
- **Fix**: Added debug logging and fixed API endpoints for saving/unsaving media
- **Files Modified**:
  - `src/app/api/media/[mediaId]/save/route.ts`
  - `src/app/api/user/saved/route.ts`

#### Music Button Removal
- **Request**: Remove "Music" filter button and stat from profile page
- **Files Modified**: `src/app/profile/[username]/page.tsx`

#### Thumbnail Display for Saved Contents
- **Issue**: Thumbnails not showing for saved media
- **Fix**: Added fallback logic to use `url` for images when `thumbnailUrl` is not available
- **Files Modified**: `src/app/profile/[username]/page.tsx`

#### TalkChat Media Picker Enhancement
- **Request**: Show all media (Uploads, Purchased, Saved) in TalkChat "+" picker, not just uploads
- **Files Modified**: `src/components/TalkChat.tsx`

---

### Phase 3: Google AdSense Integration
- **Configuration**: Verified AdSense script integration with Auto ads
- **Files Modified**:
  - `src/app/layout.tsx` (Script component)
  - `public/ads.txt`

---

### Phase 4: UI/UX Improvements

#### Media Detail Page
- Changed edit icon to green "Edit" button
- Removed icons from buttons
- Added video autoplay functionality
- Fixed username display (showing `username` instead of `name`)
- Added cache-busting for fresh data
- **Files Modified**: 
  - `src/app/media/[mediaId]/page.tsx`
  - `src/components/MediaPlayer.tsx`

#### Edit Profile Page
- Added 10px padding on top of "Edit Profile" text
- Reduced title font to 14px, then increased to 18px
- Reduced gap between sections
- Added "Back" button (later relocated to bottom left)
- Reduced avatar size from 96px to 64px
- Reduced Bio textarea rows
- Centered Cancel/Save buttons
- Added header padding (20px top/bottom)
- **Files Modified**: `src/app/profile/edit/page.tsx`

#### My Contents Page
- Reduced User ID font from 3xl to 18px
- Added 10px padding to button rows
- Minimized button internal margins
- Reduced gap between buttons from 4 to 2
- Added "Back" button
- **Files Modified**: `src/app/profile/[username]/page.tsx`

#### Membership/Pricing Page
- Added 25px padding on top of "Choose Your Plan"
- Reduced font size to 18px
- Removed subtitle
- Added "Back" button (relocated to bottom left)
- **Files Modified**: `src/app/pricing/page.tsx`

#### Support Page
- Created dedicated Support page
- Added "Back" button
- **Files Modified**: `src/app/support/page.tsx` (new file)

#### Policy Page
- Added "Back" button at bottom left
- **Files Modified**: `src/app/policy/page.tsx`

#### All Pages - TalkChat Scroll Behavior
- Added `pb-[500px]` padding to ensure content scrolls above TalkChat box
- **Files Modified**: All page components

#### Back Button Relocation
- Relocated "Back" button from top right to bottom left on all pages:
  - Edit Profile, Pricing, Support, Profile, Media Detail, Policy

---

### Phase 5: Navbar Enhancements

#### Logo & Home Icon
- Replaced logo with new image
- Removed "Ai Media Tank" text next to logo
- Added wireframe "Home" icon with 30px gap from logo
- Made logo slightly larger (h-10)
- **Files Modified**: `src/components/Navbar.tsx`

#### Upload Button
- Removed "+" icon from Upload button
- Reduced button size to fit "Upload" text
- Matched Chat button height (h-9, px-3)
- **Files Modified**: `src/components/Navbar.tsx`

---

### Phase 6: Home Page Branding

#### Title Styling
- Made "AiMediaTank" non-italic, straight letters
- Added 20px padding on right
- Added "AI-Generated" with italic/bold, aligned with "AiMediaTank" bottom
- Changed subtitle to "Community for AI Contents Creators and Enthusiasts"
- Matched "AI-Generated" color to subtitle color
- **Files Modified**: `src/app/page.tsx`

---

### Phase 7: Sort Mode Persistence
- **Issue**: Content sorting mode kept reverting to "Most Popular"
- **Fix**: Implemented localStorage persistence with SSR hydration handling
- **Files Modified**: `src/app/page.tsx`

---

### Phase 8: TalkChat Major Enhancements

#### Emoji Removal
- Removed Emoji icon button and related logic
- **Files Modified**: `src/components/TalkChat.tsx`

#### Independent Resize
- Replaced corner resize with edge-based resizing
- Horizontal and vertical resize independent
- **Files Modified**: `src/components/TalkChat.tsx`

#### Corner Styling
- Removed bottom rounded corners
- Removed top rounded corners
- **Files Modified**: `src/components/TalkChat.tsx`

#### Message Input Box
- Reduced height to align with "+" button (32px)
- **Files Modified**: `src/components/TalkChat.tsx`

#### Window Visibility
- Implemented viewport constraints on load, drag, resize, and window resize
- Chat window always stays visible
- **Files Modified**: `src/components/TalkChat.tsx`

#### Context Menu for Private Chats
- Added right-click (desktop) and long-press (mobile) context menu
- Options: Priority, Edit Chat Name, Leave Chat, Close
- Custom confirmation modal (replaced browser dialog)
- Visual highlighting for selected chat record
- Mobile-specific positioning adjustments
- Blocked native iOS "Copy Writing Tools" popup
- **Files Modified**: 
  - `src/components/TalkChat.tsx`
  - `src/app/api/chat/conversations/[conversationId]/route.ts` (new file)

#### Priority Chat Feature
- Added `priority` field to `ConversationMember` schema
- Red flag indicator on priority chat avatars
- Priority chats sorted to top of list
- **Files Modified**:
  - `prisma/schema.prisma`
  - `src/components/TalkChat.tsx`
  - `src/app/api/chat/conversations/route.ts`
  - `src/app/api/chat/conversations/[conversationId]/route.ts`

#### Unread Message Badges
- Created `/api/chat/unread` endpoint for consolidated unread counts
- "Chat" button shows total unread private messages
- "Private" tab shows unread count
- Fixed badge count mismatch issue
- **Files Modified**:
  - `src/app/api/chat/unread/route.ts` (new file)
  - `src/app/api/notifications/route.ts`
  - `src/components/Navbar.tsx`
  - `src/components/TalkChat.tsx`

#### Message Display Fix
- Fixed 405 errors by adding GET/POST handlers
- Fixed message not displaying (data path correction)
- **Files Modified**: 
  - `src/app/api/chat/conversations/[conversationId]/route.ts`
  - `src/components/TalkChat.tsx`

---

### Phase 9: Username Update Propagation
- **Issue**: Username changes not reflecting in media detail "Created by" section
- **Fix**: 
  - Added `export const dynamic = 'force-dynamic'` to API route
  - Added cache-busting to fetch calls
  - Changed display from `name || username` to `username`
  - Updated NextAuth callbacks for session updates
- **Files Modified**:
  - `src/app/api/media/[mediaId]/route.ts`
  - `src/app/media/[mediaId]/page.tsx`
  - `src/lib/auth.ts`

---

### Phase 10: CSS Fixes

#### Media Display Black Areas
- **Issue**: Black padding on desktop when resizing window height
- **Fix**: Modified media query constraints for landscape padding
- **Files Modified**: `src/app/globals.css`

---

### Phase 11: Staging Environment

#### Configuration Issues
- Identified staging URL mismatch
- Identified `NEXTAUTH_URL` misconfiguration
- Staging uses same database as production
- **Resolution**: User to update Azure Portal environment variables

---

### Phase 12: Admin Panel Development

#### Schema Updates
Added to `User` model:
- `isSuspended`, `suspendedAt`, `suspendedUntil`, `suspendReason`
- `warningCount`, `lastWarningAt`, `lastWarningReason`
- `bonusCredits`, `adminNotes`

Added to `Media` model:
- `isDeleted`, `deletedAt`, `deletedBy`, `deletionReason`

New models:
- `AdminAction` - Tracks all admin actions
- `ChatWarning` - Tracks chat user warnings

**Files Modified**: `prisma/schema.prisma`

#### Admin Panel UI
- Dashboard with analytics
- Users tab with search, filters (all/suspended/warned), manage modal
- Media tab with pagination, search, type/status filters
- Chat tab for moderation
- Reports tab for pending reports
- **Files Modified**: `src/app/admin/page.tsx`

#### User Management Actions
- Suspend/Unsuspend users
- Send warnings
- Clear warnings
- Give credits
- Change role
- Delete user

#### Media Management
- Search by title/creator/@mention
- Filter by type (video/image/music)
- Filter by status (approved/pending/deleted)
- Pagination (20 items per page)
- Custom delete modal with email notification option
- Soft delete (preserves records)
- Restore deleted media

#### Chat Moderation
- View recent messages
- Warn chat users
- Delete messages

#### Suspension Logic
- Added check in NextAuth `authorize` to prevent suspended users from logging in
- **Files Modified**: `src/lib/auth.ts`

#### Admin API
- GET: analytics, users, media, chatMessages
- POST: suspendUser, unsuspendUser, warnUser, clearWarnings, giveCredits, deleteMedia, restoreMedia, warnChatUser, deleteChatMessage
- All actions logged to `AdminAction` table
- **Files Modified**: `src/app/api/admin/route.ts`

#### Admin Setup
- Created temporary `/api/admin/set-admin` endpoint
- Set `support@aimediatank.com` as admin
- Deleted setup files after confirmation

#### Search Input Focus Fix
- **Issue**: Search input losing focus after each keystroke
- **Fix**: Implemented debouncing and moved inputs outside loading conditional
- **Files Modified**: `src/app/admin/page.tsx`

#### @mention Search
- Users tab: `@username` searches by username only
- Media tab: `@username` searches by creator username
- **Files Modified**: `src/app/api/admin/route.ts`

---

## Database Migrations
- Added `priority` to `ConversationMember`
- Added suspension/warning fields to `User`
- Added soft delete fields to `Media`
- Added `AdminAction` model
- Added `ChatWarning` model

---

## Deployment
- **Branches**: `develop` (testing), `main` (production)
- **CI/CD**: GitHub Actions
- **Hosting**: Azure App Services
  - Production: `aimediatank.com`
  - Staging: `aimediatank-staging-*.azurewebsites.net`

---

## Key Bug Fixes Summary

| Issue | Root Cause | Solution |
|-------|------------|----------|
| Saved media not showing | API/rendering issue | Fixed thumbnail fallback logic |
| Sort mode not persisting | SSR hydration race condition | localStorage with initialization flag |
| Username not updating | Server caching | force-dynamic + cache-busting |
| TalkChat 405 errors | Missing API handlers | Added GET/POST handlers |
| Messages not displaying | Wrong data path | Fixed `data.conversation.messages` |
| Private badge mismatch | Invalid invites counted | Filter by valid sender |
| Search input losing focus | Re-mount on loading state | Moved inputs outside conditional |
| Black media areas | Overly broad media query | Restricted query conditions |

---

## Files Created/Modified Count

### New Files Created
- `src/app/support/page.tsx`
- `src/app/api/chat/unread/route.ts`
- `src/app/api/chat/conversations/[conversationId]/route.ts`
- `src/app/api/admin/set-admin/route.ts` (deleted after use)
- `set-admin.js` (deleted after use)

### Major Files Modified
- `src/components/TalkChat.tsx` - Extensive enhancements
- `src/components/Navbar.tsx` - UI updates
- `src/app/page.tsx` - Branding, sort persistence
- `src/app/admin/page.tsx` - Complete admin panel
- `src/app/api/admin/route.ts` - Admin API endpoints
- `prisma/schema.prisma` - Schema updates
- `src/lib/auth.ts` - Session handling, suspension checks

---

## All User Requests (Chronological)

1. Go back to version fb2701f and continue development
2. Fix "Save to My Contents" not showing saved items
3. Remove "Music" button
4. Show thumbnails on saved contents
5. "+" button show all media in My Contents
6. Double check Google AdSense configuration
7. Media detail - change edit icon to green "Edit" button
8. Push changes
9. Remove icon on each button
10. Push to branches
11. TalkChat scroll behavior - scroll up to menubar top
12. Apply scroll behavior to all screens
13. Review and update Edit Profile page
14. Add padding to Edit Profile header
15. Increase "Edit Profile" font to 18px
16. Align Bio box with Edit Avatar button
17. Review and update My Contents page
18. Review and update Membership page
19. Add "Back" button to My Contents
20. Run npm run build
21. Relocate "Back" button to bottom
22. TalkChat - remove Emoji icon
23. Main menu bar - replace logo, add Home icon
24. Check AdSense status
25. Fix sort mode persistence
26. Change TalkChat resize method
27. Remove TalkChat bottom/top corners' round
28. Style "AiMediaTank" title
29. Reduce TalkChat message input box height
30. Style "AI-Generated" text
31. Reduce Upload button size
32. Media detail - autoplay video
33. Check staging web link
34. Fix username update on media detail
35. Check staging environment
36. New private message badge on Chat/Private buttons
37. Check staging database sharing
38. Display Open chat records always
39. Fix staging/production mismatch
40. Add unread badge on message list
41. Fix media display black areas
42. Move chat window to always visible
43. Chat/Private badge show TalkChat only
44. Fix Private tab badge mismatch
45. Add context menu to chat records
46. Make confirmation popup in TalkChat
47. Add "Close" to context menu
48. Activate right-click only on Private chats
49. Add "Priority" to context menu
50. Color highlight clicked message
51. Mobile popup alignment
52. Block Copy Writing Tools popup
53. Adjust mobile popup to fit TalkChat
54. Create Admin Panel
55. Set support@aimediatank.com as admin
56. Fix admin panel display (only 20 of 57)
57. Add filter function to Media tab
58. Custom delete popup with email
59. Change "Delete Content" to "Send and Delete Content"
60. Soft delete content for records
61. Fix TalkChat 405 error
62. Fix message not displayed
63. Fix admin search input deactivation
64. Update @mention search to work

---

*Document Generated: January 8, 2026*

