"""
New accounts see no tutorial (Nov 17), and the phone Edit and Layout menus
stay on screen.

1. A direct sign-up, and accounts that arrived from a group or an event,
   land on a homepage with no "We set this up for you" note, no "Next: …"
   line, no Get started card, and the ordinary Dashboard (Coming up, For you,
   Your tasks), with no newcomer focus or tips.
2. On a phone (390 and 320 px wide), the page header's Edit menu and the
   editing bar's Layout menu open fully inside the screen.
"""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
errs = []
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def homepage_has_no_tutorial(pg, who):
    text = pg.locator('#homepage-view').inner_text()
    check(pg.locator('#onboarding-slot').count() == 0, f'{who}: no onboarding slot')
    check(pg.locator('#homepage-view .next-step').count() == 0, f'{who}: no "Next:" line')
    check('We set this up' not in text, f'{who}: no "We set this up" note')
    check(pg.locator('.get-started, .dashboard-tip, .dashboard-focus, .dashboard-steps').count() == 0, f'{who}: no Get started, focus, or tips')
    dash = pg.locator('[data-module-type="dashboard"]')
    check(dash.count() == 1 and all(s in dash.inner_text().upper() for s in ['COMING UP', 'FOR YOU', 'YOUR TASKS']), f'{who}: the ordinary Dashboard')
    check('Show everything' not in text, f'{who}: no "Show everything" switch')


def inside(box, width, label):
    check(box is not None and box['x'] >= 0 and box['x'] + box['width'] <= width, f'{label} inside the screen ({box and round(box["x"])}–{box and round(box["x"] + box["width"])} of {width})')


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html')
    pg.evaluate('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("3den")')
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=30000)

    # 1a. Sign up on the form, with no link behind it.
    pg.evaluate("(async()=>{const a=await import('./js/state/accounts.js'); a.signOut();})()"); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='#signup'"); pg.wait_for_timeout(600)
    pg.get_by_label('Your name').fill('Rosa Diaz'); pg.get_by_label('Username').fill('rosad')
    pg.get_by_label('Email').fill('rosa@example.org'); pg.get_by_label('Password').fill('correct horse battery')
    pg.get_by_role('button', name='Create account').click(); pg.wait_for_timeout(3200)
    homepage_has_no_tutorial(pg, 'direct sign-up')
    pg.screenshot(path='test-output/out/no-tutorial-direct.png')

    # 1b. Accounts that arrived from a group and from an event.
    for name, user, arrival in [('Gr Person', 'grp', {'source': 'group', 'spaceId': 'tenants'}),
                                ('Ev Person', 'evp', {'source': 'event', 'itemId': 'band-ev-2', 'spaceId': 'porchlights'})]:
        pg.evaluate("""async ([name, user, arrival]) => {
          const a = await import('./js/state/accounts.js');
          a.createAccount({ name, username: user, email: user + '@example.com', password: null, arrival });
          location.hash = '#space-me';
        }""", [name, user, arrival])
        pg.reload(); pg.wait_for_timeout(1200)
        homepage_has_no_tutorial(pg, f'arrived from {arrival["source"]}')

    # 2. Phone menus, as Leo.
    pg.evaluate("(async()=>{const a=await import('./js/state/accounts.js'); const s=await import('./js/state/store.js'); a.signIn(s.getState().members.find(m=>m.username==='leo').id);})()")
    for width in [390, 320]:
        pg.set_viewport_size({'width': width, 'height': 800})
        for space in ['#space-me', '#space-juniper']:
            pg.evaluate(f"location.hash='{space}'"); pg.reload(); pg.wait_for_timeout(1200)
            pg.locator('#space-header').get_by_role('button', name='Edit').first.click(); pg.wait_for_timeout(300)
            inside(pg.locator('#space-header [role=menu]').first.bounding_box(), width, f'{width}px {space} Edit menu')
            pg.get_by_role('menuitem', name='Edit this page').click(); pg.wait_for_timeout(500)
            # Groups and homepages have no Layouts menu on phones (Nov 18: widgets are the phone layout).
            if pg.locator('.layout-menu__button:visible').count():
                pg.locator('.layout-menu__button').first.click(); pg.wait_for_timeout(400)
                inside(pg.locator('.layout-menu').bounding_box(), width, f'{width}px {space} Layout menu')
                pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
            pg.get_by_role('button', name='Done editing').first.click(); pg.wait_for_timeout(300)

    # The Layout menu still opens from the button on a computer.
    pg.set_viewport_size({'width': 1300, 'height': 900})
    pg.evaluate("location.hash='#space-juniper'"); pg.reload(); pg.wait_for_timeout(1200)
    pg.locator('#space-header').get_by_role('button', name='Edit').first.click(); pg.wait_for_timeout(300)
    inside(pg.locator('#space-header [role=menu]').first.bounding_box(), 1300, 'desktop Edit menu')
    pg.get_by_role('menuitem', name='Edit this page').click(); pg.wait_for_timeout(500)
    pg.locator('.layout-menu__button').first.click(); pg.wait_for_timeout(400)
    btn = pg.locator('.layout-menu__button').bounding_box(); menu = pg.locator('.layout-menu').bounding_box()
    check(abs(menu['x'] - btn['x']) < 2, 'desktop Layout menu lines up with its button')

    print('page errors:', errs[:3])
    check(not errs, 'no page errors')
    b.close()

print('PASS' if not fails else f'{len(fails)} FAILED')
