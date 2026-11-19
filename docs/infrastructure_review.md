# 3den: infrastructure review and development plan

Status: **draft for discussion** (Nov 18, 2026). Nothing here is built yet.

This doc has two parts:

1. **Hosting options.** How to run 3den in production on AWS, Cloudflare,
   or both, with rough monthly costs at 200, 2,000, and 20,000 users.
2. **Development plan.** How each part of the system gets built (Postgres,
   the API, the worker, the existing JavaScript, and so on), and in what
   order. The aim is to get basic features working end to end first, then add
   the rest.

Related docs:

- [cloudflare-deploy.md](cloudflare-deploy.md): putting the static prototype
  on Cloudflare Pages for phone testing. That is step zero and separate from
  this doc.
- `DESIGN.md`, "From prototype to a real service": how each prototype piece
  maps to a server piece.
- `HANDOFF.md`, "Before the backend": four reminders (Protomaps, AGPL
  readiness, the calendar feed, and Web Push). They are built into the plan
  below.
- The "3den: building the backend" and "Security, privacy, and anti-bot plan"
  docs, which are claude.ai artifacts linked from HANDOFF.md. This review
  hasn't been checked against them yet. Do that before deciding anything.

---

## Part 1: Hosting options

### What has to run

Every option below hosts the same set of parts. They come from DESIGN.md's
prototype-to-server table and HANDOFF.md's backend notes.

| Part | What it does | Notes |
|---|---|---|
| **Web app** (static files) | Today's HTML, CSS, and JS | About 4 MB unminified; cache it at the edge |
| **API server** | Accounts, groups, modules, events, posts, and permissions | Repeats every `permissions.js` check on the server |
| **Live connection** | Chat, presence, and live updates (replaces `live.js`) | WebSockets; long-lived connections |
| **Worker** | Web Push, email, reminders, scheduled articles, recaps, image previews, and fetching external calendars | Runs jobs from a queue and on a schedule |
| **Postgres** | The data | Needs backups and point-in-time restore |
| **Object storage** | Vault files, photos, previews, and Protomaps tiles | S3 or R2 |
| **Calendar feed** | `GET /cal/<token>.ics` | Part of the API; no sign-in, so it needs a short cache and rate limits |
| **Email** | Notifications, sign-in links, and invites | SES, Postmark, or similar |
| **Geocoder** (later) | Photon address search | Java, memory-hungry; use a regional extract |

### Usage assumptions behind the prices

These numbers are rough guesses. Photos and files drive the storage and
bandwidth figures, so they matter most.

| | 200 users | 2,000 users | 20,000 users |
|---|---|---|---|
| Active on a given day (about 35%) | 70 | 700 | 7,000 |
| Open live connections at peak | ~30 | ~300 | ~3,000 |
| API requests per month | ~0.5 M | ~5 M | ~50 M |
| Files stored | 20 GB | 200 GB | 2 TB |
| Data sent to users per month | 50 GB | 500 GB | 5 TB |
| Postgres size | < 1 GB | ~5 GB | ~50 GB |
| Emails per month | 5 k | 50 k | 500 k |

**About the prices:** they're rough monthly USD figures from on-demand list
prices (AWS us-east-1) as I last knew them, mid-2026. They leave out tax,
support plans, the domain name, and free-tier credits. Before deciding,
check them with the AWS Pricing Calculator and Cloudflare's pricing pages.
One- or three-year commitments (Savings Plans or Reserved Instances) cut EC2
and RDS costs by about 30–40%.

**At 20,000 users, bandwidth costs more than servers.** AWS charges about
$0.09/GB for data sent out, so 5 TB costs about $440 a month. Cloudflare R2
charges nothing for data sent out. That's why the hybrid option (C3) appears
throughout this doc.

---

### AWS options

#### A1. One EC2 instance running Docker Compose

