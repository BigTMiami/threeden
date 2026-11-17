from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1400,'height':950}, accept_downloads=True)
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    # a spreadsheet in the vault
    pg.evaluate("location.hash='#module-tenants-vault'"); pg.wait_for_timeout(900)
    v=pg.locator('#module-page-view')
    v.get_by_role('button', name='New').first.click(); pg.wait_for_timeout(200)
    print('new menu has Spreadsheet:', v.get_by_role('menuitem', name='Spreadsheet').count() or v.get_by_text('Spreadsheet').count())
    (v.get_by_role('menuitem', name='Spreadsheet') if v.get_by_role('menuitem', name='Spreadsheet').count() else v.get_by_text('Spreadsheet').first).click(); pg.wait_for_timeout(400)
    nm=v.locator('input[type=text]:visible').first
    print('name field:', nm.get_attribute('aria-label') or nm.get_attribute('placeholder'))
    nm.fill('Dues tracker'); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
    print('opened sheet editor:', v.locator('.sheet__table').count(), '| title:', v.inner_text()[:80].replace('\n',' | '))
    # import xlsx into it
    v.locator('.sheet__tool--menu', has_text='File').click()
    with pg.expect_file_chooser() as fc: v.get_by_role('menuitem', name='Import a file (.xlsx or .csv)…').click()
    fc.value.set_files('tests/files/import-test.xlsx'); pg.wait_for_timeout(800)
    cell=lambda c,r: v.locator(f'td[data-col="{c}"][data-row="{r}"]')
    print('toast:', pg.locator('.toast').last.inner_text())
    print('tabs:', v.locator('.sheet__tab').all_inner_texts(), '| B2:', cell(1,1).inner_text(), '| B4:', cell(1,3).inner_text(), '| C3:', cell(2,2).inner_text(), '| A1 bold:', cell(0,0).evaluate('e=>getComputedStyle(e).fontWeight'))
    v.locator('.sheet__tab', has_text='Notes').click(); pg.wait_for_timeout(200); print('Notes B1:', cell(1,0).inner_text())
    pg.screenshot(path='test-output/sheet-vault.png')
    saved=st(pg, "const m=s.getModule('tenants-vault'); const it=m.data.items.find(i=>i.name==='Dues tracker'); return [it.kind, it.moduleType, it.data.sheets.length]")
    print('saved in vault:', saved)
    # homepage card (band merch on Porch Lights) compact
    pg.evaluate("location.hash='#space-porchlights--band-tab-room'"); pg.wait_for_timeout(1000)
    card=pg.locator('.sheet--card:visible').first
    print('card:', card.count(), '| toolbar in card:', card.locator('.sheet__tools').count(), '| open full:', card.locator('.sheet__more').count())
    # phone
    pg.set_viewport_size({'width':390,'height':844}); pg.evaluate("location.hash='#module-band-merch'"); pg.wait_for_timeout(900)
    print('phone overflow:', pg.evaluate('document.documentElement.scrollWidth > innerWidth'))
    pg.screenshot(path='test-output/sheet-phone.png')
    print('errors', errs[:4])
    b.close()
