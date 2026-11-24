# 3den: development setup on macOS

Status: **plan, to be checked as we build** (Nov 24, 2026). The files this
doc describes (`prod/compose.yaml`, `prod/server/`, `prod/ios/`, and so on)
don't exist yet. Cycles 0 to 2 in [dev_plan_1.md](dev_plan_1.md) create them,
and this doc gets corrected as each step is checked. The overall design is in
[architecture.md](architecture.md).

All production code lives under **`prod/`**. The prototype stays where it is
at the repo root for now (it will move into its own folder later), and
production work doesn't change it. Paths in this doc are relative to `prod/`
unless they start with `prod/` or say otherwise, and the `make` and
`docker compose` commands are run from `prod/`.

Goal: the same setup on your desktop and your laptop, with everything except
Xcode running in Docker, so the Macs and the later EC2 testing server behave
the same.

## What you'll have

```mermaid
flowchart LR
  subgraph Mac
    BR["Browser<br/>localhost:8080"]
    SIM["iOS Simulator"]
    PH["iPhone on Wi-Fi<br/>yourmac.local:8080"]
    subgraph Docker["docker compose"]
      CADDY["web: Caddy<br/>:8080"]
      API["api: FastAPI<br/>:8000 (inside Docker)"]
      DB[("db: Postgres 17<br/>:5432 (localhost only)")]
    end
    CODE["prod/ folder<br/>(mounted into the containers)"]
  end
  BR --> CADDY
  SIM --> CADDY
  PH --> CADDY
  CADDY -->|"/api/*"| API
  CADDY -->|"everything else"| STATIC["prod/web/ static files"]
  API --> DB
  CODE -.-> API
  CODE -.-> STATIC
```

Later cycles add a `worker`, `mailpit` (catches outgoing email so you can
read it at `localhost:8025`), and `minio` or `garage` (S3 stand-in).

## 1. Install the tools (once per Mac)

| Tool | Why | Install |
|---|---|---|
| Homebrew | installs the rest | https://brew.sh |
| Docker runtime | runs the containers | **OrbStack** (`brew install --cask orbstack`), or Docker Desktop. See below |
| Git and GitHub CLI | code and sync between Macs | `brew install git gh`, then `gh auth login` |
| uv | Python packages (also used inside the containers) | `brew install uv` (already on the laptop) |
| Node 24 | the existing lint and type checks | already installed with nvm |
| Python 3.11+ | the existing Playwright tests | already installed with pyenv |
| Xcode 26 | the iOS app | Mac App Store (already installed); open it once to install the iOS Simulator |
| XcodeGen | makes the Xcode project from `prod/ios/project.yml` | `brew install xcodegen` |
| psql (optional) | poke at the database from the Mac | `brew install libpq && brew link --force libpq` |
| A database GUI (optional) | browse tables | TablePlus, Postico, or VS Code's SQLTools |

**Which Docker?** OrbStack is faster and lighter on Apple silicon and is free
for personal use. Docker Desktop is the reference implementation and free for
personal use and small businesses. Either one provides the `docker` and
`docker compose` commands this doc uses. Check that it works:

```bash
docker run --rm hello-world
docker compose version
```

**VS Code extensions:** Python, Pylance, Ruff, Container Tools (Docker),
YAML, Even Better TOML, and Markdown Preview Mermaid Support (to see the
diagrams in these docs). Swift files are edited in Xcode; the Swift
extension for VS Code is optional.

## 2. Repository layout

```
threeden/
  prod/                 all production code
    web/                the production web app (served by Caddy)
    server/
      app/              FastAPI application
      migrations/       Alembic
      tests/            pytest
      pyproject.toml    dependencies (uv)
      uv.lock
      Dockerfile
      alembic.ini
    ios/
      project.yml       XcodeGen spec
      ThreeDen/         Swift sources
      ThreeDenTests/
    infra/
      Caddyfile
    shared/
      permissions.json  the permission table, read by web and server
    e2e/                Playwright tests for the production web app
    compose.yaml        the local stack
    .env.example        settings to copy into .env (which is never committed)
    .gitignore          .env, ios/*.xcodeproj, __pycache__, .venv
    Makefile            short names for common commands
  docs/                 shared by the prototype and production
  index.html, css/, js/, …   the prototype, unchanged for now
  tests/                the prototype's Playwright tests (existing)
  scripts/              the prototype's scripts (existing)
  package.json, eslint.config.js, jsconfig.json   the prototype's checks (existing)
```

The prototype stays at the root, still runs on its own (`npm run serve`), and
keeps its own checks and tests. A later step moves it into its own folder
(cloudflare-deploy.md planned that as `prototype_deploy/`); nothing in
`prod/` depends on where it sits.

`prod/web/` starts small (the Hello World page in Cycle 1). When web sign-in
comes (Cycle 3), the prototype's app files are copied into `prod/web/` and
server mode is built there; from then on the two are separate, and the
prototype stays the demo-mode reference.

