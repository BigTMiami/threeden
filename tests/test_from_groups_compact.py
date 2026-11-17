# From groups on a phone: an announcement with an RSVP and sign-ups is one row of buttons; × hides a row; a clash chip wraps as words.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':844}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(1200)
    row=pg.locator('.needs__row--postask').first
    h=row.bounding_box()['height']; print('postask row height:', round(h)); 
    if h > 130: errs.append(f'postask row too tall: {h}')
    print('no "Are you coming?" label:', row.locator('.asks__label').count()==0, '| no counts:', row.locator('.asks__counts').count()==0)
    if row.locator('.asks__label').count(): errs.append('label shown')
    row.locator('.asks__signup-chip').click(); pg.wait_for_timeout(150); print('slots after tapping Sign up:', row.locator('.asks__slot').count())
    before=pg.locator('.needs__row').count(); pg.locator('.needs__row').first.get_by_role('button', name='Not for me').click(); pg.wait_for_timeout(300)
    print('rows', before, '->', pg.locator('.needs__row').count())
    pg.locator('.needs__more').click(); pg.wait_for_timeout(300)
    busy=pg.locator('.needs .availability--busy').first
    if busy.count():
        d=busy.evaluate("e=>getComputedStyle(e).display"); print('clash chip display:', d)
        if d!='inline-block': errs.append('clash chip not inline-block')
    box=pg.locator('section.needs').bounding_box()
    wide=pg.evaluate("()=>{const b=document.querySelector('section.needs').getBoundingClientRect(); return [...document.querySelectorAll('section.needs *')].filter(e=>e.getBoundingClientRect().right>b.right+1).length}")
    print('spilling out of the box:', wide)
    if wide: errs.append('spill')
    print('errors', errs)
    b.close()
