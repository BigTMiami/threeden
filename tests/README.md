# Tests

Browser tests for the prototype, written with Playwright for Python and
driving Chrome. They expect the site at `http://localhost:8765`:

```
python3 -m http.server 8765        # in the project folder
python3 tests/sweep_signed_in.py   # from the project folder
```

- `sweep_signed_in.py`: visits every space, tab, and module full page as Leo at
  1440 px and 400 px wide, and checks for stray "null", "undefined", or "NaN"
  text, page errors, and sideways overflow on phones.
- `sweep_guest.py`: the same for someone signed out (public groups, blogs, and
  events).
- `test_*.py`: one feature each (disappearing messages, the calendar, the area
  map, shared modules, the canvas, the photo editor, Instagram, encrypted
  messages, budgets, feed grids, the spreadsheet and live windows, imports,
  the world map, the top bar, the Feed's asks and filters, the dashboard,
  recaps and reminders, announcement sign-ups, spreadsheet ranges, group
  setup, the welcome checklist, the directory and blocking, the demo tour,
  message threads and voice notes, co-hosts and waitlists and series,
  shifts, the About block and tags and the Instagram card, moderation and
  the privacy checkup, and the front page and Help). Each prints what it
  checked and ends with the page errors it saw (`errors []` means none).
- `test_street_map.py`: the area map's street layer. With no network the
  built-in map stays; with a stand-in for MapLibre, dragging, the distance
  menu, zoom, search, and the [ ] keys all reach the street map.
- `test_phone_overflow.py`: every module type's full page, and the main
  pages, at 390 px on a touch phone; lists anything that spills past the
  screen.
- `test_dark_contrast.py`: on each dark theme, the contrast of the red,
  amber, muted, and link colors, and of red and orange event chips (all
  should be 4.5 or more).

Before committing, also run `npm run check` (ESLint and TypeScript; see the
main README).

Screenshots go to `test-output/` (not part of the project). The scripts use
`/usr/bin/google-chrome`; change `executable_path` to match your machine, or
remove it to use Playwright's own Chromium.
