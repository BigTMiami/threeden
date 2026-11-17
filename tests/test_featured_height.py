# The featured module in Spotlight (and Main and sidebar) grows with its content until someone drags its resize handle;
# then it keeps that height (saved as the layout's featuredRows, not the module's grid size). "Fit to content" in the bar undoes it.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1400,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    st(pg, "s.setEditMode(true); s.setPageLayout('spotlight'); return 1"); pg.wait_for_timeout(700)
    f=pg.locator('.layout-col--center .module-frame').first; mid=f.get_attribute('data-module-id')
    print('featured has a handle:', f.locator('.resize-handle:visible').count(), '| grows:', 'module-frame--grow' in f.get_attribute('class'))
    if not f.locator('.resize-handle:visible').count(): errs.append('no handle on the featured module')
    rows0=st(pg, f"return s.getModule('{mid}').rows")
    hb=f.locator('.resize-handle').bounding_box(); h0=f.bounding_box()['height']
    pg.mouse.move(hb['x']+hb['width']/2, hb['y']+hb['height']/2); pg.mouse.down()
    pg.mouse.move(hb['x']+hb['width']/2, hb['y']+hb['height']/2-200, steps=10); pg.wait_for_timeout(100)
    print('while dragging up: height', round(h0), '->', round(f.bounding_box()['height']), '|', f.locator('.resize-label').inner_text())
    pg.mouse.up(); pg.wait_for_timeout(600)
    f=pg.locator(f'.module-frame[data-module-id="{mid}"]')
    saved=st(pg, "return s.getPageLayout().featuredRows")
    print('saved featuredRows:', saved, '| module rows unchanged:', st(pg, f"return s.getModule('{mid}').rows")==rows0, '| now fixed:', 'module-frame--fixed' in f.get_attribute('class'), '| height', round(f.bounding_box()['height']))
    if not saved: errs.append('featured height not saved')
    if abs(f.bounding_box()['height']-(h0-200))>60: errs.append('height not kept')
    pg.screenshot(path='test-output/featured-height.png')
    # keyboard: one row taller
    f.locator('.resize-handle').focus(); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(400)
    print('ArrowDown:', saved, '->', st(pg, "return s.getPageLayout().featuredRows"))
    if st(pg, "return s.getPageLayout().featuredRows")!=saved+1: errs.append('arrow key did not change it')
    # Main and sidebar keeps it; Fit to content undoes it
    st(pg, "s.setPageLayout('sidebar'); return 1"); pg.wait_for_timeout(600)
    print('sidebar main fixed too:', 'module-frame--fixed' in pg.locator('.layout-col--main .module-frame').first.get_attribute('class'))
    pg.get_by_role('button', name='Fit to content').click(); pg.wait_for_timeout(600)
    print('after Fit to content:', st(pg, "return s.getPageLayout().featuredRows"), '| grows:', 'module-frame--grow' in pg.locator('.layout-col--main .module-frame').first.get_attribute('class'))
    if st(pg, "return s.getPageLayout().featuredRows") is not None: errs.append('Fit to content did not reset')
    st(pg, "s.setPageLayout('grid'); s.setEditMode(false); return 1")
    print('errors', errs)
