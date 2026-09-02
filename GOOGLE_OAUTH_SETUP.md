# Google OAuth2 Setup Guide

This guide walks you through creating a Google Cloud project and OAuth2 credentials for the Simply Black and White scanner dashboard.

**Time required:** ~10 minutes  
**Account to use:** frictionlessaccess@gmail.com

---

## Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Sign in with **frictionlessaccess@gmail.com**
3. Click the project dropdown (top-left, next to "Google Cloud")
4. Click **"New Project"**
5. Name it: `simply-black-and-white`
6. Click **Create**
7. Make sure the new project is selected in the dropdown

---

## Step 2: Enable the Google+ API (People API)

1. In the left sidebar, go to **APIs & Services → Library**
2. Search for **"Google People API"**
3. Click it and press **Enable**

---

## Step 3: Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** (unless you have a Workspace account)
3. Click **Create**
4. Fill in:
   - **App name:** `Simply Black and White Scanner`
   - **User support email:** `frictionlessaccess@gmail.com`
   - **Developer contact email:** `frictionlessaccess@gmail.com`
5. Click **Save and Continue**
6. On the **Scopes** page, click **Add or Remove Scopes**
   - Select: `email`, `profile`, `openid`
   - Click **Update** → **Save and Continue**
7. On the **Test users** page:
   - Click **Add Users**
   - Add: `frictionlessaccess@gmail.com`
   - Click **Save and Continue**
8. Click **Back to Dashboard**

**Note:** While in "Testing" mode, only the test users you add can log in. This is fine — you only need your own account.

---

## Step 4: Create OAuth2 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `SBW Scanner`
5. Under **Authorized redirect URIs**, add:
   - For local development: `http://localhost:3000/auth/google/callback`
   - For production (add later): `https://simplyblackandwhite.com/auth/google/callback`
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

---

## Step 5: Update Your .env File

Open your `.env` file and replace the placeholder values:

```
GOOGLE_CLIENT_ID=your_actual_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_actual_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

---

## Step 6: Restart and Test

1. Restart the server: `npm start`
2. Go to `http://localhost:3000/scanner`
3. You should be redirected to the login page
4. Click "Sign in with Google"
5. Sign in with `frictionlessaccess@gmail.com`
6. You should land on the scanner dashboard

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "Access blocked: This app's request is invalid" | Check that the callback URL in Google Console matches your .env exactly |
| "Error 403: access_denied" | Make sure frictionlessaccess@gmail.com is added as a test user |
| Login works but dashboard says "unauthorized" | Check that ALLOWED_GOOGLE_EMAIL in .env matches your Google account email exactly |
| "OAuth2 credentials not configured" in server logs | The GOOGLE_CLIENT_ID in .env is still the placeholder value |

---

## Production (Later — Phase 10)

When deploying to Railway:
1. Add the production callback URL to Google Console: `https://simplyblackandwhite.com/auth/google/callback`
2. Update `GOOGLE_CALLBACK_URL` in Railway environment variables
3. Consider publishing the OAuth app (removes the "test users only" restriction) — though since only you use it, testing mode is fine forever

---

*This file can be deleted after setup is complete.*
