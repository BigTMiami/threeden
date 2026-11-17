from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':844}); pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(900)
    f=pg.locator('.quick-create__button--float').bounding_box(); t=pg.locator('.tab-bar').bounding_box()
    print('gap to bottom bar:', round(t['y']-(f['y']+f['height'])), 'px')
    print('errors []' if round(t['y']-(f['y']+f['height']))<=8 else 'errors ["too far"]')
    b.close()
