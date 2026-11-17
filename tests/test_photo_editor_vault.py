from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(800)
    pg.evaluate("location.hash='#module-house-vault'"); pg.wait_for_timeout(700)
    hv=pg.locator('#module-page-view'); card=hv.locator('.module-frame:has(.vault-card), .module-frame:has([class*=vault])').first
    print('vault cards:', hv.locator('[class*=vault]').count())
    pg.evaluate("""(async()=>{const s=await import('./js/state/store.js'); const c=document.createElement('canvas'); c.width=300;c.height=200; const x=c.getContext('2d'); x.fillStyle='#c33'; x.fillRect(0,0,300,200);
      const m=s.getModule('house-vault'); const d=structuredClone(m.data); d.items.push({id:'item-pic', parentId:null, kind:'file', name:'t117_400.png', createdBy:s.getCurrentUser().id, updatedAt:Date.now(), file:{mimeType:'image/png', size:2000, dataUrl:c.toDataURL()}}); s.updateModuleData('house-vault', d)})()"""); pg.wait_for_timeout(600)
    pg.reload(); pg.wait_for_timeout(900); print(hv.inner_text()[:300].replace('\n','|')); print(pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getModule('house-vault').data.items.map(i=>i.name).join(',')})()"))
    item=hv.get_by_text('t117_400.png').first; item.click(); pg.wait_for_timeout(500)
    print('edit button:', hv.get_by_role('button', name='Edit photo').count())
    hv.locator('.vault-file__edit input[type=checkbox]').check()
    hv.get_by_role('button', name='Edit photo').click(); pg.wait_for_timeout(500)
    pg.locator('.photo-editor__filter').nth(4).click()
    pg.locator('.photo-editor').get_by_role('button', name='Save copy').click(); pg.wait_for_timeout(600)
    r=pg.evaluate("""(async()=>{const s=await import('./js/state/store.js'); const m=s.getModule('house-vault'); return m.data.items.filter(i=>i.name.startsWith('t117')).map(i=>[i.name,i.file.mimeType])})()""")
    print('items:', r)
    # owen (not creator, not moderator?) view
    print('errors', errs)
