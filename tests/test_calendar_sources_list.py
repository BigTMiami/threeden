"""Full calendar's Calendars list (Nov 20): My calendar, a line, the group
calendars, then Select all. Same on a group calendar's "Show my other calendars"."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    pg.evaluate("location.hash='#module-me-calendar'"); pg.wait_for_timeout(900)
    src = pg.locator('#module-page-view .calendar-sources').first
    kids = src.evaluate("el => [...el.children].map(c => c.tagName + (c.className ? '.' + c.className.split(' ').join('.') : ''))")
    print('   ', kids)
    order = [k.split('.')[0] for k in kids]
    check(order[:5] == ['H3', 'UL', 'HR', 'UL', 'BUTTON'], 'Calendars, My calendar, a line, the groups, then a button')
    check(src.locator('ul').first.inner_text().startswith('My calendar') and src.locator('ul').first.locator('li').count() == 1, 'My calendar sits alone above the line')
    groups = src.locator('.calendar-sources__list--groups li')
    check(groups.count() >= 2, f'the group calendars are below the line ({groups.count()})')
    sel = src.get_by_role('button', name='Select all')
    check(sel.is_disabled(), 'Select all is greyed out while everything is shown')
    groups.nth(0).locator('input').uncheck(); groups.nth(1).locator('input').uncheck(); pg.wait_for_timeout(200)
    src = pg.locator('#module-page-view .calendar-sources').first
    sel = src.get_by_role('button', name='Select all')
    check(not sel.is_disabled(), 'Select all wakes up once something is unticked')
    sel.click(); pg.wait_for_timeout(200)
    src = pg.locator('#module-page-view .calendar-sources').first
    boxes = src.locator('input[type=checkbox]').evaluate_all("els => els.filter(e => !e.closest('.calendar-sources__all-groups')).map(e => e.checked)")
    check(all(boxes), 'Select all ticks every calendar again')
    src.screenshot(path='test-output/out/calendar-sources-list.png')

    # A group calendar's "Show my other calendars"
    pg.evaluate("location.hash='#module-house-calendar'"); pg.wait_for_timeout(900)
    det = pg.locator('#module-page-view .calendar-sources__others')
    det.locator('summary').click(); pg.wait_for_timeout(300)
    det = pg.locator('#module-page-view .calendar-sources__others')
    check(det.locator('.calendar-sources__divider').count() == 1, 'other calendars: a line under My calendar')
    check(det.locator('ul').first.inner_text().startswith('My calendar'), 'other calendars: My calendar first')
    det.get_by_role('button', name='Select all').click(); pg.wait_for_timeout(300)
    det = pg.locator('#module-page-view .calendar-sources__others')
    check(all(det.locator('input[type=checkbox]').evaluate_all("els => els.map(e => e.checked)")), 'other calendars: Select all shows them all')
    check(det.get_by_role('button', name='Select all').is_disabled(), 'and then it greys out')
    det.screenshot(path='test-output/out/calendar-sources-others.png')

    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
