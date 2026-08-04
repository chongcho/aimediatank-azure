# Azure Communication Services (ACS) – SMS setup guide

This guide walks you through creating an Azure Communication Services resource and configuring it so the app can send SMS verification codes (e.g. for sign-up phone verification).

---

## 1. Create the Communication Service resource

1. In **Azure Portal**, go to **Create a resource** and search for **Communication Services**.
2. Open **Communication Service** and click **Create**.

### Basics tab

| Field | What to do |
|-------|------------|
| **Subscription** | Choose the subscription that will be billed (e.g. "Azure subscription 1"). |
| **Resource group** | Use an existing group (e.g. **aimediatank**) or click **Create new** and name it (e.g. `rg-aimediatank-acs`). |
| **Resource Name** | Enter a unique name, e.g. `aimediatank-acs` or `aimediatank-sms`. This becomes part of the resource URL. |
| **Data location** | Choose the region for the service (e.g. **United States**). |

3. Click **Review + create**, then **Create**.
4. Wait until the resource is deployed.

---

## 2. Get the connection string

1. Open your **Communication Service** resource in the portal.
2. In the left menu, under **Settings**, click **Keys**.
3. Copy the **Primary connection string** (or Secondary).  
   It looks like:  
   `endpoint=https://your-resource.communication.azure.com/;accesskey=...`

This is the value you will use for **AZURE_ACS_CONNECTION_STRING** (or **COMMUNICATION_SERVICES_CONNECTION_STRING**) in your app.

---

## 3. Get an SMS-capable phone number

SMS is sent *from* a number that belongs to your Communication Services resource. You must provision one first.

1. In your **Communication Service** resource, go to **Phone numbers** (left menu).
2. Click **Get a phone number** (or **Purchase**).
3. Choose:
   - **Country/region** (e.g. United States).
   - **Number type** (e.g. **Toll-free** for US; other types vary by country).
   - **Capabilities**: ensure **SMS** is selected.
4. Click **Search**, pick a number from the list, then complete **Purchase**.
5. Note the number in **E.164** format (e.g. `+18005551234`).  
   This is the value for **AZURE_ACS_SMS_FROM**.

**Cost (approximate):**

- Toll-free (US): about **$2/month** lease + per-message fee (e.g. ~\$0.0075/segment + small surcharge).
- Exact pricing: [Azure Communication Services pricing](https://azure.microsoft.com/pricing/details/communication-services/).

---

## 4. Configure your app

Your app reads two values from the environment.

### Option A: Local development (`.env` or `.env.local`)

Add:

```env
AZURE_ACS_CONNECTION_STRING=endpoint=https://your-resource.communication.azure.com/;accesskey=YOUR_ACCESS_KEY
AZURE_ACS_SMS_FROM=+18005551234
```

Replace with your real connection string and the E.164 number from step 3.

### Option B: Azure App Service (production/staging)

1. In the portal, open your **App Service** (e.g. aimediatank-azure or aimediatank-staging).
2. Go to **Settings** → **Configuration** → **Application settings**.
3. Add two new application settings:

| Name | Value |
|------|--------|
| **AZURE_ACS_CONNECTION_STRING** | The full connection string from step 2. |
| **AZURE_ACS_SMS_FROM** | The E.164 sender number from step 3 (e.g. `+18005551234`). |

4. Click **Save** and **Continue** if prompted; restart the app if needed.

**Alternative name:** The code also checks **COMMUNICATION_SERVICES_CONNECTION_STRING** if **AZURE_ACS_CONNECTION_STRING** is not set. You can use either name.

---

## 5. Verify behavior

- **When both variables are set:**  
  “Send verification code” on the Join (registration) page sends a real SMS to the entered phone number. The code is **not** returned in the API response.

- **When either variable is missing:**  
  The app does not call Azure SMS. The 6-digit code is still generated and stored; in the API response the code is included so the UI can pre-fill it for testing (e.g. in dev or before ACS is configured).

---

## 6. Toll-free verification (TFV) — opt-in & privacy

US/CA carriers require [toll-free verification](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/sms/apply-for-toll-free-verification) before reliable delivery. Submit from the ACS resource → **Toll-free verification**.

### Program description (paste)

> AI Media Tank (AiM) sends transactional SMS one-time passcodes (OTP) so users can verify a mobile number during account registration or when updating their phone on their profile. Recipients are users who voluntarily provide a phone number on https://www.aimediatank.com. Message frequency varies (typically 1–few messages per signup or phone change). Not used for marketing or promotional campaigns.

### Opt-in method (paste)

> Website form. On Join (register) and Edit Profile, the user enters a mobile number. Beside the phone field they see: “By providing your mobile number, you agree to receive SMS messages from AI Media Tank.” Consent is collected by AI Media Tank (first party) when the user provides a phone number / requests a verification code. Screenshots: Join and Edit Profile phone sections on production. Privacy Policy (separate): https://www.aimediatank.com/privacy

### Opt-in URL

Host a clear screenshot (or short PDF) of the Join / Edit Profile phone field **with the SMS consent text and Privacy/Terms links visible**, then paste the public HTTPS URL into Azure. Example pages to capture after deploy:

- `https://www.aimediatank.com/register` (Mobile field + disclosure)
- `https://www.aimediatank.com/profile/edit` (signed-in; Mobile field + disclosure)

### Privacy policy URL

`https://www.aimediatank.com/privacy`

Personal data (phone number) is collected for verification; the Privacy Policy covers SMS delivery for verification and transactional messages.

### Sample message template

```
Your verification code is:
######
This code expires in 10 minutes. If you didn't request it, secure your account.
Reply STOP to opt out.
AI Media Tank
```

### App UI

`SmsOptInDisclosure` is always shown under the phone field on Join and Edit Profile (not gated on the admin phone-verification toggle), so TFV screenshots and carriers always see consent at collection.

---

## Summary checklist

- [ ] Create Communication Service resource (Basics: subscription, resource group, name, data location).
- [ ] Copy **Primary connection string** from **Keys**.
- [ ] In **Phone numbers**, purchase an SMS-capable number and note its E.164 value.
- [ ] Set **AZURE_ACS_CONNECTION_STRING** and **AZURE_ACS_SMS_FROM** in App Service (or `.env` for local).
- [ ] Restart the app and test “Send verification code” with a real phone number.
- [ ] Screenshot Join + Edit Profile SMS consent UI; host publicly; submit **Toll-free verification** with Privacy Policy URL.
