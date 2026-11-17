from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def ev(pg, js): return pg.evaluate(f"(async()=>{{const e=await import('./js/state/events.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#event-tenants-ev-3'"); pg.wait_for_timeout(800)
    r=pg.locator('.event-page__rsvp')
    print('going btn:', r.locator('.rsvp__button').first.inner_text(), '| summary:', r.locator('.event-details__muted').first.inner_text())
    r.locator('.rsvp__button--waitlist').click(); pg.wait_for_timeout(300)
    print('after join:', pg.locator('.event-page__rsvp .rsvp__button').first.inner_text())
    print('waitlist:', ev(pg, "return e.findEvent('tenants-ev-3').event.waitlist"))
    print('guests waitlist row:', [t for t in pg.locator('.guest-list dt').all_inner_texts()])
    # owen leaves -> jamal promoted, leo #1
    ev(pg, "const c=await import('./js/modules/calendar/calendar-data.js'); e.updateEvent('tenants-ev-3', (x)=>c.applyRsvp(x,'m-owen','no'))"); pg.wait_for_timeout(300)
    print('after owen leaves:', ev(pg, "const f=e.findEvent('tenants-ev-3').event; return [f.rsvps['m-jamal'], f.waitlist]"))
    print('jamal notified:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getState().notifications.filter(n=>n.recipientId==='m-jamal'&&n.kind==='waitlist').length})()"))
    pg.reload(); pg.wait_for_timeout(800); print('leo now:', pg.locator('.event-page__rsvp .rsvp__button').first.inner_text())
    # cohost on ev-1: Leo not host. Make Leo host of ev-1 via priya? Test host page as Priya isn't simple; test cohost display
    pg.evaluate("location.hash='#event-tenants-ev-1'"); pg.wait_for_timeout(700)
    print('hosted by:', pg.locator('.event-page__facts p').nth(1).inner_text())
    # make Leo cohost, then he sees host tools
    ev(pg, "e.updateEvent('tenants-ev-1', (x)=>{x.cohostIds=[...x.cohostIds,'m-leo']})"); pg.wait_for_timeout(200); pg.reload(); pg.wait_for_timeout(800)
    print('leo notified cohost:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getState().notifications.filter(n=>n.recipientId==='m-leo'&&n.kind==='cohost').length})()"))
    print('host tools:', pg.locator('.event-page__host h2').inner_text(), '| cohosts:', pg.locator('.event-page__cohost-list li').count())
    pg.get_by_label('Add a co-host by username').fill('@iris'); pg.locator('.event-page__host').get_by_role('button', name='Add', exact=True).click(); pg.wait_for_timeout(300)
    print('cohosts now:', ev(pg, "return e.findEvent('tenants-ev-1').event.cohostIds"), '|', pg.locator('.event-page__facts p').nth(1).inner_text())
    # series
    pg.evaluate("location.hash='#event-priya-ev-1'"); pg.wait_for_timeout(700)
    print('series line:', pg.locator('.event-page__facts p', has_text='Every').inner_text())
    pg.get_by_role('link', name='See every date').click(); pg.wait_for_timeout(600)
    print('series:', pg.locator('.series-page__when').inner_text(), '| dates:', pg.locator('.series-page__dates li').count())
    pg.locator('.series-page__answer .rsvp__button--going').click(); pg.wait_for_timeout(300)
    pg.locator('.series-page__date').nth(1).get_by_role('button', name='Skip').click(); pg.wait_for_timeout(300)
    print('skipped 2nd:', pg.locator('.series-page__date.is-skipped').count())
    pg.screenshot(path='test-output/series.png')
    print('errors', errs)
