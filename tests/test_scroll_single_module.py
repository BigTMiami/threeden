# Over a module that can't scroll the way you're going (here: a page with one module, the tenants' forum), the browser scrolls the
# page itself, natively: scroll-flow.js steps in only when something inside the module can still scroll that way.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':800}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.app-bar', timeout=20000); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(800)
    pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); s.changeState(st=>{const sp=st.spaces.find(x=>x.id==='tenants'); sp.modules=sp.modules.filter(m=>m.type==='forum'); sp.modules[0].span=12; sp.modules[0].rows=16;}, 'layout');})()"); pg.wait_for_timeout(1000)
    print('modules on the page:', pg.locator('#homepage-view .module-frame').count())
    pg.evaluate("window.__taken=[]; document.addEventListener('wheel', e=>window.__taken.push(e.defaultPrevented), {passive:true})")
    pg.mouse.move(650, 600); y0=pg.evaluate('scrollY')
    for _ in range(20): pg.mouse.wheel(0, 15)
    pg.wait_for_timeout(400); y1=pg.evaluate('scrollY'); taken=sum(pg.evaluate('window.__taken'))
    print('page scrolled', y0, '->', y1, '| wheel events the script took over:', taken, 'of', len(pg.evaluate('window.__taken')))
    if y1-y0 < 200: errs.append('the page did not scroll')
    if taken: errs.append('the script took over scrolling it did not need to')
    print('errors', errs)
