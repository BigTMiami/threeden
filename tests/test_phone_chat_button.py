# On a phone, a group's chat is a module like any other (Nov 18; it used to be a button that left for Messages):
# its widget opens it in the swipe view, on the page; its chip shows the unread count; sending works there.
# On a computer the chat stays a module on the page.
from playwright.sync_api import sync_playwright
errs = []
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(1000)
    # The chip's unread count shows before the chat is opened.
    pg.locator('.mwidget', has_text='House to-do').first.tap(); pg.wait_for_timeout(700)
    chip = pg.locator('.module-strip__chip', has_text='House chat')
    check(chip.count() == 1, 'the chat is a chip like the other modules')
    label = chip.get_attribute('aria-label') or ''
    check('unread' in label and chip.locator('.module-strip__badge').count() == 1, f'its chip shows the unread count ({label!r})')
    check(pg.locator('.module-strip__chat').count() == 0, 'no separate Chat button')
    pg.get_by_role('button', name='Back to widgets').tap(); pg.wait_for_timeout(500)
    pg.locator('.mwidget', has_text='House chat').first.tap(); pg.wait_for_timeout(800)
    check(pg.evaluate('location.hash') == '#space-juniper', f'the chat widget stays on the page ({pg.evaluate("location.hash")})')
    check(pg.locator('.module-strip__chip.is-current').inner_text().strip() == 'House chat', 'and opens the chat in the swipe view')
    frame = pg.locator('.module-frame[data-module-type="chat"]')
    box = frame.bounding_box()
    check(box and 0 <= box['x'] < 50 and frame.locator('textarea, input[type=text]').first.is_visible(), 'the chat and its message box are on screen')
    frame.locator('textarea').first.fill('Testing from the page')
    frame.get_by_role('button', name='Send').click(); pg.wait_for_timeout(500)
    check(frame.get_by_text('Testing from the page').count() >= 1, 'sending works on the page')
    pg.screenshot(path='test-output/phone-chat-on-page.png')
    # desktop: the chat module shows
    d = b.new_page(viewport={'width': 1300, 'height': 900}); d.on('pageerror', lambda e: errs.append(str(e)))
    d.goto('http://localhost:8765/index.html#space-juniper'); d.wait_for_selector('.app-bar', timeout=20000); d.wait_for_timeout(900)
    check(d.locator('.module-frame[data-module-type="chat"]').is_visible(), 'computer: the chat module shows on the page')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
