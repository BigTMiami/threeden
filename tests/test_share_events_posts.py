"""
Calendar sharing, double-click, entry people, and posts with events and sign-ups (Nov 18).

1. Desktop: a single click on an empty day doesn't open the editor; a double-click does (month,
   week at the time clicked); double-clicking a day on the calendar card opens its add form on it.
2. Entries have a People field (anyone, on your own calendar too); people added get it on their calendar.
3. Share an event: "Send in 3den" invites the people it's sent to (on their calendar, with RSVP);
   "Add to a group's calendar" puts it on that group's calendar, its Upcoming events, and a
   member's Dashboard; taking it off works. Entries: Share → Add people, and Add to a group's calendar.
4. Board: the composer has Event and Sign-ups; posting with an event puts it on the group's calendar
   and the post shows it with RSVP; sign-ups show on the post. "+ Post" is at the bottom right.
5. Feed (a blog's general feed): Sign-ups in the composer; the post shows them and signing up saves.
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
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const li=await import('./js/editor/linked-items.js'); const ev=await import('./js/state/events.js'); const dash=await import('./js/modules/dashboard/dashboard-data.js'); const a=await import('./js/state/accounts.js'); const cd=await import('./js/modules/calendar/calendar-data.js'); {js}}})()")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    mv = pg.locator('#module-page-view')

    # 1
    pg.evaluate("location.hash='#module-house-calendar'"); pg.wait_for_timeout(800)
    mv.get_by_role('button', name='Month').first.click(); pg.wait_for_timeout(300)
    box = mv.locator('.month-view__day[data-date="2026-11-24"]').bounding_box()
    pg.mouse.click(box['x'] + box['width'] - 8, box['y'] + box['height'] - 8); pg.wait_for_timeout(300)
    check(mv.locator('.event-editor').count() == 0, 'a single click on an empty day opens nothing')
    pg.mouse.dblclick(box['x'] + box['width'] - 8, box['y'] + box['height'] - 8); pg.wait_for_timeout(400)
    check(mv.locator('.event-editor').count() == 1 and mv.locator('.event-editor input[aria-label="Start date"]').input_value() == '2026-11-24', 'a double-click opens a new item on that day')

    # 2: entry with people, from this editor
    ed = mv.locator('.event-editor')
    ed.locator('input[placeholder="What is it?"]').fill('Deep clean')
    check(ed.locator('.event-editor__label', has_text='People').count() == 1, 'entries have a People field')
    ed.get_by_role('combobox', name='Add people').fill('Owen'); pg.wait_for_timeout(200)
    ed.locator('.people-search__option, [role="option"]').first.click(); pg.wait_for_timeout(200)
    ed.get_by_role('button', name='Save').click(); pg.wait_for_timeout(500)
    entry = st(pg, "return s.getModule('house-calendar').data.events.find(e=>e.title==='Deep clean')")
    owen = st(pg, "return s.getState().members.find(m=>m.name.startsWith('Owen')).id")
    check(owen in entry['attendeeIds'], 'the person is on the entry')
    check('Deep clean' in st(pg, f"return li.otherCalendarLinks('{owen}', null).map(l=>l.item.title)"), 'it shows on their calendar')

    # week view double-click at a time
    mv.get_by_role('button', name='Week').first.click(); pg.wait_for_timeout(300)
    col = mv.locator('.time-grid__column').nth(3)
    col.evaluate("e=>e.scrollIntoView({block:'center'})"); pg.wait_for_timeout(200)
    cb = col.bounding_box(); top = col.evaluate("e=>e.getBoundingClientRect().top")
    pg.mouse.dblclick(cb['x'] + 20, top + 16 * 48 + 5); pg.wait_for_timeout(400)
    check(mv.locator('.event-editor input[aria-label="Start time"]').input_value() == '16:00', 'week view: a double-click starts one at that time')
    mv.locator('.event-editor').get_by_role('button', name='Cancel').click(); pg.wait_for_timeout(200)

    # card double-click
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    card = pg.locator('.module-frame', has=pg.locator('.calendar__grid')).first; card.scroll_into_view_if_needed()
    card.locator('.calendar__day[data-date="2026-11-27"]').dblclick(); pg.wait_for_timeout(400)
    check(card.locator('input[aria-label="Date"]').input_value() == '2026-11-27' and card.locator('input[aria-label="Name"]').is_visible(), 'the calendar card: a double-click opens its add form on that day')

    # 3: share an event with a group, and send to a person
    eid = st(pg, """const m = s.getModule('house-calendar'); const e = cd.createEvent({kind:'event', title:'Potluck', date:'2026-11-28', time:'18:00', endTime:'20:00', allDay:false, createdBy:'m-leo', visibility:'group', rsvps:{'m-leo':'going'}});
      s.updateModuleData(m.id, {...m.data, events:[...m.data.events, e]}); return e.id""")
    pg.evaluate(f"location.hash='#event-{eid}'"); pg.wait_for_timeout(800)
    pg.locator('.event-page').get_by_role('button', name='Share').first.click(); pg.wait_for_timeout(300)
    share = pg.locator('.event-share')
    check(share.get_by_text('Add to a group’s calendar').count() == 1, 'Share offers “Add to a group’s calendar”')
    share.get_by_text('Add to a group’s calendar').click(); pg.wait_for_timeout(300)
    share.locator('.event-share__group', has_text='Porch Lights').click(); pg.wait_for_timeout(300)
    check(st(pg, f"return ev.findEvent('{eid}').event.sharedGroupIds") == ['porchlights'], 'saved as shared with the group')
    check('Potluck' in st(pg, "return li.getLinkedItems('band-calendar').map(l=>l.item.title)"), 'it’s on the group’s calendar')
    share.get_by_role('button', name='Done').click(); pg.wait_for_timeout(200)
    member = st(pg, "return s.getSpace('porchlights').memberIds.find(id => !s.getSpace('juniper').memberIds.includes(id))")
    check(any(o['event']['title'] == 'Potluck' for o in st(pg, f"return dash.myUpcoming(s.getMember('{member}'), 30).map(o=>({{event:{{title:o.event.title}}}}))")), 'it’s on a group member’s Dashboard')
    check(st(pg, f"return ev.canViewEvent(ev.findEvent('{eid}'), '{member}')"), 'group members can open it')
    # Upcoming events in that group
    up = st(pg, "return s.getSpace('porchlights').modules.find(m=>m.type==='events')?.id ?? null")
    if up:
        pg.evaluate(f"location.hash='#module-{up}'"); pg.wait_for_timeout(800)
        check(mv.get_by_text('Potluck').count() >= 1, 'it’s in the group’s Upcoming events')
    # Send to a person: invited
    pg.evaluate(f"location.hash='#event-{eid}'"); pg.wait_for_timeout(700)
    pg.locator('.event-page').get_by_role('button', name='Share').first.click(); pg.wait_for_timeout(300)
    pg.locator('.event-share').get_by_text('Send in 3den').click(); pg.wait_for_timeout(400)
    dialog = pg.locator('.share-dialog, [role=dialog]').last
    first_person = dialog.locator('input[type=checkbox], [role=checkbox], .share-dialog__person').first
    if first_person.count():
        first_person.click(); pg.wait_for_timeout(150)
        send = dialog.get_by_role('button', name='Send')
        if send.count():
            send.first.click(); pg.wait_for_timeout(400)
    invited = st(pg, f"return ev.findEvent('{eid}').event.inviteeIds")
    check(len(invited) >= 1, f'“Send in 3den” puts it on their calendar as an invitation ({invited})')

    # entry share: add people, and a group
    did = entry['id']
    pg.evaluate("location.hash='#module-house-calendar'"); pg.wait_for_timeout(700)
    st(pg, f"(await import('./js/events/event-share.js')).openEventShare(ev.findEvent('{did}'), s.getCurrentUser()); return 1"); pg.wait_for_timeout(300)
    es = pg.locator('.event-share')
    check(es.get_by_text('Add people').count() >= 1 and es.get_by_text('Add to a group’s calendar').count() == 1, 'entries share too: Add people, and Add to a group’s calendar')
    es.locator('.event-share__group', has_text='Porch Lights').click(); pg.wait_for_timeout(300)
    check(st(pg, f"return ev.findEvent('{did}').event.sharedGroupIds") == ['porchlights'], 'an entry can go on a group’s calendar')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # 4: Board
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    board = pg.locator('.module-frame', has=pg.locator('.board__compose')).first; board.scroll_into_view_if_needed()
    fb, bb = board.bounding_box(), board.locator('.compose-toggle__open').bounding_box()
    check((fb['x'] + fb['width']) - (bb['x'] + bb['width']) < 30 and (fb['y'] + fb['height']) - (bb['y'] + bb['height']) < 30, '“+ Post” is at the bottom right')
    board.locator('.compose-toggle__open').click(); pg.wait_for_timeout(300)
    comp = board.locator('.board-composer')
    check(comp.get_by_role('button', name='Event').count() == 1 and comp.get_by_role('button', name='Sign-ups').count() == 1, 'the Board composer has Event and Sign-ups')
    comp.get_by_label('Title (optional)').fill('Game night')
    comp.get_by_role('button', name='Event').click(); pg.wait_for_timeout(150)
    comp.get_by_label('Event date').fill('2026-11-29')
    comp.get_by_role('button', name='Sign-ups').click(); pg.wait_for_timeout(150)
    comp.get_by_label('Sign-up 1').fill('Snacks')
    comp.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(600)
    post = st(pg, "return s.getSpace('juniper').modules.find(m=>m.type==='announcements').data.posts.find(p=>p.title==='Game night')")
    check(post and post.get('eventId'), 'the post has its event')
    check(st(pg, f"return ev.findEvent('{post['eventId']}')?.moduleId") == 'house-calendar', 'the event is on the group’s calendar')
    shown = board.locator('.board-post, .board-pinned', has_text='Game night').first
    check(shown.locator('.event-strip').count() == 1 and shown.locator('.event-strip .rsvp__button').count() >= 2, 'the post shows the event with RSVP')
    check(shown.get_by_text('Snacks').count() >= 1 or shown.locator('.asks').count() == 1, 'the post shows its sign-ups')
    pg.screenshot(path='test-output/out/board-event-post.png')

    # 5: Feed sign-ups (Leo's blog general feed)
    feed_id = st(pg, "const blog = s.getState().spaces.find(x=>x.kind==='blog' && x.memberIds[0]==='m-leo'); return blog?.modules.find(m=>m.type==='generalfeed')?.id ?? null")
    if feed_id:
        pg.evaluate(f"location.hash='#module-{feed_id}'"); pg.wait_for_timeout(900)
        mv.get_by_role('button', name='New post').first.click(); pg.wait_for_timeout(400)
        fc = pg.locator('.feed-composer').first  # opens in a dialog
        check(fc.get_by_role('button', name='Sign-ups').count() == 1, 'the feed composer has Sign-ups')
        fc.locator('textarea').first.fill('Moving day Saturday!')
        fc.get_by_role('button', name='Sign-ups').click(); pg.wait_for_timeout(150)
        fc.get_by_label('Sign-up 1').fill('Truck')
        fc.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(600)
        saved = st(pg, f"return s.getModule('{feed_id}').data.posts.find(p=>p.text==='Moving day Saturday!')")
        check(saved and any(a['kind'] == 'signups' for a in saved['attachments']), 'the post saves its sign-ups')
        # In grid layout a post is a tile; open it to see the whole post.
        tile = mv.locator('.feed-tile', has_text='Moving day Saturday!').first
        if tile.count():
            tile.click(); pg.wait_for_timeout(500)
        fp = pg.locator('.feed-post', has_text='Moving day Saturday!').last
        check(fp.get_by_text('Truck').count() >= 1, 'the post shows them')
        signup = fp.locator('.asks__signups button, .asks button').first
        if signup.count():
            signup.click(); pg.wait_for_timeout(400)
            people = st(pg, f"return s.getModule('{feed_id}').data.posts.find(p=>p.text==='Moving day Saturday!').attachments.find(a=>a.kind==='signups').signups[0].memberIds")
            check('m-leo' in people, 'signing up saves')
    else:
        check(False, 'Leo’s blog has a general feed')

    check(not errs, f'no page errors {errs[:2]}')
    b.close()

print('\n', 'ALL PASS' if not fails else f'{len(fails)} FAILED: {fails}')
