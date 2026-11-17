from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1300,'height':900})
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()')
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000); pg.wait_for_timeout(800)
    print('permission:', pg.evaluate('Notification.permission'), '| worker:', pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r && r.active?.scriptURL.split('/').pop())"))
    # offer after Going
    pg.evaluate("location.hash='#event-aid-ev-0'"); pg.wait_for_timeout(700)
    ans=pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); const e=await import('./js/state/events.js'); return e.findEvent('aid-ev-0').event.rsvps?.['m-leo']})()"); print('answer before:', ans)
    if ans=='going': pg.locator('.event-page__rsvp .rsvp__button').first.click(); pg.wait_for_timeout(300)
    pg.locator('.event-page__rsvp .rsvp__button').first.click(); pg.wait_for_timeout(300)
    print('toast:', pg.locator('.toast').last.inner_text().replace('\n',' | '))
    ctx.grant_permissions(['notifications'])
    pg.locator('.toast').last.get_by_role('button', name='Turn on').click(); pg.wait_for_timeout(500)
    print('after turn on:', pg.locator('.toast').last.inner_text().replace('\n',' | '))
    print('prefs:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); const d=s.getCurrentUser().delivery; return [d.push, !!d.askedPush]})()"))
    # second Going: no offer again
    pg.locator('.event-page__rsvp .rsvp__button').first.click(); pg.wait_for_timeout(200); pg.locator('.event-page__rsvp .rsvp__button').first.click(); pg.wait_for_timeout(300)
    print('second toast:', pg.locator('.toast').last.inner_text().replace('\n',' | '))
    # settings
    pg.evaluate("location.hash='#account-notifications'"); pg.wait_for_timeout(700)
    sec=pg.locator('#notification-settings')
    print('quiet:', sec.locator('.notify-quiet').count(), '| groups summary:', sec.locator('.notify-groups summary').inner_text())
    sec.locator('.notify-quiet input[type=checkbox]').check(); pg.wait_for_timeout(300)
    sec=pg.locator('#notification-settings'); sec.locator('input[aria-label="Quiet from"]').fill('21:30'); sec.locator('input[aria-label="Quiet from"]').dispatch_event('change'); pg.wait_for_timeout(300)
    sec=pg.locator('#notification-settings'); sec.locator('.notify-groups summary').click()
    sel=sec.locator('select[aria-label="Notifications from Eastside Mutual Aid"]'); print('group select:', sel.count())
    sel.select_option('off'); pg.wait_for_timeout(300)
    print('saved:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); const d=s.getCurrentUser().delivery; return [d.quiet, d.groups]})()"))
    # rules
    print('rules:', pg.evaluate("""(async()=>{const d=await import('./js/state/delivery.js'); const p={push:true,pushScope:'needs',groups:{aid:'off',band:'all'},quiet:{on:true,from:'22:00',to:'08:00'}};
      const noon=new Date('2026-11-14T12:00'), night=new Date('2026-11-14T23:30');
      return [d.shouldPush(p,{kind:'mention',spaceId:'aid'},noon), d.shouldPush(p,{kind:'like',spaceId:'band'},noon), d.shouldPush(p,{kind:'like'},noon), d.shouldPush(p,{kind:'mention'},night), d.shouldPush(p,{kind:'reminder'},night)]})()"""))
    # test notification through the worker
    pg.evaluate("location.hash='#account-notifications'"); pg.wait_for_timeout(400)
    print('test shown:', pg.evaluate("(async()=>{const d=await import('./js/state/delivery.js'); return d.showOnDevice('Test from the test')})()"))
    pg.wait_for_timeout(500)
    print('worker notes:', pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>r?r.getNotifications().then(n=>n.map(x=>x.body)):'no reg')"))
    pg.screenshot(path='test-output/notify-settings.png', full_page=True)
    ip=b.new_context(viewport={'width':390,'height':844}, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')
    p2=ip.new_page(); p2.goto('http://localhost:8765/index.html'); p2.wait_for_selector('.app-bar', timeout=20000)
    p2.evaluate("location.hash='#account-notifications'"); p2.wait_for_timeout(700)
    print('iphone help:', p2.locator('.notify-install').inner_text().replace('\n',' | ') if p2.locator('.notify-install').count() else 'none')
    print('errors', errs[:3])
    b.close()
