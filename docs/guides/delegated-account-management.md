# Delegated Account Management — Hiring Someone to Create Bot Accounts

How to safely give a hired person (VA, team member, contractor) access to create social media accounts and generate API credentials for ViralEngine — without exposing your personal accounts.

---

## Principles

1. **They never see your personal Facebook, Instagram, or Twitter**
2. **They only access the specific Pages, Apps, and Developer Portals you grant**
3. **Access is revocable instantly** — one click removes them
4. **They don't need your passwords** — platform role invites handle everything
5. **Tokens they generate go into your system** — they don't retain access after removal

---

## What You Provide to the Hired Person

| Item | Purpose |
|---|---|
| Meta Business Suite invite (limited role) | Create Facebook Pages + link Instagram accounts |
| Facebook Developer Portal invite (Developer role) | Generate API tokens |
| Twitter Developer Portal invite (Developer role) | Create apps + generate tokens |
| Account creation guide (`docs/guides/social-media-bot-account-creation.md`) | Step-by-step instructions |
| List of accounts to create | Brand names, usernames, verticals |
| Access to ViralEngine dashboard or DB (when OAuth flow is built) | Store generated tokens |

## What You Retain

- Ownership of all apps, pages, and developer portals
- Ability to revoke their access instantly
- No personal account exposure
- Full audit trail of what they created

---

<details>
<summary><h2>Meta (Facebook Pages + Instagram) — Delegated Setup</h2></summary>

### Step 1: Create a Meta Business Portfolio

1. Go to https://business.facebook.com
2. Create a Business Portfolio (if you don't have one)
3. Add your existing Facebook Pages to the portfolio

### Step 2: Invite the Person

1. In Meta Business Suite → **Settings** → **People**
2. Click **Invite People**
3. Enter their email address
4. Assign role: **Employee** (limited access)
5. Grant access to specific assets only:
   - **Pages:** Select only the brand Pages they need to manage (e.g., "Fit Pulse HQ")
   - **Apps:** Select only the developer app (e.g., "viralengine-dev")
   - Do NOT grant access to your personal ad accounts, pixels, or other assets

### Step 3: What They Can Do

With Employee role + Page access:

| Action | Can they do it? |
|---|---|
| Create new Facebook Pages | Yes (under the Business Portfolio) |
| Create new Instagram accounts | Yes (manually on phone — this can't be delegated via Meta) |
| Link Instagram to Facebook Page | Yes (via Page Settings → Linked Accounts) |
| Access Developer Portal | Yes (if you gave them App access) |
| Generate API tokens | Yes (via Developer App dashboard) |
| See your personal Facebook | **No** |
| See your personal Instagram | **No** |
| Access your other Pages | **No** (only the ones you granted) |
| Delete the Developer App | **No** (only Admin can) |
| Change app ownership | **No** |

### Step 4: Developer Portal Access

1. Go to https://developers.facebook.com → your app
2. **App Roles** → **Roles** → **Add People**
3. Add them as **Developer** (not Admin)
4. They can now generate tokens, add Instagram testers, and test API calls

### Step 5: Instagram Account Creation (Manual)

**This part cannot be fully delegated via roles.** The person needs to:

1. Create Instagram accounts on their own phone/device
2. Use their own email or a company email for signup
3. Link to the Facebook Pages you granted them access to
4. Switch to Business account and connect the Page

**Important:** The Instagram accounts they create will be owned by whoever's email/phone was used. To ensure you retain ownership:
- Have them create accounts using **company email addresses you control** (e.g., fitness@yourcompany.com)
- Or have them add the accounts to **your Accounts Center** (requires your authorization)

### Step 6: Revoking Access

1. Meta Business Suite → **Settings** → **People** → find the person → **Remove**
2. Developer Portal → **App Roles** → **Roles** → remove their role
3. Done — they lose all access immediately
4. Tokens they generated **continue to work** (they're tied to the app, not the person)
5. If you want to invalidate tokens too, regenerate them in the Developer Portal

</details>

---

<details>
<summary><h2>Twitter/X — Delegated Setup</h2></summary>

### Step 1: Invite to Developer Portal

1. Go to https://developer.x.com → your Developer Portal
2. **Team members** → **Invite**
3. Enter their email
4. Role: **Developer** (can create apps, generate tokens, but can't delete the project or change billing)

### Step 2: What They Can Do

| Action | Can they do it? |
|---|---|
| Create new Apps in your project | Yes |
| Generate API keys and tokens | Yes |
| Configure OAuth settings | Yes |
| See your personal X account | **No** (Developer Portal is separate from your X profile) |
| Delete the project | **No** (Admin only) |
| Change billing/pricing | **No** |
| Access your X DMs or tweets | **No** |

### Step 3: Creating Twitter Accounts for Posting

The person needs to:

1. Create new X accounts manually (e.g., @GoldForexEN, @FitnessDaily)
2. Use **company-controlled emails** for account creation
3. Verify each account with a phone number
4. Generate access tokens for each account via the Developer Portal

**For accounts they create on their own email:**
- Use the 3-legged OAuth flow to authorize each account to your app
- This way the access tokens are generated without sharing passwords
- When the "Connect Account" dashboard feature is built (see backlog), they'd just click a button

**For accounts you want to fully own:**
- Have them create accounts with emails you control
- Or transfer ownership after creation by changing the email/phone

### Step 4: Revoking Access

1. Developer Portal → **Team members** → remove them
2. Their personal access is gone
3. Apps and tokens they created **continue to work** (tied to the project)
4. To invalidate specific tokens: regenerate them in the app's Keys and Tokens page

</details>

---

<details>
<summary><h2>Security Checklist for Delegation</h2></summary>

### Before Granting Access
- [ ] Use company-controlled emails for all new accounts (not the hired person's personal email)
- [ ] Grant minimum necessary roles (Employee/Developer, never Admin)
- [ ] Grant access to specific assets only (not your entire Business Portfolio)
- [ ] Document which accounts and apps the person will create
- [ ] Set a timeline — "create these 5 accounts by Friday, then we revoke access"

### During Their Work
- [ ] They follow `docs/guides/social-media-bot-account-creation.md` step by step
- [ ] Tokens are stored directly in the database or a secure password manager — never sent via email/Slack
- [ ] They confirm each account is Public (not Private) for API access
- [ ] They test each account generates content successfully before handing off

### After Completion
- [ ] Remove their Meta Business Suite access
- [ ] Remove their Developer Portal access (both Meta and Twitter)
- [ ] Verify all tokens still work after removal
- [ ] Change passwords on any accounts created with their personal email
- [ ] Update the accounts table in the database with final credentials

### Ongoing (if long-term team member)
- [ ] Audit their access quarterly
- [ ] Rotate tokens if they leave
- [ ] Keep their role at minimum level needed

</details>

---

## Cost Estimate

| Task | Time | Cost (VA rate $5-15/hr) |
|---|---|---|
| Create 1 Instagram Business account + Facebook Page + link + API token | ~15 min | $2-4 |
| Create 1 Twitter account + Developer App + tokens | ~10 min | $1.50-2.50 |
| Full vertical setup (2 platforms × 1 vertical) | ~30 min | $4-8 |
| Scale: 3 verticals × 3 platforms each | ~2-3 hours | $15-45 |

This is a one-time cost per account. Once set up, the system runs autonomously.
