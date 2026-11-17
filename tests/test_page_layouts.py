# Page layouts: in edit mode, "Layout" in the bottom bar lists 12 layouts; each draws the page's modules without errors.
# Spotlight: one module down the middle (grows with its content), others on both sides; Featured picks it; dragging a module
# onto the middle features it; dragging into a side column places it there. Phones: one stack, the featured module first.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1400,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    st(pg, "s.addModule('forum'); s.addModule('chat'); s.setEditMode(true); return 1"); pg.wait_for_timeout(600)
    bar=pg.locator('.edit-bar')
    bar.locator('.layout-menu__button').click(); pg.wait_for_timeout(200)
    items=pg.locator('.layout-menu__item strong').all_inner_texts(); print('layouts:', len(items), items)
    if len(items)!=12: errs.append('12 layouts')
    shot={'spotlight','channels','timeline','magazine'}
    for name in items:
        if not pg.locator('.layout-menu:not([hidden])').count(): bar.locator('.layout-menu__button').click(); pg.wait_for_timeout(150)
        pg.locator('.layout-menu__item', has_text=name).first.click(); pg.wait_for_timeout(500)
        kind=st(pg, "return s.getPageLayout().kind")
        n=pg.locator('.module-grid .module-frame').count()
        print(f'  {name}: kind={kind} frames={n} button="{bar.locator(".layout-menu__button").inner_text().strip()}"')
        if n==0: errs.append(f'{name}: no modules drawn')
        if kind in shot: pg.screenshot(path=f'test-output/layout-{kind}.png')
    # spotlight in detail
    bar.locator('.layout-menu__button').click(); pg.locator('.layout-menu__item', has_text='Spotlight').click(); pg.wait_for_timeout(500)
    center=pg.locator('.layout-col--center .module-frame'); print('spotlight middle:', center.get_attribute('data-module-type'), '| grows:', 'module-frame--grow' in center.get_attribute('class'))
    sides=[pg.locator('.layout-col--side').nth(i).locator('.module-frame').count() for i in range(2)]; print('sides:', sides)
    sel=bar.locator('.edit-bar__featured select'); opts=sel.locator('option').all_inner_texts(); target=[o for o in opts if o!=sel.locator('option:checked').inner_text()][0]
    sel.select_option(label=target); pg.wait_for_timeout(400)
    print('featured picked:', target, '->', pg.locator('.layout-col--center .module-frame .module-frame__title, .layout-col--center .module-frame__title-input').first.evaluate("e=>e.value||e.textContent"))
    # drag a side module onto the middle
    side=pg.locator('.layout-col--side .module-frame').first; mid=side.get_attribute('data-module-id')
    grip=side.locator('.module-frame__drag-strip').first if side.locator('.module-frame__drag-strip').count() else side.locator('.module-frame__grip').first
    gb=grip.bounding_box(); cb=pg.locator('.layout-col--center').bounding_box()
    pg.mouse.move(gb['x']+gb['width']/2, gb['y']+gb['height']/2); pg.mouse.down(); pg.mouse.move(cb['x']+cb['width']/2, cb['y']+80, steps=12); pg.wait_for_timeout(100); pg.mouse.up(); pg.wait_for_timeout(500)
    print('dragged onto middle, now featured:', st(pg, "return s.getPageLayout().featuredId")==mid)
    if st(pg, "return s.getPageLayout().featuredId")!=mid: errs.append('drag to middle')
    # done editing: empty side columns hide; phone stack
    st(pg, "s.setEditMode(false); return 1"); pg.wait_for_timeout(400)
    pg.screenshot(path='test-output/layout-spotlight-view.png', full_page=True)
    pg.set_viewport_size({'width':390,'height':844}); pg.wait_for_timeout(500)
    first=pg.locator('.module-grid > .module-frame').first.get_attribute('data-module-id')
    print('phone: flat stack:', pg.locator('.module-grid > .layout-row').count()==0, '| featured first:', first==mid, '| overflow:', pg.evaluate('document.documentElement.scrollWidth>innerWidth'))
    print('errors', errs)
    b.close()
