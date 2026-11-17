from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os, re; os.makedirs('test-output/out', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()')
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    ids=['aid-ev-0','tenants-ev-3','tenants-ev-1']
    print('events:', ids)
    for eid in ids:
        if not eid: continue
        pg.evaluate(f"location.hash='#event-{eid}'"); pg.wait_for_timeout(900)
        sec=pg.locator('.event-page__rsvp')
        print(' buttons:', [t.strip() for t in sec.locator('button').all_inner_texts()][:3])
        muted=sec.locator('.event-details__muted').all_inner_texts()
        print(' summary lines:', muted, '| says going:', any(re.search(r'\d+ going', t) for t in muted))
        dts=pg.locator('.event-page__guests .guest-list dt').all_inner_texts()
        print(' guest headings:', dts, '| counts in headings:', any('(' in t for t in dts))
        pg.screenshot(path=f'test-output/event-counts-{eid}.png')
    print('errors', errs[:3])
    b.close()
