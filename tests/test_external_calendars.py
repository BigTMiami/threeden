from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
def store(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(700)
    # Saturday pantry clashes with brunch (10-12); rehearsal Wed 19:30 free
    pg.evaluate("location.hash='#event-aid-ev-1'"); pg.wait_for_timeout(800)
    print('pantry:', pg.locator('.event-page__rsvp .availability').inner_text())
    print('   title:', pg.locator('.event-page__rsvp .availability').get_attribute('title'))
    pg.evaluate("location.hash='#event-band-ev-2'"); pg.wait_for_timeout(800)
    print('street fair:', pg.locator('.event-page .availability').first.get_attribute('title'), pg.locator('.event-page .availability').first.inner_text().replace(chr(10),' ') if pg.locator('.event-page .availability').count() else None)
    # feed + explore chips
    pg.evaluate("location.hash='#groups-explore'"); pg.wait_for_timeout(900)
    print('explore chips:', pg.locator('.explore-list .availability').all_inner_texts()[:4])
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(900)
    print('feed chips:', pg.locator('.feed-page .availability').all_inner_texts()[:4])
    # account calendars
    pg.evaluate("location.hash='#account-calendars'"); pg.wait_for_timeout(700)
    print('calendars:', pg.locator('.ext-calendars__row').all_inner_texts())
    pg.get_by_role('button', name='Google Calendar').click(); pg.wait_for_timeout(200)
    print('   steps:', pg.locator('.ext-calendars__connect .settings-field__hint').first.inner_text()[:60])
    pg.get_by_label('Calendar address').fill('https://calendar.google.com/calendar/ical/x/basic.ics'); pg.get_by_role('button', name='Connect', exact=True).click(); pg.wait_for_timeout(1500)
    print('   url error:', pg.locator('.ext-calendars__connect p.form-error').inner_text()[:70])
    # upload a file
    ics='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Choir\r\nDTSTART:20261121T110000\r\nDTEND:20261121T123000\r\nEND:VEVENT\r\nEND:VCALENDAR'
    open('test-output/choir.ics','w').write(ics)
    pg.locator('.ext-calendars__connect input[type=file]').set_input_files('test-output/choir.ics'); pg.wait_for_timeout(500)
    print('   after upload:', pg.locator('.ext-calendars__row').all_inner_texts())
    pg.screenshot(path='test-output/calendars.png', full_page=True)
    # turn off the work calendar → pantry shows choir only
    pg.locator('.ext-calendars__row').first.locator('input[type=checkbox]').uncheck(); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='#event-aid-ev-1'"); pg.wait_for_timeout(800)
    print('pantry now:', pg.locator('.event-page__rsvp .availability').inner_text())
    # remove all → connect link
    store(pg, "const a=await import('./js/state/external-calendars.js'); for (const c of a.calendarsOf(s.getCurrentUser())) a.removeCalendar(s.getCurrentUser().id, c.id)")
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(300); pg.evaluate("location.hash='#event-band-ev-2'"); pg.wait_for_timeout(800)
    print('no calendars:', pg.locator('.event-page .availability').first.inner_text().replace(chr(10),' ') if pg.locator('.event-page .availability').count() else None)
    print('errors', errs); b.close()
