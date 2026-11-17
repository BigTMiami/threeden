# Edit mode on a computer: each module shows a small phone number, its place in the one-column stack on phones. Picking another
# number moves it there; phones then show modules in that order; "Reset phone order" goes back to the page's own order.
# The Modules panel has a bottom border.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    st(pg, "s.setEditMode(true); return 1"); pg.wait_for_timeout(600)
    print('library bottom border:', pg.evaluate("getComputedStyle(document.querySelector('.library')).borderBottomWidth"))
    frames=pg.locator('.module-grid > .module-frame')
    ids=frames.evaluate_all("els=>els.map(e=>e.dataset.moduleId)")
    nums=frames.locator('.module-frame__phone-select').evaluate_all("els=>els.map(e=>e.value)")
    print('modules:', len(ids), '| phone numbers:', nums)
    if nums != [str(i+1) for i in range(len(ids))]: errs.append('numbers should start in page order')
    last=ids[-1]
    pg.locator(f'.module-frame[data-module-id="{last}"] .module-frame__phone-select').select_option('1'); pg.wait_for_timeout(500)
    print('after moving the last to 1:', pg.locator(f'.module-frame[data-module-id="{last}"] .module-frame__phone-select').input_value(), '| first module now:', pg.locator(f'.module-frame[data-module-id="{ids[0]}"] .module-frame__phone-select').input_value(), '| reset shown:', pg.locator('.edit-bar__phone-reset').count())
    pg.screenshot(path='test-output/phone-order-edit.png')
    st(pg, "s.setEditMode(false); return 1")
    pg.set_viewport_size({'width':390,'height':844}); pg.wait_for_timeout(700)
    phone=pg.locator('.module-grid > .module-frame').evaluate_all("els=>els.map(e=>e.dataset.moduleId)")
    print('phone order first:', phone[0]==last, '| desktop page order unchanged:', st(pg, "return s.getVisibleModules().map(m=>m.id)")==ids)
    if phone[0]!=last: errs.append('phone should show the moved module first')
    pg.set_viewport_size({'width':1300,'height':900}); st(pg, "s.setEditMode(true); return 1"); pg.wait_for_timeout(600)
    pg.locator('.edit-bar__phone-reset').click(); pg.wait_for_timeout(400)
    print('reset: numbers', pg.locator('.module-grid > .module-frame .module-frame__phone-select').evaluate_all("els=>els.map(e=>e.value)"), '| reset gone:', pg.locator('.edit-bar__phone-reset').count()==0)
    # works with a layout too: spotlight puts the featured module first by default
    st(pg, "s.setPageLayout('spotlight'); return 1"); pg.wait_for_timeout(500)
    fid=st(pg, "return s.getPageLayout().featuredId")
    print('spotlight: featured is #1 on phones:', pg.locator(f'.module-frame[data-module-id="{fid}"] .module-frame__phone-select').input_value()=='1')
    print('errors', errs)
    b.close()
