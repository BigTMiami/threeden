from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#blog-jamal'"); pg.wait_for_timeout(800)
    print("jamal's blog: page theme attr:", pg.evaluate("document.documentElement.dataset.pageTheme ?? null"), '| own look:', pg.evaluate("document.documentElement.dataset.ownLook ?? null"), '| body bg:', repr(pg.evaluate("document.body.style.background")))
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(700)
    print('tenants: own look:', pg.evaluate("document.documentElement.dataset.ownLook ?? null"), '| cover shown:', pg.locator('.space-header__cover, .space-cover').count())
    pg.evaluate("location.hash='#settings-tenants--appearance'"); pg.wait_for_timeout(600)
    v=pg.locator('#settings-view')
    print('cover tab:', v.locator('nav.settings-tabs .is-active').inner_text(), '| sections:', v.locator('.settings-section__title').all_inner_texts())
    pg.evaluate("location.hash='#account-look'"); pg.wait_for_timeout(500)
    print('theme section checkbox gone:', v.locator('.theme-picker__groups').count()==0)
    # dark theme: group page follows it
    pg.evaluate("void (async()=>{const t=await import('./js/ui/themes.js'); t.setTheme('m-leo','midnight'); location.hash='#space-tenants';})()"); pg.wait_for_timeout(800)
    print('dark on group:', pg.evaluate("document.documentElement.dataset.dark !== undefined"), pg.evaluate("getComputedStyle(document.querySelector('.page')).getPropertyValue('--color-surface')"))
    pg.screenshot(path='test-output/dark-group.png')
    print('errors', errs)
