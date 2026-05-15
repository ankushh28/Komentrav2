# ReplyPilot — Scalable Architecture

This document explains the production-grade architecture used by ReplyPilot to handle high-volume Instagram comment automation across many tenants.

## 🎯 Goal

- **Acknowledge Meta webhooks in <100ms** so Meta never marks our endpoint as slow/unavailable (Meta auto-disables endpoints that consistently respond in >2s)
- **Handle thousands of concurrent webhook events** without dropping any
- **Scale horizontally** by adding more worker processes
- **Decouple ingestion (web tier) from processing (workers)** so a slow Instagram Graph API call doesn't block the next webhook

---

## 🏗 High-Level Architecture

```
                                ┌─────────────────────────────┐
   Instagram /                  │    ┌────────────────────┐   │
   Meta Webhooks   ───POST─────▶│    │  Next.js Web Tier  │   │
                                │    │  (HTTP handlers)   │   │
                                │    │                    │   │
                                │    │ /api/webhook       │   │
                                │    │ /api/auth/*        │   │
                                │    │ /api/automations/* │   │
                                │    │ /api/instagram/*   │   │
                                │    │ /api/analytics     │   │
                                │    └────────┬───────────┘   │
                                │             │               │
                                │   ┌─────────▼───────────┐   │
                                │   │   BullMQ Producer   │   │
                                │   │   (lib/queue.js)    │   │
                                │   └─────────┬───────────┘   │
                                └─────────────┼───────────────┘
                                              │
                                  ┌───────────▼────────────┐
                                  │   Redis (queue + KV)   │
                                  │   localhost:6379       │
                                  └───────────┬────────────┘
                                              │
                       ┌──────────────────────┼─────────────────────┐
                       │                      │                     │
              ┌────────▼─────────┐   ┌────────▼─────────┐  ┌────────▼─────────┐
              │   Worker #1      │   │   Worker #2      │  │   Worker #N      │
              │  (worker.js)     │   │  (worker.js)     │  │  (worker.js)     │
              │  conc=8          │   │  conc=8          │  │  conc=8          │
              └────────┬─────────┘   └────────┬─────────┘  └────────┬─────────┘
                       │                      │                     │
                       └──────────────┬───────┴─────────────────────┘
                                      │
                            ┌─────────▼──────────┐         ┌──────────────────┐
                            │   MongoDB          │◀───────▶│  Instagram Graph │
                            │   (single source   │  HTTP   │  API (Meta)      │
                            │    of truth)       │         └──────────────────┘
                            └────────────────────┘
```

### Components

| Component | Responsibility | Tech |
|-----------|----------------|------|
| **Web tier** | Serve UI, handle auth + CRUD, accept Meta webhooks, enqueue jobs | Next.js 14 App Router |
| **Queue broker** | Buffer jobs, retries, backoff, dead-letter | Redis + BullMQ |
| **Workers** | Process webhook jobs: match automations, post replies, send DMs, follow verification | Node.js + BullMQ |
| **Database** | Source of truth: users, accounts, automations, runs, webhook archive | MongoDB |
| **Outbound** | Instagram Graph API (replies, DMs, follow check), Resend (email OTP) | HTTPS |

---

## 🔁 Webhook Flow (the hot path)

1. Meta sends `POST /api/webhook` with comment/messaging payload
2. Next.js handler:
   - Parses JSON body
   - **Archives raw payload to MongoDB** (non-blocking, fire-and-forget)
   - **Enqueues job in BullMQ** (Redis)
   - **Responds `200 EVENT_RECEIVED`** in <100ms
3. Worker picks up job from queue:
   - Looks up matching automations by `postId`
   - For each match: posts public reply, sends DM (or follow-prompt)
   - Records run in `automation_runs` collection
4. If a job fails, BullMQ retries up to 3× with exponential backoff (2s, 4s, 8s)
5. After 3 failures, job goes to dead-letter set (kept 7 days for debugging)

### Why this matters

- Meta's webhook timeout is **20 seconds** — exceeding it kills the integration
- Calling Instagram Graph API (replies/DMs/follow-check) takes 200-2000ms per call
- A burst of 100 comments would block our endpoint for >2 minutes if processed inline
- With queue: web tier ingests 100 events in <2s; workers process them in parallel

---

## 📚 Database Collections

| Collection | Description |
|------------|-------------|
| `users` | App accounts with bcrypt passwords + email verification (OTP) |
| `instagram_accounts` | Connected IG accounts with long-lived tokens |
| `automations` | User-created automations: keywords, replies, DM config |
| `automation_runs` | Every fired event (powers analytics) |
| `webhook_events` | Raw Meta payloads (audit trail / replay) |

Indexes to add for production:

```js
db.automations.createIndex({ postId: 1, isActive: 1 })
db.automation_runs.createIndex({ userId: 1, ranAt: -1 })
db.automation_runs.createIndex({ automationId: 1, ranAt: -1 })
db.users.createIndex({ email: 1 }, { unique: true })
db.instagram_accounts.createIndex({ connectedUserId: 1 })
```

---

## 🚀 Scaling Strategies

### Horizontal scaling — add more workers
Each worker processes up to `WORKER_CONCURRENCY` jobs in parallel (default 8). To handle more throughput:

