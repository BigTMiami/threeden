"""Nov 20: the sign-in page's "Preview as a new user": each path makes a
fresh account and lands where that person would, with their tutorial."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const a=await import('./js/state/accounts.js'); {js}}})()")
def to_signin(pg):
    st(pg, "a.signOut()"); pg.wait_for_timeout(300)
    pg.evaluate("sessionStorage.clear(); location.hash='#signin'"); pg.wait_for_timeout(700)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 1000}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    to_signin(pg)
    sec = pg.locator('.auth__preview-new')
    check(sec.count() == 1 and sec.locator('.auth__preview-path').count() == 6, 'six previews on the sign-in page')
    pg.screenshot(path='test-output/out/signin-preview.png', full_page=True)
    seen = set()
    def run(pid):
        to_signin(pg)
        pg.locator(f'.auth__preview-path[data-preview="{pid}"]').click(); pg.wait_for_timeout(900)
        me = st(pg, "const m=s.getCurrentUser(); return {id:m.id, name:m.name, preview:!!m.preview, source:m.onboarding?.source, username:m.username}")
        check(me['preview'] and me['id'] not in seen, f'{pid}: a fresh preview account ({me["name"]}, {me["source"]})')
        seen.add(me['id'])
        return me
    me = run('group')
    check(st(pg, f"return s.getSpaces().find(x=>x.inviteCode==='supper24').memberIds.includes('{me['id']}')"), 'group: joined Juniper Supper Club')
    check(pg.evaluate("location.hash").startswith('#space-'), 'group: on the group’s page')
    me = run('event')
    check(st(pg, f"const ev=await import('./js/state/events.js'); return ev.findEvent('band-ev-2').event.rsvps['{me['id']}']") == 'going', 'event: going to the event')
    me = run('friend')
    check(st(pg, f"const f=await import('./js/state/friends.js'); return f.friendStatus('{me['id']}', s.getState().members.find(m=>m.username==='jamal').id)") == 'friends', 'friend: friends with Jamal')
    me = run('follow')
    check(st(pg, f"return (s.getMember('{me['id']}').following?.spaces||[]).includes('porchlights')"), 'follow: follows Porch Lights')
    me = run('organizer')
    check(pg.evaluate("location.hash") == '#new-group', 'organizer: on Create a group')
    me = run('direct')
    check(pg.evaluate("location.hash") in ('', '#') or 'space-' in pg.evaluate("location.hash"), f'direct: on their new homepage ({pg.evaluate("location.hash")})')
    to_signin(pg)
    names = pg.locator('.auth__demo-account:not(.auth__preview-path) .auth__demo-name').all_inner_texts()
    check(not any('preview' in n for n in names), 'preview accounts stay out of the demo-account list')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
