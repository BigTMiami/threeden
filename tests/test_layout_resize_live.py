# In a page layout other than the grid, dragging a module's resize handle changes its height as you drag (like the grid), and the
# new height is kept when you let go. (The featured module's handle: test_featured_height.py.)
from playwright.sync_api import sync_playwright
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1400,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    st(pg, "s.setEditMode(true); s.setPageLayout('spotlight'); return 1"); pg.wait_for_timeout(700)
    print('spotlight middle has a handle:', pg.locator('.layout-col--center .resize-handle:visible').count())
    f=pg.locator('.layout-col--side .module-frame').first; mid=f.get_attribute('data-module-id')
    f.scroll_into_view_if_needed(); h0=f.bounding_box()['height']; rows0=st(pg, f"return s.getModule('{mid}').rows")
    hb=f.locator('.resize-handle').bounding_box()
    pg.mouse.move(hb['x']+hb['width']/2, hb['y']+hb['height']/2); pg.mouse.down()
    pg.mouse.move(hb['x']+hb['width']/2, hb['y']+hb['height']/2+180, steps=10); pg.wait_for_timeout(100)
    hmid=f.bounding_box()['height']; label=f.locator('.resize-label, .module-frame__size').first.inner_text() if f.locator('.resize-label, .module-frame__size').count() else ''
    print('while dragging: height', round(h0), '->', round(hmid), '| label:', label)
    if hmid <= h0 + 100: errs.append('height did not follow the drag')
    pg.mouse.up(); pg.wait_for_timeout(500)
    f=pg.locator(f'.module-frame[data-module-id="{mid}"]')
    print('after letting go: rows', rows0, '->', st(pg, f"return s.getModule('{mid}').rows"), '| height', round(f.bounding_box()['height']))
    print('errors', errs)
    b.close()
