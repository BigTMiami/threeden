from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#module-aid-requests'"); pg.wait_for_timeout(900)
    pg.locator('.kanban-card:visible').first.click(); pg.wait_for_timeout(400)
    title=pg.locator('.side-panel__title:visible').input_value(); print('card:', title)
    pg.get_by_role('button', name='Add to my to-do list').click(); pg.wait_for_timeout(400)
    print('toast:', pg.locator('.toast').last.inner_text().replace('\n',' | '))
    print('panel:', pg.locator('.kanban-track:visible').inner_text().replace('\n',' | '))
    tasks=st(pg, "const h=s.getPersonalSpace(); const m=h.modules.find(x=>x.type==='todo'); return m.data.tasks.slice(0,2).map(t=>[t.text, t.source?.moduleId, t.assigneeIds])")
    print('my list top:', tasks)
    pg.screenshot(path='test-output/kanban-track.png')
    # on homepage: source tag shows; clicking opens the card
    pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(900)
    tag=pg.locator('.todo-item .source-tag:visible').first
    print('source tag:', tag.inner_text() if tag.count() else 'none')
    tag.click(); pg.wait_for_timeout(800)
    print('opened:', pg.evaluate('location.hash'), '| selected:', pg.locator('.side-panel__title:visible').input_value() if pg.locator('.side-panel__title:visible').count() else '-')
    # remove + undo
    pg.locator('.kanban-track:visible').get_by_role('button', name='Remove').click(); pg.wait_for_timeout(300)
    print('after remove:', pg.locator('.kanban-track:visible').inner_text())
    pg.locator('.toast').last.get_by_role('button', name='Undo').click(); pg.wait_for_timeout(300)
    print('after undo:', pg.locator('.kanban-track:visible').inner_text().replace('\n',' | '))
    # no button on a personal board
    pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(500)
    kid=st(pg, "return s.getPersonalSpace().modules.find(x=>x.type==='kanban')?.id")
    if kid:
        pg.evaluate(f"location.hash='#module-{kid}'"); pg.wait_for_timeout(700); pg.locator('.kanban-card:visible').first.click(); pg.wait_for_timeout(300)
        print('personal board button:', pg.get_by_role('button', name='Add to my to-do list').count())
    # someone with no to-do module gets one
    st(pg, "const h=s.getPersonalSpace(); s.changeState(()=>{ h.modules=h.modules.filter(m=>m.type!=='todo') }, 'layout'); return 1")
    pg.evaluate("location.hash='#module-tenants-doors'"); pg.wait_for_timeout(800); pg.locator('.kanban-card:visible').first.click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Add to my to-do list').click(); pg.wait_for_timeout(300)
    print('made a list:', st(pg, "const m=s.getPersonalSpace().modules.find(x=>x.type==='todo'); return m && [m.title, m.data.tasks.length]"))
    print('errors', errs[:3])
    b.close()
