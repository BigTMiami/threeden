"""Nov 22: the Feed no longer shows the "Your week" card on Sundays. The
Your week page (#week) still works from search."""
from playwright.sync_api import sync_playwright
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("Date.prototype.getDay = function () { return 0; };")  # a Sunday, whatever today is
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(1000)
    check(pg.locator('.week-card').count() == 0 and 'Your week' not in pg.locator('main').first.inner_text(), 'no Your week card on the Feed on a Sunday')
    check(pg.locator('.feed-item, .feed__item, article').count() > 0, 'the Feed still shows posts')
    pg.evaluate("location.hash='#week'"); pg.wait_for_timeout(800)
    check(pg.locator('.week').count() == 1, 'the Your week page still opens')
    check(not errs, f'no page errors {errs[:2]}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
