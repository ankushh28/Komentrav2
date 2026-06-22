# Komentra

Komentra is a Next.js app for Instagram comment and DM automation. A user signs up with email OTP, creates one or more workspaces, connects an Instagram Business or Creator account, and creates automations that reply to comments or incoming DMs when keywords match.

The backend is built into the Next.js app through one catch-all API route, and webhook processing is moved out of the request path into a Redis/BullMQ worker.

## What The App Does

- Email/password auth with OTP email verification.
- Password reset by email OTP.
- Workspace-based organization for accounts, automations, analytics, and audience data.
- Instagram OAuth connection with long-lived Instagram tokens.
- Comment-to-DM automation for selected Instagram posts.
- Optional DM response when a user shares the selected post or reel to the connected account's inbox.
- DM auto-reply automation for incoming Instagram messages.
- Follow-gated DM flow using Instagram postback buttons.
- Meta webhook verification with `X-Hub-Signature-256`.
- Webhook ingestion through BullMQ and Redis.
- Background worker for matching automations, sending replies/DMs, applying cooldowns, and recording analytics.
- Billing plans with Razorpay subscriptions and usage limits.
- Audience list and paid-plan audience export.

## Tech Stack

| Area | Tool |
| --- | --- |
| Web app | Next.js 14 App Router |
| UI | React, Tailwind CSS, shadcn/ui, lucide-react, sonner |
| API | `app/api/[[...path]]/route.js` catch-all route |
| Database | MongoDB |
| Queue | Redis + BullMQ |
| Worker | Node.js `worker.js` |
| Auth | JWT + bcryptjs |
| Email | Resend |
| Payments | Razorpay |
| Instagram | Meta Instagram Graph API |

## Project Structure

```text
app/
  api/[[...path]]/route.js     Main API dispatcher
  auth/page.js                 Login, signup, OTP, password reset
  dashboard/page.js            Workspaces, accounts, automations
  analytics/page.js            Analytics dashboard
  audience/page.js             Audience list and export
  billing/page.js              Plan and subscription management
  contact/                     Contact page and form
components/
  ui/                          shadcn/ui components
lib/
  auth.js                      JWT and password helpers
  mongo.js                     MongoDB connection
  queue.js                     BullMQ producer
  redis.js                     Redis connection for web process
  entitlements.js              Plan limits and usage counters
  plans.js                     Plan definitions
  email.js                     Resend email helpers
worker.js                      BullMQ consumer and Instagram send logic
scripts/migrate-workspaces.mjs Workspace migration helper
```

## Core Data Model

| Collection | Purpose |
| --- | --- |
| `users` | App users, bcrypt password hash, email verification state, subscription data |
| `workspaces` | User-owned containers for one Instagram account and its automations |
| `instagram_accounts` | Connected Instagram accounts, webhook IDs, token expiry, access token |
| `oauth_states` | Short-lived Instagram OAuth state records |
| `automations` | Comment and DM automations with keywords, replies, buttons, gating settings |
| `automation_runs` | History of processed automation events for analytics |
| `automation_deliveries` | Worker idempotency, cooldowns, and delivery status |
| `audience_members` | Per-workspace audience records created from comments and DMs |
| `usage_counters` | Monthly trigger usage per workspace |
| `webhook_events` | Raw Meta webhook payload archive |
| `billing_events` | Razorpay webhook event archive and dedupe |

## API Reference

All API routes live under `/api`. Authenticated routes require:

```http
Authorization: Bearer <jwt>
```

Workspace-scoped routes should also send:

```http
X-Workspace-Id: <workspaceId>
```

If `X-Workspace-Id` is missing, the API uses the user's first active workspace.

### Auth

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | `{ "username": "...", "email": "...", "password": "..." }` | `{ "needsVerification": true, "email": "..." }` |
| POST | `/api/auth/verify-otp` | `{ "email": "...", "otp": "123456" }` | `{ "token": "...", "user": {...} }` |
| POST | `/api/auth/resend-otp` | `{ "email": "..." }` | `{ "sent": true }` |
| POST | `/api/auth/login` | `{ "email": "...", "password": "..." }` | `{ "token": "...", "user": {...} }` or `needsVerification` |
| GET | `/api/auth/me` | none | Current user |
| POST | `/api/auth/forgot-password` | `{ "email": "..." }` | Generic sent response |
| POST | `/api/auth/reset-password` | `{ "email": "...", "otp": "123456", "newPassword": "..." }` | `{ "token": "...", "user": {...} }` |

