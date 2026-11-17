"""
New message: search people by name or @username (Nov 17).

1. #messages-new: suggestions on focus (people you talked to, then friends),
   typing narrows by name or @username, arrow keys and Enter pick, chips can
   be removed with × or Backspace, one person starts a direct message, two
   or more a group conversation (with the Name field).
2. The + menu's Message: one person only, then Send opens the conversation.
3. The "New message" button keeps its white text while the pointer rests on
   it (a:hover used to turn it blue on blue), and the heading stays.
4. On a phone (390 px), the results fit on screen.
"""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
errs = []
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def options(pg):
    return [t.split('\n') for t in pg.locator('.people-search__option').all_inner_texts()]


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html')
    pg.evaluate('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("3den")')
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=30000)

    # 3. The button's text while hovered, then the heading after clicking it.
    pg.evaluate("location.hash='#messages'"); pg.wait_for_timeout(900)
    button = pg.locator('.messages-page__header a.button', has_text='New message')
    button.hover(); pg.wait_for_timeout(300)
    color = button.evaluate('e => getComputedStyle(e).color')
    check(color in ('rgb(255, 255, 255)', 'color(srgb 1 1 1)'), f'hovered New message button keeps white text ({color})')
    button.click(); pg.wait_for_timeout(700)
    check(button.evaluate('e => getComputedStyle(e).color') in ('rgb(255, 255, 255)', 'color(srgb 1 1 1)'), 'still white right after clicking')
    check(pg.locator('.new-conversation h2').inner_text() == 'New message', 'the box says New message')

    # 1. Search on the Messages page.
    box = pg.locator('.new-conversation .people-search__input')
    check(box.evaluate('e => e === document.activeElement'), 'the To box is ready to type in')
    suggested = options(pg)
    check(len(suggested) > 0 and suggested[0][1] == 'Priya Nair', f'suggestions start with the latest conversation ({suggested[:1]})')
    check(pg.locator('.people-search__heading').inner_text().upper() == 'SUGGESTED', 'labeled Suggested')
    box.fill('gra'); pg.wait_for_timeout(150)
    found = options(pg)
    check(found and found[0][1] == 'Grace Okafor', f'"gra" puts Grace Okafor first ({[f[1] for f in found[:3]]})')
    check(all('gra' in (f[1] + f[2]).lower() for f in found), 'every result matches "gra"')
    check(len(found) <= 8, 'at most 8 results')
    pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(50)
    check('is-active' in pg.locator('.people-search__option').nth(1).get_attribute('class'), 'ArrowDown moves to the second result')
    pg.keyboard.press('ArrowUp'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    chips = pg.locator('.new-conversation .people-search__chip').all_inner_texts()
    check(len(chips) == 1 and 'Grace Okafor' in chips[0], f'Enter picks Grace ({chips})')
    check(pg.url.endswith('#messages-new'), 'Enter picked instead of submitting')
    box.fill('@jam'); pg.wait_for_timeout(150)
    check(options(pg)[0][1] == 'Jamal Brooks', 'an @username finds Jamal Brooks')
    pg.locator('.people-search__option').first.click(); pg.wait_for_timeout(150)
    check(pg.locator('.new-conversation .people-search__chip').count() == 2, 'clicking a result adds a second chip')
    check(pg.locator('.new-conversation label.settings-field').is_visible(), 'two people show the Name field')
    box.fill('gra'); pg.wait_for_timeout(150)
    check('Grace Okafor' not in [o[1] for o in options(pg)], 'people already chosen drop out of the results')
    box.fill('zzqx'); pg.wait_for_timeout(150)
    check('No one matches' in pg.locator('.people-search__empty').inner_text(), 'no match says so')
    box.fill(''); pg.keyboard.press('Backspace'); pg.wait_for_timeout(150)
    check(pg.locator('.new-conversation .people-search__chip').count() == 1, 'Backspace in an empty box removes the last chip')
    pg.locator('.people-search__remove').first.click(); pg.wait_for_timeout(150)
    check(pg.locator('.new-conversation .people-search__chip').count() == 0, '× removes a chip')
    pg.get_by_role('button', name='Start conversation').click(); pg.wait_for_timeout(200)
    check('Choose at least one person' in pg.locator('.new-conversation .form-error').inner_text(), 'nobody chosen: asks for someone')
    box.fill('jamal'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    pg.get_by_role('button', name='Start conversation').click(); pg.wait_for_timeout(700)
    check(pg.locator('.thread-header__title').inner_text().strip() == 'Jamal Brooks', f'one person opens the direct message ({pg.locator(".thread-header__title").inner_text().strip()})')
    pg.evaluate("location.hash='#messages-new'"); pg.wait_for_timeout(700)
    for name in ['grace okafor', 'hana']:
        box.fill(name); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    pg.locator('.new-conversation input[aria-label="Conversation name"]').fill('Test ride')
    pg.get_by_role('button', name='Start conversation').click(); pg.wait_for_timeout(700)
    check(pg.locator('.thread-header__title').inner_text().strip() == 'Test ride', 'two people open a named group conversation')

    # 2. The + menu's Message.
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(800)
    pg.evaluate("(async()=>{const q=await import('./js/editor/quick-create.js'); q.openQuickCreate('message');})()"); pg.wait_for_timeout(400)
    quick = pg.locator('.quick-create .people-search__input')
    quick.fill('priya'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    check(pg.locator('.quick-create .people-search__chip').count() == 1 and not quick.is_visible(), 'one person: the chip replaces the box')
    pg.locator('.quick-create .people-search__remove').click(); pg.wait_for_timeout(150)
    check(quick.is_visible(), 'removing the chip brings the box back')
    quick.fill('priya'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    pg.locator('.quick-create textarea').fill('See you Saturday')
    pg.locator('.quick-create').get_by_role('button', name='Send').click(); pg.wait_for_timeout(800)
    check(pg.evaluate('location.hash').startswith('#messages-') and 'See you Saturday' in pg.locator('#messages-view').inner_text(), 'Send opens the conversation with the message')

    # 4. Phone.
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.evaluate("location.hash='#messages-new'"); pg.wait_for_timeout(800)
    box.click(); box.fill('a'); pg.wait_for_timeout(200)
    r = pg.locator('.people-search__results').bounding_box()
    check(r['x'] >= 0 and r['x'] + r['width'] <= 390, f'phone: results fit the width ({round(r["x"])}–{round(r["x"] + r["width"])})')
    pg.screenshot(path='test-output/out/new-message-phone.png')

    print('page errors:', errs[:3])
    check(not errs, 'no page errors')
    b.close()

print('PASS' if not fails else f'{len(fails)} FAILED')
