# ReplyPilot — Instagram Comment Automation SaaS

A simple, production-style Instagram comment automation app. Users sign up, connect their Instagram Business/Creator account via Meta OAuth, and create automations that auto-reply to comments + send DMs whenever a trigger keyword is detected on a chosen post.

## ✨ Features

- Email/password auth (JWT + bcrypt)
- Connect Instagram Business/Creator account via Meta Instagram Login (OAuth)
- Long-lived (60-day) Instagram access tokens, stored per user
- Create automations: pick a post + trigger keyword + auto-reply + DM message
- Auto-subscribe each connected IG account to Instagram comment/message webhooks
- Webhook receiver verifies + processes Instagram comment events
- When a comment matches the trigger keyword → posts a reply + sends a DM via Instagram Graph API
- Toggle ON/OFF and delete automations
- "Check webhook subscription" and "Re-subscribe" tools per account

## 🛠 Tech Stack

- **Frontend + Backend:** Next.js 14 (App Router) — full-stack in one process
- **Database:** MongoDB (local or Atlas)
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **UI:** Tailwind CSS + shadcn/ui + lucide-react icons
- **Toasts:** sonner

> Why one server instead of separate Express on `:5000`? Cleaner, simpler, identical REST surface. All routes live under `/api/...` and are dispatched by a single dynamic Next.js route at `app/api/[[...path]]/route.js`.

## 📁 Project Structure

```
/app
├── app/
│   ├── api/[[...path]]/route.js   # All REST endpoints (auth, instagram, automations, webhook)
│   ├── page.js                    # Single-page UI (login / signup / dashboard / create-automation)
│   ├── layout.js                  # Root layout + Toaster
│   └── globals.css                # Tailwind base
├── components/ui/                 # shadcn components
├── lib/
│   ├── mongo.js                   # MongoDB client (cached)
│   └── auth.js                    # JWT + bcrypt helpers
├── .env                           # Environment variables (NEVER commit)
├── package.json
└── README.md
```

## 🧱 MongoDB Collections

| Collection | Fields |
|------------|--------|
| `users` | `_id` (UUID), `email`, `password` (bcrypt), `createdAt` |
| `instagram_accounts` | `_id` (UUID), `connectedUserId`, `instagramUserId`, `username`, `accountType`, `accessToken`, `tokenExpiry`, `createdAt`, `updatedAt` |
| `automations` | `_id` (UUID), `userId`, `instagramAccountId`, `postId`, `postPermalink`, `postThumbnail`, `triggerWord`, `replyMessage`, `dmMessage`, `isActive`, `createdAt` |
| `webhook_events` | Raw payload archive for debugging |
| `automation_runs` | History of fired automations (reply + DM results) |

## 🌐 API Endpoints

All routes are under `/api`. Authenticated routes require `Authorization: Bearer <jwt>`.

### Auth
| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/api/auth/signup` | `{email, password}` | Returns `{token, user}` |
| POST | `/api/auth/login` | `{email, password}` | Returns `{token, user}` |
| GET | `/api/auth/me` | — | Requires auth |

### Instagram
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/instagram/connect` | Returns `{url}` to redirect user to Meta OAuth |
| GET | `/api/instagram/callback` | OAuth callback (Meta calls this) |
| GET | `/api/instagram/accounts` | List connected IG accounts for logged-in user |
| DELETE | `/api/instagram/accounts/:id` | Disconnect + delete linked automations |
| POST | `/api/instagram/accounts/:id/resubscribe` | Manually re-subscribe to webhooks |
| GET | `/api/instagram/accounts/:id/subscription` | Check current webhook subscription status |
| GET | `/api/instagram/media?accountId=` | List the IG account's recent posts |

### Automations
| Method | Path | Body / Notes |
|--------|------|--------------|
| POST | `/api/automations` | `{instagramAccountId, postId, triggerWord, replyMessage, dmMessage, ...}` |
| GET | `/api/automations` | List automations for logged-in user |
| PUT | `/api/automations/:id` | Update (e.g., `{isActive:false}` to disable) |
| DELETE | `/api/automations/:id` | Delete |

### Webhook (called by Meta)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/webhook` | Verify endpoint (`hub.challenge` echo) |
| POST | `/api/webhook` | Receive Instagram events (`comments`, `messages`) |

---

## 🔑 Environment Variables

Create a `.env` file in the project root with these:

