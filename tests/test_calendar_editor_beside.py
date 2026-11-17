# Editing or opening an event on a calendar's full page puts the panel beside the calendar, which shrinks to make room,
# instead of below it (at 900, 1300, and 1500 px wide). On a phone it stays below.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for w in [900, 1300, 1500, 390]:
        pg=b.new_page(viewport={'width':w,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear(); sessionStorage.clear()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
        pg.evaluate("location.hash='#module-band-calendar'"); pg.wait_for_timeout(700)
        mv=pg.locator('#module-page-view')
        if w < 700:
            mv.get_by_role('button', name='Agenda').click(); pg.wait_for_timeout(300)
            mv.locator('.agenda-view__event').first.click(); pg.wait_for_timeout(400)
        else:
            mv.locator('.event-chip').first.click(); pg.wait_for_timeout(400)
        details=pg.evaluate("""()=>{const v=document.querySelector('#module-page-view .calendar-page__view').getBoundingClientRect(); const ed=document.querySelector('#module-page-view .calendar-page__editor').getBoundingClientRect(); return [ed.left >= v.right - 1, Math.abs(ed.top - v.top) < 4]}""")
        e=mv.locator('.event-details').get_by_role('button', name='Edit')
        if e.count(): e.first.click(); pg.wait_for_timeout(400)
        r=pg.evaluate("""()=>{const v=document.querySelector('#module-page-view .calendar-page__view').getBoundingClientRect(); const ed=document.querySelector('#module-page-view .calendar-page__editor').getBoundingClientRect(); return {beside: ed.left >= v.right - 1 && Math.abs(ed.top - v.top) < 4, viewWidth: Math.round(v.width), editorWidth: Math.round(ed.width), editing: Boolean(document.querySelector('#module-page-view .event-editor')), overflowX: document.documentElement.scrollWidth > innerWidth}}""")
        print(w, 'details beside:', details, '| editor:', r)
        if w >= 761 and not (r['beside'] and r['editing']): errs.append(f'{w}: editor should sit beside the calendar')
        if r['overflowX']: errs.append(f'{w}: page scrolls sideways')
        pg.close()
    print('errors', errs)
    b.close()
