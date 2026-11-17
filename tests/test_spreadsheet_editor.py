from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os, json; os.makedirs('test-output/out', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1400,'height':950}, accept_downloads=True); ctx.grant_permissions(['clipboard-read','clipboard-write'])
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text else None)
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#module-band-merch'"); pg.wait_for_timeout(1000)
    v=pg.locator('#module-page-view'); cell=lambda c,r: v.locator(f'td[data-col="{c}"][data-row="{r}"]')
    print('migrated F2/F7:', cell(5,1).inner_text(), cell(5,6).inner_text(), '| tabs:', v.locator('.sheet__tab').all_inner_texts())
    pg.screenshot(path='test-output/sheet-page.png')
    # type a value and a formula with autocomplete
    cell(3,1).click(); pg.keyboard.type('30'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    print('after D2=30: E2,F2,F7', cell(4,1).inner_text(), cell(5,1).inner_text(), cell(5,6).inner_text(), '| where:', v.locator('.sheet__where').input_value())
    cell(0,8).click(); pg.keyboard.type('=aver'); pg.wait_for_timeout(150)
    print('suggest:', v.locator('.sheet__suggest li').all_inner_texts()[:3])
    pg.keyboard.press('Tab'); pg.keyboard.type('B2:B5'); pg.wait_for_timeout(100)
    print('hint:', v.locator('.sheet__hint').inner_text())
    pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    print('A9 =', cell(0,8).inner_text(), '| raw:', st(pg, "const d=s.getModule('band-merch').data; const c=d.sheets[0].cells.A9; return typeof c==='object'?c.v:c"))
    # point mode: type =, click B2, type *, click C2
    cell(1,8).click(); pg.keyboard.type('='); cell(1,1).click(); pg.keyboard.type('*'); cell(2,1).click(); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    print('B9 via clicks:', cell(1,8).inner_text(), st(pg, "const c=s.getModule('band-merch').data.sheets[0].cells.B9; return typeof c==='object'?c.v:c"))
    # fill handle drag: A11=Week 1 -> A14
    cell(0,10).click(); pg.keyboard.type('Week 1'); pg.keyboard.press('Enter'); cell(0,10).click(); pg.wait_for_timeout(100)
    fh=v.locator('.sheet__fill-handle').bounding_box(); pg.mouse.move(fh['x']+4, fh['y']+4); pg.mouse.down(); t=cell(0,13).bounding_box(); pg.mouse.move(t['x']+10, t['y']+10, steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    print('filled:', [cell(0,r).inner_text() for r in range(10,14)])
    # range select + bold + currency + sum in status
    cell(1,1).click(); cell(1,4).click(modifiers=['Shift']); pg.wait_for_timeout(100)
    print('status:', v.locator('.sheet__status').inner_text())
    pg.keyboard.press('Control+b'); pg.wait_for_timeout(100)
    v.get_by_role('button', name='Currency').click(); pg.wait_for_timeout(150)
    print('B3 now:', cell(1,2).inner_text(), '| bold:', cell(1,2).evaluate('e=>getComputedStyle(e).fontWeight'))
    # undo
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(100); print('undo currency:', cell(1,2).inner_text())
    # copy/paste with formula shift: copy F2 to F10
    cell(5,1).click(); pg.keyboard.press('Control+c'); pg.wait_for_timeout(150); cell(5,9).click(); pg.keyboard.press('Control+v'); pg.wait_for_timeout(250)
    print('pasted F10 raw:', st(pg, "const c=s.getModule('band-merch').data.sheets[0].cells.F10; return typeof c==='object'?c.v:c"))
    # insert row above row 3, check total formula moves
    cell(0,2).click(); v.locator('.sheet__tool--menu', has_text='Insert').click(); v.get_by_role('menuitem', name='Row above').click(); pg.wait_for_timeout(200)
    print('after insert: total raw F8:', st(pg, "const c=s.getModule('band-merch').data.sheets[0].cells.F8; return typeof c==='object'?c.v:c"))
    v.locator('.sheet__scroll').focus(); pg.keyboard.press('Control+z'); pg.wait_for_timeout(150)
    print('undo insert: F7 raw:', st(pg, "const c=s.getModule('band-merch').data.sheets[0].cells.F7; return typeof c==='object'?c.v:c"))
    # sort by price desc
    cell(1,1).click(); v.locator('.sheet__tool--menu', has_text='Sort').click(); v.get_by_role('menuitem', name='Z → A').first.click(); pg.wait_for_timeout(200)
    print('sorted A2..A5:', [cell(0,r).inner_text() for r in range(1,5)])
    # filter
    v.get_by_role('button', name='Filter: show a filter on each column').click(); pg.wait_for_timeout(150)
    v.locator('button[aria-label="Filter column A"]').click(); pg.wait_for_timeout(150)
    v.locator('.sheet__filter-row', has_text='Tote bag').locator('input').uncheck(); v.locator('.sheet__filter').get_by_role('button', name='OK').click(); pg.wait_for_timeout(200)
    print('rows shown after filter:', [cell(0,r).inner_text() for r in range(1,6) if cell(0,r).count()])
    # new sheet + cross-sheet formula
    v.locator('button[aria-label="Add a sheet"]').click(); pg.wait_for_timeout(200)
    cell(0,0).click(); pg.keyboard.type("=Sheet1!F7*2"); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    print('sheet2 A1:', cell(0,0).inner_text(), '| tabs:', v.locator('.sheet__tab').all_inner_texts())
    # rename Sheet1 via dblclick
    v.locator('.sheet__tab', has_text='Sheet1').dblclick(); pg.keyboard.press('Control+a'); pg.keyboard.type('Merch'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    print('renamed ref:', st(pg, "const c=s.getModule('band-merch').data.sheets[1].cells.A1; return typeof c==='object'?c.v:c"), cell(0,0).inner_text())
    # find
    v.locator('.sheet__tab', has_text='Merch').click(); pg.wait_for_timeout(150)
    v.get_by_role('button', name='Find and replace (Ctrl+F)').click(); pg.keyboard.type('Sticker'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    print('find ->', v.locator('.sheet__where').input_value(), v.locator('.sheet__find-count').inner_text())
    # chart
    cell(0,0).click(); cell(1,4).click(modifiers=['Shift']); v.get_by_role('button', name='Chart from the selection').click(); pg.wait_for_timeout(200)
    print('charts:', v.locator('.sheet-chart').count(), '| bars:', v.locator('.sheet-chart svg rect').count())
    # xlsx download + reimport
    v.locator('.sheet__tool--menu', has_text='File').click()
    with pg.expect_download() as dl: v.get_by_role('menuitem', name='Download as Excel (.xlsx)').click()
    path=dl.value.path(); print('xlsx bytes:', os.path.getsize(path))
    print('errors', errs[:5])
    b.close()