Everything runs as containers on one server: Caddy (handles HTTPS), the API,
the worker, and Postgres. Files go to S3, and nightly database backups plus
continuous WAL archiving (wal-g or pgBackRest) also go to S3.

```
            ┌──────────── EC2 (docker compose) ────────────┐
 users ───► │ caddy ─► api ◄─► postgres     worker         │ ──► S3 (files, backups)
            └──────────────────────────────────────────────┘ ──► SES (email)
```

- **Pros:**
  - It's the same `docker-compose.yml` you run on your desktop, which gives
    the closest match between local and production.
  - Cheapest on AWS.
  - Simple to understand and debug.
- **Cons:**
  - One server means one point of failure.
  - You patch the OS and manage Postgres yourself, including backups and
    upgrades.
  - Scaling means a bigger box; adding more boxes needs rework.
- **Fits:** a pilot, and probably up to around 2,000 users.

| | 200 | 2,000 | 20,000 |
|---|---|---|---|
| Instance | t4g.small (2 GB) $12 | t4g.large (8 GB) $49 | m7g.xlarge (16 GB) $119 |
| Disk (EBS gp3) | $3 | $8 | $24 |
| Public IPv4, backups, S3 files | $6 | $14 | $70 |
| Data out | $0 (free tier) | $36 | $440 |
| SES email | $1 | $5 | $50 |
| **Total (approx.)** | **$20–25** | **~$110** | **~$700** (not recommended at this size) |

**Lightsail variant:** Lightsail is AWS's simplified server offering with
fixed monthly prices, and those prices include a large data-transfer
allowance. A 2 GB instance is $12/month with 3 TB of transfer; an 8 GB
instance is $44/month with 5 TB. That makes A1 on Lightsail roughly $15–20 at
200 users and $55–65 at 2,000. The downsides are fewer instance sizes and an
awkward path to ECS later. It's a good fit for a pilot.

#### A2. Separate pieces: app server on EC2, Postgres on RDS

The same Docker images run on EC2, but Postgres moves to RDS, AWS's managed
database service. RDS handles backups, point-in-time restore, and minor
upgrades, and can add a standby copy (Multi-AZ) later. At larger sizes, add a
load balancer (ALB) and a second app server.

- **Pros:**
  - Your data is the hardest part to recover, and AWS takes care of keeping
    it safe.
  - App servers become disposable.
  - The containers stay the same as on the desktop; only the database
    address changes.
- **Cons:** costs more than A1, with more AWS parts to set up (VPC, security
  groups, and subnets).
- **Fits:** any size. This is the recommended AWS starting point (see
  Recommendation).

| | 200 | 2,000 | 20,000 |
|---|---|---|---|
| App (and worker) servers | t4g.small $12 | t4g.medium $25 | 2× t4g.large + worker t4g.medium $123 |
| Load balancer (ALB) | — | — | $25 |
| RDS Postgres | db.t4g.micro $14 | db.t4g.medium $54 | db.m7g.large Multi-AZ $290 |
| S3, IPv4, logs | $6 | $12 | $65 |
| Data out | $0 | $36 | $440 |
| SES email | $1 | $5 | $50 |
| **Total (approx.)** | **~$35** | **~$130** | **~$990** (~$600 with C3) |

#### A3. Containers on ECS Fargate, with RDS and an ALB

The same images run on ECS, AWS's container service, using Fargate, which
runs containers without servers to manage. You don't patch any machines, and
ECS can run more copies under load and replace ones that fail. Images are
stored in ECR, AWS's container registry.

- **Pros:**
  - The cleanest way to run the Docker setup in production.
  - Deploys roll out gradually and roll back.
  - Scales smoothly to 20,000 users and beyond.
- **Cons:**
  - The load balancer costs about $20/month even when idle.
  - More to set up than A2. Use Terraform (or OpenTofu) or the AWS CDK
    rather than clicking through the console.
  - A NAT Gateway (about $33/month or more) is a common hidden cost. Avoid
    it by running tasks in public subnets, or by using VPC endpoints.
