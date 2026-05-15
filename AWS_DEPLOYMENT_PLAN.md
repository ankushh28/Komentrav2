# ReplyPilot AWS Deployment Plan

This plan is based on the architecture in `ARCHITECTURE.md` and the current codebase:

- Next.js 14 App Router web tier in `app/`
- Single catch-all API route at `app/api/[[...path]]/route.js`
- BullMQ queue producer in `lib/queue.js`
- Redis connection in `lib/redis.js`
- Background worker in `worker.js`
- MongoDB connection in `lib/mongo.js`
- Email OTP through Resend in `lib/email.js`

## 1. Recommended AWS Architecture

Use containers on AWS App Runner for the easiest production path.

```text
Users / Meta Webhooks
        |
        v
  HTTPS custom domain
        |
        v
AWS App Runner Service: replypilot-web
  - runs Next.js standalone server
  - serves UI
  - handles /api/auth/*
  - handles /api/instagram/*
  - handles /api/automations/*
  - handles /api/analytics
  - handles /api/webhook
  - enqueues webhook jobs into Redis
        |
        +--------------------+
        |                    |
        v                    v
Amazon ElastiCache Redis   MongoDB Atlas
  - BullMQ queue           - users
  - retries/backoff        - instagram_accounts
  - webhook-events queue   - automations
                           - automation_runs
                           - webhook_events

AWS App Runner Service: replypilot-worker
  - runs node worker.js
  - consumes Redis queue
  - calls Instagram Graph API
  - writes automation_runs to MongoDB

External services:
  - Meta / Instagram Graph API
  - Resend email API
```

Why this is the easiest AWS fit:

- App Runner avoids managing ECS clusters, EC2 hosts, Nginx, process managers, or load balancers.
- The web tier and worker can use the same Docker image with different start commands.
- App Runner gives HTTPS, autoscaling, logs, deployments, and custom domains with much less setup.
- ElastiCache gives a stable Redis endpoint for BullMQ.
- MongoDB Atlas is simpler than self-hosting MongoDB on AWS and is already compatible with `MONGO_URL`.

## 2. Services To Create

### Required

| Need | AWS / External Service | Notes |
| --- | --- | --- |
| Web app and API | AWS App Runner | Public service, HTTPS, health check `/api/health` |
| Background processing | AWS App Runner | Private-style background service using same image, command `node worker.js` |
| Queue | Amazon ElastiCache for Redis | Required by BullMQ and webhook processing |
| Database | MongoDB Atlas on AWS region | Use Atlas unless you specifically want DocumentDB migration work |
| Secrets | AWS Secrets Manager or App Runner env vars | Secrets Manager is better for production |
| Logs | CloudWatch Logs | App Runner sends logs there |
| Domain | Route 53 or existing DNS | Point `app.yourdomain.com` to App Runner |
| Email OTP | Resend | Existing app integration |

### Optional Later

| Need | Service |
| --- | --- |
| Container registry | Amazon ECR |
| Monitoring dashboards | CloudWatch dashboards |
| Error tracking | Sentry |
| WAF/rate limiting | AWS WAF in front of App Runner via CloudFront/ALB, or app-level Redis rate limits |
| Scheduled token refresh | EventBridge Scheduler + App Runner job/ECS task/Lambda |

## 3. Required Environment Variables

Set these on both the web service and the worker unless noted.

| Variable | Used By | Example / Notes |
| --- | --- | --- |
| `MONGO_URL` | web, worker | MongoDB Atlas connection string |
| `DB_NAME` | web, worker | `ig_automation` |
| `REDIS_URL` | web, worker | ElastiCache Redis URL, for example `redis://primary.xxxxxx.cache.amazonaws.com:6379` |
| `NEXT_PUBLIC_BASE_URL` | web, worker okay | `https://app.yourdomain.com` |
| `JWT_SECRET` | web | Long random value, at least 32 bytes |
| `META_APP_ID` | web | Meta Instagram app/client ID |
| `META_APP_SECRET` | web, worker recommended | Meta Instagram app secret |
| `WEBHOOK_VERIFY_TOKEN` | web | Same token configured in Meta Webhooks |
| `META_API_VERSION` | web, worker | Use one value consistently, for example `v23.0` |
| `RESEND_API_KEY` | web | Required for OTP email |
| `EMAIL_FROM` | web | Verified Resend sender, for example `ReplyPilot <no-reply@yourdomain.com>` |
| `CORS_ORIGINS` | web | Prefer your exact domain over `*` |
| `WORKER_CONCURRENCY` | worker | Start with `8`, increase after observing rate limits |

Important: the README does not list `REDIS_URL`, but the code requires it for production queueing.

