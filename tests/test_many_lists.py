# The List module holds many lists: chips on the card to switch, "+" for a new one; the full page lists them down the side, with
# rename and Delete list (Undo). An old single list keeps working. A List file in a vault with several lists shows each list in
# File from vault's picker; put on a page, it opens on that list.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    card=pg.locator('.module-frame[data-module-id="house-grocery"]').first; mid=card.get_attribute('data-module-id')
    print('old list still shows items:', card.locator('.grocery__items li').count(), '| single-list "+ New list":', card.locator('.lists__first-new').count())
    card.locator('.lists__first-new').click(); card.locator('.lists__new-input').fill('Hardware store'); card.locator('.lists__new-input').press('Enter'); pg.wait_for_timeout(400)
    chips=card.locator('.lists__chip:not(.lists__chip--new)').all_inner_texts(); print('chips:', chips, '| open:', card.locator('.lists__chip.is-open').inner_text())
    card.locator('.grocery__add input').fill('Picture hooks'); card.locator('.grocery__add input').press('Enter'); pg.wait_for_timeout(300)
    card.locator('.lists__chip').first.click(); pg.wait_for_timeout(300)
    print('back on the first list, hooks not here:', card.locator('text=Picture hooks').count()==0, '| data:', st(pg, f"return s.getModule('{mid}').data.lists.map(l=>[l.name, l.items.length])"))
    pg.screenshot(path='test-output/lists-card.png')
    # full page
    pg.evaluate(f"location.hash='#module-{mid}'"); pg.wait_for_timeout(800)
    side=pg.locator('.lists__side'); print('sidebar:', side.locator('.lists__item:not(.lists__item--new)').all_inner_texts())
    side.locator('.lists__item', has_text='Hardware').click(); pg.wait_for_timeout(300)
    t=pg.locator('.lists__title-input'); t.fill('Hardware'); t.press('Enter'); pg.wait_for_timeout(300)
    print('renamed:', side.locator('.lists__item.is-open').inner_text())
    pg.screenshot(path='test-output/lists-page.png')
    pg.get_by_role('button', name='Delete list').click(); pg.wait_for_timeout(300); print('deleted:', st(pg, f"return s.getModule('{mid}').data.lists.length"))
    pg.locator('.toast').get_by_role('button', name='Undo').click(); pg.wait_for_timeout(300); print('undo:', st(pg, f"return s.getModule('{mid}').data.lists.length"))
    # a vault List file with two lists → each in File from vault's picker; opens on that list
    st(pg, """const sp=s.getSpace('juniper'); const v=sp.modules.find(m=>m.type==='vault'); const data=structuredClone(v.data);
      data.items.push({id:'lf-t', kind:'module', moduleType:'todo', name:'Party lists', parentId:null, createdBy:'m-leo', createdAt:Date.now(), updatedAt:Date.now(),
        data:{tasks:[], view:'lists', lists:[{id:'food', name:'Food', items:[{id:'i1', name:'Chips', bought:false}], history:[]},{id:'music', name:'Music', items:[{id:'i2', name:'Speaker', bought:false}], history:[]}]}});
      s.updateModuleData(v.id, data); s.setEditMode(true); return 1""")
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    pg.locator('#module-library .library-item', has_text='File from vault').click(); pg.wait_for_timeout(400)
    entries=pg.locator('.vault-picker__item', has_text='A list in Party lists'); print('picker entries for the lists:', entries.all_inner_texts())
    pg.locator('.vault-picker__item', has_text='Music').click(); pg.wait_for_timeout(600)
    st(pg, "s.setEditMode(false); return 1"); pg.wait_for_timeout(500)
    vf=pg.locator('.module-frame[data-module-type="vaultfile"]').last
    print('on the page, opens on:', vf.locator('.lists__chip.is-open').inner_text() if vf.locator('.lists__chip.is-open').count() else None, '| shows Speaker:', vf.locator('text=Speaker').count()>0)
    if not vf.locator('text=Speaker').count(): errs.append('vault list should open on its list')
    print('errors', errs)
    b.close()