### Workspaces

| Method | Path | Body / Notes |
| --- | --- | --- |
| GET | `/api/workspaces` | List user workspaces with account and automation counts |
| POST | `/api/workspaces` | `{ "name": "Client A" }` |
| PUT | `/api/workspaces/:id` | `{ "name": "..." }` or `{ "status": "active" | "disabled" }` |
| DELETE | `/api/workspaces/:id` | Deletes workspace accounts, automations, and runs |

### Instagram

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/instagram/connect` | Returns `{ "url": "..." }` for Meta OAuth |
| GET | `/api/instagram/callback` | Meta OAuth callback |
| GET | `/api/instagram/accounts` | List connected accounts in the selected workspace |
| DELETE | `/api/instagram/accounts/:id` | Disconnect account and delete its automations |
| POST | `/api/instagram/accounts/:id/resubscribe` | Re-subscribe the account to Meta webhook fields |
| GET | `/api/instagram/accounts/:id/subscription` | Check current webhook subscription state |
| GET | `/api/instagram/media?accountId=...` | List recent media for automation setup |

### Automations

There are two automation types.

#### Comment-to-DM Automation

```json
{
  "type": "comment_dm",
  "instagramAccountId": "account-id",
  "postId": "instagram-media-id",
  "postPermalink": "https://instagram.com/...",
  "postThumbnail": "https://...",
  "name": "Pricing reply",
  "keywords": ["price", "pricing"],
  "matchType": "contains",
  "replyMessages": ["Sent you the details."],
  "dmText": "Here is the link you asked for.",
  "dmButtons": [{ "title": "Open link", "url": "https://example.com" }],
  "respondToPostShares": false,
  "askToFollow": false,
  "followMessage": "",
  "followButtonText": "I Followed"
}
```

#### DM Auto-Reply Automation

```json
{
  "type": "dm_reply",
  "instagramAccountId": "account-id",
  "name": "DM pricing reply",
  "keywords": ["price", "pricing"],
  "matchType": "contains",
  "replyMessages": ["Here are the details."],
  "replyButtons": [{ "title": "Open link", "url": "https://example.com" }]
}
```

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/automations` | Create either automation type |
| GET | `/api/automations` | List automations for the selected workspace |
| PUT | `/api/automations/:id` | Update settings or toggle `isActive` |
| DELETE | `/api/automations/:id` | Delete automation |

Supported `matchType` values are `contains`, `exact`, and `starts_with`.

For `comment_dm` automations, `respondToPostShares` is optional and defaults to `false`. When enabled, an incoming `messages` webhook whose `share`, `ig_reel`, or `reel` attachment URL matches the selected post permalink sends the configured DM without posting a public comment reply. Matching is scoped to the connected Instagram account and ignores permalink query parameters and fragments. The existing follow gate and DM buttons also apply to this trigger.

### Analytics And Audience

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/analytics` | Summary, timeline, per-automation stats, top keywords, funnel, recent matches |
| GET | `/api/audience` | List visible audience records for selected workspace |
| GET | `/api/audience/export` | CSV export, available on paid plans |

### Billing

| Method | Path | Body / Notes |
| --- | --- | --- |
| GET | `/api/billing/status` | Current plan, subscription, usage, and plan options |
| POST | `/api/billing/checkout` | `{ "planId": "creator" | "growth" | "agency" }` |
| POST | `/api/billing/subscription` | `{ "action": "cancel" }` or `{ "action": "change_plan", "planId": "..." }` |
| POST | `/api/billing/webhook` | Razorpay webhook with `x-razorpay-signature` |

### Contact

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/contact` | Public support/contact form |

### Meta Webhook

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/webhook` | Meta verification using `hub.verify_token` and `hub.challenge` |
| POST | `/api/webhook` | Requires `X-Hub-Signature-256`; archives payload and enqueues BullMQ job |

## Environment Variables

Create `.env` in the project root. Do not commit real secrets.

```bash
MONGO_URL=mongodb://localhost:27017
DB_NAME=ig_automation

REDIS_URL=redis://localhost:6379

NEXT_PUBLIC_BASE_URL=http://localhost:3000

JWT_SECRET=replace_with_a_long_random_secret

META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_API_VERSION=v23.0
WEBHOOK_VERIFY_TOKEN=your_meta_webhook_verify_token

