from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#settings-league'"); pg.wait_for_timeout(700)
    print('tab badge (on More):', pg.locator('.settings-tabs__more').inner_text().replace('\n',' '))
    pg.evaluate("location.hash='#settings-league--moderation'"); pg.wait_for_timeout(500)
    c=pg.locator('.moderation__card'); print('cards:', c.count(), '|', c.first.inner_text().replace('\n',' | ')[:220])
    c.first.get_by_role('button', name='Remove the announcement').click(); pg.wait_for_timeout(300)
    print('after:', pg.locator('.moderation__card').count(), '| handled:', pg.locator('.moderation details summary').inner_text())
    print('post gone:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getModule('league-announcements').data.posts.map(p=>p.id)})()"))
    print('erik told:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getState().notifications.filter(n=>n.recipientId==='m-erik'&&n.kind==='moderation').length})()"))
    # member without moderate can't see
    pg.evaluate("location.hash='#settings-tenants--moderation'"); pg.wait_for_timeout(500)
    print('tenants (member):', pg.locator('.settings-page__body').inner_text()[:80])
    # privacy
    pg.evaluate("location.hash='#account-privacy'"); pg.wait_for_timeout(700)
    pc=pg.locator('#privacy-settings'); print('checkup:', pc.locator('.settings-section__description').inner_text(), '| rows:', pc.locator('.privacy-check__row').count())
    pc.get_by_role('button', name='View my blog as a stranger').click(); pg.wait_for_timeout(900)
    print('hash:', pg.evaluate('location.hash'), '| banner:', pg.locator('.stranger-banner').count(), '| guest body:', pg.evaluate("document.body.classList.contains('is-guest')"))
    print('about edit hidden:', pg.locator('.about-block button', has_text='Edit').count())
    pg.screenshot(path='test-output/stranger.png')
    pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(600); print('private page shows auth:', pg.locator('#auth-view').is_visible() if pg.locator('#auth-view').count() else 'n/a')
    pg.locator('.stranger-banner').get_by_role('button', name='Back to my account').click(); pg.wait_for_timeout(800)
    print('back:', pg.evaluate('location.hash'), '| banner:', pg.locator('.stranger-banner').count(), '| user:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getCurrentUser().id})()"))
    print('errors', errs)