- **Fits:** from 2,000 users, or as soon as downtime during a deploy or a
  server failure isn't acceptable.

| | 200 | 2,000 | 20,000 |
|---|---|---|---|
| Fargate (ARM) | api 0.5 vCPU + worker 0.25 vCPU $21 | 2× api + worker $43 | 3× api (1 vCPU) + 2× worker $115 |
| Load balancer (ALB) | $20 | $22 | $40 |
| RDS Postgres | db.t4g.micro $14 | db.t4g.medium $54 | db.m7g.large Multi-AZ $290 |
| S3, IPv4, logs | $15 | $25 | $100 |
| Data out | $0 | $36 | $350–440 |
| SES email | $1 | $5 | $50 |
| **Total (approx.)** | **~$70** | **~$185** | **~$1,000** (~$600 with C3) |

Running ECS on your own EC2 instances instead of Fargate costs about the same
as A2, with ECS's deploy tooling. It isn't worth the extra setup at these
sizes.

#### A4. EC2 without containers

Python runs in a virtual environment under systemd, behind Caddy or nginx.
Postgres is either installed on the server or on RDS. Servers are set up
with Ansible or a shell script.

- **Pros:** one fewer layer, and it's slightly easier to inspect a running
  process.
- **Cons:**
  - Your desktop and the server drift apart over time (OS packages, Python
    versions, and system libraries such as libvips for image previews).
  - Rebuilding a server is slower, and moving to ECS later means
    containerizing anyway.
  - The Photon geocoder (Java) has to be installed and maintained by hand.
- **Cost:** the same as A1 or A2.
- **Verdict:** not recommended. Docker costs almost nothing extra and keeps
  the desktop-to-AWS path you want.

#### A5. AWS managed-services ("serverless") model

| Need | AWS service |
|---|---|
| Static files | CloudFront and S3 |
| API | API Gateway (HTTP API) and Lambda (Python; FastAPI can run on it through the Mangum adapter) |
| Live connections | API Gateway WebSocket API |
| Database | RDS Postgres (with RDS Proxy) or Aurora Serverless v2 |
| Sign-in | Cognito (optional) |
| Email | SES |
| Jobs and schedules | SQS and EventBridge Scheduler |

- **Pros:**
  - No servers.
  - Computing costs almost nothing when idle.
  - Scales automatically.
- **Cons:**
  - **It doesn't match the Docker-on-desktop model.** Running it locally
    relies on SAM or LocalStack approximations.
  - Lambda has cold starts and a 15-minute limit per run.
  - The WebSocket API changes how chat is written: connection IDs are kept
    in the database and messages are pushed through API calls.
  - Lambda inside a VPC needs a NAT Gateway or VPC endpoints to reach the
    internet, which push services require.
  - Most tied to AWS of all the options.
- **Fits:** a team that wants AWS to run everything and accepts the lock-in.

| | 200 | 2,000 | 20,000 |
|---|---|---|---|
| API Gateway, Lambda, WebSockets | $2 | $20 | $120 |
| RDS (+ Proxy at the largest size) | $14 | $54 | $310 |
| NAT or VPC endpoints | $15–35 | $35 | $50 |
| CloudFront, S3 | $3 | $10 | $390 |
| Cognito, SES | $1 | $5 | $105 |
| **Total (approx.)** | **$35–55** | **~$125** | **~$975** |

---

### Cloudflare options

Cloudflare's building blocks:

| Product | What it is | Rough price |
|---|---|---|
| **Pages** (or Workers with static assets) | Static files | Free, with unlimited bandwidth |
| **Workers** | JavaScript/TypeScript code at the edge | $5/month includes 10 M requests; Python Workers exist but are less mature |
| **Durable Objects** | Small stateful servers with WebSockets; one per chat room or group is a natural fit for live chat | Included in Workers' $5, plus usage |
| **R2** | S3-compatible storage with **no charge for data out** | $0.015/GB-month |
| **D1** | SQLite database | Not Postgres |
| **Hyperdrive** | Connection pooling to an outside Postgres | Included |
| **Queues and Cron Triggers** | Jobs and schedules | Included, plus usage |
| **Containers** | Docker images run alongside Workers, billed by time running, can stop when idle | Launched in public beta in 2025; check whether it's generally available (GA) yet and its current limits |
| **Access, WAF, DNS, and CDN** | Login gate, firewall, DNS, and caching | Free tier available |

