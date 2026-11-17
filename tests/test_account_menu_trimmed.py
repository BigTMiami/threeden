# The account menu (your initials, top right) is just about your account: no My blog, Friends, Saved, Customize my homepage, or Create a group
# (those live under Home and Groups). With blogs and friends turned off, Saved stays here, since Home has no menu then.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.locator('.app-bar__user').click(); pg.wait_for_timeout(300)
    items=[x.strip() for x in pg.locator('.account-menu .account-menu__item').all_inner_texts()]; print('account menu:', items)
    for gone in ['My blog','Friends','Saved','Customize my homepage','Create a group','Feed','Groups']:
        if gone in items: errs.append(f'{gone} should not be in the account menu')
    pg.keyboard.press('Escape')
    pg.locator('.app-bar__home').hover(); pg.wait_for_timeout(300)
    print('home menu:', [x.strip() for x in pg.locator('.home-menu a').all_inner_texts()])
    # blogs and friends off
    pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); s.changeState(st=>{const m=st.members.find(x=>x.id==='m-leo'); m.socialOff=true;}, 'account')})()"); pg.wait_for_timeout(400)
    pg.locator('.app-bar__user').click(); pg.wait_for_timeout(300)
    off=[x.strip() for x in pg.locator('.account-menu .account-menu__item').all_inner_texts()]; print('social off:', off)
    if 'Saved' not in off: errs.append('with blogs off, Saved belongs in the account menu')
    print('errors', errs)
    b.close()
