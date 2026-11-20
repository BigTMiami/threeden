"""Nov 20: a new account that joins from a group's link gets a "Next step"
card after 15 seconds pointing to its homepage (Home outlined); opening the
homepage shows "Welcome to your homepage!". Got it ends it for good."""
from playwright.sync_api import sync_playwright
import os, time
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const a=await import('./js/state/accounts.js'); const g=await import('./js/state/groups.js'); {js}}})()")
for width, label in [(1300, 'desktop'), (390, 'phone')]:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': width, 'height': 860}, is_mobile=width < 500, has_touch=width < 500); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    gid = st(pg, "return s.getSpaces().find(x=>x.inviteCode==='supper24').id")
    # Leo (not new, didn't arrive from a group): never gets it
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(500)
    # A new account from the invite link
    st(pg, f"a.signOut(); const m=a.createAccount({{name:'Rosa Diaz', username:'rosad{width}', email:'rosa{width}@example.com', password:null, arrival:{{source:'group', spaceId:'{gid}'}}}}); g.addMember('{gid}', m.id, 'member', {{via:'link'}}); location.hash='#space-{gid}'")
    start = time.time(); pg.wait_for_timeout(1200)
    check(pg.locator('.joined-tour').count() == 0, f'{label}: nothing right away')
    pg.wait_for_timeout(int(max(0, 15.6 - (time.time() - start)) * 1000))
    card = pg.locator('.joined-tour')
    check(card.count() == 1 and 'Next step' in card.text_content() and 'Your homepage' in card.text_content(), f'{label}: after 15 seconds, a "Next step" card')
    spot = pg.locator('.tour-spot')
    check(spot.count() == 1 and spot.evaluate("e => e.matches('.app-bar__home, .tab-bar__tab')"), f'{label}: the Home link is outlined')
    pg.screenshot(path=f'test-output/out/joined-tour-next-{label}.png')
    card.get_by_role('button', name='Go to my homepage').click(); pg.wait_for_timeout(900)
    card = pg.locator('.joined-tour')
    check(card.count() == 1 and 'Welcome to your homepage!' in card.text_content() and 'You can manage all your groups and events here!' in card.text_content(), f'{label}: on the homepage, the welcome card')
    check(pg.locator('.tour-spot').count() == 0, f'{label}: the outline is gone')
    check('1 of 3' in card.text_content(), f'{label}: the welcome is step 1 of 3')
    pg.screenshot(path=f'test-output/out/joined-tour-welcome-{label}.png')
    card.get_by_role('button', name='Next').click(); pg.wait_for_timeout(700)
    card = pg.locator('.joined-tour')
    dash = st(pg, "return s.getPersonalSpace().modules.find(m=>m.type==='dashboard').id")
    check('Your dashboard' in card.text_content() and '2 of 3' in card.text_content(), f'{label}: Next: the dashboard')
    check(pg.locator(f'.tour-spot[data-module-id="{dash}"], .tour-spot[data-widget-id="{dash}"]').count() == 1, f'{label}: the Dashboard is outlined')
    pg.screenshot(path=f'test-output/out/joined-tour-dashboard-{label}.png')
    card.get_by_role('button', name='Next').click(); pg.wait_for_timeout(700)
    card = pg.locator('.joined-tour')
    vault = st(pg, "return s.getPersonalSpace().modules.find(m=>m.type==='vault').id")
    check('Your vault' in card.text_content() and '3 of 3' in card.text_content(), f'{label}: Next: the vault')
    check(pg.locator(f'.tour-spot[data-module-id="{vault}"], .tour-spot[data-widget-id="{vault}"]').count() == 1, f'{label}: the vault is outlined')
    pg.screenshot(path=f'test-output/out/joined-tour-vault-{label}.png')
    card.get_by_role('button', name='Back').click(); pg.wait_for_timeout(400)
    check('Your dashboard' in pg.locator('.joined-tour').text_content(), f'{label}: Back goes to the dashboard step')
    pg.locator('.joined-tour').get_by_role('button', name='Next').click(); pg.wait_for_timeout(400)
    pg.locator('.joined-tour').get_by_role('button', name='Done').click(); pg.wait_for_timeout(300)
    check(pg.locator('.joined-tour').count() == 0 and pg.locator('.tour-spot').count() == 0, f'{label}: Done closes it')
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(600)
    pg.evaluate("location.hash='#'"); pg.wait_for_timeout(600)
    check(pg.locator('.joined-tour').count() == 0 and st(pg, "return s.getCurrentUser().onboarding.joinedTour.stage") == 'done', f'{label}: and it doesn’t come back')
    check(not errs, f'{label}: no page errors {errs}')
    b.close()

# Going home before 15 seconds: straight to the welcome; Leo never sees it
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 860})
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    gid = st(pg, "return s.getSpaces().find(x=>x.inviteCode==='supper24').id")
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(16000)
    check(pg.locator('.joined-tour').count() == 0, 'Leo (an older account) never gets it')
    st(pg, f"a.signOut(); const m=a.createAccount({{name:'Sam Ito', username:'samito', email:'sam@example.com', password:null, arrival:{{source:'group', spaceId:'{gid}'}}}}); g.addMember('{gid}', m.id, 'member', {{via:'link'}}); location.hash='#space-{gid}'")
    pg.wait_for_timeout(2000)
    home = st(pg, "return s.getPersonalSpace().id")
    pg.evaluate(f"location.hash='#space-{home}'"); pg.wait_for_timeout(800)
    check('Welcome to your homepage!' in (pg.locator('.joined-tour').text_content() or ''), 'home early: the welcome right away')
    pg.wait_for_timeout(15000)
    check('Next step' not in (pg.locator('.joined-tour').text_content() or ''), 'and no "Next step" after it')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
