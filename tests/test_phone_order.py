"""
Phone order and Big widgets (Nov 18).

1. No phone-position numbers on modules in edit mode, and no "Reset phone
   order" in Layouts (Edit mobile arranges the phone).
2. Swiping goes through the modules in the widgets' order, counting from the
   top left to the bottom right, also after Edit mobile moves a widget.
3. Big: Edit mobile offers Small, Wide, and Big. Big is full width and twice
   as tall as Wide, and shows the next few things (a calendar's next dates,
   the to-do's next tasks, every grocery chip).
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


def start_editing(pg):
    pg.locator('#space-header').get_by_role('button', name='Edit', exact=True).first.click(); pg.wait_for_timeout(200)
    pg.get_by_role('menuitem', name='Edit this page').click(); pg.wait_for_timeout(500)


READING = """(sel => [...document.querySelectorAll(sel)].map(el => ({ r: el.getBoundingClientRect(), id: el.dataset.widgetId }))
  .filter(x => x.r.width).sort((a, b) => Math.round(a.r.top) - Math.round(b.r.top) || a.r.left - b.r.left).map(x => x.id))"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context()
    errs = []
    desk = ctx.new_page()
    desk.on('pageerror', lambda e: errs.append(str(e)))
    desk.set_viewport_size({'width': 1300, 'height': 900})
    desk.goto('http://localhost:8765/index.html'); desk.evaluate('localStorage.clear(); sessionStorage.clear()'); desk.reload(); desk.wait_for_timeout(900)
    desk.evaluate("location.hash='#space-juniper'"); desk.wait_for_timeout(800)
    start_editing(desk)

    # 1
    check(desk.locator('.module-frame__phone, .module-frame__phone-select').count() == 0, 'no phone numbers on the modules')
    desk.get_by_role('button', name='Layouts').first.click(); desk.wait_for_timeout(300)
    check(desk.get_by_text('Reset phone order').count() == 0, 'no Reset phone order in Layouts')
    desk.keyboard.press('Escape'); desk.wait_for_timeout(200)

    # 3 (on the computer): Big, and move a widget
    desk.get_by_role('button', name='Edit mobile').click(); desk.wait_for_timeout(500)
    cell = lambda name: desk.locator('#mobile-editor .mwidgets__cell', has_text=name)
    check(cell('House to-do').get_by_role('button', name='Big').count() == 1, 'Edit mobile offers Big')
    cell('House to-do').get_by_role('button', name='Big').click(); desk.wait_for_timeout(300)
    cell('House calendar').get_by_role('button', name='Big').click(); desk.wait_for_timeout(300)
    tid = st(desk, "return s.getVisibleModules().find(m=>m.type==='todo').id")
    check(st(desk, f"return s.getCurrentSpace().mobileWidgets[s.getCurrentTabId()]['{tid}']") == 'big', 'Big saves')
    # Move the calendar to the front
    for _ in range(8):
        btn = cell('House calendar').get_by_role('button', name='Move House calendar earlier')
        if btn.count() == 0 or btn.is_disabled():
            break
        btn.click(); desk.wait_for_timeout(150)
    desk.screenshot(path='test-output/out/mobile-editor-big.png', full_page=True)
    desk.get_by_role('button', name='Done editing').click(); desk.wait_for_timeout(400)

    # On a phone
    phone = ctx.new_page()
    phone.on('pageerror', lambda e: errs.append(str(e)))
    phone.set_viewport_size({'width': 390, 'height': 844})
    phone.goto('http://localhost:8765/index.html#space-juniper'); phone.wait_for_timeout(1000)
    reading = phone.evaluate(READING, '.mwidgets .mwidget[data-widget-id]')
    check(reading[0] == 'house-calendar', f'the moved widget comes first ({reading[:3]})')
    big = phone.locator('.mwidget[data-widget-id="house-calendar"]')
    wide = phone.locator('.mwidget--wide').first
    bw, bh = big.bounding_box()['width'], big.bounding_box()['height']
    grid_w = phone.locator('.mwidgets').bounding_box()['width']
    check('mwidget--big' in big.get_attribute('class') and bw > grid_w - 4, f'Big is full width ({bw:.0f} of {grid_w:.0f})')
    if wide.count():
        check(bh >= 2 * 96 - 2 and bh >= 1.9 * 96, f'Big is twice as tall as Wide’s minimum ({bh:.0f})')
    check(big.locator('.mwidget__more-line').count() >= 2, f'Big lists the next few dates ({big.locator(".mwidget__more-line").all_inner_texts()[:2]})')
    todo = phone.locator('.mwidget--big', has_text='House to-do')
    check(todo.locator('.mwidget__more-line').count() >= 1, 'Big to-do lists the next tasks')
    phone.screenshot(path='test-output/out/phone-big-widgets.png', full_page=True)

    # 2: swiping follows the widgets, top left to bottom right
    phone.locator('.mwidget[data-widget-id]').first.click(); phone.wait_for_timeout(800)
    swipe = phone.evaluate("[...document.querySelectorAll('.module-grid > .module-frame')].map(f=>f.dataset.moduleId)")
    check(swipe == reading, f'swipe order = widget order, top left to bottom right ({swipe[:4]} / {reading[:4]})')
    chips = phone.evaluate("[...document.querySelectorAll('.module-strip [data-module-id], .module-strip__chip')].map(c=>c.dataset.moduleId).filter(Boolean)")
    if chips:
        check(chips == reading, 'the chips follow the same order')

    check(not errs, f'no page errors {errs[:2]}')
    b.close()

print('\n', 'ALL PASS' if not fails else f'{len(fails)} FAILED: {fails}')
