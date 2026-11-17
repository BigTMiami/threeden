from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(900)
    n=pg.locator('.needs')
    print('49 needs rows:', n.locator('.needs__row').count(), '|', n.locator('.needs__more').inner_text())
    n.locator('.needs__more').click(); pg.wait_for_timeout(200)
    row=n.locator('.needs__row--postask').first
    print('49 postask line:', row.locator('.asks__signup-chip').inner_text().replace('\n',' '), '| slot rows before:', row.locator('.asks__slot').count())
    row.locator('.asks__signup-chip').click(); pg.wait_for_timeout(100); print('49 after Pick one:', row.locator('.asks__slot').count())
    # 52 feed card menu
    card=pg.locator('.feed-page .feed-item').first
    print('52 reactions row:', card.locator('.reactions__row').first.inner_text().replace('\n',' ') if card.locator('.reactions__row').count() else '-')
    card.locator('.post-menu__button').first.click(); print('52 menu:', [t.strip() for t in card.locator('.post-menu__item').all_inner_texts()])
    pg.keyboard.press('Escape'); pg.mouse.click(5,5)
    print('54 clusters:', pg.locator('.feed-cluster').count(), '|', pg.locator('.feed-cluster__head').first.inner_text() if pg.locator('.feed-cluster').count() else '')
    # own blog post: Edit/Delete in menu
    pg.evaluate("location.hash='#module-leo-feed'"); pg.wait_for_timeout(800)
    v=pg.locator('#module-page-view')
    v.locator('.feed-tile, .feed-row').first.click(); pg.wait_for_timeout(500)
    post=pg.locator('.photo-viewer__side .feed-post').first
    print('52 header tools gone:', post.locator('.feed-post__tools').count()==0)
    post.locator('.post-menu__button').first.click(); print('52 own post menu:', [t.strip() for t in post.locator('.post-menu__item').all_inner_texts()])
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # announcements
    pg.evaluate("location.hash='#module-tenants-announcements'"); pg.wait_for_timeout(800)
    a=v.locator('.announcement-post, article').filter(has_text='Flyering').first
    a.locator('.post-menu__button').first.click(); print('52 announcement menu:', [t.strip() for t in a.locator('.post-menu__item').all_inner_texts()])
    # forum
    pg.evaluate("location.hash='#module-tenants-forum'"); pg.wait_for_timeout(800)
    f=v.locator('.forum-thread').first
    if f.count():
        f.locator('.post-menu__button').first.click(); print('52 forum row menu:', [t.strip() for t in f.locator('.post-menu__item').all_inner_texts()])
    # 53 short cards
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    print('53 card-more links:', [t.strip() for t in pg.locator('#homepage-view .card-more').all_inner_texts()])
    # 55 source tag inside group
    pg.evaluate("location.hash='#space-mutualaid'"); pg.wait_for_timeout(900)
    print('55 tags in group:', list(set(t.strip() for t in pg.locator('#homepage-view .source-tag').all_inner_texts()))[:4])
    pg.screenshot(path='test-output/dense.png')
    print('errors', errs)
