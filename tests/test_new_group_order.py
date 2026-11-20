"""Nov 20: on Create a group, the templates come before "Who can see it" and
"How people join"; picking a template still sets those two."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 1400}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#new-group'"); pg.wait_for_timeout(800)
    y = lambda text: pg.locator('.new-group-form').get_by_text(text, exact=True).first.bounding_box()['y']
    t, v, j = y('Start from a template'), y('Who can see it'), y('How people join')
    check(t < v < j, f'template, then who can see it, then how people join ({t:.0f} < {v:.0f} < {j:.0f})')
    pg.locator('input[name=new-template][value=business]').check(); pg.wait_for_timeout(200)
    vis = pg.evaluate("document.querySelector('input[name=new-visibility]:checked').value")
    check(vis == 'public', f'picking Business still sets who can see it ({vis})')
    pg.screenshot(path='test-output/out/new-group-order.png', full_page=True)
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
