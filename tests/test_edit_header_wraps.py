# In edit mode a module's header shows no expand button and no up/down arrows, and wraps instead of hiding its buttons:
# Remove stays visible and clickable even in the narrowest module.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    mid=st(pg, "const m=s.addModule('announcements', 0); s.resizeModule(m.id, {span: 3, rows: 8}); s.setEditMode(true); return m.id"); pg.wait_for_timeout(600)
    f=pg.locator(f'.module-frame[data-module-id="{mid}"]')
    print('narrow width:', round(f.bounding_box()['width']), '| expand:', f.locator('.module-frame__open').count(), '| arrows:', f.locator('[aria-label="Move earlier"], [aria-label="Move later"]').count())
    rm=f.get_by_role('button', name='Remove module'); bb=rm.bounding_box(); fb=f.bounding_box()
    inside = bb and bb['x'] >= fb['x'] and bb['x']+bb['width'] <= fb['x']+fb['width']+1
    print('Remove visible inside the frame:', rm.is_visible(), inside)
    if not inside: errs.append('Remove is cut off')
    pg.screenshot(path='test-output/edit-header-narrow.png')
    rm.click(); pg.wait_for_timeout(400); print('removed:', pg.locator(f'.module-frame[data-module-id="{mid}"]').count()==0)
    print('errors', errs)
    b.close()