**Cloudflare doesn't offer managed Postgres.** You pair it with Neon,
Supabase, or AWS RDS, connected through Hyperdrive.

#### C1. All Cloudflare (Workers, Durable Objects, and R2) with outside Postgres

- **Pros:**
  - Cheapest at scale, because sending data out is free.
  - Nothing to patch.
  - Durable Objects are a very good fit for chat and presence.
  - Fast worldwide.
- **Cons:**
  - **The backend has to be written in JS or TypeScript** for the Workers
    runtime, not Python.
  - **It isn't Docker.** Local development uses `wrangler dev`, which works
    offline but is its own environment.
  - Tied to Cloudflare's runtime.
  - The Photon geocoder can't run on Workers; it needs Containers or a
    separate server.

| | 200 | 2,000 | 20,000 |
|---|---|---|---|
| Workers, Durable Objects, Queues | $5 | $7 | $50 |
| R2 storage and operations | $0 | $5 | $40 |
| Postgres (Neon, Supabase, or RDS) | $0–25 | $25–70 | $150–350 |
| Email (Postmark or SES) | $0–15 | $15 | $50 |
| **Total (approx.)** | **$5–45** | **$50–100** | **$300–500** |

#### C2. Cloudflare Containers with outside Postgres

This runs the same Docker images as your desktop, with a small Worker in
front that sends requests to them. Container disks are temporary, so
Postgres has to live somewhere else (Neon, Supabase, or RDS).

- **Pros:**
  - Keeps the Docker model.
  - Comes with Cloudflare's edge, R2, and free data out.
- **Cons:**
  - The newest and least proven option.
  - A container that's always on costs more per vCPU than EC2.
  - Every database query makes a round trip to Postgres somewhere else.
  - Prices and limits are still changing.
- **Approximate total:** $20–60 at 200 users, $80–170 at 2,000, and
  $450–900 at 20,000. **These are the least certain numbers in this doc;
  re-check them first.**

#### C3. Hybrid: Cloudflare at the edge, AWS for the backend

Cloudflare handles:
- DNS, caching, and the firewall
- Pages for the static app
- R2 for files, photos, and map tiles (no charge for data out)
- Access for staging

AWS runs the API, the worker, and Postgres with any of A1–A3.

- **Pros:**
  - Removes the biggest cost at scale, data sent out from AWS.
  - Shields the AWS servers from attacks.
  - Keeps the Docker-to-AWS path.
  - Adds about $0–25/month for Cloudflare plus R2 storage.
- **How uploads work:** browsers upload straight to R2 using one-time signed
  URLs from the API, so the files never pass through AWS. The worker reads
  originals from R2 for free and writes back only small previews.
- **Cons:** two providers to manage, and both have to be set up and
  understood.

### Not covered

Hetzner, DigitalOcean, Fly.io, and Render often cost less than AWS for a
single box or small containers. Docker Compose would move to any of them.
They were left out because this review focuses on AWS and Cloudflare.

---

### Comparison

