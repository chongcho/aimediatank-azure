# Social Sign In / Sign Up (Microsoft Entra External ID)

The app supports **Sign In** and **Sign Up** via **Microsoft Entra External ID** (or Azure AD B2C) as a **single integration point**. Azure handles federation with Google, Facebook, Apple, and Microsoft accounts; you configure those identity providers once in the Azure portal.

## Behaviour

- **Login** (`/login`) and **Register** (`/register`) show an “Or continue with” section with separate buttons: **Continue with Google**, **Continue with Facebook**, **Continue with Apple**, **Continue with Microsoft** (each only appears if that provider is configured in Entra).
- Clicking a button redirects users to Azure (and, when supported, directly to that provider via `domain_hint`). On first sign-in we create a user; on later sign-ins we match by email.
- On first sign-in we **create a user** in our database (email, username from email, name, `emailVerified: true`, `role: SUBSCRIBER`). On later sign-ins we match by email and reuse the same user.
- **Credentials** (email + password) continue to work as before.

## Configuration

### Option A: Microsoft Entra External ID (recommended)

1. Create an **External ID** tenant and configure your **user flow** (sign-up/sign-in) and identity providers (Google, Facebook, Apple, Microsoft) in the [Microsoft Entra admin center](https://entra.microsoft.com/).
2. Register an **application** and note:
   - **Application (client) ID**
   - **Client secret** (or certificate)
   - **Issuer** (e.g. `https://<your-tenant>.ciamlogin.com/<tenant-id>/v2.0` or the issuer from your flow’s OpenID Connect metadata).
3. Add **redirect URIs** (one per button so NextAuth callbacks work). Add all of these in the app registration:
   - `https://<your-app-domain>/api/auth/callback/entra-external-id-google`
   - `https://<your-app-domain>/api/auth/callback/entra-external-id-facebook`
   - `https://<your-app-domain>/api/auth/callback/entra-external-id-apple`
   - `https://<your-app-domain>/api/auth/callback/entra-external-id-microsoft`  
   (and the same four with `http://localhost:3000` for local dev).
4. Set these in your app (e.g. `.env` or Azure App Service settings):

| Variable | Description |
|----------|-------------|
| `ENTRA_ISSUER` | Full issuer URL (no trailing slash), e.g. `https://<tenant>.ciamlogin.com/<tenant-id>/v2.0` |
| `ENTRA_CLIENT_ID` | Application (client) ID |
| `ENTRA_CLIENT_SECRET` | Client secret |

After deploy/restart, the four “Continue with Google/Facebook/Apple/Microsoft” buttons appear (for each IdP you configured in Entra) and social sign-in/sign-up works through Azure.

### Option B: Azure AD B2C (legacy)

If you use **Azure AD B2C** with a user flow (e.g. `B2C_1_signup_signin`):

| Variable | Description |
|----------|-------------|
| `AZURE_AD_B2C_TENANT_NAME` | B2C tenant name (e.g. `mytenant`) |
| `AZURE_AD_B2C_PRIMARY_USER_FLOW` | User flow name (e.g. `B2C_1_signup_signin`) |
| `AZURE_AD_B2C_CLIENT_ID` | Application (client) ID |
| `AZURE_AD_B2C_CLIENT_SECRET` | Client secret |

Redirect URI:  
`https://<your-app-domain>/api/auth/callback/azure-ad-b2c`  
(and `http://localhost:3000/...` for local).

### Optional: Use same app for both

You can set **either** Option A **or** Option B. If both are set, Option A (`ENTRA_ISSUER` + `ENTRA_CLIENT_ID` + `ENTRA_CLIENT_SECRET`) is used and the B2C vars are ignored.

## Cost

- Entra External ID: first **50,000 MAU** are free; beyond that, see [External ID pricing](https://aka.ms/ExternalIDPricing).
- You still need to create and configure each social IdP (Google, Facebook, Apple, Microsoft) in their own consoles; Azure is the single place your app talks to.

## Implementation notes

- **Auth config**: `src/lib/auth.ts` — adds the Entra/B2C provider and find-or-create user logic in the JWT callback.
- **UI**: `src/components/SocialSignIn.tsx` — “Or continue with” + one button per provider (Google, Facebook, Apple, Microsoft); used on `src/app/login/page.tsx` and `src/app/register/page.tsx`.
- **Provider ids** when using Option A: `entra-external-id-google`, `entra-external-id-facebook`, `entra-external-id-apple`, `entra-external-id-microsoft` (each passes `domain_hint` to Entra). When using Option B: single `azure-ad-b2c` (one “Microsoft” button).
