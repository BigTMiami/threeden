# Contributing to 3den

Thanks for helping. 3den is a place for groups to organize and for people
to show up for each other, with no ads, no data brokers, and no bots. Code
that serves that is welcome.

## Before you start

- **Security problems:** see SECURITY.md. Don't open a public issue.
- **Bigger changes:** open an issue first to talk it through, so nobody
  spends a week on something that won't fit.
- **Be kind:** everyone here follows CODE_OF_CONDUCT.md.

## Running it

It's plain HTML, CSS, and JavaScript, with no build step and nothing to
install. From the project folder:

```sh
python3 -m http.server 8765
# then open http://localhost:8765/index.html
```

## Checks

Before you send a change:

- `npm run check` runs ESLint and the TypeScript check of the JSDoc. Both
  should pass. New files start with `// @ts-check`.
- The Playwright tests in `tests/` (see tests/README.md): at least the
  test for what you changed, and one of the full sweeps.

## How the code is written

README.md, "Conventions", has the details. In short:

- Build the page with `h(tag, props, ...children)` from `js/ui/dom.js`,
  not HTML strings.
- Every file starts with a short comment saying what it's for.
- Plain words on screen. Always use the Oxford comma ("Home, Blog, and
  Groups"), in the app, docs, and comments.
- Real buttons, inputs, and labels, and a keyboard way to do everything
  you can do with a mouse or a finger.
- Privacy first: don't add anything that sends people's data to another
  company (analytics, ads, outside fonts, trackers). If a feature needs an
  outside service, say so in the change and explain why.

## Signing off your work

Each commit needs a `Signed-off-by:` line (`git commit -s`), certifying the
Developer Certificate of Origin (https://developercertificate.org): you
wrote the change, or have the right to submit it under this project's
license.

## License

3den is licensed under the GNU Affero General Public License, version 3 or
later (see LICENSE). By contributing, you agree your contribution is
licensed the same way. In short: anyone may use, change, and share 3den,
and anyone who runs a changed version as a service must share their
changes with its users.

Third-party pieces keep their own licenses. In particular, map data is
from OpenStreetMap (© OpenStreetMap contributors, Open Database License),
and the street map has to keep showing that credit.
