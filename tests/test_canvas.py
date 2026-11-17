from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300,400]:
        pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        hv=pg.locator('#homepage-view'); mv=pg.locator('#module-page-view')
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(500)
        pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(500)
        pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); s.addModule('canvas', 0)})()"); pg.wait_for_timeout(500)
        card=hv.locator('.canvas-card').first
        print(vw, 'shapes:', card.locator('.canvas-card__shape').count())
        card.locator('.canvas-card__shape').first.click(); pg.wait_for_timeout(700)
        print(' editor:', mv.locator('.canvas-editor').count(), 'layers:', mv.locator('.canvas-editor__layer-row').count(), 'zoom:', mv.locator('.canvas-editor__zoom-label').inner_text())
        st=mv.locator('.canvas-editor__stack'); bb=st.bounding_box()
        def drag(x1,y1,x2,y2):
            pg.mouse.move(bb['x']+bb['width']*x1, bb['y']+bb['height']*y1); pg.mouse.down()
            pg.mouse.move(bb['x']+bb['width']*x2, bb['y']+bb['height']*y2, steps=8); pg.mouse.up()
        drag(.1,.2,.5,.6)
        mv.get_by_role('button', name='Box').click(); drag(.55,.2,.9,.5)
        mv.get_by_role('button', name='Ellipse').click(); mv.locator('.canvas-editor__check input').check(); mv.locator('.canvas-editor__swatch').nth(3).click(); drag(.2,.6,.4,.9)
        mv.get_by_role('button', name='Fill').click(); mv.locator('.canvas-editor__swatch').nth(5).click(); pg.mouse.click(bb['x']+bb['width']*.7, bb['y']+bb['height']*.35)
        mv.get_by_role('button', name='Text', exact=True).click(); pg.mouse.click(bb['x']+bb['width']*.1, bb['y']+bb['height']*.05); pg.wait_for_timeout(100); pg.keyboard.type('Hello 3den'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100); print(' tool after text:', mv.locator('.canvas-editor__tool.is-active').get_attribute('aria-label'))
        mv.locator('.canvas-editor__layer-tools').get_by_role('button', name='Layer').click(); pg.wait_for_timeout(100)
        print(' layers now:', mv.locator('.canvas-editor__layer-row').count())
        pass
        pg.screenshot(path=f'test-output/t116_{vw}.png')
        mv.get_by_role('button', name='Save').click(); pg.wait_for_timeout(500)
        saved=pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); const m=s.getCurrentSpace().modules.find(x=>x.type==='canvas'); return [m.data.layers.length, m.data.image.length>1000, m.data.width]})()")
        print(' saved:', saved)
        pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(500)
        print(' card picture:', hv.locator('.canvas-card__picture img').count())
        pg.reload(); pg.wait_for_timeout(600)
        pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); location.hash='#module-'+s.getCurrentSpace().modules.find(x=>x.type==='canvas').id})()"); pg.wait_for_timeout(800)
        print(' reloaded layers:', mv.locator('.canvas-editor__layer-row').count())
        pg.close()
    b.close()
print('ERRORS', errs)
