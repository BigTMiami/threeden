from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(1200)
    # a post with several photos
    opened=False
    for i in range(30):
        grid=pg.locator('.feed-item').filter(has=pg.locator('img')).nth(i)
        if not grid.count(): break
        imgs=grid.locator('button img, a img, img')
        if imgs.count()>=2:
            grid.scroll_into_view_if_needed(); imgs.first.click(); pg.wait_for_timeout(500)
            if pg.locator('.lightbox').count(): opened=True; break
    print('opened:', opened, '| count:', pg.locator('.lightbox__count').inner_text() if opened else '')
    cdp=ctx.new_cdp_session(pg)
    def touch(kind, pts): cdp.send('Input.dispatchTouchEvent', {'type':kind, 'touchPoints':[{'x':x,'y':y,'id':i} for i,(x,y) in enumerate(pts)]})
    def swipe(x0,y0,x1,y1,steps=10):
        touch('touchStart',[(x0,y0)])
        for k in range(1,steps+1): touch('touchMove',[(x0+(x1-x0)*k/steps, y0+(y1-y0)*k/steps)]); pg.wait_for_timeout(16)
        cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(400)
    box=pg.locator('.lightbox__image').bounding_box(); cx=box['x']+box['width']/2; cy=box['y']+box['height']/2
    swipe(cx+100, cy, cx-100, cy); print('after swipe left:', pg.locator('.lightbox__count').inner_text())
    swipe(cx-100, cy, cx+100, cy); print('after swipe right:', pg.locator('.lightbox__count').inner_text())
    # pinch out
    box=pg.locator('.lightbox__image').bounding_box(); cx=box['x']+box['width']/2; cy=box['y']+box['height']/2
    touch('touchStart',[(cx-20,cy),(cx+20,cy)])
    for k in range(1,11): touch('touchMove',[(cx-20-8*k,cy),(cx+20+8*k,cy)]); pg.wait_for_timeout(16)
    cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(300)
    print('after pinch:', pg.locator('.lightbox__image').evaluate('i=>i.style.transform'), '| zoomed:', pg.locator('.lightbox__image.is-zoomed').count())
    # pan while zoomed shouldn't change photo
    swipe(cx+60, cy, cx-60, cy); print('pan zoomed, still:', pg.locator('.lightbox__count').inner_text(), pg.locator('.lightbox__image').evaluate('i=>i.style.transform'))
    pg.screenshot(path='test-output/lightbox-zoom.png')
    # double tap: zoom back out
    for _ in range(2):
        touch('touchStart',[(cx,cy)]); cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(90)
    pg.wait_for_timeout(300); print('after double tap:', pg.locator('.lightbox__image.is-zoomed').count())
    for _ in range(2):
        touch('touchStart',[(cx,cy)]); cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(90)
    pg.wait_for_timeout(300); print('double tap again (zoom in):', pg.locator('.lightbox__image.is-zoomed').count())
    for _ in range(2):
        touch('touchStart',[(cx,cy)]); cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(90)
    pg.wait_for_timeout(300)
    swipe(cx, cy-60, cx, cy+120); print('swipe down closes:', pg.locator('.lightbox').count()==0)
    print('errors', errs[:3])
    b.close()