RESEND_API_KEY=your_resend_key
EMAIL_FROM=Komentra <no-reply@yourdomain.com>

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
RAZORPAY_PLAN_CREATOR_ID=plan_xxx
RAZORPAY_PLAN_GROWTH_ID=plan_xxx
RAZORPAY_PLAN_AGENCY_ID=plan_xxx

CORS_ORIGINS=http://localhost:3000

WORKER_CONCURRENCY=8
DM_AUTOMATION_COOLDOWN_SECONDS=900
FOLLOW_RETRY_COOLDOWN_SECONDS=900
META_ACCOUNT_SEND_LIMIT_PER_HOUR=50
GRAPH_ERROR_PAUSE_MINUTES=60
RATE_LIMIT_PAUSE_MINUTES=60
AUTOMATIONS_PAUSED=false
```

## Local Setup

Install dependencies:

```bash
yarn install
```

Start MongoDB and Redis locally, then run the web app:

```bash
yarn dev
```

Run the worker in a second terminal:

```bash
node worker.js
```

The app runs at:

```text
http://localhost:3000
```

For Meta OAuth and webhooks in local development, use an HTTPS tunnel such as ngrok and set:

```bash
NEXT_PUBLIC_BASE_URL=https://your-ngrok-url.ngrok-free.app
```

Then add these URLs in the Meta app dashboard:

```text
https://your-ngrok-url.ngrok-free.app/api/instagram/callback
https://your-ngrok-url.ngrok-free.app/api/webhook
```

## Meta App Setup

1. Create a Meta app at `https://developers.facebook.com/apps/`.
2. Add the Instagram product with Instagram Login.
3. Add OAuth redirect URI:

```text
{NEXT_PUBLIC_BASE_URL}/api/instagram/callback
```

4. Add a Webhooks subscription for Instagram:

```text
{NEXT_PUBLIC_BASE_URL}/api/webhook
```

5. Use the same verify token as `WEBHOOK_VERIFY_TOKEN`.
6. Subscribe to `comments` and `messages`. The `messages` field is required for keyword DM replies and shared-post DM triggers.
7. In development mode, add Instagram tester accounts and accept tester invites in the Instagram app.
8. For production, request required Instagram permissions:

```text
instagram_business_basic
instagram_business_manage_comments
instagram_business_manage_messages
```

## Deployment Notes

The web app and worker should be deployed as separate processes:

```text
Web process:    yarn start
Worker process: node worker.js
```

Recommended production layout:

- Next.js web app behind HTTPS.
- Worker process connected to the same Redis and MongoDB.
- Managed MongoDB Atlas.
- Managed Redis.
- Razorpay webhook configured to `/api/billing/webhook`.
- Meta webhook configured to `/api/webhook`.

Before going live, confirm:

- `NEXT_PUBLIC_BASE_URL` is the real HTTPS app URL.
- `JWT_SECRET`, `META_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`, and Razorpay secrets are set.
- Redis is reachable by both web and worker processes.
- Worker is running continuously.
- Meta webhook POST requests include valid signatures.
- The app has approved Instagram permissions or all test accounts are configured as testers.

## Common Issues

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| OAuth says `redirect_uri mismatch` | Meta dashboard URL does not exactly match the app URL | Add `{NEXT_PUBLIC_BASE_URL}/api/instagram/callback` exactly |
| Webhook GET verification fails | Verify token mismatch | Make Meta verify token match `WEBHOOK_VERIFY_TOKEN` |
| Webhook POST returns `invalid signature` | Meta app secret mismatch or unsigned test request | Use the correct `META_APP_SECRET` and send `X-Hub-Signature-256` |
| Webhook returns `queue error` | Redis is down or unreachable | Start Redis and check `REDIS_URL` |
| Comment automation does not trigger | Wrong workspace/account/post, disabled automation, keyword mismatch, or worker not running | Check dashboard, worker logs, and selected workspace |
| DM automation sends too often | Cooldown env values too low | Increase `DM_AUTOMATION_COOLDOWN_SECONDS` |
| Account stops working after weeks | Instagram token expired | Reconnect account; token refresh job is still a recommended improvement |

## Known Production Gaps

These are documented in `CODE_REVIEW_EDGE_CASES.md` and should be prioritized before serious scale:

- OTP and password reset rate limiting.
- Hashed OTP storage and cryptographic OTP generation.
- Encrypted Instagram access tokens.
- Automatic Instagram token refresh.
- Better worker retry/dead-letter handling for transient Graph failures.
- TTL/redaction for archived webhook payloads.
- Stricter CORS and frame headers.
- Consistent frontend handling for expired sessions.
