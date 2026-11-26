# 3den: development plan 1

Status: **ready to start once the questions in
[proto_to_dev_plan.md](proto_to_dev_plan.md) are answered** (Nov 20, 2026).

Short build cycles, each ending with something you can run and see. The
order: get the tools working, then a Hello World through the database and
FastAPI on the web, then the same on iOS, then sign-in, then one real
prototype feature (**group events and RSVPs**) on the web and iOS. Android
comes later.

Background: [architecture.md](architecture.md) for the design,
[development_setup.md](development_setup.md) for the tools and commands.

**Who does each step:**

- 🧑 **You**: things only you can do (installing apps, Apple signing,
  choosing, testing on your phone, reviewing) or should do (deciding).
- 🤖 **Claude**: writing code, config, tests, and docs, and running the
  checks it can run from the terminal.

Claude doesn't commit or push unless you ask. Each cycle ends with a
"review and commit" step for you (or ask Claude to commit).

**Where things go:** all production code is under `prod/` (layout in
development_setup.md §2). The prototype stays at the repo root, unchanged,
and keeps its own checks and tests; it moves into its own folder in a later
plan. File paths in the steps below are relative to `prod/` unless they say
"the prototype's", and `make` runs from `prod/`.

Progress: change `[ ]` to `[x]` as steps are done.

---

## Cycle 0: Decisions and tools

**Done when:** Docker runs on both Macs, the decisions are made, and `prod/`
exists with the prototype still working where it is.

| | Step | Who | Done when |
|---|---|---|---|
| [ ] | **0.1** Read architecture.md and answer the questions in proto_to_dev_plan.md (or reply "use your defaults") | 🧑 You | Answers written in the doc |
| [ ] | **0.2** Install OrbStack (or Docker Desktop), XcodeGen, and optionally libpq, on the desktop and the laptop (development_setup.md §1) | 🧑 You | `docker run --rm hello-world` works on both Macs |
| [ ] | **0.3** Create `prod/` with its empty folders and files: `web/`, `server/`, `ios/`, `infra/`, `shared/`, `e2e/`, `.env.example`, and `prod/.gitignore` (`.env`, `ios/*.xcodeproj`, `__pycache__`, `.venv`). The prototype isn't moved or changed | 🤖 Claude | Files exist; the prototype's `npm run check` still passes |
| [ ] | **0.4** Review and commit | 🧑 You | On `main` (or a branch) |

## Cycle 1: Hello World on the web (database + FastAPI + Caddy)

**Done when:** a page at `http://localhost:8080/hello.html` reads greetings
from Postgres through FastAPI, you can add one, and it's still there after a
restart, on both Macs.

| | Step | Who | Done when |
|---|---|---|---|
| [x] | **1.1** `prod/compose.yaml` (db, api, web), `infra/Caddyfile`, `.env.example`, and the `Makefile` | 🤖 Claude | `docker compose config` is valid (run in `prod/`) |
| [x] | **1.2** FastAPI skeleton: `server/pyproject.toml` (uv), Dockerfile, settings from the environment, a SQLAlchemy engine, and `GET /api/health` that checks the database | 🤖 Claude | `make up`, then `curl localhost:8080/api/health` returns `{"status":"ok","database":"ok"}` |
| [x] | **1.3** Alembic set up in `server/migrations/`, with a first migration creating a `greetings` table (id, message, created_at) | 🤖 Claude | `make migrate` creates the table |
| [x] | **1.4** `GET /api/v1/hello` (count and latest five greetings) and `POST /api/v1/hello` (add one, 1–200 characters) | 🤖 Claude | Both work from `/api/docs` |
| [x] | **1.5** pytest set up against a separate test database, with tests for health and hello (including a too-long message being refused) | 🤖 Claude | `make test` passes |
| [x] | **1.6** `web/hello.html`: shows the server and database status, the greetings, and a form to add one. Uses a copy of the prototype's `css/tokens.css` (in `web/css/`) so it looks like 3den | 🤖 Claude | Works in the browser |
| [ ] | **1.7** Try it: `cd prod`, `cp .env.example .env`, `make up`, `make migrate`, open `localhost:8080/hello.html`, add a greeting, run `make down` then `make up`, and check it's still there. Open `/api/docs` and try an endpoint | 🧑 You | Works on the desktop |
| [ ] | **1.8** Pull on the laptop and do the same | 🧑 You | Works on the laptop |
| [ ] | **1.9** Fix anything in development_setup.md that turned out wrong, and mark sections 3 to 7 as checked | 🤖 Claude | Doc matches reality |
| [ ] | **1.10** Review and commit | 🧑 You | Committed |

## Cycle 2: Hello World on iOS

