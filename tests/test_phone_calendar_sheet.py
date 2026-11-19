"""
Phone calendars and the module view (Nov 18), at 390×844:

1. Opening a widget: the module fills the screen right under the top bar;
   the group's name is just above, out of view. A small pull up springs
   back; a hard pull shows the header; a small scroll down from the header
   snaps back to the module.
2. Long-press a day on the calendar widget: a New sheet opens over the
   calendar with that date, Calendar entry / Event to choose; saving adds
   it (and it's on your calendar too). The tap after the long press doesn't
   also select the day.
3. Tap an event in the calendar widget: its page opens over the calendar
   (Hosted by…, RSVP); × goes back, and so does the phone's Back.
   Tap an entry: its details, with Edit, which edits in the sheet.
4. On the full calendar page: a tap on an empty day shows that day (no
   editor); long-press a time in the day view opens New at that time;
   tapping an event opens it over the calendar.
5. Homepages snap the same way.
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
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const li=await import('./js/editor/linked-items.js'); {js}}})()")


LONG_PRESS = """(([sel, dy]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + (dy ?? r.height / 2) };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  return new Promise((res) => setTimeout(() => { el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new MouseEvent('click', o)); res(1); }, 650)); })"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    y = lambda: pg.evaluate('scrollY')
    grid_top = lambda: pg.evaluate("Math.round(document.querySelector('.module-grid').getBoundingClientRect().top)")
    header_bottom = lambda: pg.evaluate("Math.round(document.getElementById('space-header').getBoundingClientRect().bottom)")
    app_bar = lambda: pg.evaluate("Math.round(document.querySelector('.app-bar').getBoundingClientRect().bottom)")

    # 1
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    pg.locator('[data-widget-id="house-calendar"]').tap(); pg.wait_for_timeout(900)
    check(abs(grid_top() - app_bar()) <= 10, f'the module sits right under the top bar ({grid_top()} vs {app_bar()})')
    check(header_bottom() <= app_bar(), 'the group’s name is just above, out of view')
    frame_bottom = pg.evaluate("Math.round(document.querySelector('.module-grid > .module-frame').getBoundingClientRect().bottom)")
    strip_top = pg.evaluate("Math.round(document.querySelector('.module-strip').getBoundingClientRect().top)")
    check(frame_bottom <= strip_top and strip_top - frame_bottom < 40, f'it fills the screen down to the chips ({frame_bottom} / {strip_top})')
    rest = y()
    cdp = ctx.new_cdp_session(pg)
    import time

    def drag(y0, y1, steps=8, hold_ms=0, x=195):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y0}]})
        for i in range(1, steps + 1):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y0 + (y1 - y0) * i / steps}]})
        if hold_ms:
            time.sleep(hold_ms / 1000)  # the finger stops before letting go: no momentum
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        pg.wait_for_timeout(1300)

    # The snap rides the scroll: it's the browser's own scroll snapping, not a second motion afterwards.
    check(pg.evaluate("getComputedStyle(document.documentElement).scrollSnapType").startswith('y'), 'the page snaps with the scroll itself (CSS scroll snapping)')
    drag(650, 690, hold_ms=250)
    check(abs(y() - rest) <= 2, 'a small pull (then letting go) springs back to the module')
    drag(600, 760, steps=5)
    check(y() == 0 and header_bottom() > app_bar(), 'a flick down carries on to the group’s name and description')
    drag(700, 560, steps=5)
    check(abs(y() - rest) <= 2, 'a flick back up lands on the module')
    drag(300, 400, steps=5)
    check(y() == 0 and pg.locator('dialog.phone-sheet').count() == 0, 'a flick starting on the month grid scrolls too (no long press)')
    drag(700, 560, steps=5)

    # 2
    pg.evaluate(LONG_PRESS, ['.module-grid [aria-label^="November 25"]', None]); pg.wait_for_timeout(500)
    sheet = pg.locator('dialog.phone-sheet')
    check(sheet.count() == 1 and sheet.is_visible(), 'long-press a day: a sheet opens over the calendar')
    check(sheet.locator('input[aria-label="Start date"]').input_value() == '2026-11-25', 'with that date')
    check(sheet.locator('.segmented__option', has_text='Event').count() == 1, 'entry or event to choose')
    sheet.locator('input[placeholder="What is it?"]').fill('Bulk trash pickup')
    sheet.get_by_role('button', name='Save').click(); pg.wait_for_timeout(500)
    check(pg.locator('dialog.phone-sheet').count() == 0, 'saving closes the sheet')
    check(st(pg, "return s.getModule('house-calendar').data.events.some(e=>e.title==='Bulk trash pickup' && e.date==='2026-11-25')"), 'the entry is saved on that day')
    check('Bulk trash pickup' in st(pg, "return li.getLinkedItems('me-calendar').map(l=>l.item.title)"), 'and it’s on Leo’s own calendar too')

    # 3
    st(pg, """const m=s.getModule('house-calendar'); const ev=await import('./js/modules/calendar/calendar-data.js');
      s.updateModuleData(m.id, {...m.data, events:[...m.data.events, ev.createEvent({kind:'event', title:'Porch dinner', date:'2026-11-21', time:'18:00', endTime:'20:00', allDay:false, createdBy:'m-maya', visibility:'group', rsvps:{'m-maya':'going'}})]}); return 1""")
    pg.locator('.module-grid [aria-label^="November 20"]').tap(); pg.wait_for_timeout(300)
    pg.locator('.module-grid .calendar-event', has_text='Porch dinner').first.tap(); pg.wait_for_timeout(700)
    sheet = pg.locator('dialog.phone-sheet')
    check(sheet.count() == 1 and sheet.locator('.event-page').count() == 1, 'tap an event: its page opens over the calendar')
    check('Hosted by' in sheet.inner_text() and sheet.locator('.rsvp, .rsvp__button').count() > 0, 'with hosts and RSVP')
    check(sheet.locator('.module-page__back:visible').count() == 0, 'no Back link inside the sheet')
    pg.screenshot(path='test-output/out/phone-event-sheet.png')
    sheet.get_by_role('button', name='Back to the calendar').tap(); pg.wait_for_timeout(500)
    check(pg.locator('dialog.phone-sheet').count() == 0 and pg.locator('.module-grid.is-swiping').count() == 1, '× goes back to the calendar')
    pg.locator('.module-grid .calendar-event', has_text='Porch dinner').first.tap(); pg.wait_for_timeout(600)
    pg.go_back(); pg.wait_for_timeout(600)
    check(pg.locator('dialog.phone-sheet').count() == 0 and pg.locator('.module-grid.is-swiping').count() == 1, 'the phone’s Back closes it too, staying on the module')
    pg.locator('.module-grid .calendar-event', has_text='Plumber').first.tap(); pg.wait_for_timeout(600)
    sheet = pg.locator('dialog.phone-sheet')
    check(sheet.count() == 1 and 'Plumber' in sheet.inner_text(), 'tap an entry: its details open over the calendar')
    sheet.get_by_role('button', name='Edit').first.tap(); pg.wait_for_timeout(300)
    check(sheet.locator('.event-editor').count() == 1, 'Edit edits it in the sheet')
    sheet.locator('.event-editor input[type=text]').first.fill('Plumber (shower, take 2)')
    sheet.get_by_role('button', name='Save').tap(); pg.wait_for_timeout(400)
    check('take 2' in sheet.inner_text(), 'saved, back to its details')
    check(st(pg, "return s.getModule('house-calendar').data.events.some(e=>e.title==='Plumber (shower, take 2)')"), 'the change is saved')
    sheet.get_by_role('button', name='Back to the calendar').tap(); pg.wait_for_timeout(400)

    # 4
    pg.evaluate("location.hash='#module-house-calendar'"); pg.wait_for_timeout(900)
    mv = pg.locator('#module-page-view')
    if mv.get_by_role('button', name='Month').count():
        mv.get_by_role('button', name='Month').first.tap(); pg.wait_for_timeout(400)
    day = mv.locator('.month-view__day[data-date="2026-11-23"]')
    if day.count():
        box = day.bounding_box()
        pg.touchscreen.tap(box['x'] + box['width'] - 6, box['y'] + box['height'] - 6); pg.wait_for_timeout(500)
        check(mv.locator('.event-editor').count() == 0 or not mv.locator('.event-editor').is_visible(), 'tap an empty day: no editor')
        check(mv.locator('.time-grid--day').count() == 1, 'it shows that day')
    else:
        check(False, 'month view day cell found')
    pg.evaluate(LONG_PRESS, ['#module-page-view .time-grid__column', 15 * 48 + 10]); pg.wait_for_timeout(500)
    sheet = pg.locator('dialog.phone-sheet')
    check(sheet.count() == 1, 'long-press a time in the day view: New opens over the calendar')
    if sheet.count():
        t = sheet.locator('input[aria-label="Start time"]').input_value()
        print('   start time:', t)
        check(t == '15:00', 'at the time pressed (3:00pm)')
        check(sheet.locator('input[aria-label="Start date"]').input_value() == '2026-11-23', 'on that day')
        sheet.get_by_role('button', name='Back to the calendar').tap(); pg.wait_for_timeout(400)
    mv.get_by_role('button', name='Week').first.tap(); pg.wait_for_timeout(500)
    mv.locator('.event-chip', has_text='Bulk trash').first.tap(); pg.wait_for_timeout(600)
    check(pg.locator('dialog.phone-sheet').count() == 1 and pg.url.endswith('#module-house-calendar'), 'tapping an event on the full calendar opens it over the calendar')
    pg.screenshot(path='test-output/out/phone-full-cal-sheet.png')
    pg.locator('dialog.phone-sheet').get_by_role('button', name='Back to the calendar').tap(); pg.wait_for_timeout(400)

    # 5
    pg.evaluate("location.hash='#home'"); pg.wait_for_timeout(900)
    w = pg.locator('[data-widget-id]').first
    w.tap(); pg.wait_for_timeout(900)
    check(abs(grid_top() - app_bar()) <= 10, 'your homepage: the module sits right under the top bar too')

    check(not errs, f'no page errors {errs[:2]}')
    b.close()

print('\n', 'ALL PASS' if not fails else f'{len(fails)} FAILED: {fails}')