```bash
# MongoDB (local or Atlas connection string)
MONGO_URL=mongodb://localhost:27017
DB_NAME=ig_automation

# Public base URL of this app (used for OAuth redirect URI and webhook URL).
# In local dev: http://localhost:3000
# In production: your https domain (e.g., https://app.yourbrand.com)
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# JWT signing secret — use a strong random string in production
JWT_SECRET=please_change_me_to_a_long_random_string

# Meta App credentials (https://developers.facebook.com/apps/)
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret

# Verify token you set in Meta App Dashboard → Webhooks
WEBHOOK_VERIFY_TOKEN=your_random_verify_token

# Meta Graph API version (keep at v22.0 unless you know what you're doing)
META_API_VERSION=v22.0

CORS_ORIGINS=*
```

---

## 🚀 Local Setup (run in ~5 minutes)

### Prerequisites
- Node.js 18+ (or 20+)
- Yarn (the repo uses `yarn`, not npm)
- MongoDB running locally on `mongodb://localhost:27017` (or use MongoDB Atlas — just paste the connection string into `MONGO_URL`)

### Steps

```bash
# 1. Clone & install
git clone <your-repo>
cd ig-automation
yarn install

# 2. Create .env (copy the template above into a new .env file)
# Fill in MongoDB, JWT_SECRET, META_APP_ID, META_APP_SECRET, WEBHOOK_VERIFY_TOKEN

# 3. Start MongoDB locally (if not already running)
mongod --dbpath ~/data/db  # adjust path as needed
# or use Docker: docker run -d -p 27017:27017 --name mongo mongo:7

# 4. Run the dev server
yarn dev
```

The app will be available at **http://localhost:3000**.

> Note: For Meta OAuth and webhook callbacks to work locally, Meta requires HTTPS URLs. Use a tunneling tool like **ngrok** for local testing — see "Local Testing with Meta" below.

---

## 🌍 Meta App Setup (Required for Instagram features)

### A. Create a Meta App

1. Go to https://developers.facebook.com/apps/ → **Create App**
2. Use case: **"Other"** → App type: **"Business"**
3. Once created, add the **Instagram** product (with "Instagram API with Instagram Login")

### B. Configure Instagram Business Login

1. In the app's left sidebar → **Instagram → API setup with Instagram login**
2. Add an OAuth redirect URI:
   ```
   {NEXT_PUBLIC_BASE_URL}/api/instagram/callback
   ```
   Example: `https://yourdomain.com/api/instagram/callback`
3. Grab your **Instagram App ID** + **Instagram App Secret** → paste them into `.env` as `META_APP_ID` and `META_APP_SECRET`

### C. Configure Webhooks

1. In the left sidebar → **Webhooks** (the standalone Webhooks product)
2. Object dropdown: **Instagram**
3. Click **Subscribe** and enter:
   - **Callback URL:** `{NEXT_PUBLIC_BASE_URL}/api/webhook` (e.g., `https://yourdomain.com/api/webhook`)
   - **Verify Token:** the same value as your `.env`'s `WEBHOOK_VERIFY_TOKEN`
4. Click **Verify and Save** — Meta will hit `GET /api/webhook` and our server will respond with the challenge. ✅
5. Subscribe to fields:
   - ✅ `comments` (required)
   - ✅ `messages` (required for DM-related events)

### D. Add Testers (Required in Development Mode)

While your app is in **Development Mode** (default), Meta only delivers webhook events for Instagram accounts marked as testers.

1. In Meta App Dashboard → **App Roles → Roles → Add People → Instagram Tester**
2. Add the Instagram usernames you want to test with
3. On each invited Instagram account's phone:
   - Open Instagram → **Settings → Apps and Websites → Tester Invites**
   - Accept the invite — the app should then appear under the **"Active"** tab

### E. Request Permissions for Production

To go live (handle real, non-tester users), submit these permissions for App Review:
- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`
- `instagram_business_content_publish` (optional)

---

## 🧪 Local Testing with Meta (using ngrok)

Meta needs HTTPS to verify webhooks. Use [ngrok](https://ngrok.com/) for local dev:

```bash
# Terminal 1
yarn dev   # runs on localhost:3000

# Terminal 2
ngrok http 3000
# ngrok will print a public HTTPS URL, e.g. https://abcd-1234.ngrok-free.app
```

Then:
1. Update `.env` → `NEXT_PUBLIC_BASE_URL=https://abcd-1234.ngrok-free.app` and restart `yarn dev`
2. Update Meta App OAuth redirect URI to `https://abcd-1234.ngrok-free.app/api/instagram/callback`
3. Update webhook callback URL to `https://abcd-1234.ngrok-free.app/api/webhook`

> ⚠️ ngrok free URLs change every restart. For sustained testing, use a paid ngrok plan with a custom domain, or deploy.

