# Upcoming events' full page shows your calendar beside the list: a month with a dot on days with events (filled where you're
# going or hosting); click a day to see just that day, "Show all" to go back; ‹ › change the month. Phones: calendar on top, no overflow.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    mid=st(pg, "const sp=s.getState().spaces.find(x=>x.kind==='personal'&&x.memberIds[0]===s.getCurrentUser().id); let m=sp.modules.find(m=>m.type==='events'); if(!m){ location.hash='#space-'+sp.id; } return m?m.id:null")
    if not mid:
        pg.wait_for_timeout(600); mid=st(pg, "return s.addModule('events', 0).id")
    pg.evaluate(f"location.hash='#module-{mid}'"); pg.wait_for_timeout(900)
    cal=pg.locator('.upcoming-cal')
    days=cal.locator('.upcoming-cal__day'); dots=cal.locator('.upcoming-cal__day .upcoming-cal__dot'); mine=cal.locator('.upcoming-cal__day .upcoming-cal__dot.is-mine')
    print('calendar:', cal.count(), '| month:', cal.locator('.upcoming-cal__month').inner_text(), '| days:', days.count(), '| days with events:', dots.count(), '| going/hosting:', mine.count())
    if not cal.count() or days.count()!=42: errs.append('no calendar')
    if dots.count():
        day=cal.locator('.upcoming-cal__day.has-events').first; label=day.get_attribute('aria-label'); day.click(); pg.wait_for_timeout(300)
        print('picked:', label[:70], '| list header:', pg.locator('.upcoming-page__day strong').inner_text(), '| rows:', pg.locator('.upcoming-page__list .upcoming__event').count())
        if not pg.locator('.upcoming-page__list .upcoming__event').count(): errs.append('picked day shows no events')
        pg.screenshot(path='test-output/events-page-calendar.png')
        pg.get_by_role('button', name='Show all').click(); pg.wait_for_timeout(200); print('show all rows:', pg.locator('.upcoming-page__list .upcoming__event').count())
    m0=cal.locator('.upcoming-cal__month').inner_text(); cal.get_by_role('button', name='Next month').click(); print('next month:', m0, '->', cal.locator('.upcoming-cal__month').inner_text())
    # open an event: calendar stays
    pg.locator('.upcoming-page__list .upcoming__event').first.click(); pg.wait_for_timeout(300)
    print('details open, calendar still there:', pg.locator('.upcoming-page__side:not([hidden])').count(), cal.count())
    pg.set_viewport_size({'width':390,'height':844}); pg.wait_for_timeout(400)
    print('phone overflow:', pg.evaluate('document.documentElement.scrollWidth>innerWidth'), '| calendar above list:', pg.evaluate("document.querySelector('.upcoming-cal').getBoundingClientRect().top < document.querySelector('.upcoming-page__list').getBoundingClientRect().top"))
    pg.screenshot(path='test-output/events-page-calendar-phone.png')
    print('errors', errs)
    b.close()
