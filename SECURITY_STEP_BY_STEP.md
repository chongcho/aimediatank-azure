# Security setup — step-by-step guide

Follow these steps in order. You need **Azure Portal** (or Azure CLI) and a terminal.

---

## Step 1: Generate secret values

In a terminal, generate random values for your secrets (or use a password manager):

**On Windows (PowerShell):**
```powershell
# Generate a 32-byte base64 string (use for each secret)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

**On macOS/Linux (or Git Bash on Windows):**
```bash
openssl rand -base64 32
```

Generate **three** values and save them somewhere safe (e.g. password manager):

- One for **NEXTAUTH_SECRET**
- One for **CRON_SECRET**
- One for **LOG_ACCESS_SECRET** (optional but recommended)

You’ll use the same **CRON_SECRET** in both the Web App and the Function App.

---

## Step 2: Set secrets on the **Azure Web App** (Next.js app)

1. Open **Azure Portal** → your resource group → **aimediatank-azure** (or your Web App name).
2. Go to **Settings** → **Configuration** (or **Environment variables** in the new portal).
3. Open **Application settings**.
4. Add or edit:

   | Name               | Value                    | Notes                    |
   |--------------------|--------------------------|--------------------------|
   | `NEXTAUTH_SECRET`  | _(paste generated value)_| Required in production.  |
   | `CRON_SECRET`      | _(paste generated value)_| Required for cron.       |
   | `LOG_ACCESS_SECRET`| _(paste generated value)_| Optional; for geo logs.  |

5. Use the **same** value for `CRON_SECRET` that you will use in the Function App (Step 3).
6. Click **Save** (and **Continue** if asked). The app may restart.

---

## Step 3: Set secrets on the **Azure Function App** (cron jobs)

Your cron jobs run in a **separate** Azure Function App. It must have the same **CRON_SECRET** so it can call the Web App.

1. In **Azure Portal**, open the **Function App** that hosts the timers (process-videos, cleanup, send-reminders).
2. Go to **Settings** → **Configuration** → **Application settings**.
3. Add or edit:

   | Name           | Value                    | Notes                          |
   |----------------|--------------------------|--------------------------------|
   | `CRON_SECRET`  | _(same as Web App)_      | Must match Web App exactly.    |
   | `WEBAPP_URL`   | `https://aimediatank-azure.azurewebsites.net` | Or your real Web App URL. |

4. Save. The Function App will restart.

After this, the functions will send `x-cron-secret` with every request to your cron endpoints.

---

## Step 4: (Optional) Create your first admin user

Only do this if you still need to promote someone to admin via the app.

1. On the **Azure Web App** (same as Step 2), add one more application setting:
   - **Name:** `ADMIN_SETUP_SECRET`  
   - **Value:** a **new** strong random value (e.g. another `openssl rand -base64 32`).  
   Save.

2. Call the endpoint once (replace with your admin email and the secret you set):
   ```bash
   curl -X POST https://aimediatank-azure.azurewebsites.net/api/admin/set-admin \
     -H "Content-Type: application/json" \
     -d "{\"email\": \"your-admin@example.com\", \"secret\": \"YOUR_ADMIN_SETUP_SECRET\"}"
   ```
   Or use Postman/Insomnia: **POST** to `https://<your-webapp-url>/api/admin/set-admin`, body:
   ```json
   { "email": "your-admin@example.com", "secret": "YOUR_ADMIN_SETUP_SECRET" }
   ```

3. After you get a success response:
   - Go back to the Web App **Configuration** → **Application settings**.
   - **Remove** the `ADMIN_SETUP_SECRET` setting (or delete the `src/app/api/admin/set-admin` route from the code and redeploy).

---

## Step 5: (If needed) Run the legalName migration once

Only if your database doesn’t have the `legalName` column yet:

1. Log in to your app as a user that is already **ADMIN** (e.g. after Step 4).
2. In the browser, open (or call with curl):
   ```
   https://aimediatank-azure.azurewebsites.net/api/admin/add-legal-name
   ```
3. You should get `{"success":true,"message":"legalName column added successfully"}`.  
   After that, you don’t need to call this again.

---

## Step 6: Fix dependency vulnerabilities

On your machine, in the project folder:

```bash
cd "c:\Users\chong\AI Studio\aimediatank-azure"
npm audit
npm audit fix
```

If the report still shows critical/high issues for **Next.js**:

```bash
npm install next@14.2.35
npm run build
```

Then run your usual tests and deploy.

---

## Step 7: Verify

- **Login:** Open the app and sign in. If production has `NEXTAUTH_SECRET` set, auth and admin re-auth should work.
- **Cron:** Check Azure Function App **Monitor** / **Log stream** for the timer functions. You should see successful runs (e.g. “Processed video” or “No pending videos”) and no 401/503 from the Web App.
- **Admin:** If you have an admin user, open the admin panel and confirm re-auth works.

---

## Quick checklist

- [ ] **Step 1:** Generated and stored NEXTAUTH_SECRET, CRON_SECRET, LOG_ACCESS_SECRET.
- [ ] **Step 2:** Set NEXTAUTH_SECRET, CRON_SECRET (and optionally LOG_ACCESS_SECRET) on the **Web App**.
- [ ] **Step 3:** Set CRON_SECRET and WEBAPP_URL on the **Function App** (same CRON_SECRET as Web App).
- [ ] **Step 4 (optional):** Created first admin with ADMIN_SETUP_SECRET, then removed that setting.
- [ ] **Step 5 (optional):** Ran add-legal-name once as admin if needed.
- [ ] **Step 6:** Ran `npm audit` / `npm audit fix` and upgraded Next.js if needed.
- [ ] **Step 7:** Checked login, cron logs, and admin panel.

If anything fails (e.g. 503 on cron, admin re-auth error), double-check that the same **CRON_SECRET** is set in both Web App and Function App and that **NEXTAUTH_SECRET** is set on the Web App.