**Done when:** a greeting added on your iPhone shows on the web page, and the
other way round.

| | Step | Who | Done when |
|---|---|---|---|
| [x] | **2.1** `ios/project.yml` (XcodeGen), a SwiftUI app named 3den with Debug and Release config files (`API_BASE_URL`), an optional `Local.xcconfig` for per-Mac settings, and Info.plist settings for local networking | 🤖 Claude | `xcodegen` makes the project; `xcodebuild` builds it for the Simulator |
| [x] | **2.2** An `APIClient` (URLSession, async/await, Codable, one error type) and a Hello screen: status, greetings list, pull to refresh, add form | 🤖 Claude | Builds |
| [x] | **2.3** Unit tests for decoding the hello responses and for error handling | 🤖 Claude | Tests pass with `make ios-test` |
| [x] | **2.4** With the stack up, `make ios`, open `ios/ThreeDen.xcodeproj` in Xcode, and run on the iPhone Simulator (no team needed). Add a greeting; refresh the web page | 🧑 You | The greeting shows on the web |
| [x] | **2.5** `cp ios/Config/Local.xcconfig.example ios/Config/Local.xcconfig`; set `DEVELOPMENT_TEAM` and your Mac's `.local` address in it; `make ios`; run on your iPhone (same Wi-Fi), allow Local Network access, and add a greeting from the phone | 🧑 You | It shows on the web, and a web greeting shows on the phone |
| [x] | **2.6** Update development_setup.md §8 with what you ran into | 🤖 Claude | Doc matches reality |
| [ ] | **2.7** Review and commit | 🧑 You | Committed |

## Cycle 3: Accounts and sign-in

Every real feature needs to know who's asking, so this comes before the
first feature.

**Done when:** you make an account on the web, sign in with it on the
phone, and signing out on one device doesn't sign out the other.

| | Step | Who | Done when |
|---|---|---|---|
| [x] | **3.1** Tables `accounts` and `sessions` (token stored only as a hash, device name, last used, revoked). Argon2id passwords | 🤖 Claude | Migration applies |
| [x] | **3.2** `POST /api/v1/auth/signup`, `/signin`, `/signout`; `GET /api/v1/me`; `GET` and `DELETE /api/v1/me/sessions` (your devices). Cookie for the web, bearer token for apps. Origin check on changes. A simple rate limit on sign-in and sign-up | 🤖 Claude | Works from `/api/docs` |
| [x] | **3.3** Tests, including the refusals: wrong password, a revoked session, a missing Origin, and too many attempts | 🤖 Claude | `make test` passes |
| [x] | **3.4** Copy the prototype's app files (index.html, phone.html, manifest.json, sw.js, css/, js/, icons/) into `web/`, with its ESLint and jsconfig settings so `make check` covers them. The prototype at the root is left as it is | 🤖 Claude | `make check` passes; `localhost:8080` shows the app in demo mode |
| [x] | **3.5** Web server mode, first part, in `web/`: the app checks for `/api/health` and offers server mode; the sign-up and sign-in screens (`web/js/account/auth-view.js`) call the API in server mode. Demo mode still works | 🤖 Claude | Sign up, sign out, and sign in work in the browser; the prototype's sweeps still pass |
| [x] | **3.6** iOS: sign-in and sign-up screens, the token in the Keychain, a Me screen with a sign-out button | 🤖 Claude | Builds; tests pass |
| [ ] | **3.7** Try it: make an account on the web, sign in on the phone, sign out on the web, and check the phone is still signed in. Look at the sessions in the database (`make psql`) | 🧑 You | Works |
| [ ] | **3.8** Review and commit | 🧑 You | Committed |

## Cycle 4: First prototype feature: group events and RSVPs

**Why this feature:** events are 3den's core loop (someone sends you an
event, you say you're going, it shows in your calendar), they're what people
most often do on a phone, and they test the hard parts of the architecture in
a small space: groups, roles, permissions, visibility, and two clients
changing the same data.

**In:** your groups; a group's upcoming events; an event's page; RSVP Going,
Maybe, or Can't go, with counts and who's going.
**Out, for later cycles:** making and editing events (they come from the seed
data), series, waitlists, reminders, hosts, covers, rides, live updates, and
the calendar feed.

**Done when:** Leo RSVPs on the phone, Maya sees it on the web after a
refresh, and a new account that isn't in the group can't see its private
events. (Leo and Maya are demo accounts in 14 Juniper Lane.)

