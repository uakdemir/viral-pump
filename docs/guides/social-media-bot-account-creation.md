# Social Media Bot Account Creation Guide

Step-by-step instructions for creating platform accounts and obtaining API credentials for ViralEngine.
Based on real experience (March 2026) — verified working steps only.

---
## Twitter/X — App Creation & API Credentials Well

<details>
<summary><h2>Twitter/X — App Creation & API Credentials</h2></summary>


### Prerequisites
- A personal X (Twitter) account with a verified phone number and email
- The account must not be newly created (X locks phone/email changes for 48 hours on new accounts)

### Step 1: Sign up for Developer Portal

1. Go to https://developer.x.com
2. Sign in with your personal X account (this becomes the developer portal owner — it's NOT the account that tweets)
3. If asked to describe your use case (minimum 250 chars), write something like:
   > "Building a personal project that monitors financial market data and fitness content trends. The application uses the X API to post automated content updates to X accounts — short data-driven summaries with accompanying images. We also read engagement metrics on posts made by our own accounts to measure content performance. Expected volume: 10-50 posts per day across 2-3 accounts."
4. Submit and wait for approval (may be instant, or may take up to 48 hours)

### Step 2: Create an App

1. In the Developer Portal, go to **Apps** section
2. Click **Create App**
3. App name: `viralengine-gold-forex` (must be unique across all of X)
4. Environment: leave as default (dev)
5. Click Create

**IMPORTANT:** After creation, you'll see **API Key**, **API Key Secret**, and **Bearer Token** displayed. **Copy all three immediately** — they may only be shown once.

### Step 3: Configure User Authentication

1. Go to the app's **Settings** → **User Authentication Settings** → **Set up**
2. Permissions: **Read and Write**
3. Type of App: **Web App, Automated App or Bot**
4. Callback URL: `https://example.com` (required field, we don't use OAuth2 flow)
5. Website URL: `https://example.com` (required field, placeholder)
   - NOTE: `https://localhost` was rejected as "Not a valid URL format" — use `example.com` instead
6. Save

### Step 4: Generate Access Tokens

1. Go to **Keys and Tokens** tab
2. Under **Access Token & Secret** → click **Generate**
3. Copy **Access Token** and **Access Token Secret**

### What you get (4 values)

| Value | Where it goes |
|---|---|
| API Key (Consumer Key) | `.env` → `TWITTER_API_KEY` |
| API Key Secret (Consumer Secret) | `.env` → `TWITTER_API_SECRET` |
| Access Token | Database → `accounts.credentials.accessToken` |
| Access Token Secret | Database → `accounts.credentials.accessTokenSecret` |

### Notes
- The API Key/Secret are **app-level** — shared across all Twitter accounts
- The Access Token/Secret are **per-account** — stored in the database per account
- X uses pay-per-use pricing (as of Feb 2026) — posting costs ~cents, not $100/month
- One developer portal account can manage multiple apps and multiple posting accounts
- To post to a different Twitter account (not the developer portal owner), you need the 3-legged OAuth flow

### Gotchas we encountered
- New X accounts have a 48-hour lockout on phone/email changes — can't verify during this period
- `https://localhost` is rejected as Website URL — use `https://example.com` instead

</details>

---
## Instagram — Business Account, Facebook Page & API Credentials


<details>
<summary><h2>Instagram — Business Account, Facebook Page & API Credentials</h2></summary>

### Prerequisites
- A personal Facebook account (this is the admin layer — never publicly visible)
- A phone with the Instagram app installed

### Architecture (required chain)

```
Your personal Facebook account
  → owns a Facebook Page (e.g., "Fit Pulse HQ")
    → linked to an Instagram Business account (e.g., @fitpulsehq_)
      → connected to a Meta Developer App (e.g., "viralengine-dev")
        → generates API access token
```

All four layers are required. Instagram's Content Publishing API only works through this chain.

### Step 1: Create a Facebook Page

1. Go to https://www.facebook.com/pages/create
2. Log in with your personal Facebook account
3. Page name: your brand name (e.g., "Fit Pulse HQ")
4. Category: pick the closest match (e.g., "Fitness Trainer") — doesn't affect API access
5. Create the Page

### Step 2: Create an Instagram Account

1. Open **Instagram app** on your phone
2. Go to your profile → tap your **username** at the top
3. Tap **Add account** → **Create new account**
4. Choose a username (e.g., `fitpulsehq_`)
   - If your first choice is taken, try variations: `fitpulse.hq`, `thefitpulsehq`, `fitpulsehq_`
5. When asked "Create in this Account Center?" → **Yes** (this links it to your personal Meta account for admin purposes — not publicly visible)
6. Set a **password** — write it down, you'll need it for the developer portal (actually you share the same password with your account)
7. Skip all onboarding steps (profile picture, follow suggestions, etc.)

**IMPORTANT:** Make the account **public** — go to Settings → Privacy → turn OFF "Private Account". Private accounts can't use the Content Publishing API.

### Step 3: Link Instagram to Facebook Page

**Do this from Facebook (browser), NOT from Instagram:**

1. Go to Facebook → your brand Page (e.g., "Fit Pulse HQ")
2. Click the Page's profile picture or name to go to the Page
3. Click **Settings & privacy** → **Settings**
4. In the left menu → **Linked Accounts**
5. Click **Instagram** → **Connect Account**
6. Enter your Instagram username and password (e.g., `fitpulsehq_` + password)
7. Click Log In

**Gotchas we encountered:**
- Do NOT try to link from the Instagram app — the "Connect to Facebook Page" option may not appear
- If Instagram was already linked to a different Page/account, you must disconnect it first from Facebook Page Settings → Linked Accounts
- If you created the Instagram account under the same Account Center as your personal account, both share the same password
- The Instagram "Switch to Professional Account" flow may or may not show the Facebook Page connection — it's unreliable. Link from Facebook instead.

### Step 4: Create a Meta Developer App

1. Go to https://developers.facebook.com
2. Log in with your personal Facebook account
3. Click **My Apps** → **Create App**
4. If shown "new way to create apps" notice → click **Create App** to continue
5. Select use case: **"Manage Messaging and Content Instagram"**
6. Don't connect a Business Portfolio (skip if asked)
7. App name: `viralengine-dev` (or similar)
8. Create the app

**Note:** Meta automatically creates a companion app with `-IG` suffix (e.g., `viralengine-dev-IG`). The Instagram App ID and Secret come from this `-IG` app.

### Step 5: Get Instagram App Credentials

1. In the app dashboard, left sidebar → **Instagram** → **API setup with Instagram login**
2. Copy the **Instagram App ID** and **Instagram App Secret** displayed at the top

### Step 6: Add Instagram Account & Generate Token

1. Still on the API setup page, scroll to **"Generate access tokens"**
2. Click **Add an Instagram account**
3. Log in with your Instagram credentials (`fitpulsehq_` + password)
4. If you get "Insufficient Developer Role" error:
   - Go to **App Roles** → **Roles** in the left sidebar
   - Add the Instagram account as a tester
   - Accept the tester invite from Instagram Settings
   - Try again
5. After adding the account, click **Generate Token** next to it
6. When prompted for permissions, **allow all** (access to messages, media, etc.)
7. Copy the token — tokens from the Dashboard are **long-lived (60 days)**

### Step 7: Get Instagram Business Account ID

Run this in your terminal (replace `YOUR_TOKEN`):

```bash
curl -s "https://graph.instagram.com/v21.0/me?fields=id,username&access_token=YOUR_TOKEN"
```

Response:
```json
{"id":"123456789","username":"fitpulsehq_"}
```

Save the `id` — this is your Instagram Business Account ID.

### What you get (4 values)

| Value | Where it goes |
|---|---|
| Instagram App ID | Code config (not in `.env` currently — stored per-account) |
| Instagram App Secret | Code config |
| Access Token (60-day) | Database → `accounts.credentials.accessToken` |
| Instagram Business Account ID | Database → `accounts.credentials.instagramBusinessAccountId` |

### Token Renewal

The Dashboard token lasts 60 days. To renew before expiry:

```bash
curl -s "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=YOUR_CURRENT_TOKEN"
```

Returns a new 60-day token.

### Notes
- Instagram API is **completely free** — no per-request charges
- Rate limits: 25 publishes per 24 hours, 200 API calls per hour per user token
- The Facebook Page is just a backend connector — you don't need to post anything to it
- Instagram requires **publicly reachable image URLs** for the Content Publishing API — local file paths won't work. In production, use S3/CDN.
- In development (dryRun mode), the API is never called, so this doesn't matter

### Gotchas we encountered
- "Login with Facebook" button was removed from Instagram mobile app — link from Facebook Page settings instead
- The Graph API Explorer's permission selector was broken in Chrome — use the Dashboard token generation instead
- OAuth URLs with `instagram_basic` / `instagram_content_publish` scopes are **outdated** — current scopes use `instagram_business_basic` / `instagram_business_content_publish` prefix
- Facebook Developer App auto-creates a separate `-IG` app for Instagram — the Instagram credentials come from this companion app, not the main Facebook app
- Test user creation may be "temporarily disabled" — use the Dashboard token flow instead

</details>

---

<details>
<summary><h2>Future Platforms (Not Yet Set Up)</h2></summary>

### LinkedIn
- Developer Portal: https://developer.linkedin.com
- Requires: Company Page or personal profile
- Auth: OAuth 2.0
- Note: LinkedIn deprecated `ugcPosts` API — use Community Management API (`/rest/posts`) for new apps

### Pinterest
- Developer Portal: https://developers.pinterest.com
- Requires: Business account
- Auth: OAuth 2.0, API v5

### Telegram
- Create bot via @BotFather on Telegram
- Get bot token + add bot as admin to channel
- Simplest API of all platforms — just HTTP POST with bot token

### TikTok
- Developer Portal: https://developers.tiktok.com
- Requires: Content Publishing API approval (can take weeks)
- Video-only platform — needs video generation pipeline first

### YouTube
- Developer Portal: https://console.developers.google.com
- YouTube Data API v3
- Requires: Google OAuth 2.0
- Video-only — needs video generation pipeline first

</details>

---

## Database Configuration

After obtaining credentials, configure them in the database:

### Twitter/X

```bash
# 1. Add app-level keys to .env
TWITTER_API_KEY=your-api-key
TWITTER_API_SECRET=your-api-secret

# 2. Update account in DB with per-account tokens + disable dryRun
psql $VIRAL_DATABASE_URL -c "
  UPDATE accounts
  SET credentials = '{
    \"accessToken\": \"your-access-token\",
    \"accessTokenSecret\": \"your-access-token-secret\"
  }'::jsonb,
  config = jsonb_set(config, '{dryRun}', 'false')
  WHERE name = 'Gold Forex EN';
"
```

### Instagram

```bash
# Update account in DB with Instagram credentials + disable dryRun
psql $VIRAL_DATABASE_URL -c "
  UPDATE accounts
  SET credentials = '{
    \"accessToken\": \"your-instagram-access-token\",
    \"instagramBusinessAccountId\": \"your-ig-business-account-id\"
  }'::jsonb,
  config = jsonb_set(config, '{dryRun}', 'false')
  WHERE name = 'Fitness Daily IG';
"
```

Then restart the worker and approve content — it will post to the real platforms.
