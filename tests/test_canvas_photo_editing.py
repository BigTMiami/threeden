# Canvas photo editing: Edit a photo (the canvas takes the photo's size), Crop (with Square), Rotate canvas,
# Adjust (a filter, sliders, rotate/flip/scale) with Apply and Cancel, and Undo through all of it.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    mv=pg.locator('#module-page-view')
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(500)
    mid=pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.addModule('canvas', 0).id})()"); pg.wait_for_timeout(400)
    pg.evaluate(f"location.hash='#module-{mid}'"); pg.wait_for_timeout(900)
    size=lambda: pg.evaluate("[document.querySelector('.canvas-editor__layer').width, document.querySelector('.canvas-editor__layer').height]")
    px=lambda x,y: pg.evaluate(f"[...document.querySelector('.canvas-editor__layer').getContext('2d').getImageData({x},{y},1,1).data]")
    print('start:', size(), '| Adjust button:', mv.get_by_role('button', name='Adjust').count(), '| Crop tool:', mv.get_by_role('button', name='Crop', exact=True).count())
    with pg.expect_file_chooser() as fc: mv.get_by_role('button', name='Edit a photo').click()
    fc.value.set_files('tests/files/photo-600x400.png'); pg.wait_for_timeout(800)
    print('photo opened at:', size(), '| toast:', pg.locator('.toast').last.inner_text())
    if size()!=[600,400]: errs.append('photo size')
    # crop, square
    mv.get_by_role('button', name='Crop', exact=True).click(); pg.wait_for_timeout(100)
    mv.get_by_role('button', name='Square').click()
    bb=mv.locator('.canvas-editor__stack').bounding_box()
    pg.mouse.move(bb['x']+bb['width']*.25, bb['y']+bb['height']*.25); pg.mouse.down(); pg.mouse.move(bb['x']+bb['width']*.5, bb['y']+bb['height']*.6, steps=6); pg.mouse.up(); pg.wait_for_timeout(150)
    print('crop box:', mv.locator('.canvas-editor__options .canvas-editor__hint').first.inner_text())
    mv.get_by_role('button', name='Crop', exact=True).nth(1).click() if mv.get_by_role('button', name='Crop', exact=True).count()>1 else None
    pg.wait_for_timeout(300)
    cw=size(); print('cropped to:', cw, '| square:', cw[0]==cw[1])
    if cw[0]!=cw[1] or cw[0]>=600: errs.append('crop')
    pg.screenshot(path='test-output/canvas-cropped.png')
    # rotate canvas: crop a non-square first? undo then rotate the 600x400
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300); print('undo crop:', size())
    mv.get_by_role('button', name='Rotate canvas right').click(); pg.wait_for_timeout(300); print('rotated:', size())
    if size()!=[400,600]: errs.append('rotate canvas')
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    # adjust: mono filter
    before=px(300,200)
    mv.get_by_role('button', name='Adjust').click(); pg.wait_for_timeout(200)
    print('adjust panel:', mv.locator('.canvas-adjust').count(), '| filters:', mv.locator('.canvas-adjust__chip').count(), '| sliders:', mv.locator('.canvas-adjust__slider').count())
    mv.get_by_role('button', name='Mono').click(); pg.wait_for_timeout(200)
    after=px(300,200); print('mono preview:', before, '->', after, '| gray:', after[0]==after[1]==after[2])
    pg.screenshot(path='test-output/canvas-adjust.png')
    mv.get_by_role('button', name='Cancel').click(); pg.wait_for_timeout(200)
    print('cancel restores:', px(300,200)==before)
    mv.get_by_role('button', name='Adjust').click(); pg.wait_for_timeout(200)
    mv.get_by_label('Brightness').fill('60'); mv.get_by_role('button', name='⇋ Flip').click(); pg.wait_for_timeout(200)
    mv.get_by_role('button', name='Apply').click(); pg.wait_for_timeout(200)
    lit=px(300,200); print('applied brighter:', sum(lit[:3])>sum(before[:3]), '| panel closed:', mv.locator('.canvas-adjust').count()==0)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200); print('undo adjust:', px(300,200)==before)
    # scale down a layer
    mv.get_by_role('button', name='Adjust').click(); pg.wait_for_timeout(150)
    mv.get_by_label('Scale').fill('50'); pg.wait_for_timeout(200); mv.get_by_role('button', name='Apply').click(); pg.wait_for_timeout(200)
    print('scaled: corner now empty:', px(10,10)[3]==0)
    # save keeps the size
    mv.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(500)
    print('saved size:', pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const d=s.getModule('{mid}').data; return [d.width,d.height]}})()"))
    print('errors', errs)
    b.close()
