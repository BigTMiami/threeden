"""
Group calendars and your own (Nov 18):

1. An entry you add on a group's calendar shows on your homepage calendar
   too ("It's on your calendar too"); the editor has "Show on my calendar",
   ticked by default, and unticking it takes it off.
2. Events have a Hosts field: people (search) and groups (Add a group…).
   Co-hosts are saved and invited; a hosting group's calendar shows the
   event; someone in the hosting group (not the creator) can edit it, and
   the event page names the group among the hosts.
3. The step-by-step new event page has "Hosting with you".
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
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const li=await import('./js/editor/linked-items.js'); const ev=await import('./js/state/events.js'); const a=await import('./js/state/accounts.js'); {js}}})()")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    mine = lambda: st(pg, "return li.getLinkedItems('me-calendar').map(l=>l.item.title)")

    # 1
    pg.evaluate("location.hash='#module-house-calendar'"); pg.wait_for_timeout(800)
    mv = pg.locator('#module-page-view')
    mv.get_by_role('button', name='Entry', exact=False).filter(has_text='Entry').last.click(); pg.wait_for_timeout(300)
    ed = mv.locator('.event-editor')
    check(ed.get_by_label('Show on my calendar').is_checked(), 'new group entry: Show on my calendar is ticked')
    ed.locator('input[placeholder="What is it?"]').fill('Plumber visit')
    ed.get_by_role('button', name='Save').click(); pg.wait_for_timeout(500)
    check('on your calendar too' in pg.locator('.toast').last.inner_text(), 'toast says it’s on your calendar too')
    check('Plumber visit' in mine(), 'the entry shows on Leo’s homepage calendar')
    eid = st(pg, "return s.getModule('house-calendar').data.events.find(e=>e.title==='Plumber visit').id")
    # Edit it: untick
    pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js');}})()")
    mv.locator('.event-chip, .time-grid__event', has_text='Plumber visit').first.click(); pg.wait_for_timeout(300)
    mv.get_by_role('button', name='Edit').first.click(); pg.wait_for_timeout(300)
    ed = mv.locator('.event-editor')
    ed.get_by_label('Show on my calendar').uncheck()
    ed.get_by_role('button', name='Save').click(); pg.wait_for_timeout(500)
    check('Plumber visit' not in mine(), 'unticking takes it off the homepage calendar')
    check(st(pg, f"return s.getModule('house-calendar').data.events.find(e=>e.id==='{eid}').hiddenFrom") == ['m-leo'], 'saved as hiddenFrom')

    # 2
    mv.get_by_role('button', name='Event', exact=False).filter(has_text='Event').last.click(); pg.wait_for_timeout(300)
    ed = mv.locator('.event-editor')
    ed.locator('.segmented__option', has_text='Event').click(); pg.wait_for_timeout(150)
    ed.locator('input[placeholder="Event name"]').fill('Block party')
    hosts = ed.locator('.event-hosts')
    check(hosts.is_visible() and 'Hosts' in hosts.inner_text(), 'events have a Hosts field')
    hosts.get_by_role('combobox', name='Add a host').fill('Grace')
    pg.wait_for_timeout(200)
    hosts.locator('.people-search__option, [role="option"]').first.click(); pg.wait_for_timeout(200)
    hosts.get_by_label('Add a group as a host').select_option('porchlights'); pg.wait_for_timeout(200)
    check('Porch' in hosts.locator('.event-hosts__group').inner_text(), 'a group chip appears')
    pg.screenshot(path='test-output/out/event-hosts.png')
    ed.get_by_role('button', name='Save').click(); pg.wait_for_timeout(500)
    saved = st(pg, "return s.getModule('house-calendar').data.events.find(e=>e.title==='Block party')")
    check(len(saved['cohostIds']) == 1 and saved['cohostIds'][0] in saved['inviteeIds'], 'co-host saved and invited')
    check(saved['hostGroupIds'] == ['porchlights'], 'hosting group saved')
    check('Block party' in mine(), 'the event shows on Leo’s homepage calendar')
    check('Block party' in st(pg, "return li.getLinkedItems('band-calendar').map(l=>l.item.title)"), 'it shows on the hosting group’s calendar')
    check(st(pg, "return li.getLinkedItems('tenants-calendar').every(l=>l.item.title!=='Block party')"), 'not on other groups’ calendars')
    other = st(pg, "return s.getSpace('porchlights').memberIds.find(id=>id!=='m-leo' && !s.getSpace('juniper').memberIds.includes(id))")
    check(st(pg, f"const e=s.getModule('house-calendar').data.events.find(e=>e.title==='Block party'); return ev.canEditEvent(e,'{other}')"), 'someone in the hosting group can edit it')
    outsider = st(pg, "return s.getState().spaces.find(x=>x.id==='tenants').memberIds.find(id=>!s.getSpace('porchlights').memberIds.includes(id) && !s.getSpace('juniper').memberIds.includes(id))")
    if outsider:
        check(not st(pg, f"const e=s.getModule('house-calendar').data.events.find(e=>e.title==='Block party'); return ev.canEditEvent(e,'{outsider}')"), 'someone outside the hosts can’t')
    st(pg, f"a.signIn('{other}'); return 1"); pg.wait_for_timeout(500)
    pg.evaluate(f"location.hash='#event-{saved['id']}'"); pg.wait_for_timeout(800)
    page = pg.locator('.event-page')
    check('Porch Lights' in page.inner_text(), 'the event page names the hosting group')
    check(page.get_by_role('heading', name='Host tools').count() == 1, 'a hosting group member gets the host tools')
    pg.evaluate("location.hash='#module-band-calendar'"); pg.wait_for_timeout(800)
    check(pg.locator('#module-page-view').get_by_text('Block party').count() >= 1, 'the hosting group’s calendar page shows it')
    st(pg, "a.signIn('m-leo'); return 1"); pg.wait_for_timeout(500)

    # 3
    pg.evaluate("location.hash='#new-event'"); pg.wait_for_timeout(700)
    ne = pg.locator('.new-event')
    ne.get_by_role('button', name='Dinner').first.click(); pg.wait_for_timeout(250)
    for _ in range(6):
        if ne.get_by_text('Hosting with you').count():
            break
        ne.locator('button.button--primary').last.click(); pg.wait_for_timeout(250)
    pg.screenshot(path='test-output/out/new-event-hosts.png')
    check(pg.locator('.new-event').get_by_text('Hosting with you').count() == 1, 'the step-by-step page has “Hosting with you”')

    check(not errs, f'no page errors {errs[:2]}')
    b.close()

print('\n', 'ALL PASS' if not fails else f'{len(fails)} FAILED: {fails}')
