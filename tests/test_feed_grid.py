from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300, 400]:
        pg=b.new_page(viewport={'width':vw,'height':1000}); pg.on('pageerror', lambda e: errs.append(str(e)))
        hv=pg.locator('#homepage-view')
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(500)
        for where in ['#space-tenants', '#blog-leo', '#blog-jamal']:
            pg.evaluate(f"location.hash='{where}'"); pg.wait_for_timeout(700)
            for fm in hv.locator('.feed-module').all():
                print(vw, where, 'tiles:', fm.locator('.feed-tile').count(), 'rows:', fm.locator('.feed-row').count(), 'docs:', fm.locator('.feed-layout__visual--doc').count(), [c.split(' ')[1] for c in fm.locator('.feed-tile').evaluate_all('ts=>ts.map(t=>t.className)')])
            f=hv.locator('.feed-module').first
            if f.count():
                f.scroll_into_view_if_needed(); pg.wait_for_timeout(300); pg.screenshot(path=f'test-output/t111_{where[1:]}_{vw}.png')
        pg.close()
    b.close()
print('ERRORS', errs)
