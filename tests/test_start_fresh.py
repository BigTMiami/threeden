"""Nov 27: Start fresh empties this browser's 3den so Leo can fill it
himself. Edit mode (beside Reset demo) and the sign-in page offer it; it
takes two clicks. Then 3den has no people, groups, events, or posts, nobody
is signed in, and a reload (or a prototype update) doesn't bring samples
back. A new account works everywhere in the empty 3den. "Bring back the
samples" restores them."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js}}})()")
def go(pg, h, wait=900):
    pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(wait)
COUNTS = "const x=s.getState(); return {members:x.members.length, spaces:x.spaces.length, conversations:x.conversations.length, notifications:x.notifications.length, friendships:x.friendships.length, me:x.currentUserId, samples:s.hasSamples()}"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(1000)
    before = st(pg, COUNTS)
    check(before['members'] > 100 and before['samples'], f'starts with the samples ({before["members"]} people)')

    # Edit mode: beside Reset demo, two clicks
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(500)
    btn = pg.locator('.start-fresh', has_text='Start fresh').first
    check(btn.count() == 1, 'edit mode offers Start fresh')
    btn.click(); pg.wait_for_timeout(300)
    check('Click again' in pg.locator('.start-fresh').first.inner_text() and st(pg, 'return s.getState().members.length') == before['members'], 'the first click only asks')
    pg.locator('.start-fresh').first.click(); pg.wait_for_timeout(1200)
    empty = st(pg, COUNTS)
    check(empty == {'members': 0, 'spaces': 0, 'conversations': 0, 'notifications': 0, 'friendships': 0, 'me': None, 'samples': False}, f'the second empties it, nobody signed in ({empty})')
    check(pg.evaluate('location.hash') == '#signup', f'and opens Create your account ({pg.evaluate("location.hash")})')
    pg.screenshot(path='test-output/out/start-fresh-signup.png')

    # A reload, and a prototype update, keep it empty
    pg.reload(); pg.wait_for_timeout(1200)
    check(st(pg, COUNTS) == empty, 'a reload keeps it empty')
    go(pg, '#signin')
    check('This 3den is empty' in pg.locator('main').first.inner_text() and pg.locator('.auth__preview-new').count() == 0, 'the sign-in page says so, and hides the previews (they need the samples)')
    upgraded = st(pg, "const u=await import('./js/state/upgrade.js'); const d=await import('./js/data/demo-state.js'); const old={...s.getState(), dataVersion: 1, demoSeen: []}; return u.upgradeState(old, d.createDemoState).state.members.length")
    check(upgraded == 0, f'a prototype update adds no samples to it ({upgraded})')

    # A new account, everywhere
    go(pg, '#signup')
    f = pg.locator('.auth__form:visible').last
    for label, value in [('Name', 'Leo Fresh'), ('Your name', 'Leo Fresh'), ('Username', 'leofresh'), ('Email', 'leo.fresh@example.com'), ('Password', 'correct-horse-battery')]:
        if f.get_by_label(label, exact=True).count(): f.get_by_label(label, exact=True).first.fill(value)
    f.get_by_role('button', name='Create account', exact=True).click(); pg.wait_for_timeout(3600)
    me = st(pg, "return s.getCurrentUser()?.name")
    check(me == 'Leo Fresh' and st(pg, 'return s.getState().members.length') == 1, f'make an account in the empty 3den ({me})')
    check(pg.locator('.onboarding-tour').count() == 1, 'the tutorial starts for it')
    pg.locator('.onboarding-tour').get_by_role('button', name='Close').click(); pg.wait_for_timeout(300)
    gid = st(pg, "const g=await import('./js/state/groups.js'); return g.createGroup({name:'My First Group', visibility:'public', joining:'invite'}).id")
    pages = ['#', '#feed', '#feed-friends', '#groups', '#groups-explore', '#messages', '#help', '#account', '#week', f'#space-{gid}', f'#settings-{gid}', f'#new-event-{gid}', '#bring', '#blog-leofresh', '#notifications']
    for h_ in pages:
        go(pg, h_, 700)
    check(not errs, f'every main page opens without errors {errs[:3]}')
    pg.screenshot(path='test-output/out/start-fresh-group.png')

    # Bring the samples back
    st(pg, "const a=await import('./js/state/accounts.js'); a.signOut()"); go(pg, '#signin')
    bring = pg.locator('.start-fresh', has_text='Bring back the samples')
    bring.click(); pg.wait_for_timeout(200); bring = pg.locator('.start-fresh').first; bring.click(); pg.wait_for_timeout(1200)
    back = st(pg, COUNTS)
    check(back['samples'] and back['members'] == before['members'], f'Bring back the samples restores them ({back["members"]} people)')
    check(not errs, f'no page errors {errs[:3]}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
