from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#tour'"); pg.wait_for_timeout(1200)
    for i in range(8):
        card=pg.locator('.tour-card')
        pg.wait_for_timeout(900)
        print(i+1, pg.evaluate('location.hash'), '|', card.locator('.tour-card__title').inner_text(), '| spot:', pg.locator('.tour-spot').count())
        if i==3: pg.reload(); pg.wait_for_timeout(1200); print('  after reload card:', pg.locator('.tour-card').count(), pg.locator('.tour-card__title').inner_text())
        if i==2: pg.screenshot(path='test-output/tour.png')
        if i<7: card.get_by_role('button', name='Next').click()
    pg.locator('.tour-card').get_by_role('button', name='Done').click(); pg.wait_for_timeout(300)
    print('ended:', pg.locator('.tour-card').count(), pg.evaluate("sessionStorage.getItem('3den.tour')"))
    pg.set_viewport_size({'width':390,'height':800}); pg.evaluate("location.hash='#tour'"); pg.wait_for_timeout(1200); pg.screenshot(path='test-output/tour-phone.png')
    print('errors', errs)
