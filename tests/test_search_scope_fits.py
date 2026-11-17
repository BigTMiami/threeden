from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.app-bar', timeout=20000); pg.wait_for_timeout(400)
    r=pg.evaluate("(()=>{const a=document.querySelector('.app-search'), c=document.querySelector('.app-search__scope'); return [getComputedStyle(a).borderTopRightRadius, getComputedStyle(c).borderTopRightRadius, c.getBoundingClientRect().right <= a.getBoundingClientRect().right]})()")
    print('bubble radius, scope radius, inside:', r)
    if r[1] in ('0px', '') or not r[2]: errs.append('scope box pokes out of the search bubble')
    print('errors', errs[:3])
    b.close()
