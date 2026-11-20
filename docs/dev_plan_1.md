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

Progress: change `[ ]` to `[x]` as steps are done.

---

## Cycle 0: Decisions and tools

**Done when:** Docker runs on both Macs, the decisions are made, and the repo
has its new layout with the prototype still working.

| | Step | Who | Done when |
|---|---|---|---|
| [ ] | **0.1** Read architecture.md and answer the questions in proto_to_dev_plan.md (or reply "use your defaults") | 🧑 You | Answers written in the doc |
| [ ] | **0.2** Install OrbStack (or Docker Desktop), XcodeGen, and optionally libpq, on the desktop and the laptop (development_setup.md §1) | 🧑 You | `docker run --rm hello-world` works on both Macs |
| [ ] | **0.3** Move the prototype into `web/` with `git mv` (index.html, phone.html, manifest.json, sw.js, css/, js/, icons/). Update package.json, eslint.config.js, jsconfig.json, scripts/build-year-demo.mjs, tests/README.md, and cloudflare-deploy.md. Add one line to README.md: "Code paths are relative to `web/`." | 🤖 Claude | `npm run check` passes; `npm run serve` still shows the prototype |
| [ ] | **0.4** Run the two Playwright sweeps against the moved prototype | 🤖 Claude | `tests/sweep_guest.py` and `tests/sweep_signed_in.py` pass |
| [ ] | **0.5** Create the empty folders and files: `server/`, `ios/`, `infra/`, `shared/`, `.env.example`, and `.gitignore` additions (`.env`, `ios/*.xcodeproj`, `__pycache__`, `.venv`) | 🤖 Claude | Files exist |
| [ ] | **0.6** Review and commit | 🧑 You | On `main` (or a branch) |

## Cycle 1: Hello World on the web (database + FastAPI + Caddy)

**Done when:** a page at `http://localhost:8080/hello.html` reads greetings
from Postgres through FastAPI, you can add one, and it's still there after a
restart, on both Macs.

| | Step | Who | Done when |
|---|---|---|---|
| [ ] | **1.1** `compose.yaml` (db, api, web), `infra/Caddyfile`, `.env.example`, and the `Makefile` | 🤖 Claude | `docker compose config` is valid |
| [ ] | **1.2** FastAPI skeleton: `server/pyproject.toml` (uv), Dockerfile, settings from the environment, a SQLAlchemy engine, and `GET /api/health` that checks the database | 🤖 Claude | `make up`, then `curl localhost:8080/api/health` returns `{"status":"ok","database":"ok"}` |
| [ ] | **1.3** Alembic set up in `server/migrations/`, with a first migration creating a `greetings` table (id, message, created_at) | 🤖 Claude | `make migrate` creates the table |
| [ ] | **1.4** `GET /api/v1/hello` (count and latest five greetings) and `POST /api/v1/hello` (add one, 1–200 characters) | 🤖 Claude | Both work from `/api/docs` |
| [ ] | **1.5** pytest set up against a separate test database, with tests for health and hello (including a too-long message being refused) | 🤖 Claude | `make test` passes |
| [ ] | **1.6** `web/hello.html`: shows the server and database status, the greetings, and a form to add one. Uses the prototype's `css/tokens.css` so it looks like 3den | 🤖 Claude | Works in the browser |
| [ ] | **1.7** Try it: `cp .env.example .env`, `make up`, `make migrate`, open `localhost:8080/hello.html`, add a greeting, run `make down` then `make up`, and check it's still there. Open `/api/docs` and try an endpoint | 🧑 You | Works on the desktop |
| [ ] | **1.8** Pull on the laptop and do the same | 🧑 You | Works on the laptop |
| [ ] | **1.9** Fix anything in development_setup.md that turned out wrong, and mark sections 3 to 7 as checked | 🤖 Claude | Doc matches reality |
| [ ] | **1.10** Review and commit | 🧑 You | Committed |

## Cycle 2: Hello World on iOS

**Done when:** a greeting added on your iPhone shows on the web page, and the
other way round.

| | Step | Who | Done when |
|---|---|---|---|
| [ ] | **2.1** `ios/project.yml` (XcodeGen), a SwiftUI app named 3den with Debug and Release config files (`API_BASE_URL`), and Info.plist settings for local networking in Debug | 🤖 Claude | `xcodegen` makes the project; `xcodebuild` builds it for the Simulator |
| [ ] | **2.2** An `APIClient` (URLSession, async/await, Codable, one error type) and a Hello screen: status, greetings list, pull to refresh, add form | 🤖 Claude | Builds |
| [ ] | **2.3** Unit tests for decoding the hello responses and for error handling | 🤖 Claude | Tests pass with `make ios-test` |
| [ ] | **2.4** Open the project in Xcode, choose your team under Signing & Capabilities, and run on the iPhone Simulator. Add a greeting; refresh the web page | 🧑 You | The greeting shows on the web |
| [ ] | **2.5** Set your Mac's `.local` name in `Debug.xcconfig`, run on your iPhone (same Wi-Fi), allow Local Network access, and add a greeting from the phone | 🧑 You | It shows on the web, and a web greeting shows on the phone |
| [ ] | **2.6** Update development_setup.md §8 with what you ran into | 🤖 Claude | Doc matches reality |
| [ ] | **2.7** Review and commit | 🧑 You | Committed |