## 3. Docker: the local stack

`prod/compose.yaml` (a sketch; Cycle 1 writes the real one). Its paths are
relative to `prod/`:

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_DB: threeden
      POSTGRES_USER: threeden
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"      # only this Mac can reach it
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U threeden"]
      interval: 2s
      retries: 30

  api:
    build: ./server
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    env_file: .env
    volumes:
      - ./server:/srv/server        # edit on the Mac, reload in the container
      - ./shared:/srv/shared:ro
    depends_on:
      db: { condition: service_healthy }

  web:
    image: caddy:2
    ports:
      - "8080:8080"
    volumes:
      - ./infra/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./web:/srv/web:ro
      - ./shared:/srv/web/shared:ro
    depends_on: [api]

volumes:
  pgdata:
```

Port 8080 is open to your Wi-Fi network so your iPhone can reach it. The
database is only open to the Mac itself. On public Wi-Fi (a café, a hotel),
stop the stack or change the port to `"127.0.0.1:8080:8080"`, since it only
holds development data but has no real protection yet.

`prod/.env` (copied from `prod/.env.example`, never committed):

```bash
POSTGRES_PASSWORD=dev-only-password
DATABASE_URL=postgresql+psycopg://threeden:dev-only-password@db:5432/threeden
APP_ENV=development
SESSION_SECRET=change-me
```

## 4. Postgres

- Runs from the official `postgres:17` image. Keep the same major version as
  the AWS server will use.
- Data lives in the `pgdata` Docker volume, so it survives `docker compose
  down` and restarts. `docker compose down -v` deletes it (a fresh start).
- Connect from the Mac: `psql postgresql://threeden:dev-only-password@localhost:5432/threeden`,
  or the same details in a GUI.
- Each Mac has its own database. To get the same data on both, run the seed
  script (Cycle 4) rather than copying databases.

### Alembic (database changes)

Alembic keeps the database structure in step with the code. Each change is a
small Python file in `prod/server/migrations/versions/`, committed with the
code that needs it.

```bash
cd prod
# make a new migration after changing the SQLAlchemy models
docker compose run --rm api alembic revision --autogenerate -m "add events"
# read the generated file and fix anything autogenerate got wrong, then apply it
docker compose run --rm api alembic upgrade head
# see where the database is
docker compose run --rm api alembic current
# step back one (local only)
docker compose run --rm api alembic downgrade -1
```

Rules:

- Always read an autogenerated migration before applying it. It misses some
  things (renames, some index and constraint changes).
- Never edit a migration that has already been applied on another machine or
  server; add a new one instead.
- Locally you run `upgrade head` yourself (or `make migrate`). On the testing
  server, deploys run it before starting the new code.

## 5. FastAPI in Docker

`prod/server/Dockerfile` (a sketch):

```dockerfile
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /srv/server
# The virtualenv lives outside /srv/server, because compose mounts the
# source folder over /srv/server and would hide a .venv inside it.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv PATH="/opt/venv/bin:$PATH"
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project
COPY . .
RUN useradd --create-home app
USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

(Cycle 1 pins the uv image to an exact version. A production stage without
`--reload` and with several workers comes with the EC2 setup.)

Useful addresses once it's running:

- `http://localhost:8080/api/health`: says whether the API can reach the
  database.
- `http://localhost:8080/api/docs`: interactive API docs, where you can try
  every endpoint (development only).

Adding a Python package: `cd prod/server && uv add <package>`, then
`cd .. && docker compose build api`. Only dependency changes need a rebuild; code
changes reload by themselves.

## 6. Do we need a web server too?

**Yes: Caddy**, in front of FastAPI. It:

- serves the web app's static files (Uvicorn could, but that's not its job);
- sends `/api/*` to FastAPI, so the browser sees **one site**. Session
  cookies then just work, and there's no cross-origin (CORS) setup;
- handles HTTPS with automatic certificates on the testing server, with the
  same config file;
- passes WebSocket connections (live updates) through without extra setup;
- adds security headers in one place.

`prod/infra/Caddyfile` (a sketch):

```
:8080 {
    encode zstd gzip
    handle /api/* {
        reverse_proxy api:8000
    }
    handle {
        root * /srv/web
        file_server
    }
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

Caddy serves only `prod/web/`, never the prototype at the repo root. The
prototype still runs on its own (`npm run serve` from the repo root) in demo
mode, without Docker.

## 7. How code gets from your editor to a running app

**Locally**

- You edit in VS Code (and Xcode for Swift). Folders under `prod/` are
  mounted into the containers: Python changes restart Uvicorn within a second or two, and
  web changes show on the next browser reload. You rebuild an image only when
  dependencies change.
- Run commands inside the containers with `docker compose run --rm api …` or
  `docker compose exec api …`, or the `make` shortcuts below, so everyone uses
  the same Python and packages.

**Between your two Macs**

- GitHub is the only sync. Commit and push on one, pull on the other, then
  `make up` (and `make migrate` if there are new migrations).
- Work on a branch for anything bigger than a small fix; merge to `main` when
  it works.
- Don't sync the database. Use the seed script.
- `prod/.env` isn't in Git. Copy it by hand once, or recreate it from
  `prod/.env.example`.

**To the EC2 testing server (later)**

```mermaid
flowchart LR
  P["git push"] --> GA["GitHub Actions:<br/>checks, pytest,<br/>build images"]
  GA --> R["Container registry<br/>(GHCR or ECR)"]
  R --> E["EC2: docker compose pull,<br/>alembic upgrade head,<br/>docker compose up -d"]
