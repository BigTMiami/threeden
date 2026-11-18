from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300,400]:
        pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
        pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(800)
        if vw <= 640: pg.locator('.mwidget', has_text='Dashboard').first.click(); pg.wait_for_timeout(700)  # phones open on widgets (Nov 18)
        d=pg.locator('.dashboard').first
        print(vw,'titles:', d.locator('.dashboard__title').all_inner_texts(), '| friends?', d.get_by_text('From friends').count())
        print(' events:', d.locator('.dashboard__row--event').count(), d.locator('.dashboard__role').all_inner_texts())
        print(' tasks:', d.locator('.dashboard__row--task').count(), d.locator('.dashboard__row--task .dashboard__text').all_inner_texts()[:3])
        d.screenshot(path=f'test-output/db_{vw}.png')
        n=d.locator('.dashboard__row--task').count()
        if n: d.locator('.dashboard__check').first.click(); pg.wait_for_timeout(400); print(' after tick:', pg.locator('.dashboard').first.locator('.dashboard__row--task').count())
        inv=pg.locator('.dashboard').first.locator('.dashboard__row--event.is-invited').first
        if inv.count(): inv.get_by_role('button').first.click(); pg.wait_for_timeout(400); print(' invited rows now:', pg.locator('.dashboard').first.locator('.dashboard__row--event.is-invited').count())
        pg.locator('.dashboard').first.get_by_role('button', name='Open the full dashboard →').click(); pg.wait_for_timeout(700)
        print(' full page titles:', pg.locator('#module-page-view .dashboard__title').all_inner_texts())
    print('errors', errs)
