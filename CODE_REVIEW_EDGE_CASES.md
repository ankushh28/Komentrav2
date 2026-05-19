# Komentra Code Review - Current Serious Issues

Reviewed on: 2026-05-19

Scope reviewed:
- Next.js API catch-all route: `app/api/[[...path]]/route.js`
- Worker and queue processing: `worker.js`, `lib/queue.js`, `lib/redis.js`
- Auth, email, Mongo, billing, plans, and entitlement helpers in `lib/`
- Main frontend pages: auth, dashboard, analytics, audience, billing, contact
- Project config, docs, and test scripts: `next.config.js`, `package.json`, `README.md`, `ARCHITECTURE.md`, `backend_test.py`, `backend_test_phase2.py`

Verification notes:
- `npm.cmd run build` passes on 2026-05-19.
- `git status` could not run because Git marked `F:/Komentrav2` as a dubious ownership repository.
- This file replaces older findings that are now fixed, including Meta webhook HMAC verification, queue failure returning 500, stored OAuth state, automation ownership checks, full automation update support, stable webhook job IDs, account-scoped comment lookup in the worker, and per-account worker send limiting.

## Critical Issues

1. OTP and password reset flows have no rate limiting, resend cooldown, or attempt lockout.
   - File: `app/api/[[...path]]/route.js:410-497`, `app/api/[[...path]]/route.js:1969-2015`
   - Signup, verify OTP, resend OTP, login, forgot-password, and reset-password can be hammered by IP or by email.
   - Impact: OTP brute force, reset-code brute force, login brute force, and email spam are all easier than they should be.
   - Fix: add per-IP and per-email rate limits, resend cooldowns, failed-attempt counters, and temporary lockouts. Keep generic responses for reset flows.

2. OTPs and password reset OTPs are stored in plaintext.
   - File: `app/api/[[...path]]/route.js:417-435`, `app/api/[[...path]]/route.js:459`, `app/api/[[...path]]/route.js:1976-1980`, `app/api/[[...path]]/route.js:2000`
   - Active verification and reset codes are written directly to MongoDB and compared as raw strings.
   - Impact: database exposure gives attackers immediately usable account verification and password reset codes.
   - Fix: store only a keyed hash of the OTP, compare using constant-time checks, and remove codes after use or expiry.

3. OTP generation uses `Math.random()`.
   - File: `lib/email.js:39-41`
   - `generateOtp()` uses `Math.floor(100000 + Math.random() * 900000)`.
   - Impact: verification and reset codes are security-sensitive and should not rely on a non-cryptographic PRNG.
   - Fix: generate OTPs with `crypto.randomInt(100000, 1000000)`.

4. Password reset marks the email as verified.
   - File: `app/api/[[...path]]/route.js:2005-2010`
   - `handleResetPassword` sets `emailVerified: true` when updating the password.
   - Impact: password reset and email verification are separate trust decisions. Coupling them can become an account-state bypass if reset eligibility changes later.
   - Fix: update only the password and reset-code fields during password reset.

5. Follow-gate postback handling does not verify the webhook recipient belongs to the automation account.
   - File: `worker.js:900-930`
   - The worker trusts `RP_FOLLOW:<automationId>`, loads the automation by ID, then loads that automation's Instagram account before checking follower status.
   - Impact: a replayed or cross-account postback payload could trigger work against an automation account that did not receive the webhook event.
   - Fix: resolve the receiving account from `recipient.id` or `entry.id`, require it to match `auto.instagramAccountId`, and include the recipient/account in the delivery key.

7. Instagram access tokens are stored unencrypted and used directly.
   - File: `app/api/[[...path]]/route.js:652-675`, `worker.js:789-810`, `worker.js:930-1012`, `worker.js:1109-1111`, `worker.js:1291-1293`
   - Long-lived Graph tokens are persisted in MongoDB as plaintext and passed directly into worker send/check calls.
   - Impact: database compromise grants Instagram comment and messaging permissions.
   - Fix: encrypt tokens at the application layer or with managed field encryption, rotate encryption keys, and decrypt only at the send boundary.

## High Priority Issues

