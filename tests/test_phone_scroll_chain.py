from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)
    errs=[]
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear(); localStorage.setItem('3den.phone-homepage-layout','list')"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    pg.evaluate("window.scrollTo(0, 400)"); pg.wait_for_timeout(200)
    cdp=ctx.new_cdp_session(pg)
    def drag(x,y,dy):
        b4=pg.evaluate('scrollY')
        cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        steps=12
        for i in range(1,steps+1):
            cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y+dy*i/steps}]}); pg.wait_for_timeout(16)
        cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(600)
        return b4, pg.evaluate('scrollY')
    find="""()=>{const b=[...document.querySelectorAll('.module-frame__body')].find(b=>b.scrollHeight>b.clientHeight+20); if(!b) return null; window.scrollTo(0, Math.max(0, window.scrollY + b.getBoundingClientRect().top - 220)); b.scrollTop=0; b.id='tb'; const r=b.getBoundingClientRect(); return [r.left+r.width/2, r.top+40, b.scrollHeight-b.clientHeight]}"""
    t=pg.evaluate(find)
    for sp in ['tenants', 'porchlights', 'mutualaid']:  # the first sample page with a module that scrolls (a wider grid gap made Juniper's fit)
        if t: break
        pg.evaluate(f"location.hash='#space-{sp}'"); pg.wait_for_timeout(900); pg.evaluate("window.scrollTo(0, 400)"); pg.wait_for_timeout(200); t=pg.evaluate(find)
    print('module', t)
    r=drag(int(t[0]), int(t[1]), 200); print('finger down inside module at top: page', r, '| chained:', r[1] < r[0], '| module top', pg.evaluate('tb.scrollTop'))
    pg.evaluate('window.scrollTo(0, 100)'); pg.evaluate('tb.scrollTop=tb.scrollHeight'); pg.wait_for_timeout(200)
    t=pg.evaluate("(()=>{const r=tb.getBoundingClientRect(); return [r.left+r.width/2, Math.min(r.bottom-40, 800)]})()")
    r=drag(int(t[0]), int(t[1]), -200); print('finger up inside module at bottom: page', r, '| chained:', r[1] > r[0])
    print('errors', errs[:3])
    b.close()
