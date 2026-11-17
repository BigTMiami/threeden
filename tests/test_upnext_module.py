from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()')
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(1000)
    print('first module:', pg.locator('.module-frame__title').first.inner_text())
    up=pg.locator('.module-frame').first
    print('next:', up.locator('.upnext__next').inner_text().replace('\n',' | ')[:160])
    print('filters:', up.locator('.upnext__filters button').all_inner_texts())
    print('since:', up.locator('.upnext__since').inner_text() if up.locator('.upnext__since').count() else '-')
    print('items:', [t.split('\n')[0]+' / '+t.split('\n')[1] for t in up.locator('.upnext__item').all_inner_texts()])
    pg.screenshot(path='test-output/upnext-desktop.png')
    up.locator('.upnext__filters button', has_text='Forum').click(); pg.wait_for_timeout(300)
    up=pg.locator('.module-frame').first
    print('forum only:', [t.split('\n')[0] for t in up.locator('.upnext__item').all_inner_texts()])
    up.locator('.upnext__item a').first.click(); pg.wait_for_timeout(800)
    print('opened:', pg.evaluate('location.hash'), '|', pg.locator('.forum-thread-view h2, .forum-page h2').first.inner_text()[:60] if pg.locator('.forum-thread-view h2, .forum-page h2').count() else '')
    # back; check Since line now that we visited before
    pg.evaluate("location.hash='#groups'"); pg.wait_for_timeout(300); pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(800)
    up=pg.locator('.module-frame').first
    print('since after revisit:', up.locator('.upnext__since').inner_text() if up.locator('.upnext__since').count() else '-')
    # post button
    up.locator('.upnext__post').click(); pg.wait_for_timeout(400)
    print('quick create open:', pg.locator('.quick-create__panel').count(), '| where:', pg.locator('.quick-create__where select').first.evaluate('s=>s.options[s.selectedIndex].text') if pg.locator('.quick-create__where select').count() else '')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # groups without events / templates
    gid=pg.evaluate("(async()=>{const g=await import('./js/state/groups.js'); return g.createGroup({name:'Test Club', template:'club'}).id})()")
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(700)
    print('new group modules:', pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); return s.getSpace('{gid}').modules.map(m=>m.type)}})()"))
    print('empty next:', pg.locator('.upnext__next').first.inner_text().replace('\n',' | '))
    # all demo groups have it first
    print('demo groups w/o upnext first:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getState().spaces.filter(x=>x.kind==='group' && x.modules[0]?.type!=='upnext').map(x=>x.id)})()"))
    # phone
    pg.set_viewport_size({'width':390,'height':844}); pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(900)
    pg.screenshot(path='test-output/upnext-phone.png')
    print('phone overflow:', pg.evaluate('document.documentElement.scrollWidth > innerWidth'))
    print('errors', errs[:3])
    b.close()
