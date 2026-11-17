from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300,400]:
        pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
        pg.evaluate("location.hash='#event-aid-ev-0'"); pg.wait_for_timeout(800)
        c=pg.locator('.recap-card'); print(vw,'recap card:', c.count(), c.inner_text().replace('\n',' | ')[:90] if c.count() else '')
        c.get_by_role('button', name='Post a recap').click(); pg.wait_for_timeout(400)
        r=pg.locator('.recap'); print(' photos:', r.locator('.recap__photo').count(), '| caption:', r.locator('textarea').input_value()[:70], '| connect:', r.locator('.recap__connect').inner_text()[:70] if r.locator('.recap__connect').count() else None, '| where:', r.locator('.recap__where').inner_text()[:60])
        r.locator('.recap__photo input').nth(1).uncheck(); pg.wait_for_timeout(100)
        pg.screenshot(path=f'test-output/rc_{vw}.png')
        r.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(600)
        print(' card now:', pg.locator('.recap-card').inner_text()[:60])
        res=pg.evaluate("""(async()=>{const s=await import('./js/state/store.js'); const me=s.getCurrentUser(); const b=s.getBlogOf(me.id); for(const m of b.modules){const p=(m.data?.posts||[]).find(x=>x.recapOf==='aid-ev-0'); if(p) return [m.title,p.media.length,JSON.stringify(p.attachments),p.text.slice(0,40)]} return null})()""")
        print(' posted:', res)
        # reminders: going to an event sets day-before; change it
        pg.evaluate("location.hash='#event-aid-ev-2'"); pg.wait_for_timeout(700)
        pg.locator('.event-page__rsvp').get_by_role('button').first.click(); pg.wait_for_timeout(500)
        rm=pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return JSON.stringify((s.getCurrentUser().reminders||[]).map(r=>[r.refId,r.lead,new Date(r.at).toString().slice(0,21)]))})()")
        print(' reminders after going:', rm, '| bell:', pg.locator('.event-page__remind .choice-menu__button').inner_text() if pg.locator('.event-page__remind').count() else 'none')
        pg.locator('.event-page__remind .choice-menu__button').click(); pg.locator('.event-page__remind .choice-menu__option').nth(2).click(); pg.wait_for_timeout(300)
        print(' bell after:', pg.locator('.event-page__remind .choice-menu__button').inner_text())
        # make a reminder due now and run tick
        pg.evaluate("""(async()=>{const s=await import('./js/state/store.js'); s.changeState(st=>{const m=st.members.find(x=>x.id==='m-leo'); m.reminders[0].at=Date.now()-1000;}); const r=await import('./js/state/reminders.js'); r.startReminders();})()"""); pg.wait_for_timeout(500)
        print(' notification:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); const n=s.getState().notifications.find(n=>n.kind==='reminder'); return n&&n.text})()"))
        # task reminder field
        pg.evaluate("location.hash='#module-house-todo'"); pg.wait_for_timeout(700)
        rows=pg.locator('#module-page-view .todo-row, #module-page-view [class*=todo-task]')
        print(' todo rows:', rows.count())
    print('errors', errs)