8. Graph API access tokens are sent in query strings for messaging/profile calls.
   - File: `worker.js:82-92`, `worker.js:114-141`, `app/api/[[...path]]/route.js:1176-1217`, `app/api/[[...path]]/route.js:1258-1269`
   - Several Graph calls put `access_token` in the URL instead of an Authorization header or POST body.
   - Impact: URLs are more likely to appear in logs, traces, proxy history, and error telemetry.
   - Fix: prefer `Authorization: Bearer <token>` where Graph supports it, or keep tokens in POST bodies for form requests.

9. Long-lived Instagram tokens are never refreshed.
   - File: `app/api/[[...path]]/route.js:614-670`
   - `tokenExpiry` is stored after OAuth, but there is no scheduled refresh before expiry.
   - Impact: connected Instagram accounts silently stop processing media, comments, and DMs after token expiry.
   - Fix: add a daily refresh job for tokens near expiry and surface expiring/expired account states in the dashboard.

10. Worker send failures are recorded but not retried by BullMQ.
    - File: `worker.js:788-836`, `worker.js:1006-1026`, `worker.js:1107-1126`, `worker.js:1289-1316`
    - The worker catches Graph send errors, marks the delivery failed, and continues without throwing the job.
    - Impact: transient Graph/network failures can permanently lose a reply or DM even though the queue has retry support.
    - Fix: classify retryable vs permanent Graph failures. Throw retryable failures so BullMQ retries, and move permanent failures to a dead-letter/reporting path.

11. Required Mongo indexes are created lazily and index creation errors are swallowed.
    - File: `app/api/[[...path]]/route.js:70-95`, `lib/entitlements.js:25-33`, `worker.js:253-275`, `worker.js:550-560`
    - Index setup catches errors, resets the promise, logs the message, and allows the app to keep running.
    - Impact: uniqueness, quota, delivery-dedupe, and audience guarantees can silently fail open in production.
    - Fix: move critical index creation into a startup migration/deploy step that fails loudly, and alert on index setup failure.

12. Raw webhook payloads are archived indefinitely.
    - File: `app/api/[[...path]]/route.js:1323-1329`
    - Full Meta webhook bodies are stored in `webhook_events` without a TTL or redaction policy.
    - Impact: user IDs, comments, messages, and operational metadata accumulate permanently, increasing privacy and breach impact.
    - Fix: add a retention TTL index, redact fields that are not needed for replay/debugging, and document retention.

13. Global CORS and frame headers are too permissive.
    - File: `next.config.js:25-35`
    - `X-Frame-Options` is `ALLOWALL`, CSP allows `frame-ancestors *`, CORS defaults to `*`, and all request headers are allowed.
    - Impact: clickjacking risk and overly broad browser access in production.
    - Fix: restrict `frame-ancestors` and CORS origins to real production/admin domains, and remove invalid/unsafe `ALLOWALL`.

14. The API advertises `OPTIONS` but exports no `OPTIONS` handler.
    - File: `next.config.js:33`, `app/api/[[...path]]/route.js:1956-1967`
    - Headers list `OPTIONS`, but the route only exports GET, POST, PUT, and DELETE.
    - Impact: browser clients from allowed external origins can fail preflight requests.
    - Fix: export `OPTIONS` for the catch-all route or remove broad CORS support.

15. `.env.example` is empty.
    - File: `.env.example`
    - The example environment file contains no required keys.
    - Impact: deploys can miss critical settings such as `JWT_SECRET`, `META_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`, `REDIS_URL`, Razorpay keys, and Resend configuration.
    - Fix: populate `.env.example` with all required variables and clearly mark dev-only defaults.

## Medium Priority Issues

16. Forgot-password leaks different behavior for email-delivery failures.
    - File: `app/api/[[...path]]/route.js:1969-1990`
    - The endpoint normally returns generic success, but if an existing verified user's reset email fails, it returns a 500.
    - Impact: attackers may infer whether a verified account exists by provoking or observing delivery failure behavior.
    - Fix: always return the same public response for forgot-password and log/alert delivery failures internally.

