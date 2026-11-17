# On a feed, "New post" sits on the module's title line (left of the expand arrows); it opens the composer in a pop-up over
# the page that dims what's behind; the composer's × (or Esc) closes it, keeping a draft; posting closes it and adds the post.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for w in [1300, 390]:
        pg=b.new_page(viewport={'width':w,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
        pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(900)
        frame=pg.locator('.module-frame', has=pg.locator('.feed-module')).first
        btn=frame.locator('.module-frame__header .feed-module__new-post')
        print(w, 'New post in the header:', btn.count(), '| text:', btn.inner_text() if btn.count() else '', '| round + left:', pg.locator('.feed-module__new').count())
        order=frame.locator('.module-frame__header').evaluate("h=>[...h.children].map(c=>c.className.split(' ')[0])")
        print('  header order:', order)
        if not btn.count(): errs.append(f'{w}: no New post button'); continue
        classes=frame.locator('.module-frame__header').evaluate("h=>[...h.children].map(c=>c.className)")
        ni=[i for i,c in enumerate(classes) if 'feed-module__new-post' in c][0]; oi=[i for i,c in enumerate(classes) if 'module-frame__open' in c][0]
        if ni > oi: errs.append('New post should sit left of expand')
        btn.click(); pg.wait_for_timeout(400)
        dlg=pg.locator('dialog.modal[open]')
        print('  pop-up open:', dlg.count(), '| has composer:', dlg.locator('.feed-composer').count(), '| backdrop dims:', pg.evaluate("getComputedStyle(document.querySelector('dialog.modal'), '::backdrop').backgroundColor"))
        if w == 1300: pg.screenshot(path='test-output/new-post-popup.png')
        else: pg.screenshot(path='test-output/new-post-popup-phone.png')
        dlg.locator('textarea').first.fill('Testing the pop-up'); pg.wait_for_timeout(900)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        print('  after Esc: open?', pg.locator('dialog.modal[open]').count(), '| drafts:', frame.locator('.feed-module__drafts-toggle').inner_text() if frame.locator('.feed-module__drafts-toggle').count() else 0)
        frame.locator('.feed-module__drafts-toggle').click(); frame.locator('.feed-drafts__open').first.click(); pg.wait_for_timeout(400)
        dlg=pg.locator('dialog.modal[open]')
        print('  draft reopened in pop-up:', dlg.count(), '|', dlg.locator('textarea').first.input_value())
        dlg.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(500)
        print('  posted: pop-up closed:', pg.locator('dialog.modal[open]').count()==0, '| post shown:', pg.locator('text=Testing the pop-up').count()>0)
        # × closes too
        frame.locator('.feed-module__new-post').click(); pg.wait_for_timeout(300)
        pg.locator('dialog.modal[open] .feed-composer__top [aria-label^="Close"]').click(); pg.wait_for_timeout(300)
        print('  × closes:', pg.locator('dialog.modal').count()==0)
        # visitor: no button
        pg.evaluate("location.hash='#blog-jamal'"); pg.wait_for_timeout(700)
        print('  on someone elses blog:', pg.locator('.feed-module__new-post').count())
        pg.close()
    print('errors', errs)
    b.close()
