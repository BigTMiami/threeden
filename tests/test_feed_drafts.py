from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(1000)
    f=pg.locator('.feed-module:visible').first
    NEW=lambda: pg.locator('.feed-module__new-post:visible').first
    D=pg.locator('dialog.modal[open]')
    print('composer open at start:', pg.locator('.feed-composer').count(), '| New post button:', NEW().count())
    pg.screenshot(path='test-output/blog-feed-closed.png')
    NEW().click(); pg.wait_for_timeout(300)
    f=pg.locator('.feed-module:visible').first
    print('open in pop-up:', D.locator('.feed-composer').count(), '| focused:', pg.evaluate("document.activeElement.classList.contains('feed-composer__text')"))
    D.locator('.feed-composer__text').fill('Half-written thought about the porch jam'); pg.wait_for_timeout(1000)
    print('autosaved:', st(pg, "return (s.getCurrentUser().postDrafts||[]).map(d=>d.text)"))
    D.get_by_role('button', name='Close (keeps a draft)').click(); pg.wait_for_timeout(300)
    print('toast:', pg.locator('.toast').last.inner_text())
    f=pg.locator('.feed-module:visible').first
    print('pop-up closed:', D.count()==0, '| bar now:', f.locator('.feed-module__compose-bar').inner_text().replace('\n',' | '))
    f.locator('.feed-module__drafts-toggle').click(); pg.wait_for_timeout(200)
    print('drafts list:', [t.replace('\n',' | ') for t in f.locator('.feed-drafts__row').all_inner_texts()])
    # reload: still there
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000); pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(900)
    f=pg.locator('.feed-module:visible').first
    print('after reload:', f.locator('.feed-module__drafts-toggle').inner_text())
    f.locator('.feed-module__drafts-toggle').click(); pg.wait_for_timeout(200); f.locator('.feed-drafts__open').first.click(); pg.wait_for_timeout(300)
    f=pg.locator('.feed-module:visible').first
    print('resumed text:', D.locator('.feed-composer__text').input_value(), '| title:', D.locator('.feed-composer__top strong').inner_text())
    D.locator('.feed-composer__text').fill('Porch jam Saturday: bring a chair!'); pg.wait_for_timeout(900)
    before=st(pg, "return s.getModule ? 1 : 1")
    D.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(500)
    print('after post drafts:', st(pg, "return (s.getCurrentUser().postDrafts||[]).length"), '| composer closed:', D.count()==0)
    print('posted:', pg.locator('.feed-module:visible').first.inner_text().count('bring a chair'))
    # discard + undo
    f=pg.locator('.feed-module:visible').first; NEW().click(); pg.wait_for_timeout(200)
    D.locator('.feed-composer__text').fill('To throw away'); pg.wait_for_timeout(900)
    D.get_by_role('button', name='Discard').click(); pg.wait_for_timeout(300)
    print('discard toast:', pg.locator('.toast').last.inner_text().replace('\n',' | '), '| drafts:', st(pg, "return (s.getCurrentUser().postDrafts||[]).length"))
    pg.locator('.toast').last.get_by_role('button', name='Undo').click(); pg.wait_for_timeout(300)
    print('undo reopens:', D.locator('.feed-composer__text').input_value())
    # close empty: no draft
    D.get_by_role('button', name='Discard').click(); pg.wait_for_timeout(200)
    f=pg.locator('.feed-module:visible').first; NEW().click(); pg.wait_for_timeout(200)
    D.get_by_role('button', name='Close (keeps a draft)').click(); pg.wait_for_timeout(200)
    print('empty close drafts:', st(pg, "return (s.getCurrentUser().postDrafts||[]).length"))
    # someone else's blog: no Post button
    pg.evaluate("location.hash='#blog-priya'"); pg.wait_for_timeout(800)
    print('other blog post btn:', pg.locator('.feed-module__new-post:visible').count())
    pg.set_viewport_size({'width':390,'height':844}); pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(800)
    print('phone overflow:', pg.evaluate('document.documentElement.scrollWidth > innerWidth'))
    print('errors', errs[:3])
    b.close()
