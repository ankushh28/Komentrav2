# Komentra Code Review - Edge Cases And Issues

Reviewed on: 2026-05-17

Scope reviewed:
- Next.js API catch-all route: `app/api/[[...path]]/route.js`
- Auth, email, Mongo, Redis, queue helpers in `lib/`
- BullMQ worker in `worker.js`
- Main frontend pages: home, auth, dashboard, analytics
- Existing backend test scripts and docs

Verification notes:
- `git status` could not run because Git marked `F:/Komentrav2` as a dubious ownership repository.
- `npm run build` was blocked by PowerShell execution policy.
- `npm.cmd run build` ran, but failed because dependencies are not installed: `next` is not recognized.

## Critical Issues

1. Missing webhook signature verification allows forged events.
   - File: `app/api/[[...path]]/route.js:614-641`
   - The POST webhook parses and enqueues any JSON body without checking `X-Hub-Signature-256` against `META_APP_SECRET`.
   - Impact: anyone who can reach `/api/webhook` can trigger automations, create fake analytics, enqueue arbitrary jobs, and potentially cause replies/DMs if they know or guess IDs.
   - Fix: verify the raw request body with HMAC SHA-256 before parsing/processing. Reject missing or invalid signatures with 401/403.

2. OAuth `state` is not signed, stored, or bound to a login session.
   - File: `app/api/[[...path]]/route.js:135-159`
   - `state` is just base64 JSON containing `{ userId, n }`. The callback trusts it after decoding.
   - Impact: callback CSRF/account linking attacks are possible if a user ID is known or leaked. An attacker can craft state and try to attach their Instagram account to another Komentra user.
   - Fix: generate a cryptographically random nonce, store it server-side with user ID and expiry, sign it, and consume it once during callback.

   Add a TTL index on oauth_states.expiresAt, otherwise expired states stay in Mongo unless callbacks clean them up.

3. Automation creation does not verify that `instagramAccountId` belongs to the authenticated user.
   - File: `app/api/[[...path]]/route.js:369-438`
   - The API accepts any `instagramAccountId` and stores it on the automation without checking `instagram_accounts.connectedUserId`.
   - Impact: a user can create automations referencing accounts they do not own if they obtain an account ID. This is an authorization boundary issue.
   - Fix: before insert, fetch the account using `{ _id: instagramAccountId, connectedUserId: u.userId }`; return 404/403 if not found.

4. Comment webhook processing matches only `postId`, not the receiving Instagram account.
   - File: `worker.js:222-232`
   - The worker loads automations by `{ postId: mediaId, isActive: true }`, then uses the first automation's account for all matching automations.
   - Impact: cross-account collisions or malicious automations can cause the wrong account token to be used. If the first automation references a missing account, later valid automations are skipped.
   - Fix: identify the connected account from the webhook `entry.id` or media owner, then query automations by both `instagramAccountId` and `postId`. Fetch the account per automation or filter to one account before processing.

5. Duplicate webhook deliveries are not idempotent.
   - File: `app/api/[[...path]]/route.js:634-635`, `worker.js:264-294`
   - Job IDs are random, and there is no processed-event/comment unique key.
   - Impact: Meta retries or duplicated payloads can produce repeated public replies and repeated DMs.
   - Fix: derive a stable dedupe key from comment ID, message ID, postback ID, automation ID, and flow; enforce a unique index in MongoDB or stable BullMQ job IDs.

## High Priority Issues

6. Webhook endpoint returns 200 even when queue enqueue fails.
   - File: `app/api/[[...path]]/route.js:631-641`
   - Queue errors are logged but still return `EVENT_RECEIVED`.
   - Impact: events are permanently lost because Meta will not retry after a 200 response.
   - Fix: if the queue is required for processing, return 500 on enqueue failure. Archive failure should be non-fatal, queue failure should not be.

7. OTP and password reset flows have no rate limiting or attempt lockout.
   - File: `app/api/[[...path]]/route.js:65-94`, `app/api/[[...path]]/route.js:814-858`
   - Verification, resend, forgot password, and reset endpoints can be hammered.
   - Impact: OTP brute force, email spam, and account abuse are easier.
   - Fix: add per-IP and per-email rate limits, resend cooldowns, failed-attempt counters, and temporary lockouts.

8. OTPs are stored in plaintext.
   - File: `app/api/[[...path]]/route.js:32-49`, `app/api/[[...path]]/route.js:821-825`
   - Plain OTP and reset OTP values are stored directly in MongoDB.
   - Impact: database/log exposure gives active verification and reset codes.
   - Fix: store a hash of the OTP, compare with constant-time hash checks, and keep short expiry.