| Option | Matches desktop Docker | Work to run | Tied to vendor | 200 | 2,000 | 20,000 |
|---|---|---|---|---|---|---|
| A1 One EC2 + Compose | ●●● | Medium (you run Postgres) | Low | $20–25 | ~$110 | ~$700* |
| A1 on Lightsail | ●●● | Medium | Low | $15–20 | $55–65 | — |
| A2 EC2 + RDS | ●●● | Low to medium | Low | ~$35 | ~$130 | ~$990 |
| A3 ECS Fargate + RDS | ●●● | Low (after setup) | Medium | ~$70 | ~$185 | ~$1,000 |
| A4 EC2, no containers | ● | Medium to high | Low | ~$35 | ~$130 | ~$990 |
| A5 AWS serverless | ● | Low | High | $35–55 | ~$125 | ~$975 |
| C1 All Cloudflare | ●● | Low | High | $5–45 | $50–100 | $300–500 |
| C2 Cloudflare Containers | ●●● | Low | Medium | $20–60 | $80–170 | $450–900 |
| C3 Cloudflare edge + AWS (A2 or A3) | ●●● | Medium | Low to medium | ~$40 | ~$110 | ~$600 |

\* One server isn't recommended at 20,000 users.

### Recommendation

Follow one path, with the same containers at every stage:

1. **Desktop:** Docker Compose runs Caddy, the API, the worker, Postgres, an
   S3-compatible store, and Mailpit (which catches outgoing email so you can
   read it locally). For the S3 store, use MinIO, Garage, or LocalStack;
   check MinIO's current license and status before choosing it.
2. **Pilot, up to about 200 users:**
   - Cloudflare in front (Pages for the app, R2 for files, DNS, and Access
     during the pilot).
   - AWS runs **A2**: one t4g.small running Compose (API and worker), and a
     **db.t4g.micro on RDS from the start**.
   - Running Postgres in a container on the server saves about $14/month,
     but managed backups and point-in-time restore are worth that once real
     people's data is in it.
   - **About $40/month.**
3. **About 2,000 users:** a bigger app server and RDS instance. Move to
   **A3 (ECS Fargate)** when you want deploys without downtime or a second
   app server. **About $110–185/month.**
4. **About 20,000 users:**
   - A3 with 2–3 API tasks, an RDS Multi-AZ standby, and R2 serving the
     files.
   - Add Redis or Valkey (an in-memory store) for the live-connection
     messaging between API copies, and only if Postgres LISTEN/NOTIFY
     isn't keeping up.
   - **About $600/month.**

Choose C1 (all Cloudflare) only if you're willing to write the backend in
TypeScript for Workers. It's the cheapest at scale, but it gives up the
Docker and Python model.

---

## Part 2: Development plan

### Suggested repository layout

This builds on the `prototype_deploy/` move in
[cloudflare-deploy.md](cloudflare-deploy.md).

```
threeden/
  prototype_deploy/   the web app (could later be renamed web/)
  server/
    app/              API (FastAPI): routes, permissions, models
    worker/           background jobs (same codebase, different entry point)
    migrations/       Alembic database migrations
    tests/            pytest API tests
    Dockerfile
  infra/
    docker-compose.yml        desktop
    docker-compose.prod.yml   pilot EC2
    terraform/                AWS and Cloudflare, once on ECS
  tests/              Playwright end-to-end tests (existing), pointed at the Compose stack
  scripts/
  docs/
```

### Each part of the system

#### Postgres

- **Version:** use the same major version locally (the official Docker
  image) and on RDS.
- **Schema approach: start close to the prototype.** Today each module keeps
  its data as one JSON object (`module.data`). On the server, store that in a
  `jsonb` column on a `modules` table, so most of the 25+ module types work
  without their own tables.
- **Use real tables for anything the server must query, check, or join:**
  - accounts and profiles
  - spaces and memberships, with roles and per-group permission overrides
  - invites
  - events, RSVPs, waitlists, and co-hosts
  - task assignments
  - conversations and messages
  - notifications
  - friends, follows, posts, comments, and likes
  - file metadata and sharing
  - push subscriptions
  - calendar feed tokens
  - reports, blocks, and moderation
  - an audit log
- **Migrations:** Alembic, run automatically on deploy. This replaces
  `DATA_VERSION` and `MIGRATIONS` in `js/state/upgrade.js` for server data.
