"""An invite link opened signed out (Nov 20): one button, "Create an account
and join"; no "Show my blog to the members" and no "Not now". Signed in,
the page is unchanged."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    # Signed in (Leo has a blog): the blog choice and Not now are there
    pg.evaluate("location.hash='#join-supper24'"); pg.wait_for_timeout(800)
    page = pg.locator('.join-page')
    check(page.get_by_text('Show my blog to the members').count() == 1 and page.get_by_text('Not now').count() == 1, 'signed in: blog choice and Not now')
    check(page.get_by_role('button', name='Join Juniper Supper Club').count() == 1, 'signed in: "Join Juniper Supper Club"')
    # Signed out
    pg.evaluate("(async()=>{const a=await import('./js/state/accounts.js'); a.signOut();})()"); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#'"); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='#join-supper24'"); pg.wait_for_timeout(900)
    page = pg.locator('.join-page')
    check(page.count() == 1, 'signed out: the invite page opens')
    buttons = page.locator('button, a.button').all_inner_texts()
    check([t.strip() for t in buttons] == ['Create an account and join'], f'one button: "Create an account and join" ({buttons})')
    check(page.get_by_text('Show my blog').count() == 0, 'no "Show my blog to the members"')
    page.screenshot(path='test-output/out/join-signed-out.png')
    page.get_by_role('button', name='Create an account and join').click(); pg.wait_for_timeout(500)
    check(pg.locator('.signup-sheet').count() == 1, 'it opens the quick sign-up')
    pg.screenshot(path='test-output/out/join-signed-out-sheet.png')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
