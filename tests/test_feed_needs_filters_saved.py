from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300,400]:
        pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
        pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(900)
        n=pg.locator('.needs'); print(vw,'needs:', n.count(), '| rows:', n.locator('.needs__row').count(), '| kinds:', n.evaluate("e=>[...e.querySelectorAll('.needs__row')].map(r=>r.className.split('--')[1])") if n.count() else None, '| count:', n.locator('.needs__count').inner_text() if n.count() else '')
        print(' caught-up lines:', pg.locator('.feed__caught-up').count(), '| end:', pg.locator('.feed__end--done').inner_text().replace('\n',' ')[:80] if pg.locator('.feed__end--done').count() else 'more')
        pg.screenshot(path=f'test-output/fd_{vw}.png', full_page=False)
        if n.count():
            r=n.locator('.needs__row--task').first
            if r.count(): t=r.locator('.needs__text strong').inner_text(); r.get_by_role('button', name='I’ll do it').click(); pg.wait_for_timeout(500); print(' claimed:', t, '| still listed:', pg.locator('.needs__row--task strong', has_text=t).count())
            r=pg.locator('.needs__row--rsvp').first
            if r.count(): before=pg.locator('.needs__row--rsvp').count(); r.get_by_role('button').first.click(); pg.wait_for_timeout(500); print(' rsvp rows', before, '->', pg.locator('.needs__row--rsvp').count())
            r=pg.locator('.needs__row--announcement').first
            if r.count(): r.locator('input').fill('On it!'); r.get_by_role('button', name='Send').click(); pg.wait_for_timeout(500); print(' announcement replied; rows now', pg.locator('.needs__row--announcement').count())
            r=pg.locator('.needs__row').first
            if r.count(): before=pg.locator('.needs__row').count(); r.get_by_role('button', name='Not for me').click(); pg.wait_for_timeout(400); print(' dismissed:', before, '->', pg.locator('.needs__row').count())
        for f in ['Friends','Groups','Events','Nearby','All']:
            pg.locator('.feed-filters__chip', has_text=f).click(); pg.wait_for_timeout(400)
            print(f' {f}:', pg.locator('.feed > .feed-item').count(), pg.locator('.feed .feed__end').inner_text()[:50] if pg.locator('.feed .feed__end').count() else '')
        # save via menu
        pg.locator('.feed-item .post-menu__button').first.click(); pg.wait_for_timeout(200)
        pg.locator('.post-menu__item', has_text='Save for later').first.click(); pg.wait_for_timeout(300)
        pg.reload(); pg.wait_for_timeout(900)
        print(' second visit caught-up top:', pg.locator('.feed__caught-up--top').count())
        pg.evaluate("location.hash='#saved'"); pg.wait_for_timeout(600)
        print(' saved rows:', pg.locator('.saved__row').count(), pg.locator('.saved__title').first.inner_text()[:50] if pg.locator('.saved__row').count() else '')
        pg.screenshot(path=f'test-output/sv_{vw}.png')
    print('errors', errs)