---

## 🚢 Deployment

### Option 1 — Vercel (Recommended, easiest)

Vercel is the maker of Next.js. Zero-config deploy.

1. Push your code to GitHub.
2. Go to https://vercel.com → **New Project** → import your repo.
3. **Environment Variables** — add all the ones from `.env`:
   - `MONGO_URL` (use MongoDB Atlas — see below)
   - `DB_NAME=ig_automation`
   - `NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app` (Vercel gives you a URL after first deploy; update this var and redeploy)
   - `JWT_SECRET=<long random string>`
   - `META_APP_ID`, `META_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`
   - `META_API_VERSION=v22.0`
4. Click **Deploy**.
5. After deploy, copy the live URL → set it as `NEXT_PUBLIC_BASE_URL` in Vercel env → redeploy.
6. Go back to Meta App Dashboard and update:
   - **OAuth Redirect URI** to `https://your-app.vercel.app/api/instagram/callback`
   - **Webhook Callback URL** to `https://your-app.vercel.app/api/webhook`

#### MongoDB Atlas (cloud DB for Vercel)
1. Create free cluster at https://www.mongodb.com/cloud/atlas
2. Atlas → Network Access → allow `0.0.0.0/0` (or Vercel IPs)
3. Database Access → create a user with read/write
4. Get the connection string: `mongodb+srv://<user>:<pass>@cluster.xxxx.mongodb.net/`
5. Paste into Vercel env as `MONGO_URL`

### Option 2 — Render / Railway / Fly.io

Any Node.js host works. Example for Render:

1. Push to GitHub.
2. Render → **New Web Service** → connect your repo.
3. **Build command:** `yarn install && yarn build`
4. **Start command:** `yarn start`
5. Add the env variables (same as Vercel section).
6. Update Meta dashboard with your Render URL + `/api/instagram/callback` and `/api/webhook`.

### Option 3 — Docker / VPS

```bash
# Build
yarn install
yarn build

# Run (production mode)
yarn start
```

Behind any reverse proxy (Nginx, Caddy) with HTTPS. Make sure `NEXT_PUBLIC_BASE_URL` reflects your real https URL.

---

## 🧷 Post-Deployment Checklist

- [ ] `NEXT_PUBLIC_BASE_URL` matches your live HTTPS domain
- [ ] Meta App → Instagram → OAuth Redirect URIs include `<live-url>/api/instagram/callback`
- [ ] Meta App → Webhooks → Instagram → Callback URL = `<live-url>/api/webhook` and verified ✅
- [ ] `comments` and `messages` fields subscribed at the app level
- [ ] Test users added as Instagram Testers (or app is approved Live)
- [ ] MongoDB is reachable from your host (whitelist IPs if using Atlas)
- [ ] `JWT_SECRET` is a strong random value (not the default)

---

## 🐞 Common Issues & Fixes

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Can't connect Instagram — `redirect_uri mismatch` | Redirect URI not added in Meta App | Add `{NEXT_PUBLIC_BASE_URL}/api/instagram/callback` exactly |
| `Object with ID … does not exist` on subscribe | Old API version | Use `META_API_VERSION=v22.0` and call `/me/subscribed_apps` (already implemented) |
| Posts list is empty | Account has no media OR access token expired | Re-connect the IG account |
| Webhook not firing for real comments | App in Dev mode, commenter not a tester | Add commenter as Instagram Tester; accept invite from IG app |
| Webhook fires only for Meta "Test" button but not real comments | App-level field subscription not enabled | Meta Dashboard → Webhooks → Instagram → subscribe to `comments` field |
| You commented on your own post and nothing happened | Meta doesn't fire webhooks for self-comments on own media | Comment from a different (tester) account |
| `Invalid signature` on webhook | (Not enforced by us yet) — see "Production Hardening" below | — |

---

## 🔐 Production Hardening (recommended next steps)

These are intentionally simplified for the MVP. Add before going to scale:

1. **HMAC signature verification** on `POST /api/webhook` using `X-Hub-Signature-256` header + `META_APP_SECRET` (function provided in playbook — wire it in)
2. **Refresh long-lived tokens** before they expire (60-day rolling refresh)
3. **Rate-limit Graph API calls** to respect Instagram's per-account quotas
4. **Background processing** of webhook events (push to a queue) instead of inline
5. **Move JWT to HTTP-only cookies** rather than localStorage
6. **Email verification + password reset**

---

## 📜 License

MIT — do whatever, just don't blame me.

## 🙌 Credits

Built with Next.js, MongoDB, Meta Graph API, shadcn/ui.
