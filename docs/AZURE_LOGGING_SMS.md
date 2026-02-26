# Azure App Service: See app logs and debug SMS

## Why you don't see `[Azure SMS]` or `[send-phone-code]` in Log stream

The **Log stream** in Azure App Service shows deployment and container output. By default it does **not** show your Next.js app’s `console.log` / `console.error` unless **Application Logging** is turned on.

## Enable Application Logging

1. In **Azure Portal** go to your **App Service** (the web app).
2. **Monitoring** → **App Service logs** (or **Logging**).
3. Set **Application Logging** to **On** (or **File System**).
4. Optionally set **Log Level** to **Information** or **Verbose**.
5. **Save**.

After that, when you open **Log stream** and trigger “Send verification code”, you should see lines like:

- `[Azure SMS] Configured (from=***1234)...` or `[Azure SMS] NOT configured...` when the app starts.
- `[send-phone-code] Request received, phone ends ***5678, Azure SMS configured: true/false` when the API is called.
- `[Azure SMS] Send failed: {...}` if the Azure SMS API returns an error.

## Check that the API is called

- If you **never** see `[send-phone-code] Request received` after clicking “Send verification code”, the request is not reaching the app (wrong URL, CORS, or client error). Confirm the front end calls `POST /api/auth/send-phone-code` with body `{ "phone": "+1..." }`.
- If you see `Request received` and `Azure SMS configured: false`, set **Application settings** for the App Service:
  - `AZURE_ACS_CONNECTION_STRING` (or `COMMUNICATION_SERVICES_CONNECTION_STRING`)
  - `AZURE_ACS_SMS_FROM` (E.164, e.g. `+18339081234`).
- If you see `Azure SMS configured: true` but still no SMS, check the next log line for `[Azure SMS] Send failed` or `[Azure SMS] Exception` and fix the connection string or number (e.g. toll-free verification in Azure).

## Phone verification env vars

| Variable | Description |
|----------|-------------|
| `AZURE_ACS_CONNECTION_STRING` | From Azure Communication Services resource → Keys. |
| `AZURE_ACS_SMS_FROM` | E.164 sender number (e.g. `+18339081234`). Must be SMS-capable; US toll-free may require toll-free verification. |
