from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#space-mutualaid'"); pg.wait_for_timeout(900)
    card=pg.locator('[data-module-id="aid-shifts"]')
    print('card days:', card.locator('.shifts__date').all_inner_texts(), '| open:', card.locator('.shifts__open').inner_text())
    card.scroll_into_view_if_needed(); card.screenshot(path='test-output/shifts-card.png')
    pg.evaluate("location.hash='#module-aid-shifts'"); pg.wait_for_timeout(800)
    v=pg.locator('#module-page-view')
    row=v.locator('.shifts__row', has_text='Cleanup').last
    row.get_by_role('button', name='Take it').click(); pg.wait_for_timeout(200)
    print('took cleanup:', v.locator('.shifts__row.is-mine').count())
    v.get_by_role('button', name='Mine').click(); print('mine rows:', v.locator('.shifts__row').count()); v.get_by_role('button', name='Mine').click()
    # drop today's doors (short notice) -> organizers notified
    v.locator('.shifts__row', has_text='Doors').first.get_by_role('button', name='Drop').click(); pg.wait_for_timeout(200)
    print('grace notified:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getState().notifications.filter(n=>n.kind==='shift').map(n=>n.recipientId)})()"))
    # add a shift
    v.get_by_role('button', name='Add a shift').click(); pg.wait_for_timeout(100)
    v.get_by_label('What the shift is').fill('Intake desk'); v.get_by_role('button', name='Add', exact=True).click(); pg.wait_for_timeout(200)
    print('intake added:', v.locator('.shifts__row', has_text='Intake desk').count())
    v.get_by_role('button', name='Copy to next week').click(); pg.wait_for_timeout(200)
    print('total shifts:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getModule('aid-shifts').data.shifts.length})()"))
    pg.screenshot(path='test-output/shifts-page.png')
    pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(800)
    print('dashboard shift rows:', pg.locator('.dashboard__row.is-shift').count(), pg.locator('.dashboard__row.is-shift').first.inner_text().replace('\n',' | ') if pg.locator('.dashboard__row.is-shift').count() else '')
    print('myUpcoming shifts:', pg.evaluate("(async()=>{const d=await import('./js/modules/dashboard/dashboard-data.js'); const s=await import('./js/state/store.js'); return d.myUpcoming(s.getCurrentUser()).filter(o=>o.role==='shift').map(o=>o.date+' '+o.event.title)})()"))
    print('errors', errs)
