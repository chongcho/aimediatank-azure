# Apple age ratings — Social Media Disabled for Users Under 13

Use this when answering App Store Connect age ratings for AI Media Tank (AMT).

## Checkbox to select

**Social Media Disabled for Users Under 13**

Apple’s definition (summary):

1. Users under 13 do **not** have access to social media capabilities.
2. At a minimum, the **Declared Age Range API** is called to check age ranges before enabling social features.
3. Only age-appropriate UGC is delivered.

## What we implemented

| Requirement | Implementation |
|---|---|
| No social under 13 | Account birthday must be ≥ max(platform ageRequirement, 13). APIs return `403` + `SOCIAL_AGE_RESTRICTED` for chat, comments, reactions (signed-in), celebration card, upload SAS, voice calls, conversations. Navbar hides Chat / Phone / Post for restricted users. Feed hides comment / share / chat / like interaction. |
| Declared Age Range API | iOS Capacitor plugin `DeclaredAgeRange` (`ios/App/App/DeclaredAgeRangePlugin.swift`) + entitlement `com.apple.developer.declared-age-range`. Client calls gates **13** and **18** via `src/lib/declaredAgeRange.ts` after login (`SocialAgeAccessProvider`). Decline / error → social stays off. |
| Age-appropriate UGC | Existing content inspection / age rating paths (`inspectMediaForAgeRating`) plus platform registration age (Admin → Authentication → 9+ / 13+ / 16+ / 18+). |

## App Store Connect answers (suggested)

- **Does the app include social media?** Yes (feed interactions, chat, sharing UGC).
- **Social media disabled for users under 13?** Yes — select that capability option.
- Confirm Declared Age Range capability is enabled on the App ID in Apple Developer / Xcode before shipping the iOS build that includes the plugin.

## Admin note

**Authentication → Age requirement** (9+ / 13+ / 16+ / 18+) controls registration and profile birthday. It cannot disable the Apple social floor of 13; social remains unavailable under 13 even when registration is 9+ or 13+.

## Manual checklist before TestFlight

1. Enable **Declared Age Range** capability on the iOS App ID and regenerate provisioning if needed.
2. Build with a toolchain that includes the DeclaredAgeRange framework (iOS 26+ SDK).
3. On a device/simulator with age features, sign in as a 13+ account and confirm the system age-range sheet can appear; as under-13 (or declined sharing), confirm Chat / Post / comments stay unavailable.
4. Confirm server rejects under-age social writes even if the UI is bypassed.
