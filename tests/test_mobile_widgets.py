"""
Phone widgets and Edit mobile (Nov 18).

Phone:
1. A group opens on widgets: one per module on the tab, in phone order; the
   modules and their chips are hidden; nothing runs off the side.
2. Tapping a widget opens the swipe view at that module (its chip lit, it in
   view); the Widgets button comes back; so does the phone's back gesture.
3. Back from a module's own page keeps the swipe view; leaving the group and
   coming back starts on the widgets again.
4. A chat's widget opens the chat full screen. Your homepage opens on
   widgets too; a blog doesn't.
Computer:
5. Edit → Edit mobile (groups and your homepage) shows the widgets in a phone frame
   instead of the page; Wide/Small, ‹ ›, and dragging by the grip save at
   once; a phone sees the same order and sizes; Reset phone layout clears
   them; Preview and Done editing turn it off.
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


PHONE_ORDER = "return s.phoneOrdered(s.naturalPhoneOrder(s.getVisibleModules())).map(m=>m.title)"


def widget_titles(pg, scope='#mobile-widgets'):
    return pg.evaluate(f"[...document.querySelectorAll('{scope} .mwidget')].map(w => w.querySelector('.mwidget__name').innerText)")


def start_editing(pg):
    pg.locator('#space-header').get_by_role('button', name='Edit', exact=True).first.click(); pg.wait_for_timeout(200)
    pg.get_by_role('menuitem', name='Edit this page').click(); pg.wait_for_timeout(500)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context()
    errs = []
    phone = ctx.new_page()
    phone.set_viewport_size({'width': 390, 'height': 844})
    phone.on('pageerror', lambda e: errs.append(str(e)))
    phone.goto('http://localhost:8765/index.html'); phone.evaluate('localStorage.clear(); sessionStorage.clear()'); phone.reload(); phone.wait_for_timeout(900)

    # 1
    phone.evaluate("location.hash='#space-juniper'"); phone.wait_for_timeout(1000)
    titles = widget_titles(phone)
    order = st(phone, PHONE_ORDER)
    check(titles == order and len(titles) >= 5, f'phone: one widget per module, in phone order ({len(titles)})')
    check(not phone.locator('#homepage-grid').is_visible() and not phone.locator('#module-strip').is_visible(), 'phone: modules and chips wait behind the widgets')
    check(phone.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'phone: nothing runs off the side')
    wide = phone.evaluate("[...document.querySelectorAll('.mwidgets__cell--wide .mwidget__name')].map(e=>e.innerText)")
    check('Up next' in wide, f'phone: Up next is wide by default ({wide})')
    phone.screenshot(path='test-output/out/mobile-widgets.png', full_page=True)

    # 2
    phone.locator('.mwidget', has_text='House to-do').first.click(); phone.wait_for_timeout(700)
    check(not phone.locator('#mobile-widgets').is_visible() and phone.locator('#homepage-grid .module-grid.is-swiping').count() == 1, 'phone: a widget opens the swipe view')
    lit = phone.locator('.module-strip__chip.is-current').inner_text().strip()
    in_view = phone.evaluate("(() => { const g = document.querySelector('#homepage-grid .module-grid'); const i = Math.round(g.scrollLeft / g.clientWidth); return [...g.querySelectorAll(':scope > .module-frame')].filter(f => f.dataset.moduleType !== 'chat')[i]?.getAttribute('aria-label'); })()")
    check(lit == 'House to-do' and in_view == 'House to-do', f'phone: at that module (chip {lit!r}, in view {in_view!r})')
    check(phone.locator('.module-strip__mode').count() == 0, 'phone: no List toggle in a group')
    phone.screenshot(path='test-output/out/mobile-widgets-swipe.png')
    phone.get_by_role('button', name='Back to widgets').click(); phone.wait_for_timeout(500)
    check(phone.locator('#mobile-widgets').is_visible(), 'phone: the Widgets button comes back')
    phone.locator('.mwidget', has_text='Groceries').first.click(); phone.wait_for_timeout(600)
    phone.go_back(); phone.wait_for_timeout(600)
    check(phone.locator('#mobile-widgets').is_visible() and phone.evaluate('location.hash') == '#space-juniper', 'phone: the back gesture comes back to the widgets')

    # 3
    phone.locator('.mwidget', has_text='Groceries').first.click(); phone.wait_for_timeout(600)
    gid = st(phone, "return s.getVisibleModules().find(m=>m.type==='grocery').id")
    phone.evaluate(f"location.hash='#module-{gid}'"); phone.wait_for_timeout(700)
    phone.evaluate("location.hash='#space-juniper'"); phone.wait_for_timeout(900)
    check(not phone.locator('#mobile-widgets').is_visible() and phone.locator('.module-strip__chip.is-current').count() == 1, 'phone: back from a module page keeps the swipe view')
    phone.evaluate("location.hash='#feed'"); phone.wait_for_timeout(600)
    phone.evaluate("location.hash='#space-juniper'"); phone.wait_for_timeout(900)
    check(phone.locator('#mobile-widgets').is_visible(), 'phone: leaving the group and coming back starts on the widgets')

    # 4
    phone.locator('.mwidget', has_text='House chat').first.click(); phone.wait_for_timeout(700)
    check(phone.evaluate('location.hash').startswith('#messages-'), f'phone: the chat widget opens the chat ({phone.evaluate("location.hash")})')
    pid = st(phone, "return s.getPersonalSpace().id")
    phone.evaluate(f"location.hash='#space-{pid}'"); phone.wait_for_timeout(900)
    check(phone.locator('#mobile-widgets').is_visible() and phone.locator('#mobile-widgets .mwidget').count() >= 3, 'phone: your homepage opens on widgets too')
    check('Dashboard' in phone.evaluate("[...document.querySelectorAll('.mwidgets__cell--wide .mwidget__name')].map(e=>e.innerText)"), 'phone: the Dashboard widget is wide')
    phone.locator('.mwidget', has_text='My vault').first.click(); phone.wait_for_timeout(700)
    check(phone.locator('.module-strip__chip.is-current').inner_text().strip() == 'My vault', 'phone: a homepage widget opens the swipe view there')
    phone.screenshot(path='test-output/out/mobile-widgets-homepage.png', full_page=True)
    phone.evaluate("location.hash='#blog-leo'"); phone.wait_for_timeout(900)
    check(not phone.locator('#mobile-widgets').is_visible(), 'phone: a blog has no widgets')

    # 5 Computer
    desk = ctx.new_page()
    desk.set_viewport_size({'width': 1300, 'height': 900})
    desk.on('pageerror', lambda e: errs.append(str(e)))
    desk.goto('http://localhost:8765/index.html#space-juniper'); desk.wait_for_timeout(1200)
    start_editing(desk)
    toggle = desk.get_by_role('button', name='Edit mobile')
    check(toggle.count() == 1, 'computer: Edit mobile shows while editing a group')
    toggle.click(); desk.wait_for_timeout(500)
    check(desk.locator('#mobile-editor').is_visible() and not desk.locator('#homepage-grid').is_visible(), 'computer: the phone layout replaces the page')
    check(toggle.get_attribute('aria-pressed') == 'true', 'computer: the toggle shows it is on')
    titles = widget_titles(desk, '#mobile-editor')
    check(titles == st(desk, PHONE_ORDER), f'computer: the same widgets in phone order ({len(titles)})')
    desk.screenshot(path='test-output/out/mobile-editor.png', full_page=True)

    cell = desk.locator('#mobile-editor .mwidgets__cell', has_text='House to-do')
    cell.get_by_role('button', name='Wide').click(); desk.wait_for_timeout(300)
    tid = st(desk, "return s.getVisibleModules().find(m=>m.type==='todo').id")
    size = st(desk, f"return s.getCurrentSpace().mobileWidgets?.[s.getCurrentTabId()]?.['{tid}']")
    check(size == 'wide' and 'mwidgets__cell--wide' in desk.locator('#mobile-editor .mwidgets__cell', has_text='House to-do').get_attribute('class'), f'computer: Wide saves ({size})')

    first = widget_titles(desk, '#mobile-editor')[0]
    desk.locator('#mobile-editor .mwidgets__cell').first.get_by_role('button', name=f'Move {first} later').click(); desk.wait_for_timeout(300)
    after = widget_titles(desk, '#mobile-editor')
    check(after[1] == first, f'computer: ‹ › moves a widget ({after[:3]})')
    check(desk.evaluate("document.activeElement?.getAttribute('aria-label') || ''").startswith(f'Move {first}'), 'computer: focus stays on the moved widget')

    # Drag the last widget onto the first.
    cells = desk.locator('#mobile-editor .mwidgets__cell')
    last_title = widget_titles(desk, '#mobile-editor')[-1]
    grip = cells.last.locator('.mwidget__grip')
    grip.scroll_into_view_if_needed()
    gb = grip.bounding_box()
    desk.mouse.move(gb['x'] + gb['width'] / 2, gb['y'] + gb['height'] / 2); desk.mouse.down()
    cells.first.scroll_into_view_if_needed()
    fb = cells.first.bounding_box()
    for step in range(1, 11):
        desk.mouse.move(fb['x'] + 40, fb['y'] + 30 * step / 10 + 10, steps=2)
        desk.wait_for_timeout(30)
    desk.mouse.up(); desk.wait_for_timeout(400)
    dragged = widget_titles(desk, '#mobile-editor')
    check(dragged[0] == last_title, f'computer: dragging by the grip moves a widget ({last_title!r} → first: {dragged[:2]})')
    saved_order = st(desk, PHONE_ORDER)
    check(saved_order == dragged, 'computer: the dragged order is saved')

    phone.evaluate("location.hash='#space-juniper'"); phone.wait_for_timeout(300)
    phone.reload(); phone.wait_for_timeout(1200)
    check(widget_titles(phone) == dragged, 'phone: shows the order set on the computer')
    check('House to-do' in phone.evaluate("[...document.querySelectorAll('.mwidgets__cell--wide .mwidget__name')].map(e=>e.innerText)"), 'phone: and the size')

    desk.get_by_role('button', name='Reset phone layout').click(); desk.wait_for_timeout(300)
    check(st(desk, "const sp=s.getCurrentSpace(), t=s.getCurrentTabId(); return !(sp.mobileOrders?.[t]?.length) && !Object.keys(sp.mobileWidgets?.[t] ?? {}).length"), 'computer: Reset phone layout clears order and sizes')

    desk.get_by_role('button', name='Preview').click(); desk.wait_for_timeout(400)
    check(not desk.locator('#mobile-editor').is_visible(), 'computer: Preview shows the page, not the phone layout')
    desk.get_by_role('button', name='Back to editing').click(); desk.wait_for_timeout(400)
    desk.get_by_role('button', name='Edit mobile').click(); desk.wait_for_timeout(300)
    desk.get_by_role('button', name='Done editing').click(); desk.wait_for_timeout(400)
    check(not desk.locator('#mobile-editor').is_visible() and desk.locator('#homepage-grid').is_visible(), 'computer: Done editing turns it off')
    pid = st(desk, "return s.getPersonalSpace().id")
    desk.evaluate(f"location.hash='#space-{pid}'"); desk.wait_for_timeout(800)
    start_editing(desk)
    check(desk.get_by_role('button', name='Edit mobile').count() == 1, 'computer: Edit mobile on your homepage too')
    desk.get_by_role('button', name='Edit mobile').click(); desk.wait_for_timeout(400)
    check('your homepage opens on these widgets' in desk.locator('#mobile-editor').inner_text(), 'computer: it says it is your homepage')

    check(not errs, f'no page errors {errs}')
    b.close()

print('PASS' if not fails else f'FAILED: {fails}')
