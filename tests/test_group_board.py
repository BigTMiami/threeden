"""
The group Board (Nov 18), replacing Announcements, design 1:

1. It's called Board (library, sample groups); the pinned post sits on top in
   the accent box with Seen by and Mark as seen; the rest follow.
2. + Post: a post with no title; it goes to the top of the stream, and to
   members' Feeds by default; unticking "Show in members' Feeds" keeps one off.
3. Admins pin from the composer (Pin for 1 day: "Pinned until …"), and on
   any post (Pin ▸ 3 days); a second pin folds into "1 more pinned"; Unpin;
   a pin past its end drops back into the stream.
4. ♡ likes.
5. Who can post: Everyone by default; an admin can switch it to admins only
   (on the board's full page), and a member then can't post.
6. Members' Feeds show board posts; the board's widget shows the pinned post.
"""
from playwright.sync_api import sync_playwright
import os
import time
os.makedirs('test-output/out', exist_ok=True)
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const d=await import('./js/modules/announcements/announcements-data.js'); const perm=await import('./js/state/permissions.js'); {js}}})()")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    bid = st(pg, "return s.getSpace('juniper').modules.find(m=>m.type==='announcements').id")
    data = lambda: st(pg, f"return s.getModule('{bid}').data.posts.map(d.normalizePost)")

    # 1
    check(st(pg, "const r=await import('./js/modules/registry.js'); return r.getModuleType('announcements').label") == 'Board', 'the module is called Board')
    check(st(pg, f"return s.getModule('{bid}').title") == 'Board', 'the sample group calls it Board')
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    board = pg.locator(f'[data-module-id="{bid}"]')
    check(board.locator('.board-pinned').count() == 1 and 'pinned' in board.locator('.board-pinned__kicker').inner_text().lower(), 'the pinned post is on top, in the box')
    check('Seen by' in board.locator('.board-pinned__meta').inner_text(), 'with Seen by')

    # 2
    board.get_by_role('button', name='Post', exact=True).first.click(); pg.wait_for_timeout(300)
    form = board.locator('.board-composer')
    form.get_by_label('Post', exact=True).fill('Anyone want to split a farm box this week?')
    check(form.get_by_label('Show in members’ Feeds').is_checked(), 'composer: Show in members’ Feeds is ticked by default')
    form.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(500)
    first = board.locator('.board__stream .board-post').first.inner_text()
    check('farm box' in first, 'a post with no title goes to the top of the stream')
    newest = [p for p in data() if 'farm box' in p['body']][0]
    check(newest['toFeed'] is True and newest['title'] == '', 'it goes to members’ Feeds, with no title')
    board.get_by_role('button', name='Post', exact=True).first.click(); pg.wait_for_timeout(300)
    form.get_by_label('Post', exact=True).fill('Just for the board')
    form.get_by_label('Show in members’ Feeds').uncheck()
    form.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(500)
    check([p for p in data() if p['body'] == 'Just for the board'][0]['toFeed'] is False, 'unticked: it stays off the Feed')

    # 3 Pin from the composer
    board.get_by_role('button', name='Post', exact=True).first.click(); pg.wait_for_timeout(300)
    form.get_by_label('Title (optional)').fill('Rent is due Friday')
    form.get_by_label('Pin it').select_option('1d')
    form.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(500)
    kicker = board.locator('.board-pinned__kicker').first.inner_text()
    check('until' in kicker.lower() and 'Rent is due' in board.locator('.board-pinned').first.inner_text(), f'composer pin for 1 day: on top, "{kicker.strip()}"')
    more = board.locator('.board__more-pins')
    check(more.count() == 1 and '1 more pinned' in more.inner_text(), 'the other pinned post folds into "1 more pinned"')
    more.get_by_role('button', name='Show').click(); pg.wait_for_timeout(300)
    check(board.locator('.board-pinned').count() == 2, 'Show opens the other pinned post')
    # Pin an existing post for 3 days
    row = board.locator('.board__stream .board-post', has_text='farm box').first
    row.get_by_role('button', name='Pin').click(); pg.wait_for_timeout(200)
    row.get_by_role('button', name='3 days').click(); pg.wait_for_timeout(400)
    farm = [p for p in data() if 'farm box' in p['body']][0]
    left = (farm['pin']['until'] / 1000 - time.time()) / 86400 if farm['pin'] and farm['pin']['until'] else 0
    check(2.9 < left < 3.1, f'Pin ▸ 3 days pins it for three days ({left:.2f})')
    pg.screenshot(path='test-output/out/group-board.png', full_page=True)
    # Unpin
    board.locator('.board-pinned', has_text='farm box').get_by_role('button', name='Unpin').click(); pg.wait_for_timeout(300)
    check(not [p for p in data() if 'farm box' in p['body']][0]['pin'], 'Unpin')
    # Expired
    st(pg, f"const m=s.getModule('{bid}'); const data=structuredClone(m.data); const p=data.posts.find(p=>p.title==='Rent is due Friday'); p.pin={{until:Date.now()-1000, by:'m-leo', at:Date.now()-86400000}}; s.updateModuleData('{bid}', data); return 1")
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    check(board.locator('.board-pinned', has_text='Rent is due').count() == 0 and board.locator('.board__stream', has_text='Rent is due').count() == 1, 'a pin past its end drops back into the stream')

    # 4 Likes
    board.locator('.board__stream .board-post', has_text='farm box').locator('.board-like').click(); pg.wait_for_timeout(300)
    check(board.locator('.board__stream .board-post', has_text='farm box').locator('.board-like').get_attribute('aria-pressed') == 'true', '♡ likes')

    # 5 Who can post
    me = st(pg, "return s.getCurrentUser().id")
    member = st(pg, f"const sp=s.getSpace('juniper'); return sp.memberIds.find(id => perm.roleOf(sp,id)==='member')")
    check(st(pg, f"return perm.can(s.getSpace('juniper'), '{member}', 'postAnnouncements')") is True, 'members can post by default')
    pg.evaluate(f"location.hash='#module-{bid}'"); pg.wait_for_timeout(800)
    pg.get_by_label('Who can post').select_option('admin'); pg.wait_for_timeout(300)
    check(st(pg, f"return perm.can(s.getSpace('juniper'), '{member}', 'postAnnouncements')") is False, 'an admin switches it to admins only: members can’t post')
    check(st(pg, f"return perm.can(s.getSpace('juniper'), '{me}', 'postAnnouncements')") is True, 'admins still can')
    pg.get_by_label('Who can post').select_option('member'); pg.wait_for_timeout(300)

    # 6 Feed and widget
    st(pg, f"const m=s.getModule('{bid}'); const data=structuredClone(m.data); data.posts.push(d.createPost({{authorId:'{member}', title:'', body:'Spare bike lock by the door if anyone needs it'}})); s.updateModuleData('{bid}', data); return 1")
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(1000)
    feed = pg.locator('.feed-item--board', has_text='Spare bike lock')
    check(feed.count() >= 1, 'a board post shows in members’ Feeds')
    check(pg.locator('.feed-item--board', has_text='Just for the board').count() == 0, 'a post kept off the Feed doesn’t')
    phone = b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    phone.on('pageerror', lambda e: errs.append(str(e)))
    phone.goto('http://localhost:8765/index.html#space-juniper'); phone.wait_for_timeout(1200)
    w = phone.locator('.mwidget', has_text='Board').first
    check(w.count() == 1 and 'pinned' in w.inner_text().lower(), f'the board’s widget shows the pinned post ({" ".join(w.inner_text().split())[:50]!r})')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
