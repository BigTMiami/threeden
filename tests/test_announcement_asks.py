from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#module-tenants-announcements'"); pg.wait_for_timeout(800)
    v=pg.locator('#module-page-view')
    post=v.locator('article, .announcement').filter(has_text='Flyering').first
    print('asks on post:', post.locator('.asks').count(), '| signup rows:', post.locator('.asks__slot').count())
    btn=post.locator('.asks__slot button:not([disabled])').first; print('first slot btn:', btn.inner_text()); btn.click(); pg.wait_for_timeout(200)
    post=v.locator('article, .announcement').filter(has_text='Flyering').first
    print('after take:', post.get_by_role('button', name='Take me off').count())
    post.get_by_role('button', name='Going').first.click(); pg.wait_for_timeout(200)
    print('rsvp pressed:', post.locator('[aria-pressed="true"]').count())
    # composer
    print('composer asks buttons:', v.get_by_role('button', name='RSVP').count(), v.get_by_role('button', name='Sign-ups').count())
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(900)
    print('feed needs postask rows:', pg.locator('.needs').filter(has_text='Flyering').count())
    print('errors', errs)