## 4. Pre-Deployment Code Readiness

Before deploying, make these small production-readiness changes.

### Must Do

1. Add a `Dockerfile` that supports Next.js standalone output.
2. Add a worker start command or document App Runner command override as `node worker.js`.
3. Keep `next.config.js` `output: 'standalone'` enabled. It is already present.
4. Use the existing health endpoint: `/api/health`.
5. Create MongoDB indexes from `ARCHITECTURE.md`.
6. Confirm `META_API_VERSION` is the same in the web route and worker. The code currently defaults to `v23.0` in the API route and `v22.0` in the worker.
7. Add webhook HMAC verification before serious production traffic. `crypto` is already imported in the route file, but signature verification is not wired into `POST /api/webhook`.

### Strongly Recommended

1. Add graceful shutdown to `worker.js` for App Runner deploys and scaling events.
2. Add Redis/Mongo readiness checks to `/api/health` or create `/api/ready`.
3. Move JWT storage from localStorage to HTTP-only cookies later.
4. Encrypt Instagram access tokens at the application layer or use MongoDB Atlas encryption features.
5. Add a token refresh scheduled job before tokens reach 60-day expiry.

## 5. Suggested Dockerfile

Add this at the repo root as `Dockerfile`.

```Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/worker.js ./worker.js
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "server.js"]
```

Note: if `worker.js` cannot import dependencies from the standalone output in your build, use a slightly larger runtime image that also copies `node_modules`. The first deployment build will confirm this quickly.

## 6. Step-By-Step Deployment

### Step 1: Create MongoDB Atlas Cluster

1. Create an Atlas project.
2. Create an M0/M2 for testing or M10 for real production.
3. Select the AWS region closest to your users and App Runner service.
4. Create a database user with read/write access.
5. Add network access:
   - easiest start: allow `0.0.0.0/0`
   - production preference: use Atlas private networking or restrict egress paths when your AWS topology is stable
6. Save the connection string as `MONGO_URL`.

Create indexes:

```js
db.automations.createIndex({ postId: 1, isActive: 1 })
db.automation_runs.createIndex({ userId: 1, ranAt: -1 })
db.automation_runs.createIndex({ automationId: 1, ranAt: -1 })
db.users.createIndex({ email: 1 }, { unique: true })
db.instagram_accounts.createIndex({ connectedUserId: 1 })
```

### Step 2: Create ElastiCache Redis

1. Create an ElastiCache Redis replication group.
2. Use the same AWS region as App Runner.
3. Start small for MVP, for example `cache.t4g.micro` or the smallest available production-compatible node.
4. Disable cluster mode initially. BullMQ works well with a single primary endpoint for this workload.
5. Put Redis in a VPC.
6. Configure security groups so App Runner can reach Redis through a VPC connector.
7. Save the primary endpoint as:

```text
REDIS_URL=redis://<redis-primary-endpoint>:6379
```

### Step 3: Create ECR Repository

1. Create an ECR repository named `replypilot`.
2. Build and push the image from your machine or CI.

Example commands:

```bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-south-1.amazonaws.com
docker build -t replypilot .
docker tag replypilot:latest <account-id>.dkr.ecr.ap-south-1.amazonaws.com/replypilot:latest
docker push <account-id>.dkr.ecr.ap-south-1.amazonaws.com/replypilot:latest
```

### Step 4: Create App Runner Web Service

1. App Runner -> Create service.
2. Source: ECR image `replypilot:latest`.
3. Port: `3000`.
4. Start command: leave default if Dockerfile uses `CMD ["node", "server.js"]`.
5. Health check:
   - protocol: HTTP
   - path: `/api/health`
6. Add all web environment variables.
7. Attach VPC connector so it can reach ElastiCache Redis.
8. Deploy.

After deployment, visit:

```text
https://<app-runner-url>/api/health
```

Expected response:

```json
{ "ok": true }
```

### Step 5: Create App Runner Worker Service

Use the same ECR image.

1. App Runner -> Create service.
2. Source: ECR image `replypilot:latest`.
3. Start command override:

```bash
node worker.js
```

4. Add worker environment variables:
   - `MONGO_URL`
   - `DB_NAME`
   - `REDIS_URL`
   - `META_API_VERSION`
   - `WORKER_CONCURRENCY`
5. Attach the same VPC connector for Redis.
6. Deploy.

Scale workers separately from web:

- Start with 1 worker instance and `WORKER_CONCURRENCY=8`.
- Increase to 2-3 worker instances when queue depth grows or webhook volume rises.
- Increase concurrency carefully because Instagram Graph API rate limits are per account.

