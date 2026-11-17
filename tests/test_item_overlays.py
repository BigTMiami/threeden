# Clicking a task, a list item, or a calendar entry on a module opens it over the page (dimmed behind): changes made there save,
# Esc or × closes it, and "Open in …" goes to the full page.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    # a task
    todo=pg.locator('.module-frame[data-module-type="todo"]').first; tid_mod=todo.get_attribute('data-module-id')
    first=todo.locator('.todo-item__label--button').first; name=first.inner_text().split('\n')[0]
    first.click(); pg.wait_for_timeout(300)
    d=pg.locator('dialog.modal[open]'); print('task overlay:', d.count(), '| title:', d.locator('.item-overlay__title-input').input_value())
    d.locator('textarea').first.fill('Bring the ladder'); d.locator('textarea').first.dispatch_event('change')
    d.locator('.item-overlay__add input').fill('Buy filters'); d.locator('.item-overlay__add input').press('Enter'); pg.wait_for_timeout(300)
    saved=st(pg, f"const t=s.getModule('{tid_mod}').data.tasks.find(x=>x.text==={name!r}); return [t.notes, (t.subtasks||[]).map(x=>x.text)]"); print('saved:', saved)
    if saved[0]!='Bring the ladder' or 'Buy filters' not in saved[1]: errs.append('task changes not saved')
    pg.screenshot(path='test-output/overlay-task.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300); print('Esc closes:', pg.locator('dialog.modal[open]').count()==0)
    # a list item
    lst=pg.locator('.module-frame[data-module-type="grocery"]').first
    lst.locator('.grocery-item__name--button').first.click(); pg.wait_for_timeout(300)
    d=pg.locator('dialog.modal[open]'); iname=d.locator('.item-overlay__title-input').input_value(); print('list overlay:', iname)
    d.get_by_label('Quantity').fill('3'); d.get_by_label('Quantity').dispatch_event('change'); pg.wait_for_timeout(200)
    print('quantity saved:', st(pg, f"const m=s.getModule('{lst.get_attribute('data-module-id')}'); const items=(m.data.lists?m.data.lists[0].items:m.data.items); return items.find(i=>i.name==={iname!r}).quantity"))
    d.get_by_role('button', name='Close').click(); pg.wait_for_timeout(200)
    # a calendar entry
    cal=pg.locator('.module-frame[data-module-type="calendar"]').first
    ev=cal.locator('.calendar-event').first; ev.click(); pg.wait_for_timeout(400)
    d=pg.locator('dialog.modal[open]'); print('event overlay:', d.count(), '|', d.locator('.event-details__title').inner_text() if d.count() else None, '| open-in link:', d.locator('.item-overlay__footer button').inner_text() if d.locator('.item-overlay__footer button').count() else None)
    pg.screenshot(path='test-output/overlay-event.png')
    d.locator('.item-overlay__footer button').click(); pg.wait_for_timeout(500); print('open in calendar →', pg.evaluate('location.hash'))
    print('errors', errs)
    b.close()
