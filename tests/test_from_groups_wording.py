from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(1000)
    print('feed box:', pg.locator('.needs__title').first.inner_text().replace('\n',' '))
    print('old wording left:', pg.locator('body').inner_text().count('need you'))
    print('errors', errs[:3])
    b.close()
