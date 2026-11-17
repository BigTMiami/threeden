# On a phone, a group's chat isn't a module to swipe to: a Chat button sits at the start of the module chips, with the unread count,
# and opens the chat in Messages. On a computer the chat stays a module on the page.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(1000)
    btn=pg.locator('.module-strip__chat')
    print('chat button:', btn.count(), '|', btn.inner_text().replace('\n',' ') if btn.count() else '', '| label:', btn.get_attribute('aria-label') if btn.count() else '')
    chips=pg.locator('.module-strip__chip').all_inner_texts(); print('chips:', [c.strip() for c in chips])
    if any('chat' in c.lower() for c in chips): errs.append('chat should not be a chip')
    print('chat module hidden:', pg.locator('[data-module-id="house-chat"]').is_hidden(), '| dots:', pg.locator('.module-dots__dot').count())
    pg.screenshot(path='test-output/phone-chat-button.png')
    btn.click(); pg.wait_for_timeout(800)
    print('opened:', pg.evaluate("location.hash"), '| thread shown:', pg.locator('.thread, .thread-view, [class*=thread]').first.is_visible())
    if not pg.evaluate("location.hash").startswith('#messages-'): errs.append('should open the chat in Messages')
    # list mode keeps the button too
    pg.evaluate("localStorage.setItem('3den.phone-homepage-layout','list'); location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    print('list mode chat button:', pg.locator('.module-strip__chat').count())
    # a group with no chat: no button
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(800)
    print('tenants (no chat module):', pg.locator('.module-strip__chat').count(), pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getSpace('tenants').modules.some(m=>m.type==='chat')})()"))
    # desktop: the chat module shows, no button
    d=b.new_page(viewport={'width':1300,'height':900}); d.on('pageerror', lambda e: errs.append(str(e)))
    d.goto('http://localhost:8765/index.html#space-juniper'); d.wait_for_selector('.app-bar', timeout=20000); d.wait_for_timeout(900)
    print('desktop: chat module visible:', d.locator('[data-module-id="house-chat"]').is_visible(), '| button:', d.locator('.module-strip__chat:visible').count())
    print('errors', errs)
    b.close()
