# Deploying the prototype to Cloudflare

Status: **plan, not started.** Goal: put the prototype on Cloudflare Pages so
it can be tested on phones, without publishing the docs, tests and scripts
along with it.

## Summary

- The prototype is static HTML, CSS and JavaScript with no build step, so
  Cloudflare Pages can serve a folder straight from the repo.
- Move the site files into `prototype_deploy/` and set that as the Pages
  **build output directory**. Only the app gets published; docs, tests and
  scripts stay out.
- The repo can stay **private**. Cloudflare's GitHub app can be limited to
  this one repository.
- To control **who can open the site**, put Cloudflare Access in front of it.
  A private repo and a deploy folder don't do that on their own.

## What each step protects

| Step | Keeps off the public web | Doesn't protect |
|---|---|---|
| Deploy `prototype_deploy/` only | `HANDOFF.md`, `DESIGN.md`, `TODO.md`, README, `tests/` (including the sample `contacts.vcf`, `chat.txt` and `.ics` files), `scripts/`, config files | The app's own JS and CSS, unminified, including the demo data in `js/data/` |
| Private GitHub repo | Source history, docs, tests on GitHub | The deployed site |
| Cloudflare Access | The whole site: visitors must log in with an email code first (free for up to 50 users) | — |
| `_headers` noindex + `robots.txt` | Search-engine listings | Anyone who has the link |

Anything the browser downloads is always readable by whoever can open the
site. Only Access limits who that is.

## Proposed layout

```
threeden/
  prototype_deploy/        ← Cloudflare "Build output directory"
    index.html  phone.html  manifest.json  sw.js
    css/  js/  icons/
    _headers               (new)
    robots.txt             (new)
  docs/
    DESIGN.md  HANDOFF.md  TODO.md  cloudflare-deploy.md
  tests/                   (unchanged)
  scripts/                 (unchanged)
  README.md  LICENSE  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md
  package.json  eslint.config.js  jsconfig.json  .gitignore
```

`README.md`, `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and
`SECURITY.md` stay at the root, because that's where GitHub looks for them.

## Changes the move needs

Use `git mv` for every move so the file history is kept.

1. **`package.json` scripts**
   - `serve`: `python3 -m http.server 8765 --directory prototype_deploy`
   - `lint`: `eslint prototype_deploy/js`
   - `check`: `eslint prototype_deploy/js && tsc -p jsconfig.json`
2. **`eslint.config.js`**: `files: ['js/**/*.js']` →
   `files: ['prototype_deploy/js/**/*.js']`
3. **`jsconfig.json`**: `"include": ["js/**/*.js"]` →
   `"include": ["prototype_deploy/js/**/*.js"]`
4. **`scripts/build-year-demo.mjs`**: update the import of
   `../js/data/demo/year-model.js` and the output path under `js/data/demo/`
   to point inside `prototype_deploy/`.
5. **Docs**: they mention `js/...` and `css/...` paths about 600 times.
   Instead of rewriting them all, add one line near the top of the README:
   "Code paths are relative to `prototype_deploy/`."
6. **`tests/README.md`**: change the serve instruction to
   `npm run serve` (or `python3 -m http.server 8765 --directory prototype_deploy`).

These need **no changes**:

- **The app**: every reference in the HTML, `manifest.json` and `sw.js` is
  relative (`css/...`, `js/main.js`, `icons/...`, `register('sw.js')`), so
  the files all move together.
- **The tests**: they load `http://localhost:8765/index.html`, which still
  works once the server serves `prototype_deploy/`. Their fixture paths
  (`tests/files/...`, `tests/bring/`, `tests/sample.ics`) are relative to
  the project root, which doesn't change.

After the move, run `npm run check` and a couple of tests (for example
`python3 tests/sweep_guest.py`) to confirm nothing broke.

## New files for `prototype_deploy/`

`_headers` (Cloudflare Pages reads this file):

```
/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

`robots.txt`:

```
User-agent: *
Disallow: /
```

## Cloudflare setup

### Option A: Git integration (redeploys on every push)

1. **Workers & Pages → Create → Pages → Connect to Git.**
2. Install Cloudflare's GitHub app and choose **Only select repositories →
   threeden**. This works with a private repo.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(empty)*
   - Build output directory: **`prototype_deploy`**
4. Deploy. The site will be at `https://<project>.pages.dev`.

### Option B: Upload from your machine (no Git access needed)

```bash
npx wrangler login
npx wrangler pages deploy prototype_deploy --project-name threeden
```

Run the deploy command again for each release. Cloudflare never sees the repo.

### Restrict access (recommended for phone testing)

1. **Zero Trust → Access → Applications → Add an application → Self-hosted.**
2. Domain: the `*.pages.dev` hostname (and any custom domain).
3. Policy: **Allow**, with **Emails** set to the testers' addresses.
4. Visitors get a one-time email code before the site loads.

Also protect the preview deployments (`*.<project>.pages.dev`). In the Pages
project, **Settings → General → Access policy** turns this on.

## Notes

- HTTPS is automatic, so the service worker, notifications and "Add to Home
  Screen" (from `manifest.json`) all work. On an iPhone, notifications need
  3den added to the Home Screen (iOS 16.4 and later).
- `sw.js` handles only notifications. It doesn't cache any files, so
  visitors won't be stuck on an old version after a deploy.
- Optional later: the README is about 176 KB. Some of it could move into
  `docs/`, leaving the root README as a short overview with run and deploy
  steps.
