"""Nov 20: after Create a group. No public page: one tab, "Home". Public page:
"Public" (Up next big, Upcoming events to its right) and "Private". Then
"Set up your group's page" (or "...Private page. Only members can see this."):
pick modules (Up next and Board start picked); they go on the members' tab;
then cards show how to move (and on desktop resize) them, in edit mode."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js}}})()")
def create(pg, name, public):
    pg.evaluate("location.hash='#new-group'"); pg.wait_for_timeout(700)
    form = pg.locator('.new-group-form')
    form.get_by_label('Group name').fill(name)
    if public: form.locator('label', has_text='Yes, give it a public page').click()
    form.get_by_role('button', name='Create group').click(); pg.wait_for_timeout(900)
def group(pg, name):
    return st(pg, f"const g=s.getSpaces().find(x=>x.name==='{name}'); return {{tabs:(g.tabs||[]).map(t=>[t.id,t.name,t.visibility||'']), mods:g.modules.map(m=>[m.type,m.tabId||'home',m.span,m.rows])}}")

for width, label in [(1300, 'desktop'), (390, 'phone')]:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': width, 'height': 900}, is_mobile=width < 500, has_touch=width < 500); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    # ── No public page ──
    create(pg, 'Garden Crew', False)
    g = group(pg, 'Garden Crew')
    check(g['tabs'] == [['home', 'Home', '']], f'{label}: one tab, “Home” ({g["tabs"]})')
    sheet = pg.locator('.group-setup')
    check(sheet.count() == 1 and sheet.locator('.group-setup__title').inner_text() == 'Set up your group’s page', f'{label}: “Set up your group’s page”')
    check(sheet.get_by_text('What do you want on your page?').count() == 1, f'{label}: asks what they want')
    picked = [c.inner_text().split('\n')[0] for c in sheet.locator('.group-setup__choice[aria-pressed=true]').all()]
    check(picked == ['Board', 'Up next'] or sorted(picked) == ['Board', 'Up next'], f'{label}: Up next and Board start picked ({picked})')
    n = sheet.locator('.group-setup__choice').count()
    check(n >= 10, f'{label}: every module a private tab offers ({n})')
    sheet.locator('.group-setup__choice', has_text='Calendar').first.click()
    sheet.locator('.group-setup__choice', has_text='Chat').first.click()
    sheet.locator('.group-setup__choice', has_text='Board').first.click()  # unpick
    check(sheet.locator('.group-setup__choice[aria-pressed=true]').count() == 3, f'{label}: tapping picks and unpicks')
    pg.screenshot(path=f'test-output/out/group-setup-pick-{label}.png')
    sheet.get_by_role('button', name='Add to my page').click(); pg.wait_for_timeout(900)
    g = group(pg, 'Garden Crew')
    types = [m[0] for m in g['mods']]
    check(sorted(types) == ['calendar', 'chat', 'upnext'], f'{label}: the picked modules are on the page ({types})')
    check(st(pg, "return s.isEditMode()"), f'{label}: edit mode is on to arrange them')
    tip = pg.locator('.group-setup-tip')
    if width < 500:
        check(tip.count() == 1 and 'Reorder your modules' in tip.inner_text(), f'{label}: a card on reordering')
        check(pg.locator('.mwidget__grip.tour-spot').count() == 1, f'{label}: a grip is outlined')
        pg.screenshot(path=f'test-output/out/group-setup-reorder-{label}.png')
        tip.get_by_role('button', name='Done').click(); pg.wait_for_timeout(400)
    else:
        check(tip.count() == 1 and 'Move your modules' in tip.inner_text(), f'{label}: a card on moving')
        check(pg.locator('.module-frame__drag-strip.tour-spot').count() == 1, f'{label}: a drag strip is outlined')
        pg.screenshot(path=f'test-output/out/group-setup-move-{label}.png')
        tip.get_by_role('button', name='Next').click(); pg.wait_for_timeout(400)
        tip = pg.locator('.group-setup-tip')
        check('Resize them' in tip.inner_text() and pg.locator('.resize-handle.tour-spot').count() == 1, f'{label}: then resizing, with a corner outlined')
        pg.screenshot(path=f'test-output/out/group-setup-resize-{label}.png')
        tip.get_by_role('button', name='Done').click(); pg.wait_for_timeout(400)
    check(pg.locator('.group-setup-tip').count() == 0 and not st(pg, "return s.isEditMode()"), f'{label}: Done ends it and leaves edit mode')

    # ── With a public page ──
    create(pg, 'Porch Band', True)
    g = group(pg, 'Porch Band')
    check(g['tabs'] == [['home', 'Public', 'public'], ['private', 'Private', '']], f'{label}: two tabs, “Public” and “Private” ({g["tabs"]})')
    pub = [m for m in g['mods'] if m[1] == 'home']
    check([m[0] for m in pub] == ['upnext', 'events'] and pub[0][2] == 8 and pub[1][2] == 4, f'{label}: Public starts with Up next big and Upcoming events to its right ({pub})')
    sheet = pg.locator('.group-setup')
    check(sheet.locator('.group-setup__title').inner_text() == 'Set up your group’s Private page' and sheet.get_by_text('Only members can see this.').count() == 1, f'{label}: “Set up your group’s Private page. Only members can see this.”')
    sheet.get_by_role('button', name='Add to my page').click(); pg.wait_for_timeout(900)
    g = group(pg, 'Porch Band')
    priv = sorted(m[0] for m in g['mods'] if m[1] == 'private')
    check(priv == ['announcements', 'upnext'], f'{label}: the picks go on the Private tab ({priv})')
    check(st(pg, "return s.getCurrentTabId()") == 'private', f'{label}: and that tab is open')
    pg.locator('.group-setup-tip').get_by_role('button', name='Close').click(); pg.wait_for_timeout(300)
    check(pg.locator('.group-setup-tip').count() == 0, f'{label}: × ends the tips')
    check(not errs, f'{label}: no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
