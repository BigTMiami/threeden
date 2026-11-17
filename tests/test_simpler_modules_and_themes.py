# Simpler: four app themes (an old choice falls back to Daylight); the module list has a "Less common modules" menu at the bottom
# (Gantt chart, Relationship map…); Shared note and Document are one module, Document, on groups, homepages, and blogs.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    st=lambda js: pg.evaluate("async()=>{const s=await import('./js/state/store.js'); const t=await import('./js/ui/themes.js'); const r=await import('./js/modules/registry.js'); "+js+"}")
    print('themes:', st("return t.THEMES.map(x=>x.label)"))
    if st("return t.THEMES.length") != 4: errs.append('should be 4 themes')
    print('an old pick (zine) shows:', st("const m={...s.getMember('m-leo'), theme:'zine'}; return t.themeOf(m)"))
    pg.evaluate("location.hash='#account-look'"); pg.wait_for_timeout(500)
    print('theme cards:', pg.locator('.theme-card').count())
    # the module list
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(600); st("s.setEditMode(true)"); pg.wait_for_timeout(400)
    lib=pg.locator('#module-library')
    print('library visible:', lib.is_visible(), '| buttons:', [x.strip() for x in lib.locator('.library__more').all_inner_texts()])
    rare=lib.locator('.library__more', has_text='Less common')
    rare.click(); pg.wait_for_timeout(150)
    names=lib.locator('#library-rare .library-item__label').all_inner_texts(); print('less common:', names)
    if 'Gantt chart' not in names or 'Relationship map' not in names: errs.append('gantt and relationship map belong in Less common')
    lib.locator('.library__more', has_text='More modules').click(); pg.wait_for_timeout(150)
    more=lib.locator('#library-more .library-item__label').all_inner_texts(); print('more:', more)
    if 'Gantt chart' in more or 'Kanban' in more + names: errs.append('wrong menu')
    basics=lib.locator('.library__list').first.locator('.library-item__label').all_inner_texts(); print('basics:', basics)
    st("s.setEditMode(false)")
    # Document everywhere
    print('document on blogs and groups:', st("return ['group','personal','blog'].map(k=>r.moduleTypesFor(k).some(x=>x.type==='note'))"), '| label:', st("return r.getModuleType('note').label"))
    pg.evaluate("location.hash='#blog-jamal'"); pg.wait_for_timeout(700)
    print('jamal about (visitor):', pg.locator('.note-doc').first.inner_text()[:60].replace('\n',' | '))
    print('errors', errs)
    b.close()