## Cycle 3: Accounts and sign-in

Every real feature needs to know who's asking, so this comes before the
first feature.

**Done when:** you make an account on the web, sign in with it on the
phone, and signing out on one device doesn't sign out the other.

| | Step | Who | Done when |
|---|---|---|---|
| [ ] | **3.1** Tables `accounts` and `sessions` (token stored only as a hash, device name, last used, revoked). Argon2id passwords | 🤖 Claude | Migration applies |
| [ ] | **3.2** `POST /api/v1/auth/signup`, `/signin`, `/signout`; `GET /api/v1/me`; `GET` and `DELETE /api/v1/me/sessions` (your devices). Cookie for the web, bearer token for apps. Origin check on changes. A simple rate limit on sign-in and sign-up | 🤖 Claude | Works from `/api/docs` |
| [ ] | **3.3** Tests, including the refusals: wrong password, a revoked session, a missing Origin, and too many attempts | 🤖 Claude | `make test` passes |
| [ ] | **3.4** Web server mode, first part: the app checks for `/api/health` and offers server mode; the prototype's sign-up and sign-in screens (`js/account/auth-view.js`) call the API in server mode. Demo mode is unchanged | 🤖 Claude | Sign up, sign out, and sign in work in the browser; demo mode still passes the sweeps |
| [ ] | **3.5** iOS: sign-in and sign-up screens, the token in the Keychain, a Me screen with a sign-out button | 🤖 Claude | Builds; tests pass |
| [ ] | **3.6** Try it: make an account on the web, sign in on the phone, sign out on the web, and check the phone is still signed in. Look at the sessions in the database (`make psql`) | 🧑 You | Works |
| [ ] | **3.7** Review and commit | 🧑 You | Committed |

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
| [ ] | **4.1** A short design note (added to this doc): the tables (`spaces`, `memberships`, `events`, `event_rsvps`), the endpoints, which prototype files change for server mode (likely `js/state/events.js`, `js/events/rsvp.js`, `js/events/event-page.js`, and the Calendar and Upcoming events modules), and how the iOS screens map to the prototype's phone layout | 🤖 Claude | Note written |
| [ ] | **4.2** Read the note and approve or adjust it | 🧑 You | Approved |
| [ ] | **4.3** Move the permission table to `shared/permissions.json`; the prototype's `permissions.js` reads it; add a shared test-case file run by both JS and pytest | 🤖 Claude | `npm run check`, the sweeps, and `make test` pass |
| [ ] | **4.4** Migrations and models for spaces, memberships, events, and RSVPs. Python versions of `can()` and the event visibility rules (`canSeeEvent`) | 🤖 Claude | Migration applies; permission tests pass |
| [ ] | **4.5** Seed script: a small Node script exports two demo groups (14 Juniper Lane and one other), their members, and their events from the sample data to JSON; a Python seeder loads it. Demo accounts get a development-only password | 🤖 Claude | `make seed` loads them; running it twice doesn't duplicate anything |
| [ ] | **4.6** Endpoints: `GET /api/v1/me/spaces`, `GET /api/v1/spaces/{id}/events?from=&to=`, `GET /api/v1/events/{id}`, `PUT /api/v1/events/{id}/rsvp` | 🤖 Claude | Work from `/api/docs` |
| [ ] | **4.7** Tests: members see their group's events; non-members get 404; public events are visible to everyone; an RSVP changes the counts; a stale version gets 409 | 🤖 Claude | `make test` passes |
| [ ] | **4.8** Web server mode: groups and their events come from the API; the event page and RSVP buttons use it (shown at once, rolled back with a toast if refused). Other modules keep local data, marked as not saved to the server yet | 🤖 Claude | Works in the browser |
| [ ] | **4.9** A Playwright test for the server-mode event flow (two browser contexts: Leo and Maya) | 🤖 Claude | Passes |
| [ ] | **4.10** Try it on the web: two browser profiles, signed in as Leo and Maya; RSVP as one and refresh as the other. Then sign in as the account you made in Cycle 3 and open a private event's address | 🧑 You | Works, and the outside account is refused |
| [ ] | **4.11** iOS: generate API types from the OpenAPI schema (`swift-openapi-generator`); Groups list → Upcoming events → Event page with RSVP buttons, following the prototype's phone layout | 🤖 Claude | Builds; tests pass |
| [ ] | **4.12** Try it on your iPhone: RSVP as Leo on the phone, see it on the web as Maya, and the other way round | 🧑 You | Works |
| [ ] | **4.13** Update README.md, DESIGN.md (the server-mode seam), architecture.md (anything that changed), and development_setup.md | 🤖 Claude | Docs match the code |
| [ ] | **4.14** Review and commit | 🧑 You | Committed |
| [ ] | **4.15** Look back together: what was slow, what to change, and what comes next | 🧑 You + 🤖 Claude | Next plan (dev_plan_2.md) outlined |

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
