"""
Editing on a phone (Nov 18): for a group or your homepage, Edit shows the
widgets with their controls (no Layouts, no Edit mobile toggle, no module
stack): Small/Wide, ‹ ›, dragging by the grip with a finger, and × (take the
module off the page, with Undo). + Add modules adds a widget. Done editing
goes back to the widgets. A blog keeps its own editing (and Layouts).
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


def titles(pg):
    return pg.evaluate("[...document.querySelectorAll('#mobile-editor .mwidget__name')].map(e => e.innerText)")


def start_editing(pg, menu=True):
    pg.locator('#space-header').get_by_role('button', name='Edit', exact=True).first.tap(); pg.wait_for_timeout(250)
    if menu:
        pg.get_by_role('menuitem', name='Edit this page').tap()
    pg.wait_for_timeout(600)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    start_editing(pg)
    check(pg.locator('#mobile-editor').is_visible() and not pg.locator('#homepage-grid').is_visible(), 'group: Edit shows the widgets, not the module stack')
    check(pg.locator('.layout-menu__button').count() == 0 and pg.get_by_role('button', name='Edit mobile').count() == 0, 'group: no Layouts and no Edit mobile toggle on a phone')
    check(pg.get_by_role('button', name='Add modules').count() == 1 and pg.get_by_role('button', name='Done editing').count() == 1, 'group: + Add modules and Done editing are there')
    start = titles(pg)
    check(start == st(pg, "return s.phoneOrdered(s.naturalPhoneOrder(s.getVisibleModules())).map(m=>m.title)"), f'group: widgets in phone order ({len(start)})')
    pg.screenshot(path='test-output/out/phone-widget-editing.png', full_page=True)

    # Small / Wide
    cell = pg.locator('#mobile-editor .mwidgets__cell', has_text='House to-do')
    cell.get_by_role('button', name='Wide').tap(); pg.wait_for_timeout(300)
    tid = st(pg, "return s.getVisibleModules().find(m=>m.type==='todo').id")
    check(st(pg, f"return s.widgetSize(s.getModule('{tid}'))") == 'wide', 'group: Wide saves')

    # ‹ ›
    first = titles(pg)[0]
    pg.locator('#mobile-editor .mwidgets__cell').first.get_by_role('button', name=f'Move {first} later').tap(); pg.wait_for_timeout(300)
    check(titles(pg)[1] == first, 'group: › moves a widget later')

    # Finger drag: the last widget onto the first.
    cdp = ctx.new_cdp_session(pg)
    last = titles(pg)[-1]
    grip = pg.locator('#mobile-editor .mwidgets__cell').last.locator('.mwidget__grip')
    grip.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    gb = grip.bounding_box()
    x, y = gb['x'] + gb['width'] / 2, gb['y'] + gb['height'] / 2
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    fb = pg.locator('#mobile-editor .mwidgets__cell').first.bounding_box()
    # The first widget may be above the screen: drag up in steps, the page doesn't scroll under a held grip, so aim at whatever widget is near the top.
    target_y = max(fb['y'] + 40, 120)
    for i in range(1, 13):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 80, 'y': y + (target_y - y) * i / 12}]}); pg.wait_for_timeout(20)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(400)
    moved = titles(pg)
    check(moved.index(last) < len(moved) - 1, f'group: dragging with a finger moves a widget ({last!r} now #{moved.index(last) + 1})')
    check(st(pg, "return s.phoneOrdered(s.naturalPhoneOrder(s.getVisibleModules())).map(m=>m.title)") == moved, 'group: the dragged order is saved')

    # × with Undo
    n = len(titles(pg))
    pg.locator('#mobile-editor .mwidgets__cell', has_text='House bills').get_by_role('button', name='Remove House bills from the page').tap(); pg.wait_for_timeout(400)
    check(len(titles(pg)) == n - 1 and 'House bills' not in titles(pg), 'group: × takes the module off the page')
    pg.get_by_role('button', name='Undo').tap(); pg.wait_for_timeout(400)
    check('House bills' in titles(pg), 'group: Undo puts it back')

    # + Add modules
    pg.get_by_role('button', name='Add modules').tap(); pg.wait_for_timeout(500)
    lib = pg.locator('#module-library')
    item = lib.locator('.library-item', has_text='Tasks').first
    added = 'Tasks'
    item.tap(); pg.wait_for_timeout(600)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check(len(titles(pg)) == n + 1, f'group: + Add modules adds a widget ({added!r})')

    # Done editing
    pg.get_by_role('button', name='Done editing').tap(); pg.wait_for_timeout(600)
    check(pg.locator('#mobile-widgets').is_visible() and not pg.locator('#mobile-editor').is_visible(), 'group: Done editing goes back to the widgets')

    # Your homepage
    pid = st(pg, "return s.getPersonalSpace().id")
    pg.evaluate(f"location.hash='#space-{pid}'"); pg.wait_for_timeout(900)
    start_editing(pg)
    check(pg.locator('#mobile-editor').is_visible() and pg.locator('#mobile-editor .mwidget').count() >= 3, 'homepage: Edit shows the widgets too')
    check(pg.locator('.layout-menu__button').count() == 0, 'homepage: no Layouts on a phone')
    pg.get_by_role('button', name='Done editing').tap(); pg.wait_for_timeout(400)

    # A blog keeps its editing
    pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(900)
    start_editing(pg, menu=False)
    check(not pg.locator('#mobile-editor').is_visible() and pg.locator('.layout-menu__button').count() == 1, 'blog: its own editing and Layouts stay')
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'nothing runs off the side')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
