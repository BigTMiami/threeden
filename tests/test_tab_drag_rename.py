"""Nov 20: in edit mode, drag a group's tabs to reorder them (the first tab
stays first), click the open tab or double-click any tab to rename it."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js}}})()")
def names(pg):
    return st(pg, "return s.getTabs(s.getSpace('porchlights')).map(t=>t.name)")
def drag(pg, src, dst_x, dst_y, steps=12):
    b = src.bounding_box()
    pg.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
    pg.mouse.down()
    pg.mouse.move(dst_x, dst_y, steps=steps)
    pg.wait_for_timeout(100)
    pg.mouse.up()
    pg.wait_for_timeout(400)

for width, label in [(1300, 'desktop'), (390, 'phone')]:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': width, 'height': 860}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(800)
    st(pg, "s.addTab('Shows'); s.addTab('Merch'); s.setCurrentTab('home')")
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(500)
    before = names(pg)
    print('   tabs:', before)
    strip = pg.locator('.space-tabs')
    check(strip.count() == 1 and strip.is_visible(), f'{label}: tabs show in edit mode')
    tab = lambda n: strip.locator('.space-tabs__tab', has_text=n).first
    check(tab(before[0]).get_attribute('class').find('is-movable') == -1, f'{label}: the first tab can’t be dragged')
    # Drag the last tab to just after the first
    last = before[-1]
    t1 = tab(before[1]).bounding_box()
    drag(pg, tab(last), t1['x'] + 4, t1['y'] + t1['height'] / 2)
    after = names(pg)
    check(after[0] == before[0] and after[1] == last and sorted(after) == sorted(before), f'{label}: dragging “{last}” left moves it ({after})')
    # Drag it back to the end
    strip = pg.locator('.space-tabs')
    end = tab(after[-1]).bounding_box()
    drag(pg, tab(last), min(end['x'] + end['width'] - 4, width - 6), end['y'] + end['height'] / 2)
    check(names(pg)[-1] == last, f'{label}: and right again ({names(pg)})')
    # Dragging onto the first tab can't put it first
    first = tab(before[0]).bounding_box()
    drag(pg, tab('Merch'), first['x'] + 2, first['y'] + first['height'] / 2)
    check(names(pg)[0] == before[0], f'{label}: nothing goes before the first tab ({names(pg)})')
    # A plain click still opens a tab
    tab('Shows').click(); pg.wait_for_timeout(500)
    check(st(pg, "return s.getCurrentTabId()") != 'home' and 'Shows' == st(pg, "return s.getTabs(s.getSpace('porchlights')).find(t=>t.id===s.getCurrentTabId()).name"), f'{label}: a click opens the tab')
    # Click the open tab: rename
    pg.locator('.space-tabs .space-tabs__tab.is-active').click(); pg.wait_for_timeout(300)
    box = pg.locator('.space-tabs__rename')
    check(box.count() == 1, f'{label}: clicking the open tab renames it')
    box.fill('Tour dates'); box.press('Enter'); pg.wait_for_timeout(300)
    check('Tour dates' in names(pg) and 'Shows' not in names(pg), f'{label}: renamed ({names(pg)})')
    # Double-click another tab: rename it
    pg.locator('.space-tabs .space-tabs__tab', has_text='Merch').dblclick(); pg.wait_for_timeout(400)
    box = pg.locator('.space-tabs__rename')
    if box.count():
        box.fill('Shop'); box.press('Enter'); pg.wait_for_timeout(300)
    check('Shop' in names(pg), f'{label}: double-click renames any tab ({names(pg)})')
    pg.screenshot(path=f'test-output/out/tabs-edit-{label}.png')
    # Not in edit mode: tabs aren't draggable
    st(pg, 's.setEditMode(false)'); pg.wait_for_timeout(400)
    check(pg.locator('.space-tabs__tab.is-movable').count() == 0, f'{label}: outside edit mode tabs don’t drag')
    check(not errs, f'{label}: no page errors {errs}')
    b.close()

# The old List module isn't offered any more
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 860})
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(800)
    pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(600)
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(500)
    for t in pg.locator('#module-library .library__more').all():
        if t.get_attribute('aria-expanded') == 'false': t.click()
    labels = [x.strip() for x in pg.locator('#module-library .library-item__label').all_inner_texts()]
    check('List' not in labels and 'Calendar' in labels, f'the module list has no “List (Soon)” ({len(labels)} modules)')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
