from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def status(pg, other): return pg.evaluate(f"(async()=>{{const f=await import('./js/state/friends.js'); return f.friendStatus('m-leo','{other}')}})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    hdr=lambda: pg.locator('.space-header').first
    # a friend
    pg.evaluate("location.hash='#blog-jamal'"); pg.wait_for_timeout(800)
    print('jamal status:', status(pg,'m-jamal'), '| buttons:', [t.strip() for t in hdr().locator('.space-header__actions > *, .space-header__actions button').all_inner_texts()][:6])
    fb=hdr().locator('.friend-menu > button'); print('friend button:', fb.inner_text().strip(), '| unfriend visible before click:', hdr().get_by_role('menuitem', name='Unfriend').is_visible())
    fb.click(); print('after click, unfriend visible:', hdr().get_by_role('menuitem', name='Unfriend').is_visible())
    pg.keyboard.press('Escape'); print('escape closes:', not hdr().get_by_role('menuitem', name='Unfriend').is_visible())
    fb.click(); hdr().get_by_role('menuitem', name='Unfriend').click(); pg.wait_for_timeout(400)
    print('after unfriend:', status(pg,'m-jamal'), '| button:', hdr().locator('button', has_text='Friend').first.inner_text().strip())
    hdr().locator('button', has_text='Friend').first.click(); pg.wait_for_timeout(400)
    print('after friend:', status(pg,'m-jamal'), '| button:', hdr().locator('.friend-menu > button').inner_text().strip())
    hdr().locator('.friend-menu > button').click(); hdr().get_by_role('menuitem', name='Cancel request').click(); pg.wait_for_timeout(400)
    print('after cancel:', status(pg,'m-jamal'))
    # received
    pg.evaluate("void (async()=>{const f=await import('./js/state/friends.js'); f.sendFriendRequest('m-jamal','m-leo');})()"); pg.wait_for_timeout(500)
    print('received button:', hdr().locator('.friend-menu > button').inner_text().strip())
    hdr().locator('.friend-menu > button').click(); hdr().get_by_role('menuitem', name='Accept').click(); pg.wait_for_timeout(400)
    print('after accept:', status(pg,'m-jamal'))
    pg.set_viewport_size({'width':390,'height':800}); pg.wait_for_timeout(300); hdr().locator('.friend-menu > button').click(); pg.wait_for_timeout(100)
    pg.screenshot(path='test-output/friend-phone.png')
    print('errors', errs)
