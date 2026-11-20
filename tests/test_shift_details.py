"""Shifts (Nov 20): renamed from Volunteer shifts; open a shift for notes;
edit it, including Repeat; a shift you take goes on your calendar."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const li=await import('./js/editor/linked-items.js'); const sd=await import('./js/modules/shifts/shifts-data.js'); const up=await import('./js/state/upgrade.js'); const reg=await import('./js/modules/registry.js'); {js}}})()")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    # Name
    check(st(pg, "return reg.getModuleType('shifts').label") == 'Shifts', 'the module is called Shifts')
    old = st(pg, "const st={dataVersion:72, demoSeen:[], spaces:[{id:'x',modules:[{id:'m',type:'shifts',title:'Volunteer shifts',data:{shifts:[]}}]}]}; return up.upgradeState(st, ()=>({spaces:[]})).state.spaces[0].modules[0].title")
    check(old == 'Shifts', 'saved modules titled "Volunteer shifts" are renamed')

    # Open a shift: its notes
    pg.evaluate("location.hash='#space-mutualaid'"); pg.wait_for_timeout(900)
    card = pg.locator('[data-module-id="aid-shifts"]'); card.scroll_into_view_if_needed()
    doors = card.locator('.shifts__row', has_text='Doors').first
    check(doors.locator('.shifts__details').count() == 0, 'details start closed')
    doors.locator('.shifts__open-button').click(); pg.wait_for_timeout(200)
    doors = card.locator('.shifts__row', has_text='Doors').first
    check(doors.locator('.shifts__details').count() == 1 and 'Clipboard' in doors.locator('.shifts__notes').inner_text(), 'clicking a shift shows its notes')
    check('On it:' in doors.locator('.shifts__details').inner_text(), 'and who’s on it')
    card.screenshot(path='test-output/out/shift-details-card.png')

    # Full page: edit a shift, add notes, make it repeat
    pg.evaluate("location.hash='#module-aid-shifts'"); pg.wait_for_timeout(800)
    v = pg.locator('#module-page-view')
    row = v.locator('.shifts__row', has_text='Cleanup').first
    sid = row.get_attribute('data-shift-id')
    row.locator('.shifts__open-button').click(); pg.wait_for_timeout(150)
    row = v.locator(f'[data-shift-id="{sid}"]')
    check(row.get_by_text('No notes yet.').count() == 1, 'a shift without notes says so')
    row.get_by_role('button', name='Edit').click(); pg.wait_for_timeout(150)
    row = v.locator(f'[data-shift-id="{sid}"]')
    row.get_by_label('Notes').fill('Mop is in the closet.')
    row.get_by_label('Repeat', exact=True).select_option('week')
    check(row.get_by_label('Repeat until').is_visible(), '“Until” shows once it repeats')
    row.screenshot(path='test-output/out/shift-edit.png')
    row.get_by_role('button', name='Save').click(); pg.wait_for_timeout(300)
    data = st(pg, "return s.getModule('aid-shifts').data")
    me_shift = next(x for x in data['shifts'] if x['id'] == sid)
    check(me_shift['notes'] == 'Mop is in the closet.', 'notes saved')
    series = [x for x in data['shifts'] if x.get('seriesId') == me_shift.get('seriesId') and me_shift.get('seriesId')]
    check(len(series) >= 8, f'repeating weekly makes the coming dates ({len(series)})')
    check(all(x['role'] == 'Cleanup' and x['memberIds'] == [] for x in series if x['id'] != sid and x['id'] != 'aid-sh-7'), 'each later date copies it, with nobody on it yet')
    check(v.locator(f'[data-shift-id="{sid}"] .shifts__repeat').count() == 1, 'the shift shows it repeats (↻)')
    dates = [x['date'] for x in data['shifts'] if x['role'] == 'Cleanup' and x['start'] == '12:00']
    check(len(dates) == len(set(dates)), 'no date gets the shift twice (next week’s Cleanup joins the series)')
    pg.screenshot(path='test-output/out/shift-repeat-page.png')

    # Edit a later date: "This and later ones"
    later = sorted(series, key=lambda x: x['date'])[2]
    st(pg, f"const d=s.getModule('aid-shifts').data; s.updateModuleData('aid-shifts', sd.updateShift(d, '{later['id']}', {{start:'12:30'}}, {{scope:'later'}}))")
    data = st(pg, "return s.getModule('aid-shifts').data")
    ss = sorted([x for x in data['shifts'] if x.get('seriesId') == me_shift['seriesId']], key=lambda x: x['date'])
    check(ss[0]['start'] == '12:00' and all(x['start'] == '12:30' for x in ss[2:]), '“This and later ones” changes only that date on')

    # Stop repeating: later untaken dates go
    st(pg, f"const d=s.getModule('aid-shifts').data; s.updateModuleData('aid-shifts', sd.setRepeat(d, '{sid}', 'none', '', '{me_shift['date']}'))")
    left = st(pg, f"return s.getModule('aid-shifts').data.shifts.filter(x=>x.role==='Cleanup' && x.date>'{me_shift['date']}' && x.memberIds.length===0).length")
    check(left == 0, 'Doesn’t repeat removes the later dates nobody took')

    # Every month keeps the day
    check(st(pg, "return [sd.nextDate('2027-01-31','month'), sd.nextDate('2026-11-20','2weeks')]") == ['2027-02-28', '2026-12-04'], 'monthly and two-weekly dates')

    # Take a shift → on your calendar
    pg.evaluate("location.hash='#module-aid-shifts'"); pg.wait_for_timeout(600)
    take = v.locator('.shifts__row', has=pg.get_by_role('button', name='Take it')).first
    tid = take.get_attribute('data-shift-id')
    take.get_by_role('button', name='Take it').click(); pg.wait_for_timeout(300)
    links = st(pg, "return li.getLinkedItems('me-calendar').filter(l=>l.readOnly).map(l=>l.itemId)")
    check(tid in links, 'a shift you take is on your homepage calendar')
    check('aid-sh-2' in links, 'shifts you already had are there too')

    # Open it from the calendar → goes to the shift
    pg.evaluate("location.hash='#module-me-calendar'"); pg.wait_for_timeout(800)
    check(st(pg, f"const l=li.getLinkedItems('me-calendar').find(l=>l.itemId==='{tid}'); return l.item.title.endsWith('shift') && l.item.kind==='entry'"), 'it shows as an entry named “… shift”')
    # drop it → off the calendar
    st(pg, f"const d=s.getModule('aid-shifts').data; s.updateModuleData('aid-shifts', sd.dropShift(d, '{tid}', 'm-leo'))")
    check(tid not in st(pg, "return li.getLinkedItems('me-calendar').map(l=>l.itemId)"), 'dropping it takes it off your calendar')

    # From the homepage calendar card, open a shift: lands on the shift, opened
    pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(900)
    cal = pg.locator('[data-module-id="me-calendar"]'); cal.scroll_into_view_if_needed()
    item = cal.locator('.calendar-event', has_text='Doors shift').first
    check(item.count() == 1, 'the shift is on the homepage calendar card')
    item.click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='Open in Eastside Mutual Aid').click(); pg.wait_for_timeout(900)
    check(v.locator('[data-shift-id="aid-sh-2"].is-open .shifts__details').count() == 1, 'opening it from your calendar opens that shift')
    pg.screenshot(path='test-output/out/shift-from-calendar.png')

    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