| | Step | Who | Done when |
|---|---|---|---|
| [x] || **4.1** A short design note (added to this doc): the tables (`spaces`, `memberships`, `events`, `event_rsvps`), the endpoints, which `web/` files change for server mode (likely `web/js/state/events.js`, `web/js/events/rsvp.js`, `web/js/events/event-page.js`, and the Calendar and Upcoming events modules), and how the iOS screens map to the prototype's phone layout | 🤖 Claude | Note written |
| [ ] | **4.2** Read the note and approve or adjust it | 🧑 You | Approved |
| [x] || **4.3** Move the permission table from `web/js/` to `shared/permissions.json`; `web/`'s `permissions.js` reads it; add a shared test-case file run by both JS and pytest. The prototype keeps its own copy | 🤖 Claude | `make check` and `make test` pass |
| [x] || **4.4** Migrations and models for spaces, memberships, events, and RSVPs. Python versions of `can()` and the event visibility rules (`canSeeEvent`) | 🤖 Claude | Migration applies; permission tests pass |
| [x] || **4.5** Seed script: a small Node script (in `server/seed/`) exports two demo groups (14 Juniper Lane and one other), their members, and their events from `web/`'s sample data to JSON; a Python seeder loads it. Demo accounts get a development-only password | 🤖 Claude | `make seed` loads them; running it twice doesn't duplicate anything |
| [x] || **4.6** Endpoints: `GET /api/v1/me/spaces`, `GET /api/v1/spaces/{id}/events?from=&to=`, `GET /api/v1/events/{id}`, `PUT /api/v1/events/{id}/rsvp` | 🤖 Claude | Work from `/api/docs` |
| [x] || **4.7** Tests: members see their group's events; non-members get 404; public events are visible to everyone; an RSVP changes the counts; a stale version gets 409 | 🤖 Claude | `make test` passes |
| [x] || **4.8** Web server mode: groups and their events come from the API; the event page and RSVP buttons use it (shown at once, rolled back with a toast if refused). Other modules keep local data, marked as not saved to the server yet | 🤖 Claude | Works in the browser |
| [x] || **4.9** A Playwright test in `e2e/` for the server-mode event flow (two browser contexts: Leo and Maya) | 🤖 Claude | Passes |
| [x] || **4.10** Try it on the web: two browser profiles, signed in as Leo and Maya; RSVP as one and refresh as the other. Then sign in as the account you made in Cycle 3 and open a private event's address | 🧑 You | Works, and the outside account is refused |
| [x] || **4.11** iOS: generate API types from the OpenAPI schema (`swift-openapi-generator`); Groups list → Upcoming events → Event page with RSVP buttons, following the prototype's phone layout | 🤖 Claude | Builds; tests pass |
| [x] || **4.12** Try it on your iPhone: RSVP as Leo on the phone, see it on the web as Maya, and the other way round | 🧑 You | Works |
| [x] || **4.13** Update architecture.md (anything that changed) and development_setup.md, and add `prod/README.md` (what's in `prod/`, the server-mode seam in `web/`) | 🤖 Claude | Docs match the code |
| [x] || **4.14** Review and commit | 🧑 You | Committed |
| [ ] | **4.15** Look back together: what was slow, what to change, and what comes next | 🧑 You + 🤖 Claude | Next plan (dev_plan_2.md) outlined |

### Cycle 4 design note (step 4.1)

Written and built in one go (Nov 26), as asked; adjust anything here and
the code follows.

**Tables** (migration 0003; ids are UUIDs, times `timestamptz`):

| Table | Columns | Notes |
|---|---|---|
| `spaces` | id, slug, kind, name, description, visibility, permissions (`jsonb`), version, created_at, updated_at | `slug` is the prototype's id (`juniper`), unique, empty for spaces made on the server later. `kind` is `group` for now. `visibility` is `private` or `public`. `permissions` holds only the changed ones, as in the prototype |
| `memberships` | space_id, account_id, role, joined_at | Key is (space, account). `role` is `owner`, `admin`, or `member`; one owner per space |
| `events` | id, space_id, kind, title, starts_at, ends_at, all_day, time_zone, location, notes, color, visibility, capacity, created_by, version, created_at, updated_at | `kind`: `event` (has a page and RSVPs) or `entry` (a plain calendar entry like "Rent due"), as in calendar-data.js. All-day items start at midnight in `time_zone` and end at the midnight after their last day |
| `event_rsvps` | event_id, account_id, answer, answered_at | `answer`: `going`, `maybe`, `no`. No row = no answer |
| `event_invitees` | event_id, account_id | A fifth, small table: invite-only events need their invite list |

Left for later cycles: repeating events, waitlists, co-hosts, host and
shared groups, covers, custom event pages, tags, and areas.

**Who can see what** (the prototype's `canViewEvent`, minus host and shared
groups), checked on the server:

- A **public** event: anyone, even someone not signed in.
- A **group** event or a calendar entry: the group's members, plus anyone
  invited or who has answered.
- An **invite-only** event: the host, the people invited, and anyone who
  has answered.
- Anyone else gets 404, as if it didn't exist. A private group's events
  list is 404 for non-members; a public group's shows its public events.

`can()` and the roles come from `shared/permissions.json`, read by both
`web/js/state/permissions.js` and `server/app/spaces/permissions.py`.
`shared/permission-cases.json` holds test cases that both check.

**Endpoints** (under `/api/v1`):

| Endpoint | What it does |
|---|---|
| `GET /me/spaces` | Your groups, with your role and the member count |
| `GET /spaces/{id}/members` | A group's members and their roles. Members only (an extra endpoint: the apps need names) |
| `GET /spaces/{id}/events?from=&to=` | The items in a time range that you can see, soonest first (default: from now, 60 days) |
| `GET /events/{id}` | One event: details, host, counts, your answer, and who answered |
| `PUT /events/{id}/rsvp` | `{answer, version}`; `answer: null` (or left out) takes your answer back. Returns the event. 409 if the event changed since you loaded it (`version`) or it's full; 400 for a calendar entry |

**Seed data:** `server/seed/export.mjs` (Node) imports `web/`'s demo
files and prints 14 Juniper Lane and Eastside Mutual Aid (a public group
with public events), their people, and their calendars as JSON;
`server/seed/load.py` writes them. Ids are fixed UUIDs made from the
prototype's ids, so loading twice changes nothing. Dates are relative to
today, in your Mac's time zone. Repeating items are loaded as one date. Demo
accounts get the password `3den-demo`, in development only. One change to
`web/`'s demo data: Juniper's House meeting becomes an event (it was a
calendar entry, so nothing in Juniper took RSVPs), with Maya and Theo going.

**Web, server mode:** the app's views keep reading local data, and a new
`web/js/api/sync.js` keeps a copy of your server groups in it:

- After sign-in (and each load) it reads your groups, their members, and
  their events, and puts them in the local state as groups with Up next,
  Calendar, and Upcoming events modules. The calendar, Upcoming events, Up
  next, the event page, and the RSVP buttons then work unchanged. People
  become local members marked `server`, like your own account.
- RSVPs: every RSVP button saves through the store, so one watcher
  (`onModuleDataChange`) notices when your answer to a server event
  changes and sends it. It shows at once; if the server refuses, the old
  answer comes back with a toast saying why.
- An event that isn't in local state (a link to a public event of a group
  you're not in) is fetched with `GET /events/{id}` when its page opens.
- Signing out or switching to demo mode removes the copied groups.
- Anything else changed in a server group (editing an event, adding a
  module) stays in this browser, and a line under the group's name says so.
- Files: new `js/api/sync.js`; `js/api/server-mode.js`,
  `js/state/permissions.js`, `js/events/event-page.js`, and
  `js/editor/space-header.js` change. The views the plan guessed at
  (`state/events.js`, `rsvp.js`, the Calendar and Upcoming events modules)
  don't need to.

**iOS:** `swift-openapi-generator` as a build plugin, with the
`swift-openapi-runtime` and `swift-openapi-urlsession` packages (Swift
packages that Xcode downloads; the first time you open the project, Xcode
asks you to trust the generator plugin). The spec is kept in
`shared/openapi.json`, written by `make openapi`; a server test fails if
it's out of date. `make ios` copies it into the app. Screens, following
the phone layout's tab bar: **Coming up** (events in all your groups, with
the RSVP buttons in the list; added Nov 26), **Groups** (your groups) → a group's upcoming
events (by day) → the event (when, where, notes, host, the three RSVP
buttons with counts, and who's going), and **Me** (devices, sign out, and
the server check that was the Hello screen). The existing hand-written
`APIClient` keeps sign-in and Hello for now.

## After this plan

Candidates for dev_plan_2.md, to choose in step 4.15:

- **Live updates:** the WebSocket, so an RSVP shows on other screens at once.
- **Making and editing events,** with hosts and permissions.
- **The EC2 testing server:** Compose on EC2, S3, HTTPS, and deploys from
  GitHub Actions, so you can test away from home.
- **Notifications:** the bell, email through Mailpit locally, and APNs
  (needs the paid Apple Developer Program).
- **Group homepages from the server:** tabs and modules with `jsonb` data, so
  the web editor saves to the server.
- **Tasks and assignments**, the second core loop.
- **Move the prototype into its own folder** (cloudflare-deploy.md's
  `prototype_deploy/`, or `prototype/`), updating its checks, tests, and
  cloudflare-deploy.md.
