from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
def store(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(600)
    # 67, 71, 72 on the pantry event
    pg.evaluate("location.hash='#event-aid-ev-1'"); pg.wait_for_timeout(900)
    g=pg.locator('.event-page__guests'); print('67 friends line:', g.locator('.guest-list__friends').inner_text() if g.locator('.guest-list__friends').count() else None)
    print('   going order:', g.locator('dd').first.locator('.guest-list__name').all_inner_texts(), '| regulars:', g.locator('.guest-list__regular').count())
    print('71 skips title:', pg.locator('.event-page__skips h2').inner_text())
    # 72 Rides were removed Nov 20; so were event sign-ups
    print('72 no rides or sign-ups:', pg.locator('.event-page__rides, .event-page__signups').count() == 0)
    # 68 thanks after an event Leo went to (find a past event he went to)
    eid=store(pg,"const me=s.getCurrentUser().id; const t=new Date().toISOString().slice(0,10); for(const sp of s.getSpaces()) for(const m of sp.modules) for(const e of (m.data?.events||[])) if((e.endDate||e.date)<t && (e.rsvps?.[me]==='going'||e.createdBy===me) && e.repeat!=='weekly') return e.id; return null")
    print('68 past event:', eid)
    pg.evaluate(f"location.hash='#event-{eid}'"); pg.wait_for_timeout(900)
    th=pg.locator('.event-page__thanks'); print('   thanks section:', th.count(), '| options:', th.locator('option').all_inner_texts()[:4])
    if th.count():
        to=th.locator('select').input_value(); th.get_by_label('Your thank-you note').fill('Thanks for organizing!'); th.get_by_role('button', name='Send').click(); pg.wait_for_timeout(300)
        print('   after:', pg.locator('.event-page__thanks').inner_text().replace('\n',' | ')[-60:])
        uname=store(pg,f"return s.getMember('{to}').username"); pg.evaluate(f"location.hash='#blog-{uname}'"); pg.wait_for_timeout(800)
        if pg.locator('.blog-about__toggle').count() and pg.locator('.blog-about').is_hidden(): pg.locator('.blog-about__toggle').click(); pg.wait_for_timeout(200)
        print('   on blog:', pg.locator('.blog-thanks').inner_text().replace('\n',' | ')[:200] if pg.locator('.blog-thanks').count() else None)
    # Grace's blog: seeded thanks + met in person
    pg.evaluate("location.hash='#blog-grace'"); pg.wait_for_timeout(800)
    if pg.locator('.blog-about').is_hidden(): pg.locator('.blog-about__toggle').click(); pg.wait_for_timeout(200)
    print('68 grace thanks:', pg.locator('.blog-thanks__item').count(), '| 74 met line:', pg.locator('.met-in-person').inner_text().replace('\n',' | '))
    pg.locator('.met-in-person__button').click(); pg.wait_for_timeout(200); print('   after vouch:', pg.locator('.met-in-person').inner_text().replace('\n',' | '))
    pg.screenshot(path='test-output/blog-grace.png')
    # 69 week page
    pg.evaluate("location.hash='#week'"); pg.wait_for_timeout(800)
    print('69 week:', pg.locator('.week').inner_text().replace('\n',' | ')[:400])
    pg.screenshot(path='test-output/week.png', full_page=True)
    print('   card on a Sunday:', pg.evaluate("(async()=>{const RealDate=Date; const w=await import('./js/feed/week-page.js'); const s=await import('./js/state/store.js'); const orig=Date.prototype.getDay; Date.prototype.getDay=function(){return 0}; const c=w.renderWeekCard(s.getCurrentUser()); Date.prototype.getDay=orig; return c?c.innerText:null})()"))
    # 70 help with: directory as organizer
    gid='juniper'
    print('70 group:', gid); pg.evaluate(f"location.hash='#directory-{gid}'"); pg.wait_for_timeout(800)
    print('   help chips:', pg.locator('.directory__help').all_inner_texts()[:3])
    cm=pg.locator('.directory .choice-menu__button'); print('   organizer filter:', cm.count())
    if cm.count():
        cm.click(); pg.locator('.choice-menu__option').nth(1).click(); pg.wait_for_timeout(200); print('   filtered to:', cm.inner_text().replace('\n',''), pg.locator('.directory__card').count())
    pg.locator('.directory__search').fill('spanish'); pg.wait_for_timeout(200)
    # 76 health
    gid='porchlights'
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(800)
    print('76 nudge:', pg.locator('.health-nudge').inner_text() if pg.locator('.health-nudge').count() else None)
    pg.evaluate(f"location.hash='#settings-{gid}--health'"); pg.wait_for_timeout(800)
    print('   health:', pg.locator('.settings-page__body').inner_text().replace('\n',' | ')[:400])
    pg.screenshot(path='test-output/health.png', full_page=True)
    # account profile help field
    pg.evaluate("location.hash='#account-profile'"); pg.wait_for_timeout(600)
    print('70 profile field:', pg.get_by_label('I can help with').input_value())
    print('errors', errs); b.close()
