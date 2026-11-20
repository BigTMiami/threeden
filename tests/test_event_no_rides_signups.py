"""Event pages have no Sign-ups or Rides (Nov 20)."""
from playwright.sync_api import sync_playwright
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    # An old saved event with sign-ups and rides: still opens, shows neither
    pg.evaluate("""(async()=>{const s=await import('./js/state/store.js'); const ev=await import('./js/state/events.js');
      ev.updateEvent('aid-ev-1', e => { e.signups=[{id:'su-x',label:'Bring snacks',spots:2,memberIds:[]}]; e.rides={drivers:{'m-theo':3},riders:{}}; });})()""")
    pg.evaluate("location.hash='#event-aid-ev-1'"); pg.wait_for_timeout(900)
    check(pg.locator('.event-page__rsvp').count() == 1, 'the event page opens')
    check(pg.locator('.event-page__rides, .event-rides').count() == 0, 'no Rides')
    check(pg.locator('.event-page__signups, .event-signups').count() == 0 and pg.get_by_text('Bring snacks').count() == 0, 'no Sign-ups')
    # Customize: the section list doesn't offer them
    labels = pg.evaluate("(async()=>{const l=await import('./js/events/event-page-layout.js'); return Object.values(l.SECTION_LABELS)})()")
    check('Rides' not in labels and 'Sign-ups' not in labels, f'not among the page sections ({labels})')
    order = pg.evaluate("(async()=>{const l=await import('./js/events/event-page-layout.js'); return l.normalizePage({order:['rsvp','signups','rides','about']}).order})()")
    check('signups' not in order and 'rides' not in order, 'saved layouts drop them')
    # Bundles don't add sign-ups
    made = pg.evaluate("(async()=>{const bd=await import('./js/events/bundles.js'); return bd.BUNDLES.map(x=>bd.applyBundle({date:'2026-12-01',createdBy:'m-leo'}, x).signups)})()")
    check(all(m is None for m in made), 'bundles add no sign-ups')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