- **Search:** Postgres full-text search (`tsvector`) at first. Results must
  be filtered by what the person is allowed to see.
- **Job queue:** keep jobs in Postgres at first (Procrastinate, or plain
  `SELECT … FOR UPDATE SKIP LOCKED`), so there's no extra service.
- **Live updates across API copies:** LISTEN/NOTIFY at first.
- **Backups:** RDS point-in-time restore, plus a monthly practice restore
  into a scratch database.

#### API server (Python)

- **Stack:**

  | Need | Tool |
  |---|---|
  | Web framework and server | FastAPI with Uvicorn |
  | Database access | SQLAlchemy 2 or psycopg 3 |
  | Request and response validation | Pydantic |
  | Password hashing | argon2-cffi |
  | Tests | pytest |
  | Packages and linting | uv and Ruff |

- **Why Python:** the team already writes Python (the Playwright tests), and
  it has good libraries for everything on the list. Image previews (Pillow
  or pyvips), push (pywebpush), and calendars (icalendar) are all covered.
- **Decision to confirm:** a Node backend could reuse `permissions.js`,
  `calendar-feed.js`, and the `*-data.js` rules files directly. With Python,
  permission rules get written twice. To keep them in line:
  - turn the permission table (each permission and the lowest role allowed)
    into one JSON file that both sides read;
  - add a shared test-case file that both the JS and Python sides run.
- **API style:**
  - Plain JSON over HTTPS, organized around things like `/spaces/{id}`,
    `/modules/{id}`, `/events/{id}/rsvp`, and `/conversations/{id}/messages`.
  - Saves use a version number ("optimistic concurrency"). When two people
    edit the same module, the second save is told it's out of date, and the
    page offers to reload or merge, instead of one edit silently overwriting
    the other.
- **Sign-in:**
  - Sessions in httpOnly cookies, which page scripts can't read.
  - Email plus password, or an emailed sign-in link. Add passkeys later.
  - Build sign-in into the app rather than using Cognito, so it moves with
    the containers.
- **Rate limits and abuse controls:** from the start on sign-in, invites,
  the calendar feed, and uploads. The security plan doc has more.
- **AGPL:** the server must offer its source to anyone using it over the
  network. Set `SOURCE_CODE_URL` (in `js/onboarding/help-page.js`) and add a
  source link to the API.

#### Live connection

- A WebSocket endpoint in the same FastAPI app, `/live`, which replaces
  `live.js` (today it only syncs between windows in the same browser).
- Each connection subscribes to the spaces and conversations the person can
  see. The server sends small "this changed" events, and the page reloads
  what it needs. That fits the store's existing events (`messages`,
  `notifications`, `layout`, and so on).
- Messages between API copies go through Postgres LISTEN/NOTIFY, or Redis
  or Valkey once there are several copies under real load.

#### Worker (Python, same codebase)

The worker runs these jobs:

- **Push and email:** Web Push (VAPID) and email through SES, applying the
  same `shouldPush` rules as the page (group settings, "needs me" only, and
  quiet hours).
- **Scheduled jobs:** reminders, scheduled articles, recaps, and repeating
  tasks.
- **File previews:** made after upload (images, PDFs, and documents).
- **External calendars:** fetched on the server, replacing the browser fetch
  in `js/state/external-calendars.js`. Fetching from the browser fails on
  many calendar servers and shows them who the person is.
- **Cleanup:** disappearing messages, expired invites, and so on.

#### Web app (the existing JavaScript)

- **Stays framework-free, with no build step.** The edge compresses it
  (Brotli) and caches it. Bundling and minifying (for example with esbuild)
  is optional later and only for production.
- **`js/state/storage.js` becomes the API client.** It's already the only
  file that knows where data is saved. `store.js` becomes a local cache of
  server data: changes show on screen right away, saves are sent to the
  server, and conflicts are shown when they come back.
- **Sign-in and sign-up screens** take over the "saving asks for an account"
  step from onboarding.