### Step 6: Add Custom Domain

1. In App Runner web service, add custom domain, for example `app.yourdomain.com`.
2. Add DNS records in Route 53 or your DNS provider.
3. Wait for certificate validation.
4. Set:

```text
NEXT_PUBLIC_BASE_URL=https://app.yourdomain.com
```

5. Redeploy web service after updating this variable.

### Step 7: Configure Meta App

In Meta Developer Dashboard:

1. Instagram OAuth redirect URI:

```text
https://app.yourdomain.com/api/instagram/callback
```

2. Instagram webhook callback URL:

```text
https://app.yourdomain.com/api/webhook
```

3. Verify token:

```text
same value as WEBHOOK_VERIFY_TOKEN
```

4. Subscribe to fields:
   - `comments`
   - `messages`
   - any additional fields you intentionally use

5. In development mode, add Instagram testers and accept the tester invite from the Instagram mobile app.

## 7. AWS Security Checklist

- Store secrets in Secrets Manager or App Runner environment variables, never in git.
- Use a strong `JWT_SECRET`.
- Restrict `CORS_ORIGINS` to `https://app.yourdomain.com`.
- Enable MongoDB Atlas backups.
- Enable ElastiCache encryption in transit if supported by your chosen setup. If using TLS Redis, confirm the `REDIS_URL` and `ioredis` options support it.
- Add webhook HMAC verification for `X-Hub-Signature-256`.
- Avoid logging access tokens, OTPs, or raw webhook bodies in production logs.
- Review App Runner instance role permissions with least privilege.

## 8. Observability Checklist

Minimum:

- App Runner web logs in CloudWatch.
- App Runner worker logs in CloudWatch.
- ElastiCache CPU, memory, connections, evictions.
- MongoDB Atlas CPU, connections, storage, slow queries.
- App Runner request count, latency, 4xx, 5xx.

Application metrics to add next:

- Webhook enqueue success/failure count.
- Queue waiting count.
- Queue active count.
- Queue failed count.
- Worker job duration.
- Instagram API error rate.
- DM success rate.
- Reply success rate.

## 9. Deployment Validation

After both services are live:

1. Open `/api/health`.
2. Sign up with a real email and verify OTP.
3. Connect Instagram through Meta OAuth.
4. Confirm `instagram_accounts` has a connected account in MongoDB.
5. Create a test automation.
6. In Meta Dashboard, send a webhook test to `/api/webhook`.
7. Confirm web logs show the event was received and enqueued.
8. Confirm worker logs show the job was consumed.
9. Comment from a different Instagram tester account.
10. Confirm:
    - public reply sent
    - DM sent
    - `automation_runs` document inserted
    - no failed jobs accumulating in Redis

## 10. Cost-Friendly MVP Sizing

Good starting point:

- App Runner web: 1 vCPU / 2 GB, min 1 instance, max 2.
- App Runner worker: 1 vCPU / 2 GB, min 1 instance, max 2.
- ElastiCache Redis: smallest production node available in your region.
- MongoDB Atlas: M0/M2 for testing, M10 for production users.
- Resend: free/low tier until email volume grows.

Scale when:

- Web CPU is high or webhook latency rises: increase App Runner web max instances.
- Redis queue waiting count grows: add worker instances or raise `WORKER_CONCURRENCY`.
- MongoDB query latency rises: add indexes first, then upgrade Atlas tier.
- Instagram API errors mention rate limits: reduce worker concurrency and add per-account throttling.

## 11. Production Hardening Roadmap

Do these before paid customer traffic:

1. Webhook HMAC verification.
2. Worker graceful shutdown.
3. Token refresh scheduler.
4. Per-account Graph API rate limiter in Redis.
5. Better `/api/ready` check for MongoDB and Redis.
6. Sentry for web and worker errors.
7. Access-token encryption.
8. CI build validation before pushing to ECR.

## 12. Easier Alternative: AWS Amplify Is Not Ideal Here

AWS Amplify can host Next.js, but this app also needs a long-running BullMQ worker connected to Redis. App Runner or ECS is a cleaner fit because the worker is a first-class service.

## 13. When To Move From App Runner To ECS

Stay on App Runner until you need:

- private-only networking patterns that App Runner cannot support cleanly,
- custom autoscaling based on Redis queue depth,
- sidecars,
- more control over deployments,
- scheduled one-off containers for maintenance jobs.

At that point, move the same container image to ECS Fargate:

- ECS service 1: `replypilot-web`
- ECS service 2: `replypilot-worker`
- ALB in front of web service
- CloudWatch alarms and autoscaling policies
- ElastiCache Redis and MongoDB Atlas unchanged