9. Default production secrets are unsafe.
   - File: `lib/auth.js:4`, `app/api/[[...path]]/route.js:11`
   - JWT falls back to `dev_secret`; webhook verify token falls back to `test`.
   - Impact: accidentally deploying without env vars makes tokens forgeable and webhook verification guessable.
   - Fix: throw on startup/request if required secrets are missing outside local development.

10. Global CORS and frame headers are too permissive.
    - File: `next.config.js:25-35`
    - `X-Frame-Options` is `ALLOWALL`, CSP allows `frame-ancestors *`, CORS defaults to `*`, and all headers are allowed.
    - Impact: clickjacking and overly broad browser access in production.
    - Fix: restrict frame ancestors and CORS origins to your real app/admin domains; remove invalid/unsafe `ALLOWALL`.

11. Instagram access tokens are stored unencrypted.
    - File: `app/api/[[...path]]/route.js:222`, `worker.js:264-284`, `worker.js:468-470`
    - Long-lived access tokens are stored directly in MongoDB and used by the worker.
    - Impact: DB compromise gives direct Instagram messaging/comment permissions.
    - Fix: encrypt tokens at the application layer or use managed encryption, rotate keys, and avoid logging token-bearing responses.

12. Long-lived Instagram tokens are never refreshed.
    - File: `app/api/[[...path]]/route.js:188-223`
    - `tokenExpiry` is stored, but there is no scheduled refresh before expiry.
    - Impact: accounts silently stop working after token expiry.
    - Fix: add a daily refresh job and surface expiring/expired token states in the dashboard.

13. Auth tokens are stored in `localStorage`.
    - File: `app/auth/page.js:61-62`, `app/auth/page.js:81-82`, `app/auth/page.js:132-133`
    - Browser JavaScript can read the JWT.
    - Impact: any XSS or third-party script issue becomes account takeover until token expiry.
    - Fix: prefer httpOnly, secure, sameSite cookies with CSRF protection, or at least shorten JWT expiry and add refresh/revocation.

14. Email identity is not normalized or protected by a unique index in code.
    - File: `app/api/[[...path]]/route.js:26-30`, `app/api/[[...path]]/route.js:98-103`
    - Emails are used as provided.
    - Impact: `User@Example.com` and `user@example.com` can become separate users unless the DB has a collation/index not shown here.
    - Fix: trim/lowercase emails and create a unique normalized-email index.

15. Password reset can verify an account as a side effect.
    - File: `app/api/[[...path]]/route.js:853`
    - Reset password sets `emailVerified: true`.
    - Impact: today this is mostly protected because reset OTP is only sent to already verified users, but it couples unrelated states and can become a bug if forgot-password rules change.
    - Fix: do not modify `emailVerified` in reset-password. Keep verification and password reset separate.

## Medium Priority Issues

16. The update automation endpoint only updates legacy fields, not the new arrays.
    - File: `app/api/[[...path]]/route.js:449-461`
    - It updates `triggerWord`, `replyMessage`, and `dmMessage`, but not `keywords`, `replyMessages`, `dmText`, `dmButtons`, `replyButtons`, `matchType`, or follow-gating fields.
    - Impact: future edit UI/API calls will appear to work partially but worker behavior may stay unchanged because the worker prefers array fields.
    - Fix: implement a full validated update path per automation type.

17. Empty updates return success with `automation: null` for missing IDs.
    - File: `app/api/[[...path]]/route.js:449-461`
    - If no document matches, the endpoint still returns 200.
    - Impact: clients cannot reliably distinguish success from not found.
    - Fix: check `matchedCount`; return 404 when the automation does not exist for that user.

18. Button URLs and titles are not validated.
    - File: `app/api/[[...path]]/route.js:380`, `app/api/[[...path]]/route.js:409`, `worker.js:281-284`, `worker.js:466-470`
    - Any non-empty `url` and `title` are accepted.
    - Impact: invalid Graph payloads, failed sends, unsafe links, or titles over Instagram limits.
    - Fix: require `https://` URLs, enforce title/text length limits, and reject malformed URLs.

19. Message length and content limits are not enforced.
    - File: `app/api/[[...path]]/route.js:379-425`
    - Reply variants and DM text are accepted without length or whitespace-only checks.
    - Impact: Graph API calls can fail at runtime instead of being caught during creation.
    - Fix: trim all strings, reject whitespace-only values, and enforce Instagram message/button limits.

20. Analytics loads all historical runs into memory.
    - File: `app/api/[[...path]]/route.js:650-704`
    - It fetches every `automation_runs` document for the user, then filters and aggregates in JavaScript.
    - Impact: analytics will slow down or time out as run history grows.
    - Fix: use MongoDB aggregation pipelines with date filters, projections, indexes, and limits.

