from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
def store(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(600)
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(900)
    card=pg.locator('.module-frame[data-module-type=articles]')
    card.scroll_into_view_if_needed(); print('card teasers:', [t.split('\n')[1] if '\n' in t else t for t in card.locator('.article-teaser__headline').all_inner_texts()])
    card.screenshot(path='test-output/articles-card.png')
    card.locator('.article-teaser:not(.is-draft) .article-teaser__link').first.click(); pg.wait_for_timeout(800)
    a=pg.locator('.news-article'); print('reader:', a.locator('.article-kicker').first.inner_text(), '|', a.locator('h1').inner_text(), '|', a.locator('.article-byline').inner_text())
    print('   hero caption:', a.locator('figcaption').inner_text(), '| reactions:', a.locator('.reactions').count())
    pg.screenshot(path='test-output/article-reader.png', full_page=True)
    # write one
    a.get_by_role('button', name='All articles').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Write an article').click(); pg.wait_for_timeout(300)
    ed=pg.locator('.article-editor')
    ed.get_by_label('Section').fill('Events'); ed.get_by_label('Headline', exact=True).fill('Workshop draws 40 neighbors'); ed.get_by_label('Summary under the headline').fill('Legal aid answered questions for two hours.')
    pg.get_by_role('button', name='Publish').click(); pg.wait_for_timeout(300)
    print('   empty story error:', ed.locator('p.form-error').inner_text())
    ed.locator('.rich-text__content, [contenteditable=true]').first.click(); pg.keyboard.type('Forty neighbors came to the library on Saturday.'); pg.wait_for_timeout(700)
    pg.screenshot(path='test-output/article-editor.png')
    pg.get_by_role('button', name='Publish').click(); pg.wait_for_timeout(500)
    print('   published:', pg.locator('.news-article h1').inner_text(), '|', store(pg,"return s.getModule('tenants-bulletin').data.articles.find(a=>a.headline.startsWith('Workshop'))?.status"))
    # feed shows it
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(1000)
    fa=pg.locator('.feed-article'); print('feed articles:', fa.count(), '|', fa.first.locator('.feed-article__headline').inner_text() if fa.count() else None)
    if fa.count():
        fa.first.scroll_into_view_if_needed(); fa.first.screenshot(path='test-output/feed-article.png')
        fa.first.click(); pg.wait_for_timeout(700); print('   opened from feed:', pg.locator('.news-article h1').inner_text())
    # phone reader
    pg.set_viewport_size({'width':390,'height':800}); pg.wait_for_timeout(300); pg.screenshot(path='test-output/article-phone.png')
    print('errors', errs); b.close()
