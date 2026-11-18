"""
Add menus (Nov 18).

1. Announcements, on the card and the full page, on a computer and a phone:
   "+ Add" opens a menu whose every choice is on screen and not covered
   (the element at each choice's middle is that choice), in order Poll,
   File from your vault, Upload from camera roll. Poll opens the poll
   fields; File from your vault picks a file that posts as a preview card;
   Upload from camera roll opens the device picker for photos and videos.
2. Up next: "+ Add" offers only New event and From your calendar. New
   event opens the new-event page; From your calendar lists your own
   upcoming events and entries, and picking one puts it on the group's
   calendar as an event with you going.
"""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js}}})()")


VISIBLE_JS = """(menu) => {
  const r = menu.getBoundingClientRect();
  const inside = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
  const choices = [...menu.querySelectorAll('[role=menuitem]')];
  const covered = choices.filter(c => { const b = c.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !c.contains(e); }).map(c => c.innerText.split('\\n')[0]);
  return { inside, covered, names: choices.map(c => c.querySelector('strong')?.innerText) };
}"""


def open_add(pg, scope):
    scope.locator('.media-attach__button, .upnext__post').first.click(); pg.wait_for_timeout(250)
    menu = scope.locator('.media-attach__menu:visible').first
    return menu, menu.evaluate(VISIBLE_JS)


def card_composer(pg):
    card = pg.locator('.module-frame', has=pg.locator('.announcements__compose')).first
    card.scroll_into_view_if_needed()
    card.locator('.announcements__compose button').first.click(); pg.wait_for_timeout(250)
    return card


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    errs = []
    for label, opts in [('computer', dict(viewport={'width': 1300, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True))]:
        pg = b.new_page(**opts)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
        pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(1000)
        aid = st(pg, "return s.getState().spaces.find(x=>x.id==='juniper').modules.find(m=>m.type==='announcements').id")
        # The card (on the phone, the full page is the reliable place; the card is checked on the computer)
        if label == 'computer':
            pg.evaluate(f"document.querySelector('[data-module-id=\"{aid}\"]')?.scrollIntoView()"); pg.wait_for_timeout(300)
            card = card_composer(pg)
            menu, v = open_add(pg, card)
            check(v['inside'] and not v['covered'], f'{label} card: Add menu fully on screen ({v})')
            check(v['names'] == ['Poll', 'File from your vault', 'Upload from camera roll'], f'{label} card: order {v["names"]}')
            pg.screenshot(path='test-output/out/add-menu-card.png')
            pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        # The full page
        pg.evaluate(f"location.hash='#module-{aid}'"); pg.wait_for_timeout(900)
        page = pg.locator('#module-page-view')
        page.locator('.announcements-page__compose button, .compose-toggle__button').first.click(); pg.wait_for_timeout(300)
        comp = page.locator('.announcements-page__composer')
        menu, v = open_add(pg, comp)
        check(v['inside'] and not v['covered'], f'{label} page: Add menu fully on screen ({v})')
        check(v['names'] == ['Poll', 'File from your vault', 'Upload from camera roll'], f'{label} page: order {v["names"]}')
        pg.screenshot(path=f'test-output/out/add-menu-page-{label}.png')
        menu.get_by_role('menuitem', name='Poll').click(); pg.wait_for_timeout(200)
        check(comp.locator('.poll-attacher .poll-attacher__top').count() == 1, f'{label}: Poll opens the poll fields')
        comp.locator('.poll-attacher').get_by_role('button', name='Remove poll').click(); pg.wait_for_timeout(150)
        menu, v = open_add(pg, comp)
        with pg.expect_file_chooser() as fc:
            menu.get_by_role('menuitem', name='Upload from camera roll').click()
        chooser = fc.value
        accept = chooser.element.get_attribute('accept')
        check(accept == 'image/*,video/*' and chooser.is_multiple(), f'{label}: camera roll takes photos and videos ({accept})')
        chooser.set_files([])
        menu, v = open_add(pg, comp)
        menu.get_by_role('menuitem', name='File from your vault').click(); pg.wait_for_timeout(400)
        picker = pg.locator('.vault-picker__results')
        check(picker.count() == 1, f'{label}: File from your vault opens the vault picker')
        first = picker.locator('button').first
        name = first.inner_text().split('\n')[0]
        first.click(); pg.wait_for_timeout(300)
        check(comp.locator('.announcement-files__chip').count() == 1, f'{label}: picked file shows above the words ({name})')
        comp.locator('input[aria-label="Announcement title"]').fill(f'Files test {label}')
        comp.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(500)
        post = page.locator('.announcement-post', has_text=f'Files test {label}').first
        check(post.locator('.announcement-files .file-preview, .announcement-files > *').count() >= 1, f'{label}: the post shows the file as a preview card')
        saved = st(pg, f"return s.getModule('{aid}').data.posts.find(p=>p.title==='Files test {label}')?.files?.length")
        check(saved == 1, f'{label}: saved on the post ({saved})')

        # 2. Up next
        pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
        if label == 'phone':  # groups open on widgets on phones: Up next's widget opens it
            pg.locator('.mwidget', has_text='Up next').first.tap(); pg.wait_for_timeout(700)
        up = pg.locator('.module-frame', has=pg.locator('.upnext__foot')).first
        up.scroll_into_view_if_needed()
        menu, v = open_add(pg, up)
        check(v['names'] == ['New event', 'From your calendar'], f'{label} Up next: only New event and From your calendar ({v["names"]})')
        check(v['inside'] and not v['covered'], f'{label} Up next: menu fully on screen ({v["inside"]}, {v["covered"]})')
        pg.screenshot(path=f'test-output/out/upnext-add-{label}.png')
        menu.get_by_role('menuitem', name='From your calendar').click(); pg.wait_for_timeout(400)
        rows = pg.locator('.upnext-pick__row')
        n = rows.count()
        check(n >= 1, f'{label} Up next: lists your upcoming events and entries ({n})')
        if n:
            title = rows.first.locator('strong').inner_text()
            before = st(pg, "return s.getState().spaces.find(x=>x.id==='juniper').modules.flatMap(m=>m.data?.events??[]).length")
            rows.first.click(); pg.wait_for_timeout(400)
            got = st(pg, f"""const evs=s.getState().spaces.find(x=>x.id==='juniper').modules.flatMap(m=>m.data?.events??[]); const e=evs.filter(e=>e.title==={title!r}).at(-1); return [evs.length, e?.kind, e?.visibility, e?.rsvps?.[s.getCurrentUser().id]]""")
            check(got[0] == before + 1 and got[1:] == ['event', 'group', 'going'], f'{label} Up next: copied into the group as an event, you going ({title!r}: {got})')
        menu, v = open_add(pg, up)
        menu.get_by_role('menuitem', name='New event').click(); pg.wait_for_timeout(600)
        check(pg.evaluate('location.hash') == '#new-event-juniper', f'{label} Up next: New event opens the new-event page ({pg.evaluate("location.hash")})')
        pg.close()

    check(not errs, f'no page errors {errs}')
    b.close()

print('PASS' if not fails else f'FAILED: {fails}')