21. Analytics top keywords can miscount overlapping keywords.
    - File: `app/api/[[...path]]/route.js:683-690`
    - It uses `text.includes(k)` for all keywords regardless of the automation's `matchType`.
    - Impact: reporting can disagree with actual trigger logic, especially for exact or starts-with automations.
    - Fix: reuse the same keyword matching logic as the worker and count the keyword that actually matched.

22. DM auto-reply can loop across automations if multiple keywords match one message.
    - File: `worker.js:443-470`
    - The worker sends a reply for every matching DM automation.
    - Impact: one inbound message can trigger multiple automated replies, which may look spammy or hit platform limits.
    - Fix: define precedence, stop after first match, or add explicit multi-match behavior.

23. Worker has no per-account rate limiting or backpressure for Graph API calls.
    - File: `worker.js:515-518`
    - Concurrency defaults to 8, but sends are not throttled per connected Instagram account.
    - Impact: bursts can trigger Meta rate limits and job retries can amplify failures.
    - Fix: add per-account rate limits, retry handling based on Graph error codes, and dead-letter reporting.

24. Worker startup can crash unclearly if `MONGO_URL` is missing.
    - File: `worker.js:34-35`
    - `new MongoClient(process.env.MONGO_URL)` is called without the explicit env validation used by `lib/mongo.js`.
    - Impact: production misconfiguration is harder to diagnose.
    - Fix: share the Mongo helper or validate required worker env vars before creating clients.

25. POST webhook archives raw payloads indefinitely.
    - File: `app/api/[[...path]]/route.js:621-626`
    - Raw webhook events can include user IDs, comments, messages, and other personal data.
    - Impact: storage growth and privacy/data-retention risk.
    - Fix: add TTL indexes, redact where possible, and document retention.

26. CORS preflight is advertised but no `OPTIONS` handler is exported.
    - File: `next.config.js:33`, `app/api/[[...path]]/route.js:802-812`
    - Headers allow `OPTIONS`, but the route exports only GET/POST/PUT/DELETE.
    - Impact: browser clients from allowed external origins may fail preflight requests.
    - Fix: export `OPTIONS` and return appropriate CORS headers, or remove broad CORS support.

27. Legacy backend tests are out of date.
    - File: `backend_test.py:64-78`, `backend_test.py:301-313`
    - The original test expects signup to return a token and creates automations using old `triggerWord/replyMessage/dmMessage` shape.
    - Impact: running the wrong test suite gives false failures or misses current behavior.
    - Fix: update or remove the legacy test, and keep one authoritative current test suite.

28. Documentation is inconsistent with current OTP signup.
    - File: `README.md:62-63`
    - README still says signup accepts `{email, password}` and returns `{token, user}`.
    - Impact: developers and testers will call the API incorrectly.
    - Fix: update docs to `{username, email, password}` returning `{needsVerification: true, email}`, followed by `/auth/verify-otp`.

## Frontend / UX Edge Cases

29. Stale or expired JWTs are not handled consistently on dashboard fetches.
    - File: `app/dashboard/page.js:569-578`
    - Dashboard fetches JSON and defaults to empty arrays without checking HTTP status.
    - Impact: expired sessions can look like an empty dashboard instead of prompting login.
    - Fix: check `res.status === 401`, clear auth storage, and redirect to `/auth?mode=login`.

30. Analytics page does not handle API errors before rendering.
    - File: `app/analytics/page.js:49-56`
    - It sets whatever JSON comes back into `data` and later destructures expected fields.
    - Impact: a 401/500 JSON response can crash or render broken UI.
    - Fix: check `res.ok`; handle 401 redirects and show a recoverable error state for 500.

31. The Windows dev script is not portable.
    - File: `package.json:6`
    - `NODE_OPTIONS='--max-old-space-size=512' next dev ...` is POSIX-style env syntax.
    - Impact: `yarn dev` can fail on Windows shells.
    - Fix: use `cross-env` or remove the inline env var for Windows compatibility.

32. Text assets show mojibake in many files.
    - Examples: `app/auth/page.js:83`, `lib/email.js:11-18`, `worker.js:276-277`
    - Characters like emojis, arrows, and checkmarks appear as corrupted byte sequences.
    - Impact: user-facing emails, toasts, and messages can look broken.
    - Fix: re-save files as UTF-8 and replace corrupted strings with clean text.

## Suggested Fix Order

1. Secure inbound trust boundaries: webhook signature verification, signed/stored OAuth state, and ownership checks on automation creation.
2. Prevent duplicate and cross-account sends: idempotency keys, account-scoped automation lookup, and queue failure behavior.
3. Harden auth: required secrets, OTP rate limits, hashed OTPs, email normalization, safer token storage.
4. Improve production reliability: token refresh job, rate limiting, worker env validation, analytics aggregation.
5. Clean up developer experience: install/build verification, Windows-compatible scripts, updated tests, updated README, and UTF-8 text cleanup.
