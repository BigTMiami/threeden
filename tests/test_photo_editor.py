from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300,400]:
        pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(500)
        pg.evaluate("""window.__res='pending'; void (async()=>{const c=document.createElement('canvas'); c.width=800;c.height=600; const x=c.getContext('2d'); x.fillStyle='#3a7'; x.fillRect(0,0,800,600); x.fillStyle='#c33'; x.fillRect(100,100,300,200);
          const m=await import('./js/ui/photo-editor.js'); window.__res=await m.openPhotoEditor(c.toDataURL('image/png'));})()""")
        pg.wait_for_timeout(600)
        ed=pg.locator('.photo-editor')
        print(vw,'filters:',ed.locator('.photo-editor__filter').count())
        ed.locator('.photo-editor__filter').nth(4).click(); pg.wait_for_timeout(200)
        ed.get_by_role('tab',name='Adjust').click(); print(' sliders:', ed.locator('.photo-editor__slider input').count())
        ed.locator('.photo-editor__slider input').first.fill('30'); pg.wait_for_timeout(100)
        ed.get_by_role('tab',name='Crop').click(); ed.get_by_role('button',name='Square').click(); pg.wait_for_timeout(100)
        box=ed.locator('.photo-editor__crop').bounding_box(); print(' crop box ratio:', round(box['width']/box['height'],2))
        h=ed.locator('.photo-editor__handle--se').bounding_box()
        pg.mouse.move(h['x']+5,h['y']+5); pg.mouse.down(); pg.mouse.move(h['x']-60,h['y']-60,steps=6); pg.mouse.up()
        box=ed.locator('.photo-editor__crop').bounding_box(); print(' after resize ratio:', round(box['width']/box['height'],2))
        ed.get_by_role('button',name='Rotate left a quarter turn').click(); ed.get_by_role('button',name='Flip left to right').click()
        ed.get_by_role('button',name='Square').click()
        pg.screenshot(path=f'test-output/t117_{vw}.png')
        ed.get_by_role('button',name='Done').click(); pg.wait_for_timeout(300)
        r=pg.evaluate("window.__res && [window.__res.width, window.__res.height, window.__res.src.slice(0,15)]"); print(' result:', r, 'open?', pg.locator('.photo-editor').count())
        # untouched returns original
        pg.evaluate("window.__res='pending'; void (async()=>{const m=await import('./js/ui/photo-editor.js'); window.__res=await m.openPhotoEditor('assets/'+'x.png')})()"); pg.wait_for_timeout(300)
        print(' bad src resolves null:', pg.evaluate("window.__res"), pg.locator('.photo-editor').count())
        # composer thumb has edit button
        pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(500)
        fi=pg.locator('.feed-composer input[type=file]').first
        if fi.count():
            fi.set_input_files('test-output/t117_400.png' if vw==400 else 'test-output/t117_1300.png'); pg.wait_for_timeout(800)
            print(' composer edit buttons:', pg.locator('.feed-composer__thumb .photo-edit-button').count())
        else: print(' no composer file input')
    print('errors', errs)
