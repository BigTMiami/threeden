"""Nov 20 (evening): the sign-in page's "Preview as a new user" opens each
path signed out, where that person would start, so every step shows: the
page they were sent, making the account, then where they land. No account
is made for you. (It replaced the "first visit" links.) Nov 21: four
previews, one per lane on the onboarding board: group invite, event,
friend's link, and no link."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const a=await import('./js/state/accounts.js'); {js}}})()")

PATHS = [
  # id, first page, button on it, then the sign-up's button
  ('group', '#join-supper24', 'Create an account and join', 'Create account and join'),
  ('event', '#event-band-ev-2', 'Going', None),
  ('friend', '#hi-jamal', 'Create an account', 'Create account and join'),  # signed out: the board's CL
  ('direct', '#welcome', 'Join 3den', 'Create account'),
]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for i, (pid, first, cta, submit) in enumerate(PATHS):
        pg = b.new_page(viewport={'width': 1300, 'height': 1000}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
        st(pg, 'a.signOut()'); pg.evaluate("location.hash='#signin'"); pg.wait_for_timeout(700)
        if i == 0:
            sec = pg.locator('.auth__preview-new')
            check(sec.locator('.auth__preview-path').count() == 4, 'four previews, one per lane on the onboarding board (Nov 21: no “Wants to start a group” or “Found a public page”)')
            check(pg.locator('.auth__first-visits').count() == 0, 'the old first-visit links are folded in')
            pg.screenshot(path='test-output/out/signin-preview.png', full_page=True)
        before = st(pg, 'return s.getState().members.length')
        pg.locator(f'.auth__preview-path[data-preview="{pid}"]').click(); pg.wait_for_timeout(900)
        check(pg.evaluate('location.hash') == first, f'{pid}: opens {first} ({pg.evaluate("location.hash")})')
        check(st(pg, 'return !s.getCurrentUser() || !!s.getCurrentUser().isGuest') and st(pg, 'return s.getState().members.length') == before, f'{pid}: still signed out, no account made')
        if cta:
            pg.locator('main').get_by_role('button', name=cta).first.click() if pid != 'direct' else pg.get_by_role('link', name=cta).first.click()
            pg.wait_for_timeout(800)
        sheet = pg.locator('.signup-sheet:visible, .auth__form:visible').last
        user = f'newperson{i}'
        for label, value in [('Your name', f'New Person {i}'), ('Name', f'New Person {i}'), ('Username', user), ('Email', f'{user}@example.com'), ('Password', 'correct-horse-battery')]:
            box = sheet.get_by_label(label, exact=True)
            if box.count(): box.first.fill(value)
        quick = sheet.get_by_label('Phone number or email')
        if quick.count(): quick.first.fill(f'{user}@example.com')
        pg.screenshot(path=f'test-output/out/preview-{pid}-signup.png')
        btn = sheet.get_by_role('button', name=submit, exact=True) if submit else sheet.locator('button[type=submit]')
        btn.first.click(); pg.wait_for_timeout(1500)
        me = st(pg, 'const m=s.getCurrentUser(); return m && !m.isGuest ? {id:m.id, name:m.name} : null')
        check(bool(me), f'{pid}: made the account by hand ({me})')
        h = pg.evaluate('location.hash')
        if pid == 'group':
            check(st(pg, f"return s.getSpaces().find(x=>x.inviteCode==='supper24').memberIds.includes('{me['id']}')") and h.startswith('#space-'), f'{pid}: joined, on the group ({h})')
        elif pid == 'event':
            check(st(pg, f"const ev=await import('./js/state/events.js'); return ev.findEvent('band-ev-2').event.rsvps['{me['id']}']") == 'going', f'{pid}: going to the event')
        elif pid == 'friend':
            check(st(pg, f"const f=await import('./js/state/friends.js'); return f.friendStatus('{me['id']}', s.getState().members.find(m=>m.username==='jamal').id)") == 'friends', f'{pid}: friends with Jamal')
        elif pid == 'follow':
            check(st(pg, f"return (s.getMember('{me['id']}').following?.spaces||[]).includes('porchlights')"), f'{pid}: follows Porch Lights')
        elif pid == 'organizer':
            check(h == '#new-group', f'{pid}: on Create a group after signing up ({h})')
        else:
            check(h in ('', '#') or h.startswith('#space-'), f'{pid}: on their new homepage ({h})')
        pg.screenshot(path=f'test-output/out/preview-{pid}-after.png')
        check(not errs, f'{pid}: no page errors {errs[:2]}')
        pg.close()
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
