from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#groups'"); pg.wait_for_timeout(700)
    v=pg.locator('#settings-view')
    print('visible h1:', v.locator('h1:not(.visually-hidden)').count(), '| tiles:', v.locator('.group-tile').count(), '| table:', v.locator('.groups-table').count())
    print('first tile:', v.locator('.group-tile').first.inner_text().replace('\n',' | '))
    pg.screenshot(path='test-output/groups.png')
    v.get_by_role('button', name='List').click(); pg.wait_for_timeout(300); print('list view:', v.locator('.groups-table').count())
    pg.reload(); pg.wait_for_timeout(900); pg.evaluate("location.hash='#groups'"); pg.wait_for_timeout(500); print('remembered list:', v.locator('.groups-table').count())
    v.get_by_role('button', name='Tiles').click(); pg.wait_for_timeout(300)
    v.locator('.group-tile__link').first.click(); pg.wait_for_timeout(500); print('tile opens:', pg.evaluate('location.hash'))
    pg.set_viewport_size({'width':390,'height':844}); pg.evaluate("location.hash='#groups'"); pg.wait_for_timeout(600); pg.screenshot(path='test-output/groups-phone.png')
    print('errors', errs)
