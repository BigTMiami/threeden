# To-do and Kanban are one module, Tasks: a List view and a Board view of the same tasks. Old boards became Tasks shown as a board;
# moving a card to the last column ticks it done in the list, and ticking it in the list moves it there.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    st=lambda js: pg.evaluate("async()=>{const s=await import('./js/state/store.js'); const r=await import('./js/modules/registry.js'); "+js+"}")
    print(st("return { kanbanLeft: s.getState().spaces.flatMap(x=>x.modules).filter(m=>m.type==='kanban').length, doors: [s.getModule('tenants-doors').type, s.getModule('tenants-doors').data.view, s.getModule('tenants-doors').data.tasks.length, s.getModule('tenants-doors').data.columns.map(c=>c.title)], label: r.getModuleType('todo').label, noKanban: (()=>{try{r.getModuleType('kanban'); return false}catch{return true}})() }"))
    pg.evaluate("location.hash='#module-tenants-doors'"); pg.wait_for_timeout(900)
    v=pg.locator('#module-page-view')
    print('toggle:', v.locator('.tasks-page__view button').all_inner_texts(), '| active:', v.locator('.tasks-page__view .is-active').inner_text())
    cols=v.locator('section.kanban__column, .kanban__column').count(); print('columns on the board:', cols)
    pg.screenshot(path='test-output/tasks-board.png')
    # move a not-done card into the last column through the data path the board uses
    tid=st("const d=s.getModule('tenants-doors').data; return d.tasks.find(t=>!t.done).id")
    st(f"""const {{ boardContext }} = await import('./js/modules/todo/tasks-board.js'); const {{ createModuleContext }} = await import('./js/editor/module-context.js').catch(()=>({{}}));
       const m=s.getModule('tenants-doors'); const data=structuredClone(m.data); const {{ toBoard, fromBoard }} = await import('./js/modules/todo/tasks-board.js');
       const board=toBoard(data); board.cards.find(c=>c.id==='{tid}').columnId=board.columns.at(-1).id; s.updateModuleData('tenants-doors', fromBoard(data, board)); return true""")
    print('moved to last column → done:', st(f"return s.getModule('tenants-doors').data.tasks.find(t=>t.id==='{tid}').done"))
    # switch to List and untick it
    v.get_by_role('button', name='List').click(); pg.wait_for_timeout(500)
    pg.screenshot(path='test-output/tasks-list.png'); print('list rows:', v.locator('li.todo-row').count(), '| saved view:', st("return s.getModule('tenants-doors').data.view"))
    st(f"const d=structuredClone(s.getModule('tenants-doors').data); d.tasks.find(t=>t.id==='{tid}').done=false; s.updateModuleData('tenants-doors', d)")
    from_list=st(f"""const {{ toBoard }} = await import('./js/modules/todo/tasks-board.js'); const d=s.getModule('tenants-doors').data; const b=toBoard(d); const c=b.cards.find(c=>c.id==='{tid}'); return [c.columnId===b.columns.at(-1).id, c.columnId===b.columns[0].id]""")
    print('unticked → in last column?', from_list[0], '| first column?', from_list[1])
    if from_list[0]: errs.append('unticked task still in Done')
    v.get_by_role('button', name='Board').click(); pg.wait_for_timeout(400)
    # the band's song board, a vault file, opens as Tasks on a board
    print('song board file:', st("const v=s.getState().spaces.flatMap(x=>x.modules).filter(m=>m.type==='vault').flatMap(m=>m.data.items).find(i=>i.id==='band-songboard'); return [v.moduleType, v.data.view, v.data.tasks.length]"))
    # a new Tasks module starts as a list
    print('new Tasks module:', st("const vt=r.getModuleType('todo'); return JSON.stringify(vt.createInitialData())"))
    # the homepage card for a board-view Tasks module draws columns
    pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(900)
    print('my board card columns:', pg.locator('[data-module-id="me-kanban"] section.kanban__column, .kanban__column').count())
    print('errors', errs)
    b.close()
