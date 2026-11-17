# A blog's Edit button has no menu: it goes straight into edit mode. There, click the title or the About to change it.
# Groups keep the Edit menu.
from playwright.sync_api import sync_playwright
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(900)
    hdr=pg.locator('#space-header, .space-header').first
    edit=hdr.get_by_role('button', name='Edit', exact=True)
    print('Edit button:', edit.count(), '| has a menu:', edit.get_attribute('aria-haspopup'))
    if edit.get_attribute('aria-haspopup'): errs.append('blog Edit still has a menu')
    edit.click(); pg.wait_for_timeout(500)
    print('in edit mode:', pg.evaluate("document.querySelector('.module-grid--editing')!==null"), '| menu shown:', pg.locator('[role=menu]:visible').count())
    name=hdr.locator('h1.space-header__name'); print('title clickable:', name.count())
    name.click(); pg.wait_for_timeout(200)
    box=hdr.locator('input:visible').first; box.fill('Leo rides bikes'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    print('renamed:', st(pg, "return s.getSpace('blog-leo')?.name ?? s.getState().spaces.find(x=>x.kind==='blog'&&x.memberIds[0]==='m-leo').name"))
    about=hdr.locator('.blog-about-edit'); print('about clickable:', about.count())
    about.click(); pg.wait_for_timeout(200)
    hdr.locator('.blog-about-edit__input').fill('Bikes, zoning, and porch music.'); hdr.locator('.blog-about-edit__input').press('Enter'); pg.wait_for_timeout(400)
    print('about saved:', st(pg, "return s.getState().spaces.find(x=>x.kind==='blog'&&x.memberIds[0]==='m-leo').description"))
    pg.screenshot(path='test-output/blog-edit-in-place.png')
    # a group keeps its menu
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    print('group Edit has menu:', pg.locator('.space-header').get_by_role('button', name='Edit').first.get_attribute('aria-haspopup'))
    print('errors', errs)
    b.close()