- **Keep a demo mode.** The sample data (`js/data/`, about 1.1 MB) is useful
  for testing and for showing 3den off, but it shouldn't ship to real users.
  Load it only in demo mode, or move it into a seed script for the server.
- **Map:** ship MapLibre with the app instead of loading it from a CDN, and
  point `STREET_STYLE` at Protomaps.

#### Files and object storage

- The browser asks the API for a signed upload URL, uploads straight to R2
  or S3, then confirms the upload to the API. The worker makes previews.
- Downloads use short-lived signed URLs, issued only after the vault's
  sharing rules allow it.
- Store the original upload and the previews as separate objects.

#### Calendar feed, push, and email

- **Calendar feed:** `GET /cal/<token>.ics`, ported from
  `feedIcs(member)` in `js/state/calendar-feed.js`. No sign-in (the token is
  the key), `text/calendar`, a short cache, and a new token when the person
  clicks "Make a new address." Set `FEED_HOST` to the real domain.
- **Push:** generate VAPID keys and put the public one in
  `VAPID_PUBLIC_KEY` (`js/state/delivery.js`). Store each
  `pushSubscription`. The existing `sw.js` already handles incoming
  pushes.
- **Email:** SES (request production access early; approval takes a few
  days), with SPF, DKIM, and DMARC set up on the domain.

#### Maps and address search

- **Protomaps:** one PMTiles file on R2, read in chunks by MapLibre (HTTP
  range requests). Start with a regional extract rather than the whole
  planet.
- **Photon** (address search) runs in its own container. It needs several
  GB of memory even for one region. Add it late, and give it its own small
  instance if needed.

#### End-to-end encrypted messages

- The browser does all the encryption: the Signal protocol for direct chats
  and MLS for group chats. They replace the prototype's `e2ee.js`. The
  server stores only public key bundles and ciphertext.
- Treat this as research first. Browser support for libsignal and the MLS
  libraries (for example OpenMLS compiled to WebAssembly) needs checking.
  It is the last major feature in the plan.

#### Testing and CI

- **Playwright tests:** the existing suite becomes the staging acceptance
  tests DESIGN.md calls for. It runs against `docker compose up` locally and
  in CI. Start with the two sweeps, then move the feature tests over as each
  area gets its server side.
- **API tests:** pytest, including a test for every permission, both
  allowed and denied.
- **Seed data:** a small Node script exports `demo-state.js` to JSON, and a
  Python seeder loads it. Local and staging then start with the same
  familiar groups.
- **CI (GitHub Actions):**
  - `npm run check`, Ruff, pytest, and the Playwright sweeps on every push;
  - build images and push them to ECR on `main`;
  - deploy to staging automatically and to production by hand.
- **Monitoring:**
  - error tracking (Sentry, or self-hosted GlitchTip);
  - logs in CloudWatch;
  - an uptime check on the API and the calendar feed.
- **Secrets:** in AWS SSM Parameter Store, never in the repo. Since the repo
  will be public, this includes anti-abuse settings.

---

### Order of development

Each phase ends with something working that you can deploy. The first two
phases build the full path (browser → API → Postgres → AWS) as thinly as
possible. Every later phase adds features to a pipeline that already works.

