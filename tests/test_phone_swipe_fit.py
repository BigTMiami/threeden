from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.goto('http://localhost:8765/phone.html'); pg.wait_for_timeout(1500)
    fr=pg.frames[1]
    fr.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(900)
    def m():
        return fr.evaluate("""(()=>{const r=e=>e?e.getBoundingClientRect():null; const f=document.querySelector('.module-grid.is-swiping > .module-frame'); const s=document.querySelector('.module-strip'); const t=document.querySelector('.tab-bar'); const d=document.querySelector('.module-dots');
        return {scrollY, maxScroll: document.documentElement.scrollHeight-innerHeight, frameTop:r(f)?.top, frameBottom:r(f)?.bottom, frameH:r(f)?.height, dots:r(d)?.bottom, strip:r(s)?.top, tab:r(t)?.top, ih:innerHeight, safeB:getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'), safeT:getComputedStyle(document.documentElement).getPropertyValue('--safe-top')}})()""")
    print('top', m())
    fr.evaluate("scrollTo(0, 99999)"); pg.wait_for_timeout(300)
    print('bottom', m())
    pg.screenshot(path='test-output/phone-preview.png')
    # wheel over the module scrolls its contents (no scroll guard in this view)
    fr.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(200)
    box=pg.locator('#app').bounding_box(); pg.mouse.move(box['x']+190, box['y']+500); pg.mouse.wheel(0, 400); pg.wait_for_timeout(400)
    print('inner scrolled:', fr.evaluate("document.querySelector('.module-grid.is-swiping > .module-frame .module-frame__body').scrollTop"))
    for h in ['#space-juniper', '#space-porchlights']:
        fr.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(900); fr.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(200)
        print(h, m())
    print('errors', errs)
    b.close()
