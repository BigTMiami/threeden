from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300,400]:
        ctx=b.new_context(viewport={'width':vw,'height':900}, timezone_id='America/New_York', permissions=['notifications'])
        pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
        # calendar import
        pg.evaluate("location.hash='#module-league-calendar'"); pg.wait_for_timeout(800)
        v=pg.locator('#module-page-view')
        n0=pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getModule('league-calendar').data.events.length})()")
        v.locator('input[type=file][accept*=ics]').set_input_files('tests/sample.ics'); pg.wait_for_timeout(600)
        ev=pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getModule('league-calendar').data.events.slice(-3).map(e=>[e.title,e.date,e.endDate,e.time,e.endTime,e.allDay,e.repeat,e.location,e.kind])})()")
        print(vw,'imported', len(ev), 'new total', n0, '->', n0+3); [print('  ',e) for e in ev]
        v.locator('input[type=file][accept*=ics]').set_input_files('tests/sample.ics'); pg.wait_for_timeout(500)
        print(' toast on re-import:', pg.locator('.toast').last.inner_text()[:70])
        with pg.expect_download() as dl: v.get_by_role('button', name='Download this calendar').click()
        t=open(dl.value.path()).read(); print(' ics out events:', t.count('BEGIN:VEVENT'), 'has league meeting:', 'League meeting\\, all captains' in t)
        # library
        pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(600)
        pg.get_by_role('button', name='Edit').first.click(); pg.wait_for_timeout(300)
        pg.get_by_role('menuitem', name='Edit this page').first.click(); pg.wait_for_timeout(400)
        if vw==400: pg.locator('.space-header__add-modules').click(); pg.wait_for_timeout(300)
        lib=pg.locator('#module-library')
        print(' basics shown:', lib.locator('.library-item:visible').count(), '| more btn:', lib.locator('.library__more').first.inner_text())
        lib.locator('.library__more').first.click(); pg.wait_for_timeout(200)
        print(' after more:', lib.locator('.library-item:visible').count())
        print(' Spreadsheet in the list (should be False):', lib.locator('.library-item', has_text='Spreadsheet').count() > 0)
        lib.locator('.library-item', has_text='Calendar').first.click(); pg.wait_for_timeout(500)  # Tasks is members-only now (Nov 20)
        print(' calendar cards on page:', pg.locator('.module-frame[data-module-type="calendar"]').count())
        pg.screenshot(path=f'test-output/t124a_{vw}.png')
        # member import
        pg.evaluate("location.hash='#settings-porchlights--members'"); pg.wait_for_timeout(700)
        mi=pg.locator('.member-import')
        if mi.count()==0:
            pg.get_by_role('tab', name='Members').click(); pg.wait_for_timeout(400)
        mi=pg.locator('.member-import'); print(' member import:', mi.count())
        mi.locator('textarea').fill('Name,Email\nIris,iris@example.com\nNew Person,ana@example.org\n"Bo",bo@example.org\n@maya @marcus jamal'); mi.get_by_role('button', name='Check the list').click(); pg.wait_for_timeout(300)
        print(' results:', mi.locator('.member-import__results').inner_text().replace('\n',' | ')[:260])
        b1=mi.locator('.member-import__group .button--primary')
        if b1.count(): b1.click(); pg.wait_for_timeout(400); print(' invites now:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return (s.getSpace('porchlights').invites||[]).length})()"))
        # notifications
        pg.evaluate("location.hash='#account-notifications'"); pg.wait_for_timeout(700)
        ns=pg.locator('#notification-settings'); print(' notif section:', ns.count(), '| email radios:', ns.locator('input[name=email-choice]').count())
        ns.locator('input[type=checkbox]').first.check(); pg.wait_for_timeout(500)
        ns=pg.locator('#notification-settings'); print(' push on:', ns.locator('input[type=checkbox]').first.is_checked(), 'scope radios:', ns.locator('input[name=push-scope]').count(), 'test btn:', ns.get_by_role('button', name='Send a test').count())
        if ns.locator('input[name=email-choice]').count():
            ns.get_by_role('button', name='Preview this week’s email').click(); pg.wait_for_timeout(400)
            print(' digest:', pg.locator('.digest__body').inner_text().replace('\n',' | ')[:420])
            pg.screenshot(path=f'test-output/t124b_{vw}.png'); pg.keyboard.press('Escape')
        else: print(' no email on Leo:', ns.inner_text()[-160:])
        ctx.close()
    print('errors', errs)