```

Images are built once in CI and the server only pulls them, so what runs
there is exactly what was tested. Details come in a later plan.

## 8. The iOS project

- **SwiftUI app**, iOS 18 and later, in `prod/ios/`. The Xcode project is
  generated from `prod/ios/project.yml` with XcodeGen and isn't committed
  (`ios/*.xcodeproj` is in `prod/.gitignore`). After pulling changes that
  touch `project.yml` or add files, run `make ios` (which runs `xcodegen`),
  then open `prod/ios/ThreeDen.xcodeproj`.
- **Signing:** in Xcode, choose your team under Signing & Capabilities once
  (it's saved in a local file that isn't committed). A free Apple ID is
  enough to run on the Simulator and your own iPhone (the app expires after
  7 days and needs a fresh install). Push notifications and TestFlight need
  the paid Apple Developer Program.
- **Which server the app talks to** is set per build configuration in
  `prod/ios/Config/Debug.xcconfig` and `Release.xcconfig` (`API_BASE_URL`):
  - Simulator: `http://localhost:8080` (the Simulator shares the Mac's
    network).
  - Your iPhone: `http://<your-mac-name>.local:8080`. Find the name in
    System Settings → General → Sharing → Local hostname. The phone must be on
    the same Wi-Fi. iOS asks once for Local Network permission; allow it.
  - Plain `http` is allowed only in Debug builds, and only to local
    addresses (`NSAllowsLocalNetworking` in Info.plist). Release builds use
    HTTPS.
- **Firewall:** if macOS's firewall is on, allow incoming connections for
  OrbStack or Docker, or the phone can't reach port 8080.
- **Tests:** ⌘U in Xcode, or `make ios-test` from the terminal.

## 9. Other pieces

- **Makefile shortcuts** (Cycle 1 adds them in `prod/Makefile`; run them
  from `prod/`):

  | Command | Does |
  |---|---|
  | `make up` | start the stack in the background |
  | `make down` | stop it (data kept) |
  | `make logs` | follow the API's logs |
  | `make migrate` | `alembic upgrade head` |
  | `make revision m="add events"` | new autogenerated migration |
  | `make test` | pytest in the container, against a separate test database |
  | `make psql` | a database prompt |
  | `make seed` | load the demo groups (Cycle 4) |
  | `make reset-db` | delete the database and start fresh |
  | `make check` | Ruff, plus ESLint and TypeScript for `prod/web/` once it has JS |
  | `make ios` | regenerate the Xcode project |

- **Linting:** Ruff for Python (format and lint), ESLint and TypeScript for
  `prod/web/` (its own config, copied from the prototype's when the app is
  copied in), Xcode's own warnings for Swift. The prototype keeps its own
  `npm run check` at the repo root.
- **Playwright tests:** the prototype's tests in `tests/` keep using demo
  mode. Production tests go in `prod/e2e/` and open `http://localhost:8080`.
- **Debugging Python from VS Code (optional):** start the API with `debugpy`
  listening on port 5678, published to localhost only, and attach with a
  "Remote Attach" launch configuration. Cycle 1 can add this if you want it.
- **Android (later):** Android Studio. The emulator reaches the Mac at
  `http://10.0.2.2:8080`.

## 10. Daily routine

```bash
git pull
cd prod
make up              # or: docker compose up -d
make migrate         # if anything new came in
make logs            # watch the API while you work
# … work …
make test
git commit / git push
make down            # when you're done for the day (optional)
```

## 11. When something's wrong

| Problem | Try |
|---|---|
| `docker: command not found` | OrbStack or Docker Desktop isn't running, or isn't installed |
| `no configuration file provided` or `make: *** No rule` | run it from `prod/`, not the repo root |
| Port 8080 or 5432 already in use | `lsof -i :8080`; stop the other program, or change the port in `prod/compose.yaml` |
| API can't reach the database | `docker compose ps` (is `db` healthy?); check `DATABASE_URL` in `prod/.env` |
| "relation does not exist" | `make migrate` |
| A package is missing in the container | `docker compose build api` after `uv add` |
| iPhone can't connect | same Wi-Fi? Local Network permission allowed? macOS firewall? Try `http://<mac>.local:8080/api/health` in Safari on the phone |
| Xcode says files are missing | `make ios` to regenerate the project |
| Start completely fresh | `docker compose down -v`, then `make up && make migrate && make seed` |
