from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(600)
    pg.evaluate("location.hash='#new-group'"); pg.wait_for_timeout(700)
    print('page:', pg.locator('main').inner_text()[:300].replace('\n',' | '))
    pg.get_by_label('Forum', exact=False).first.check() if pg.locator('.template-choice', has_text='Forum').count() else None
    gid=pg.evaluate("(async()=>{const g=await import('./js/state/groups.js'); const s=await import('./js/state/store.js'); const sp=g.createGroup({name:'Fern Street Forum', template:'forum'}); return sp.id||sp})()")
    print('created:', gid)
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(900)
    print('modules:', [ (m.get_attribute('data-module-type'), m.evaluate('e=>e.style.gridColumn')) for m in pg.locator('.module-frame').all()])
    pg.screenshot(path='test-output/forum-template.png')
    # Groups have no Layout tab any more (Nov 15): the address falls back to General.
    pg.evaluate(f"location.hash='#settings-{gid}--layout'"); pg.wait_for_timeout(700)
    print('no layout tab:', pg.locator('.settings-tabs__tab', has_text='Layout').count()==0)
    print('errors', errs); b.close()