17. Auth tokens are stored in `localStorage`.
    - File: `app/auth/page.js:52-53`, `app/auth/page.js:72-73`, `app/auth/page.js:123-124`
    - Browser JavaScript can read the JWT.
    - Impact: any XSS or compromised third-party script becomes account takeover until token expiry.
    - Fix: prefer httpOnly, secure, sameSite cookies with CSRF protection, or shorten JWT expiry and add refresh/revocation.

18. Email identity is not consistently normalized for auth lookups.
    - File: `app/api/[[...path]]/route.js:411-415`, `app/api/[[...path]]/route.js:453-456`, `app/api/[[...path]]/route.js:487-490`, `app/api/[[...path]]/route.js:1970-1973`
    - Auth handlers use the submitted email directly instead of a single normalized email field.
    - Impact: case/whitespace variants can create duplicate accounts or make login/reset behavior inconsistent unless the database has an external collation/index.
    - Fix: trim/lowercase into `normalizedEmail`, add a unique index, and query by that field.

19. Analytics still aggregates large result sets in application memory.
    - File: `app/api/[[...path]]/route.js:1367-1495`
    - The endpoint loads runs, automations, and accounts into memory, then filters and aggregates in JavaScript.
    - Impact: analytics will become slow or memory-heavy for larger accounts, especially Agency plan lookbacks.
    - Fix: use MongoDB aggregation pipelines, projections, date filters, indexes, and bounded result sets.

20. Analytics top keyword counting can disagree with worker matching.
    - File: `app/api/[[...path]]/route.js:1411-1419`
    - It counts every keyword where `text.includes(k)`, ignoring the automation's `matchType`.
    - Impact: reports can disagree with actual trigger behavior for exact, starts-with, or overlapping keywords.
    - Fix: reuse the same keyword matching logic as the worker and count only the matched keyword/automation.

21. Dashboard, analytics, and audience pages do not consistently handle expired sessions.
    - File: `app/dashboard/page.js:971-980`, `app/analytics/page.js:52-67`, `app/audience/page.js:46-70`
    - Some fetches parse JSON and default to empty arrays without checking `res.ok` or `401`.
    - Impact: expired sessions can look like empty dashboards, broken analytics, or missing audience data instead of redirecting to login.
    - Fix: centralize API fetch handling, clear auth storage on `401`, and show recoverable errors for non-auth failures.

22. Test scripts are stale around auth and webhook signatures.
    - File: `backend_test.py:62-83`, `backend_test.py:299-383`, `backend_test.py:516-542`, `backend_test_phase2.py:393-501`
    - `backend_test.py` expects old signup and automation shapes, while `backend_test_phase2.py` posts unsigned webhooks that should now fail HMAC verification.
    - Impact: test results can be false negatives or false positives depending on which script is run.
    - Fix: retire or update `backend_test.py`, and update webhook tests to calculate `X-Hub-Signature-256` with `META_APP_SECRET`.

23. Text assets contain mojibake.
    - File: `app/auth/page.js:38-90`, `lib/email.js:13-65`, `worker.js:114-120`, `worker.js:799-803`, `worker.js:1008-1012`
    - Several user-facing strings show corrupted emoji/checkmark characters.
    - Impact: auth toasts, emails, and automated DMs can look broken to users.
    - Fix: re-save affected files as UTF-8 and replace corrupted strings with clean text.

## Suggested Fix Order

1. Harden auth and account recovery: cryptographic OTPs, hashed OTP storage, rate limits, lockouts, normalized email, and reset flow separation.
2. Protect high-value tokens: encrypt Instagram access tokens, remove tokens from query strings where possible, and add token refresh.
3. Close webhook/replay gaps: validate follow-gate postback recipient/account binding and keep delivery keys account-scoped.
4. Improve production reliability: retry transient worker send failures, dead-letter permanent failures, and move critical index creation to a failing migration.
5. Reduce privacy and browser risk: webhook retention/TTL, stricter CORS/frame headers, and an explicit `OPTIONS` policy.
6. Fix user-facing reliability: consistent `401` handling in frontend pages and better API error states.
7. Clean developer experience: update `.env.example`, stale tests, and corrupted text strings.
