from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1300,'height':900}, accept_downloads=True); ctx.grant_permissions(['clipboard-read','clipboard-write'])
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    # about
    pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(900)
    a=pg.locator('.about-block').first
    print('about:', a.inner_text().replace('\n',' | ')[:200])
    a.get_by_role('button', name='Edit').click(); a.get_by_label('Ask me about (separate with commas)').fill('bikes, zoning'); a.get_by_role('button', name='Save').click(); pg.wait_for_timeout(200)
    print('chips:', a.locator('.about-block__chips .chip').all_inner_texts())
    # hashtags in feed post link
    tag=pg.locator('#module-page-view, #homepage, main').locator('a.hashtag').first
    print('hashtag links on blog:', pg.locator('a.hashtag:visible').count())
    pg.locator('a.hashtag:visible').first.click(); pg.wait_for_timeout(300); print('clicked to:', pg.evaluate('location.hash'))
    pg.evaluate("location.hash='#tag-mutualaid'"); pg.wait_for_timeout(600)
    print('tag page:', pg.evaluate('location.hash'), '|', pg.locator('.tag-page .settings-page__subtitle').inner_text(), '| items:', pg.locator('.tag-page__item').count())
    print('other topics:', pg.locator('.tag-page__topics .chip').all_inner_texts()[:6])
    pg.evaluate("location.hash='#tag-openmic'"); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Follow').click(); pg.wait_for_timeout(200)
    print('following:', pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getCurrentUser().followedTags})()"))
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(900)
    # instagram card from own post via post menu
    own=pg.locator('.feed-page article').filter(has_text='Practice run for Thanksgiving').first
    print('own post in feed:', own.count())
    # Your own posts aren't in your Feed by default: open the card the way the menu does.
    pg.evaluate("void (async()=>{const m=await import('./js/ui/instagram-card.js'); const d=await import('./js/data/demo-photos.js'); const s=await import('./js/state/store.js'); m.openInstagramCard({src:d.demoPhoto('pie','tall'), caption:'Practice run for Thanksgiving. Aunt Ingrid, the pecan pie is handled #baking', author:s.getCurrentUser()})})()")
    pg.wait_for_timeout(1500)
    if True:
        print('ig preview img:', pg.locator('.ig-card__preview img').count())
        with pg.expect_download() as dl: pg.locator('.ig-card').get_by_role('link', name='Download image').click()
        path=dl.value.path(); import os; print('download size:', os.path.getsize(path))
        pg.locator('.ig-card').get_by_role('button', name='Copy caption').click(); pg.wait_for_timeout(200)
        print('clip:', pg.evaluate('navigator.clipboard.readText()')[:60])
        pg.locator('.ig-card__preview img').screenshot(path='test-output/ig.png')
    print('errors', errs)
