# One wheel stroke over a homepage module flows on: the module scrolls to its end and the rest of the same stroke scrolls the page
# (no dead stop, no second stroke needed). Trackpad-sized steps and mouse-wheel notches both; scrolling back up works the same way.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':800}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(1200)
    info=pg.evaluate("""(()=>{const b=[...document.querySelectorAll('.module-grid .module-frame__body')].find(e=>e.scrollHeight>e.clientHeight+40); if(!b) return null;
      b.id='flowtest'; b.scrollTop=0; window.scrollTo(0, Math.max(0, scrollY + b.getBoundingClientRect().top - 150)); const r=b.getBoundingClientRect(); return [r.x+r.width/2, r.y+Math.min(80, r.height/2), b.scrollHeight-b.clientHeight]})()""")
    print('module with', info and info[2], 'px to scroll')
    pg.wait_for_timeout(200)
    def state(): return pg.evaluate("[document.getElementById('flowtest').scrollTop, scrollY]")
    # one trackpad stroke: many small steps
    pg.mouse.move(info[0], info[1]); s0=state()
    # (a stroke longer than the module's content, so some of it has to go on to the page)
    stroke=info[2]+240; steps=stroke//12
    for _ in range(steps): pg.mouse.wheel(0, 12)
    pg.wait_for_timeout(300); s1=state()
    print(f'trackpad stroke of {steps*12}px: module', s0[0], '->', s1[0], '| page', s0[1], '->', s1[1])
    if not (s1[0] >= info[2]-1 and s1[1]-s0[1] >= steps*12-info[2]-5): errs.append('trackpad stroke did not flow on to the page')
    # one mouse notch burst back up
    pg.evaluate("window.scrollTo(0, Math.max(0, scrollY + document.getElementById('flowtest').getBoundingClientRect().top - 150))"); pg.wait_for_timeout(200)
    r=pg.evaluate("(()=>{const r=document.getElementById('flowtest').getBoundingClientRect(); return [r.x+r.width/2, r.y+40]})()")
    pg.mouse.move(r[0], r[1]); s2=state()
    notches=max(3, (s2[0]+300)//200+1)
    for _ in range(notches): pg.mouse.wheel(0, -200); pg.wait_for_timeout(30)
    pg.wait_for_timeout(900); s3=state()
    print(f'mouse notches up {notches*200}px: module', s2[0], '->', s3[0], '| page', s2[1], '->', s3[1])
    if not (s3[0] <= 1 and s2[1]-s3[1] >= min(s2[1], notches*200-s2[0])-10): errs.append('mouse notches did not flow on to the page')
    print('errors', errs)
    b.close()
