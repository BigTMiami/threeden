from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(500)
    # 62 Ctrl+K
    pg.evaluate("localStorage.clear(); sessionStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(200)
    j=pg.locator('.jump'); print('62 open:', j.count(), '| empty results:', j.locator('.jump__title').all_inner_texts()[:4])
    pg.keyboard.type('porch'); pg.wait_for_timeout(150)
    print('   porch:', [t.replace('\n',' · ') for t in j.locator('.jump__result').all_inner_texts()][:5])
    pg.screenshot(path='test-output/jump.png')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(600); print('   went:', pg.evaluate('location.hash'), '| closed:', pg.locator('.jump').count())
    pg.keyboard.press('Control+k'); pg.keyboard.type('notif'); pg.wait_for_timeout(150)
    print('   notif:', j.locator('.jump__result').first.inner_text().replace('\n',' · ')); pg.keyboard.press('ArrowDown'); pg.keyboard.press('ArrowUp'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500); print('   went:', pg.evaluate('location.hash'))
    pg.keyboard.press('Control+k'); pg.keyboard.type('new ev'); pg.wait_for_timeout(150); pg.keyboard.press('Enter'); pg.wait_for_timeout(500); print('   new ev →', pg.evaluate('location.hash'))
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(100); pg.keyboard.press('Escape'); pg.wait_for_timeout(100); print('   esc closed:', pg.locator('.jump').count()==0)
    # phone: search box shows Go to
    pg.set_viewport_size({'width':390,'height':800}); pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(500)
    pg.locator('.app-bar__search-toggle').click(); pg.wait_for_timeout(200)
    pg.locator('.app-search__input').fill('settings'); pg.wait_for_timeout(500)
    print('62 phone go to:', pg.locator('.app-search__section').first.inner_text().replace('\n',' | ')[:200])
    pg.screenshot(path='test-output/phone-goto.png')
    print('errors', errs)
    b.close()