| Phase | Goal | What gets built | Done when |
|---|---|---|---|
| **0. Foundations** | Repo and tooling ready | Repo reorganized (`prototype_deploy/`, `docs/`, `server/`, `infra/`). Static prototype on Cloudflare Pages behind Access. Docker Compose with Caddy, a FastAPI "hello", and Postgres. CI running checks. Domain and DNS on Cloudflare. | `docker compose up` serves the app and `/api/health` locally, and CI is green |
| **1. Thinnest full path** | Real accounts, data saved on a server | Sign up, sign in, and sign out. `storage.js` sends **the whole saved state as one JSON blob** per account (`GET` and `PUT /api/state`) instead of IndexedDB. Deploy to the pilot server (A2 with RDS) through CI. | You sign in on your laptop and your phone and see the same data, served from AWS |
| **2. Shared groups** | Several people in one group | Accounts, spaces, memberships, roles, and the permission table move into real tables. Module data is stored per module (`jsonb`). Invite links. Public tabs readable by guests. Server checks every permission. Version-number saves. Demo data seeder. | Two accounts edit the same group, permissions hold, and the sweeps pass against the stack |
| **3. Events and calendar** | The core event loop | Events, RSVPs, waitlists, and series in tables. The calendar feed endpoint. Worker running reminders. Email notifications through SES. | An invite → RSVP → reminder email → the event shows in Google Calendar |
| **4. Messages and notifications** | Talking, live | Conversations and messages. The `/live` WebSocket. Notification table and the bell. Web Push with VAPID. Basic blocking and reporting. | A message appears instantly in the other person's window and as a phone notification |
| **Pilot** | 20–50 real people | Fix what the pilot finds. Backups tested by a practice restore. | — |
| **5. Files and media** | Vault, photos, and blogs with images | Signed uploads to R2. Previews from the worker. Sharing rules on downloads. Photo editor saves. | Upload a photo, share it with a group, and see the preview on a phone |
| **6. Social layer** | Blogs, the Feed, and Explore | Public blog pages. Posts, comments, likes, friends, and follows. Explore by place and interest. Full-text search. "Bring your people" contact matching. | The Feed and Explore run from server data, and guests can read public blogs |
| **7. Safety and open-source readiness** | Ready for people you don't know | Moderation queue, child accounts, rate limits, and anti-bot measures from the security plan. AGPL readiness list from HANDOFF (full license text, real contact addresses, `SOURCE_CODE_URL`, DCO or CLA, trademark). | Safe to open sign-up and make the repo public |
| **8. Maps** | Private maps | Protomaps PMTiles on R2. MapLibre shipped with the app. Photon address search. | The area map works with no outside map service |
| **9. Encrypted messages** | End-to-end encrypted chats | Signal-protocol direct chats and MLS group chats, with the server storing ciphertext only. | Two phones exchange messages the server can't read |
| **10. Scale and hardening** | Ready for thousands of users | Move to ECS Fargate (A3), RDS Multi-AZ, and Redis or Valkey if needed. Load testing at about 3,000 live connections. Disaster-recovery drill. Cost alerts. | Survives losing one app server and passes load tests |

Notes on the order:

- **Phase 1's whole-state blob is a deliberate shortcut.** It tests sign-in,
  deploys, the database, and the phone in days instead of weeks, because only
  `storage.js` changes. Phase 2 then replaces it with real shared data. Don't
  build features on the blob.
- **Basic blocking and reporting come in Phase 4,** before the pilot. Full
  moderation can wait until Phase 7, before opening sign-up to strangers.
- Phases 5, 6, and 8 can swap places depending on what the pilot group
  needs most.
- HANDOFF's "Before the backend" reminders appear in Phase 3 (calendar
  feed), Phase 4 (Web Push), Phase 7 (AGPL), and Phase 8 (Protomaps).

### Decisions to make

1. **Python or Node for the server.** This doc recommends Python. Node
   would let the server reuse the prototype's permission and data rules
   directly.
2. **Postgres on RDS from the pilot**, or a Postgres container on the
   pilot server to save about $14/month.
3. **Cloudflare in front from day one (C3)**, or AWS only at first and
   Cloudflare added later.
4. **Lightsail or EC2 for the pilot.** Lightsail is cheaper and includes
   data transfer; EC2 makes the move to ECS easier.
5. **Email provider:** SES (cheapest, more setup) or Postmark (easier,
   better delivery tools, costs more).
6. **Infrastructure as code:** Terraform or OpenTofu (works for both AWS and
   Cloudflare) or the AWS CDK (AWS only), and when to start. This doc
   suggests starting at the move to ECS.
