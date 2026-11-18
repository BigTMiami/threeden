from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300,400]:
        pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
        pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(900)
        post=pg.locator('article:has(.event-strip)').first
        print(vw,'posts with strip:', pg.locator('article:has(.event-strip)').count())
        post.scroll_into_view_if_needed(); pg.wait_for_timeout(400)
        print(' order:', post.evaluate("e=>[...e.children].map(c=>c.className.split(' ')[0])"))
        print(' strip:', post.locator('.event-strip').inner_text().replace('\n',' · ')[:140], '| shape', post.locator('.feed-post__media').evaluate("e=>e.style.getPropertyValue('--shape')"))
        post.screenshot(path=f'test-output/c_post_{vw}.png')
        post.locator('.feed-post__arrow--next').click(); pg.wait_for_timeout(400); post.screenshot(path=f'test-output/c_post2_{vw}.png')
        post.locator('.event-strip').get_by_role('button').first.click(); pg.wait_for_timeout(500)
        print(' rsvp:', pg.evaluate("(async()=>{const e=await import('./js/state/events.js'); return e.findEvent('band-ev-2').event.rsvps['m-leo']})()"), '| strip still there:', pg.locator('article:has(.event-strip)').count())
        pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(800)
        pg.locator('.feed-module__new-post:visible').first.click(); pg.wait_for_timeout(300); comp=pg.locator('.feed-composer').first; comp.get_by_role('button', name='Event', exact=True).click(); pg.wait_for_timeout(300)
        print(' events offered first:', comp.locator('.sub-attach__vault-item').first.inner_text().replace('\n',' '))
        pg.screenshot(path=f'test-output/c_group_{vw}.png')
    print('errors', errs)
