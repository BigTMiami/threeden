# Scrolling a page never gets stuck in a module: over a module that can't scroll (or is at its end), or over a
# relationship map on a homepage, the wheel scrolls the page. A module with more to show scrolls right away (no click).
from playwright.sync_api import sync_playwright
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':800}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(1000)
    st(pg, "s.addModule('relationship', 1); s.addModule('chat', 2); return 1"); pg.wait_for_timeout(1000)
    def wheel_over(sel, label):
        el=pg.locator(sel).first
        if not el.count(): print(label, 'not on this page'); return
        el.scroll_into_view_if_needed(); pg.evaluate('scrollBy(0,-120)'); pg.wait_for_timeout(200)
        bb=el.bounding_box(); pg.mouse.move(bb['x']+bb['width']/2, bb['y']+min(bb['height']/2, 150)); pg.wait_for_timeout(100)
        inner=pg.evaluate("""(([x,y])=>{let e=document.elementFromPoint(x,y); while(e&&!e.classList.contains('module-frame')){ if(e.scrollHeight>e.clientHeight+1&&/auto|scroll/.test(getComputedStyle(e).overflowY)) return [e.className.slice(0,30), e.scrollTop, e.scrollHeight-e.clientHeight]; e=e.parentElement} return null})""", [bb['x']+bb['width']/2, bb['y']+min(bb['height']/2,150)])
        y0=pg.evaluate('scrollY')
        # scroll enough to get past any inner scroller's end
        for _ in range(12): pg.mouse.wheel(0, 250); pg.wait_for_timeout(60)
        pg.wait_for_timeout(300)
        moved=pg.evaluate('scrollY')-y0
        print(label, '| inner scroller:', inner, '| page moved:', moved)
        if moved<=0 and pg.evaluate('scrollY + innerHeight < document.documentElement.scrollHeight - 2'): errs.append(f'stuck in {label}')
    wheel_over('.module-frame[data-module-type="relationship"]', 'relationship map')
    wheel_over('.module-frame[data-module-type="chat"]', 'chat')
    wheel_over('.module-frame[data-module-type="announcements"]', 'announcements')
    wheel_over('.module-frame[data-module-type="calendar"]', 'calendar')
    print('errors', errs)
    b.close()