```bash
# Run more workers (each on its own process / pod / container)
WORKER_CONCURRENCY=16 node worker.js  # process 1
WORKER_CONCURRENCY=16 node worker.js  # process 2
WORKER_CONCURRENCY=16 node worker.js  # process 3
```

BullMQ automatically distributes jobs across all workers connected to the same Redis queue. No code change required.

### Web-tier scaling
The Next.js web tier is **stateless** — JWT-based auth, no in-memory sessions. Just put it behind a load balancer and scale to N instances.

### Redis high availability
- **Single node** (current dev setup): fine up to ~10k jobs/min
- **Sentinel**: HA failover for production
- **Cluster**: sharded Redis for >100k jobs/min

### MongoDB scaling
- **Replica set** for read scaling and HA
- **Sharded cluster** at >1M documents per collection (shard key on `userId` for `automation_runs`)

---

## 🌐 Deployment Topology Examples

### Small (under 50 users, ~500 events/day)
- 1× Next.js (Vercel or single Node host)
- 1× Worker (same host or separate)
- Managed Redis (Upstash, Redis Cloud — free tier OK)
- MongoDB Atlas M0 free tier

### Medium (5k users, ~50k events/day)
- 2× Next.js behind LB (Vercel scales auto, or Render with 2 instances)
- 3× Workers (Railway / Fly.io / Render Background Workers)
- Managed Redis (Upstash Pro or Redis Labs)
- MongoDB Atlas M10 cluster

### Large (50k+ users, 1M+ events/day)
- 5-10× Next.js behind LB
- 10-20× Workers spread across regions
- Redis Sentinel/Cluster
- MongoDB sharded cluster
- CDN in front of UI assets

---

## 🛡 Reliability Features Already In Place

- ✅ **Job retries with backoff** (3 attempts, exponential)
- ✅ **Dead-letter queue** (failed jobs kept 7 days)
- ✅ **Webhook archive** in `webhook_events` collection (replay any event)
- ✅ **Idempotent processing** (job IDs include timestamp + random nonce)
- ✅ **Stateless web tier** (JWT auth, no sticky sessions)
- ✅ **Long-lived IG tokens** (60-day, refreshable)
- ✅ **Email OTP** with 10-min expiry, 6-digit code
- ✅ **Follow verification** via Instagram User Profile API (real check, not just trust)

## 🔭 What to Add Before True Production

These are nice-to-haves we deferred:

1. **HMAC signature verification** on `POST /api/webhook` (X-Hub-Signature-256). The code stub is in the playbook — wire up `META_APP_SECRET` HMAC check.
2. **Token refresh job** — automation that runs daily to extend long-lived tokens before expiry
3. **Per-user rate limiting** in Redis (`INCR` with TTL key). Instagram caps ~200 messages/hr per account.
4. **Distributed tracing** (OpenTelemetry → Honeycomb / Datadog) for end-to-end webhook latency
5. **Sentry / error tracking** in worker
6. **Health check endpoint** for load balancers + worker liveness reporting
7. **Graceful shutdown** in worker (drain in-flight jobs before SIGTERM)
8. **Metrics export** for Prometheus / Grafana (queue length, processing rate, error rate)

---

## 🧰 Local Development

### Services managed by supervisor

```bash
sudo supervisorctl status
# nextjs    RUNNING    (port 3000)
# redis     RUNNING    (port 6379)
# worker    RUNNING    (BullMQ consumer, concurrency=8)
# mongodb   RUNNING    (port 27017)
```

### Inspect queue

```bash
redis-cli
> KEYS bull:webhook-events:*       # see queue keys
> LLEN bull:webhook-events:wait    # # of waiting jobs
> LLEN bull:webhook-events:active  # # of active jobs
```

### Replay an archived webhook event

```js
// in node REPL
const { MongoClient } = require('mongodb');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const redis = new IORedis('redis://localhost:6379', { maxRetriesPerRequest: null });
const q = new Queue('webhook-events', { connection: redis });
const m = await new MongoClient('mongodb://localhost:27017').connect();
const db = m.db('ig_automation');
const ev = await db.collection('webhook_events').findOne({ _id: '<event-uuid>' });
await q.add('event', ev.payload);
```

### Tune worker concurrency

In `/etc/supervisor/conf.d/worker.conf`, add:
```
environment=WORKER_CONCURRENCY=16
```
Then `sudo supervisorctl restart worker`.

---

## 🔒 Security Notes (MVP-level — see "What to Add" for production)

- Passwords: bcrypt (cost 10)
- Auth: JWT, 30-day expiry, signed with `JWT_SECRET`
- Email verification: required before login
- IG access tokens: stored in MongoDB (encrypt at rest in production via Mongo CSFLE or app-level AES)
- Webhook signature: **TODO** (currently we trust based on verify token only)

---

## 🤝 Trade-offs

We deliberately chose **single-monorepo + queue** over microservices because:
- One deploy unit, one CI pipeline
- Worker code shares Mongo schema / IG helpers with web tier
- Easier debugging (same logs, same stack)
- Fast enough for 6-figure user base — only split into services if a single component becomes the bottleneck (typically the worker)

The architecture is **vertically simple, horizontally scalable** — exactly what you want for a startup-scale SaaS.
