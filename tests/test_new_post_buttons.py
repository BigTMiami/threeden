from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(900)
    card=pg.locator('.module-frame', has=pg.locator('.announcements__compose')).first
    print('form visible at start:', card.locator('.announcements__form').is_visible(), '| button:', card.locator('.compose-toggle__open').inner_text())
    card.locator('.compose-toggle__open').click(); pg.wait_for_timeout(200)
    print('open, focused title:', pg.evaluate("document.activeElement.getAttribute('aria-label')"))
    card.get_by_label('Announcement title').fill('Laundry room is fixed'); card.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(400)
    print('after post, closed:', not card.locator('.announcements__form').is_visible(), '| top post:', card.locator('.announcement, .announcements__post').first.inner_text()[:40].replace('\n',' '))
    pg.screenshot(path='test-output/announce-toggle.png')
    # close keeps text
    card.locator('.compose-toggle__open').click(); card.get_by_label('Announcement title').fill('Half done'); card.locator('.compose-toggle__close').click(); pg.wait_for_timeout(100)
    card.locator('.compose-toggle__open').click(); print('kept text:', card.get_by_label('Announcement title').input_value())
    # full page
    pg.evaluate("location.hash='#module-tenants-announcements'"); pg.wait_for_timeout(800)
    v=pg.locator('#module-page-view')
    print('page: composer hidden:', not v.locator('.announcements-page__composer').is_visible(), '| button:', v.locator('.compose-toggle__open').inner_text())
    # forum already has New thread
    pg.evaluate("location.hash='#module-tenants-forum'"); pg.wait_for_timeout(700)
    print('forum new thread button:', pg.get_by_role('button', name='New thread').count())
    print('errors', errs[:3])
    b.close()
