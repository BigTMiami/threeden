from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    # directory
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(700)
    pg.locator('.space-header__members-link').click(); pg.wait_for_timeout(500)
    print('hash:', pg.evaluate('location.hash'), '| cards:', pg.locator('.directory__card').count())
    print('first card:', pg.locator('.directory__card').first.inner_text().replace('\n',' | ')[:100])
    pg.get_by_label('Search the directory').fill('mia'); pg.wait_for_timeout(100); print('search mia:', pg.locator('.directory__card').count())
    pg.get_by_label('Search the directory').fill(''); pg.get_by_role('button', name='Organizers').click(); print('organizers:', pg.locator('.directory__card').count())
    pg.get_by_role('button', name='All', exact=True).click()
    pg.get_by_label('Your intro for this group').fill('I run the heat log.'); pg.get_by_label('Your intro for this group').press('Enter'); pg.wait_for_timeout(200)
    print('intro saved:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getSpaces().find(x=>x.id==='tenants').intros?.['m-leo']})()"))
    # mute from feed
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(900)
    names=pg.locator('.feed-page .post-menu__button')
    first_card=pg.locator('.feed-page article').filter(has=pg.locator('.post-menu__button')).first
    first_card.locator('.post-menu__button').click(); pg.wait_for_timeout(100)
    mute=first_card.locator('.post-menu__item', has_text='Mute'); label=mute.inner_text(); print('menu has:', label.strip())
    who=label.strip().replace('Mute ','')
    before=pg.locator('.feed-page article').count(); mute.click(); pg.wait_for_timeout(400)
    print('articles before/after:', before, pg.locator('.feed-page article').count())
    # block jamal from blog
    pg.evaluate("location.hash='#blog-jamal'"); pg.wait_for_timeout(800)
    pg.locator('.space-header .post-menu__button').click(); pg.locator('.space-header .post-menu__item', has_text='Block').click(); pg.wait_for_timeout(200)
    pg.locator('.sub-viewer').get_by_role('button', name='Block', exact=True).click(); pg.wait_for_timeout(300)
    print('blocked:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getCurrentUser().blocked})()"))
    # messages with jamal show note
    cid=pg.evaluate("(async()=>{const m=await import('./js/state/messages.js'); const s=await import('./js/state/store.js'); return m.findDirectConversation('m-leo','m-jamal')?.id})()")
    pg.evaluate(f"location.hash='#messages-{cid}'"); pg.wait_for_timeout(700)
    print('blocked note:', pg.locator('#messages-view .thread__blocked').inner_text().replace('\n',' '), '| composer hidden:', not pg.locator('#messages-view .thread__composer').first.is_visible())
    pg.evaluate("location.hash='#account-blocked'"); pg.wait_for_timeout(700)
    print('account list:', pg.locator('#blocked-settings li').all_inner_texts())
    pg.locator('#blocked-settings').get_by_role('button', name='Unblock').click(); pg.wait_for_timeout(200)
    print('after unblock:', pg.locator('#blocked-settings li').count())
    print('errors', errs)
