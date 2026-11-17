# On a single task (the pop-up, the to-do full page's panel, a board card's panel): who's on it (faces and names),
# "I'll take it" / Leave, and Assign. Someone assigned by another person stays on it, faded and "waiting", until they answer
# the notification: ✓ accepts (item.acceptedIds), ✕ takes them off and tells whoever assigned them.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const a=await import('./js/state/accounts.js'); {js} }})()")
task=lambda pg, tid: st(pg, f"const t=s.getModule('house-todo').data.tasks.find(x=>x.id==='{tid}'); return [t.assigneeIds, t.acceptedIds ?? null]")
def open_task(pg, text):
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(1000)
    pg.locator('#homepage-view .todo-item__label--button', has_text=text).first.click(); pg.wait_for_timeout(400)
    return pg.locator('.item-overlay--task')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.app-bar', timeout=20000); pg.wait_for_timeout(500)

    # someone else's task: see who's on it, take it
    o=open_task(pg, 'Deep clean the kitchen')
    people=o.locator('.task-people')
    print('preview:', people.locator('.task-people__names').inner_text(), '| faces:', people.locator('.task-people__face').count())
    if 'Theo and Owen are on it' not in people.inner_text(): errs.append('preview of who is on it')
    people.get_by_role('button', name='I’ll take it').click(); pg.wait_for_timeout(300)
    print('after I’ll take it:', o.locator('.task-people__names').inner_text(), '|', task(pg, 'house-task-2'))
    if 'm-leo' not in task(pg, 'house-task-2')[0]: errs.append('take it did not add me')
    o.locator('.task-people__leave').click(); pg.wait_for_timeout(300)
    print('after Leave:', task(pg, 'house-task-2')[0])
    if 'm-leo' in task(pg, 'house-task-2')[0]: errs.append('leave did not remove me')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # an unassigned task: assign Maya and Owen
    o=open_task(pg, 'Fix the sticky back door')
    print('nobody:', o.locator('.task-people__names').inner_text())
    o.locator('.task-people__assign-open').click(); pg.wait_for_timeout(200)
    o.locator('.task-people__assign .member-toggle', has_text='Maya').click(); pg.wait_for_timeout(300)
    o.locator('.task-people__assign .member-toggle', has_text='Owen').click(); pg.wait_for_timeout(300)
    print('assigned:', task(pg, 'house-task-4'), '|', o.locator('.task-people__waiting').inner_text() if o.locator('.task-people__waiting').count() else '-', '| faded faces:', o.locator('.task-people__face.is-waiting').count())
    if task(pg, 'house-task-4')[0]!=['m-maya','m-owen']: errs.append('assigning failed')
    if not o.locator('.task-people__waiting').count(): errs.append('should be waiting on them')
    pg.screenshot(path='test-output/task-people.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # Maya: the notification has ✓ and ✕; she passes
    st(pg, "a.signIn('m-maya'); return 1"); pg.wait_for_timeout(600)
    pg.locator('.notification-bell, [aria-label^="Notifications"]').first.click(); pg.wait_for_timeout(300)
    row=pg.locator('.notifications-menu__answerable', has_text='Fix the sticky back door').first
    print('Maya’s notification:', row.inner_text().replace('\n',' ')[:120], '| ✓', row.locator('.notifications-menu__accept').count(), '✕', row.locator('.notifications-menu__decline').count())
    pg.screenshot(path='test-output/assign-notification.png')
    row.locator('.notifications-menu__decline').click(); pg.wait_for_timeout(400)
    print('after ✕:', task(pg, 'house-task-4'), '| row says:', row.locator('.notifications-menu__answered').inner_text() if row.locator('.notifications-menu__answered').count() else '-')
    if 'm-maya' in task(pg, 'house-task-4')[0]: errs.append('declining should take her off')
    leo_note=st(pg, "return (s.getState().notifications??[]).filter(n=>n.recipientId==='m-leo' && n.kind==='declined').map(n=>n.text)")
    print('Leo hears:', leo_note)
    if not leo_note: errs.append('the assigner was not told')

    # Owen accepts
    pg.keyboard.press('Escape'); pg.mouse.click(5, 300); pg.wait_for_timeout(200)
    st(pg, "a.signIn('m-owen'); return 1"); pg.wait_for_timeout(600)
    pg.locator('.notification-bell, [aria-label^="Notifications"]').first.click(); pg.wait_for_timeout(300)
    row=pg.locator('.notifications-menu__answerable', has_text='Fix the sticky back door').first
    row.locator('.notifications-menu__accept').click(); pg.wait_for_timeout(400)
    print('after Owen ✓:', task(pg, 'house-task-4'))
    if task(pg, 'house-task-4')!=[['m-owen'], ['m-owen']]: errs.append('accepting failed')
    pg.keyboard.press('Escape')

    # the to-do full page's panel has the same thing
    pg.mouse.click(5, 300); pg.wait_for_timeout(200)
    st(pg, "a.signIn('m-leo'); return 1"); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#module-house-todo'"); pg.wait_for_timeout(900)
    pg.locator('#module-page-view').get_by_text('Find last winter’s heating bills').first.click(); pg.wait_for_timeout(400)
    print('full page panel:', pg.locator('.todo-details .task-people__names').inner_text() if pg.locator('.todo-details .task-people').count() else 'none')
    if not pg.locator('.todo-details .task-people').count(): errs.append('no who’s on it on the full page')
    print('errors', errs)
