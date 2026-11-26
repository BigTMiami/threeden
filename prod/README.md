# 3den: production code

Everything here is the real 3den: the server, the web app, and the iOS app.
The prototype at the repo root is separate and unchanged; it's the reference
for how things should look and behave.

- Setting up a Mac and the commands: [docs/development_setup.md](../docs/development_setup.md)
  (run `make` from this folder to list them).
- The design: [docs/architecture.md](../docs/architecture.md).
- What's being built, cycle by cycle: [docs/dev_plan_1.md](../docs/dev_plan_1.md).

## What's here

| Folder | What it is |
|---|---|
| `server/` | The API: FastAPI, SQLAlchemy, Alembic, Postgres. `app/` by area (accounts, auth, spaces, events), `migrations/`, `seed/` (demo data), `tests/` |
| `web/` | The web app: the prototype's files plus **server mode** (below). No build step; Caddy serves it as it is |
| `ios/` | The iPhone app: SwiftUI, generated with XcodeGen from `project.yml`. API types for groups and events are generated from `shared/openapi.json` |
| `shared/` | Files both sides read: the permission table and its test cases, and the API's OpenAPI description |
| `infra/` | The Caddyfile: `/api/*` to FastAPI, everything else from `web/` |
| `e2e/` | Browser checks of the web app (Playwright, in Docker): `make e2e` |

`compose.yaml` runs it all (`make up`); `Makefile` has the short names.

## Server mode in web/

The web app is the prototype's code, which keeps everything in the browser
(`js/state/store.js`, saved to IndexedDB). Served by the stack, it starts in
**server mode** (`js/api/server-mode.js`); the line at the bottom of the
sign-in screen switches to **demo mode**, the prototype as it always was.

Server mode doesn't rewrite the views. The seam is in `js/api/`:

- **`client.js`**: `api(path, options)`, fetch with the session cookie, and
  `ApiError` with the server's message.
- **`server-mode.js`**: picks the mode at start-up (is `/api/health` there?),
  signs up, in, and out through the API, and gives your server account a
  member in the local state (`m-<account id>`, `server: true`) so the rest of
  the app knows who you are.
- **`sync.js`**: copies your groups, their members, and their events into
  the local state (groups marked `server: true`), so the calendar, Upcoming
  events, Up next, the event page, and the RSVP buttons work unchanged. It
  watches saves to those calendars (`onModuleDataChange`) and sends your RSVP
  answers to the server: shown at once, put back with a toast if refused.
  Signing out removes the copies.

Everything else (boards, to-dos, messages, your homepage…) is still saved
only in the browser; a server group's header says so. Each area moves to the
server in a later cycle, the same way: the API first, then a copy in
`sync.js` (or a direct call) in place of local data.

`js/state/permissions.js` reads the roles and permissions from
`shared/permissions.json` (Caddy serves that one file at
`/shared/permissions.json`), the same table the server uses.

## Checks

| Command | Covers |
|---|---|
| `make test` | pytest: the API, permissions (shared cases), seeding, the OpenAPI copy |
| `make check` | Ruff for `server/`; ESLint, TypeScript, and the JS tests for `web/` |
| `make e2e` | the web app in Chromium: accounts (`web_auth.py`), groups and RSVPs (`web_events.py`) |
| `make ios-test` | the iOS unit tests (a fake server; no stack needed) |
