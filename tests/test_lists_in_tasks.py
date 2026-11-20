"""
Lists folded into Tasks (Nov 20).

1. The module library has no List module; Tasks says it does shared lists too.
2. The demo's lists (Groceries in 14 Juniper Lane) are Tasks modules on the Lists view, with
   their items, sections, and claims; the card works (add an item).
3. A Tasks module's full page switches between Tasks, Board, and Lists; the choice saves, and the
   tasks and the lists live side by side.
4. An older save (version 71) with a List module and a vault List file loads as Tasks on the Lists
   view, keeping its items.
5. The vault's New → More menu has no List.
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
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js}}})()")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    # 1
    lib = pg.evaluate("(async()=>{const r=await import('./js/modules/registry.js'); return r.getAvailableModuleTypes ? r.getAvailableModuleTypes().map(t=>t.type) : null})()")
    if lib is None:
        lib = pg.evaluate("(async()=>{const r=await import('./js/modules/registry.js'); return Object.values(r).flatMap(v => Array.isArray(v) ? v : []).filter(t=>t && t.available).map(t=>t.type)})()")
    check('grocery' not in lib and 'todo' in lib, f'the library offers Tasks, not List ({len(lib)} types)')

    # 2
    m = st(pg, "return s.getModule('house-grocery')")
    check(m['type'] == 'todo' and m['data']['view'] == 'lists' and len(m['data']['items']) >= 6, 'the demo’s Groceries is Tasks on its Lists view, with its items')
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    card = pg.locator('.module-frame[data-module-id="house-grocery"]')
    card.scroll_into_view_if_needed()
    check(card.locator('.grocery__items li').count() >= 6, 'the card shows the list')
    card.locator('.grocery__add input').fill('2 limes'); card.locator('.grocery__add input').press('Enter'); pg.wait_for_timeout(400)
    items = st(pg, "const L = await import('./js/modules/grocery/grocery-lists.js'); return L.listsOf(s.getModule('house-grocery').data).flatMap(l => l.items).map(i => [i.name, i.quantity, i.category])")
    check(['limes', '2', 'produce'] in items, 'adding an item works (quantity and section guessed)')
    check(st(pg, "return s.getModule('house-grocery').data.tasks") == [], 'the tasks stay alongside')

    # 3
    pg.evaluate("location.hash='#module-house-todo'"); pg.wait_for_timeout(800)
    mv = pg.locator('#module-page-view')
    opts = mv.locator('.tasks-page__view .segmented__option').all_inner_texts()
    check(opts == ['Tasks', 'Board', 'Lists'], f'Tasks, Board, and Lists ({opts})')
    tasks_before = st(pg, "return s.getModule('house-todo').data.tasks.length")
    mv.locator('.segmented__option', has_text='Lists').click(); pg.wait_for_timeout(400)
    check(st(pg, "return s.getModule('house-todo').data.view") == 'lists' and mv.locator('.lists--full').count() == 1, 'Lists saves and shows the lists (with the sidebar)')
    mv.locator('.grocery__add input, .grocery-page__add input').first.fill('Picture hooks'); mv.locator('.grocery__add input, .grocery-page__add input').first.press('Enter'); pg.wait_for_timeout(400)
    data = st(pg, "return s.getModule('house-todo').data")
    names = [i['name'] for l in (data.get('lists') or [{'items': data.get('items', [])}]) for i in l['items']]
    check('Picture hooks' in names and len(data['tasks']) == tasks_before, 'a list item saves, and the tasks are untouched')
    pg.screenshot(path='test-output/out/tasks-lists-view.png')
    mv.locator('.segmented__option', has_text='Tasks').click(); pg.wait_for_timeout(400)
    check(mv.locator('.todo-page__add').count() >= 1 and st(pg, "return s.getModule('house-todo').data.view") == 'list', 'back to Tasks')

    # 5
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(700)
    v = pg.locator('.module-frame', has=pg.locator('.vault__toolbar')).first; v.scroll_into_view_if_needed()
    v.get_by_role('button', name='New').click(); pg.wait_for_timeout(200)
    if v.locator('.vault__menu-more-toggle').count():
        v.locator('.vault__menu-more-toggle').click(); pg.wait_for_timeout(150)
    labels = v.locator('.vault__menu-label').all_inner_texts()
    check('List' not in labels and 'Tasks' in labels, f'the vault’s New menu has no List ({labels})')

    # 4: an older save (version 71) through the upgrade
    res = pg.evaluate("""(async()=>{
      const s = await import('./js/state/store.js'); const up = await import('./js/state/upgrade.js');
      const old = structuredClone(s.getState()); old.dataVersion = 71;
      const sp = old.spaces.find(x => x.id === 'juniper');
      const list = sp.modules.find(m => m.id === 'house-grocery');
      list.type = 'grocery'; list.data = { items: [{ id: 'x0', name: 'Limes', bought: false }], history: [] };
      sp.modules.find(m => m.type === 'vault').data.items.push({ id: 'old-list', kind: 'module', moduleType: 'grocery', name: 'Camping list', parentId: null, createdBy: 'm-leo', createdAt: 1, updatedAt: 1, data: { items: [{ id: 'x1', name: 'Tent', bought: false }], history: [] } });
      const { state } = up.upgradeState(old, () => structuredClone(s.getState()));
      const nsp = state.spaces.find(x => x.id === 'juniper');
      return { module: nsp.modules.find(m => m.id === 'house-grocery'), file: nsp.modules.find(m => m.type === 'vault').data.items.find(i => i.id === 'old-list') };
    })()""")
    m, f = res['module'], res['file']
    check(m['type'] == 'todo' and m['data']['view'] == 'lists' and m['data']['items'][0]['name'] == 'Limes' and m['data']['tasks'] == [], 'an older save’s List module loads as Tasks on Lists, items kept')
    check(f['moduleType'] == 'todo' and f['data']['view'] == 'lists' and f['data']['items'][0]['name'] == 'Tent', 'and a vault List file becomes a Tasks file on Lists')

    check(not errs, f'no page errors {errs[:2]}')
    b.close()

print('\n', 'ALL PASS' if not fails else f'{len(fails)} FAILED: {fails}')
