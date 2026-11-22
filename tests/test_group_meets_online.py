"""Nov 22: "Where it meets" in a group's settings (On Explore) has "Online".
An online group shows on Explore for Near me and Anywhere, and under its
own "Online" in the Where menu, but not inside a neighborhood."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const x=await import('./js/state/explore.js'); {js}}})()")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    # A public group of their own
    gid = st(pg, "const g=await import('./js/state/groups.js'); return g.createGroup({name:'Night Owls Online', visibility:'public', joining:'invite'}).id")
    pg.evaluate(f"location.hash='#settings-{gid}'"); pg.wait_for_timeout(900)
    where = pg.get_by_label('Where it meets')
    if not where.count():
        for tab in pg.locator('[role=tab], .settings-tabs a').all():
            tab.click(); pg.wait_for_timeout(300)
            if pg.get_by_label('Where it meets').count(): break
    where = pg.get_by_label('Where it meets')
    opts = where.locator('option').all_inner_texts()
    check(opts[:2] == ['Not set', 'Online'], f'Where it meets offers Online ({opts[:4]})')
    where.select_option('online'); pg.wait_for_timeout(500)
    check(st(pg, f"return s.getSpace('{gid}').area") == 'online' and pg.get_by_label('Where it meets').input_value() == 'online', 'choosing it saves, and stays chosen')
    pg.screenshot(path='test-output/out/meets-online.png')

    me = "s.getCurrentUser()"
    near = st(pg, f"return x.rankGroups({me}, [s.getSpace('{gid}')], {{where:'near'}}).length")
    online = st(pg, f"return x.rankGroups({me}, [s.getSpace('{gid}')], {{where:'online'}}).map(r=>r.place.name)")
    anywhere = st(pg, f"return x.rankGroups({me}, [s.getSpace('{gid}')], {{where:'anywhere'}}).length")
    hood = st(pg, f"const P=await import('./js/utils/places.js'); return x.rankGroups({me}, [s.getSpace('{gid}')], {{where:P.PLACES[0].id}}).length")
    check(near == 1 and anywhere == 1 and online == ['Online'] and hood == 0, f'Explore: Near me, Online, and Anywhere show it; a neighborhood doesn’t ({near}, {online}, {anywhere}, {hood})')

    # Explore lists groups you're not in: mark one of those as online
    other = st(pg, "const me=s.getCurrentUser(); const g=s.getSpaces().find(x=>x.kind==='group' && x.visibility==='public' && !x.memberIds.includes(me.id)); x.setGroupExplore(g.id, {area:'online'}); return g.name")
    pg.evaluate("location.hash='#groups-explore'"); pg.wait_for_timeout(1000)
    menu = pg.locator('.explore-where__menu').first
    menu.click(); pg.wait_for_timeout(300)
    labels = [t.strip() for t in pg.locator('[role=menuitemradio], [role=option], .menu-picker__item, .dropdown__item').all_inner_texts() if t.strip()]
    check('Online' in labels, f'Explore’s Where menu has Online ({labels})')
    pg.locator('[role=menuitemradio], [role=option], .menu-picker__item, .dropdown__item', has_text='Online').first.click(); pg.wait_for_timeout(700)
    check(other in pg.locator('main').first.inner_text(), f'choosing Online shows {other}')
    check(not errs, f'no page errors {errs[:2]}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
