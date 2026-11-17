from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def store(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    # 56: from a group page, + → Post defaults to that group
    pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(700)
    pg.evaluate("(async()=>{const q=await import('./js/editor/quick-create.js'); q.openQuickCreate()})()"); pg.wait_for_timeout(200)
    qc=pg.locator('.quick-create')
    print('56 tabs:', [t for t in qc.locator('[role=tab]').all_inner_texts()], '| post to:', qc.locator('select option:checked').inner_text())
    qc.locator('textarea').fill('Rehearsal moved to Thursday this week'); qc.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(300)
    print('   posted in porch lights:', store(pg, "return s.getSpaces().find(x=>x.id==='porchlights').modules.some(m=>(m.data?.posts||[]).some(p=>(p.text||p.title||'').startsWith('Rehearsal moved')))"))
    # 61 event via +
    pg.evaluate("(async()=>{const q=await import('./js/editor/quick-create.js'); q.openQuickCreate()})()"); qc.get_by_role('tab', name='Event').click()
    qc.get_by_label('Describe the event').fill('Potluck next Sat 6pm at Grace’s'); pg.wait_for_timeout(100)
    print('61 reading:', qc.locator('.quick-create__reading').inner_text())
    qc.get_by_role('button', name='Add', exact=True).click(); pg.wait_for_timeout(700)
    print('   event page:', pg.evaluate('location.hash'), '|', pg.locator('.event-page__title').inner_text())
    # task
    pg.evaluate("(async()=>{const q=await import('./js/editor/quick-create.js'); q.openQuickCreate()})()"); qc.get_by_role('tab', name='Task').click()
    qc.get_by_label('The task').fill('Bring extension cords'); qc.get_by_role('button', name='Add', exact=True).click(); pg.wait_for_timeout(300)
    print('56 task added:', store(pg, "return s.getSpaces().flatMap(x=>x.modules).some(m=>(m.data?.tasks||[]).some(t=>t.text==='Bring extension cords'))"))
    # message
    pg.evaluate("(async()=>{const q=await import('./js/editor/quick-create.js'); q.openQuickCreate()})()"); qc.get_by_role('tab', name='Message').click()
    qc.get_by_label('To', exact=True).fill('Jamal Brooks'); pg.keyboard.press('Enter'); qc.get_by_label('Message').fill('See you Thursday'); qc.get_by_role('button', name='Send').click(); pg.wait_for_timeout(500)
    print('56 message →', pg.evaluate('location.hash'))
    # 57: plan an event from tenants → host and usual time
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(500); pg.evaluate("location.hash='#new-event'"); pg.wait_for_timeout(600)
    v=pg.locator('#settings-view')
    v.get_by_label('Describe it in a few words').fill('Rent strike teach-in'); v.get_by_label('Describe it in a few words').press('Enter'); pg.wait_for_timeout(200)
    print('61 note:', v.locator('.new-event__quick-note').inner_text())
    v.get_by_role('button', name='Next').click(); pg.wait_for_timeout(200)
    print('57 hint:', v.locator('.settings-field__hint').first.inner_text())
    for _ in range(3): v.get_by_role('button', name='Next').click(); pg.wait_for_timeout(150)
    print('57 host:', v.get_by_label('Hosted by').locator('option:checked').inner_text(), '| who:', [t.split('\n')[0] for t in v.locator('.settings-choice').all_inner_texts()])
    v.get_by_role('button', name='Next').click(); pg.wait_for_timeout(150)
    v.get_by_role('button', name='Create').first.click(); pg.wait_for_timeout(700)
    ev=pg.evaluate('location.hash').replace('#event-','')
    print('57 created in tenants calendar:', store(pg, f"return !!s.getModule('tenants-calendar').data.events.find(e=>e.id==='{ev}')"), '| tags:', store(pg, f"return s.getModule('tenants-calendar').data.events.find(e=>e.id==='{ev}')?.tags"))
    # 77 bundle
    pg.evaluate("location.hash='#new-event-tenants'"); pg.wait_for_timeout(600)
    v.locator('.new-event__bundle', has_text='Monthly meeting').click(); pg.wait_for_timeout(150)
    for _ in range(5): v.get_by_role('button', name='Next').click(); pg.wait_for_timeout(120)
    v.get_by_role('button', name='Create').first.click(); pg.wait_for_timeout(700)
    ev=pg.evaluate('location.hash').replace('#event-','')
    print('77 bundle event:', store(pg, f"const e=s.getModule('tenants-calendar').data.events.find(e=>e.id==='{ev}'); return [e?.repeat, (e?.signups||[]).map(x=>x.label), Object.keys(e?.minutes||{{}}).length]"))
    pg.set_viewport_size({'width':390,'height':844}); pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(700); pg.screenshot(path='test-output/plus-phone.png')
    for hsh in ['#feed', '#groups', '#space-porchlights']:
        pg.evaluate(f"location.hash='{hsh}'"); pg.wait_for_timeout(500)
        print('+ (phone float) shown on', hsh, pg.locator('.quick-create__button--float').is_visible())
    print('errors', errs)
