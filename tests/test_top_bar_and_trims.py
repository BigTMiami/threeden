from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300,400]:
        pg=b.new_page(viewport={'width':vw,'height':800}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
        if vw==1300:
            nav=pg.locator('#app-nav, .app-bar__nav').first
            print('nav:', nav.inner_text().replace('\n',' | '))
            pg.locator('.app-bar__home').hover(); pg.wait_for_timeout(300)
            print('home menu:', pg.locator('.home-menu a').all_inner_texts())
            pg.screenshot(path='test-output/n_home.png', clip={'x':0,'y':0,'width':700,'height':220})
            pg.locator('.home-menu a', has_text='Friends').click(); pg.wait_for_timeout(600)
            print('friends page h1:', pg.locator('#settings-view h1').first.inner_text(), '| tabs left:', pg.locator('.blog-tabs').count(), '| home current:', pg.locator('.app-bar__home').get_attribute('aria-current'))
            pg.mouse.move(600,500)
            pg.locator('.app-bar__link', has_text='Feed').click(); pg.wait_for_timeout(600)
            print('feed current:', pg.locator('.app-bar__link', has_text='Feed').get_attribute('aria-current'), '| summary:', repr(pg.locator('.feed__summary').inner_text()[:60]))
            pg.screenshot(path='test-output/n_feed.png')
            pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(600); print('my blog: home current', pg.locator('.app-bar__home').get_attribute('aria-current'), 'tabs', pg.locator('.blog-tabs').count())
            pg.evaluate("location.hash='#groups'"); pg.wait_for_timeout(600); pg.screenshot(path='test-output/n_groups.png')
            pg.evaluate("location.hash='#groups-explore'"); pg.wait_for_timeout(600); print('explore meta:', pg.locator('.explore-list__meta').first.inner_text())
        else:
            print('tab bar:', pg.locator('.tab-bar').inner_text().replace('\n',' | '))
            pg.locator('.app-bar__user').click(); pg.wait_for_timeout(300); print('account menu:', pg.locator('.account-menu a').all_inner_texts())
    print('errors', errs)
