from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(1000)
    d=pg.locator('.dashboard').first
    heads=d.locator('.dashboard__section h3, .dashboard__section h2').all_inner_texts()
    print('card sections:', [h.split('\n')[0] for h in heads])
    boxes=[s.bounding_box() for s in d.locator('.dashboard__section').all()]
    print('left to right:', [round(bx['x']) for bx in boxes if bx])
    pg.screenshot(path='test-output/dashboard-order.png')
    d.locator('.dashboard__more').click(); pg.wait_for_timeout(800)
    print('full page sections:', [h.split('\n')[0] for h in pg.locator('.dashboard--page .dashboard__section h3, .dashboard--page .dashboard__section h2').all_inner_texts()])
    pg.set_viewport_size({'width':390,'height':844}); pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(900)
    print('phone sections:', [h.split('\n')[0] for h in pg.locator('.dashboard').first.locator('.dashboard__section h3, .dashboard__section h2').all_inner_texts()])
    print('errors', errs[:3])
    b.close()
