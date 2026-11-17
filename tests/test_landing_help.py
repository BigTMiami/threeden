from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    # signed in: help
    pg.evaluate("location.hash='#help'"); pg.wait_for_timeout(500)
    print('topics:', pg.locator('.help__topic').count())
    pg.get_by_label('Search help').fill('waitlist'); pg.wait_for_timeout(100); print('search:', pg.locator('.help__count').inner_text())
    pg.get_by_label('Search help').fill(''); pg.locator('.help__topic', has_text='Events').click(); pg.wait_for_timeout(300)
    print('events topic:', pg.evaluate('location.hash'), pg.locator('.help__qa').count())
    # sign out -> landing
    pg.evaluate("void (async()=>{const a=await import('./js/state/accounts.js'); a.signOut(); location.hash='#';})()"); pg.wait_for_timeout(900)
    print('signed out at:', pg.evaluate('location.hash'), '| landing:', pg.locator('.landing').count(), '|', pg.locator('.landing__title').inner_text().replace('\n',' '))
    pg.screenshot(path='test-output/landing.png', full_page=True)
    pg.evaluate("location.hash='#help-privacy'"); pg.wait_for_timeout(500); print('guest help:', pg.locator('.help__qa').count(), '| links hidden:', pg.locator('.help__qa a.button').count())
    pg.evaluate("location.hash='#welcome'"); pg.wait_for_timeout(500)
    pg.locator('.landing__signin').click(); pg.wait_for_timeout(500); print('sign in view:', pg.evaluate('location.hash'))
    pg.evaluate("location.hash='#welcome'"); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Try the organizer demo').click(); pg.wait_for_timeout(1500)
    print('demo:', pg.evaluate('location.hash'), '| tour card:', pg.locator('.tour-card').count(), '| user:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getCurrentUser()?.id})()"))
    pg.set_viewport_size({'width':390,'height':800}); pg.evaluate("location.hash='#welcome'"); pg.wait_for_timeout(600); pg.locator('.tour-card button[aria-label=\"End the demo\"]').click() if pg.locator('.tour-card').count() else None
    pg.screenshot(path='test-output/landing-phone.png')
    print('errors', errs)
