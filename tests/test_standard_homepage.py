# Every new account's homepage starts with the Dashboard and the vault, side by side. The Dashboard's full page has Customize:
# which parts show and their order, on the card too. New groups start with two small modules (and a shorter Up next).
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const a=await import('./js/state/accounts.js'); const g=await import('./js/state/groups.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    shape="sp.modules.map(m=>[m.type,m.title,m.span,m.rows].join(' '))"
    new=st(pg, f"const m=a.createAccount({{name:'Rosa Diaz', username:'rosa-test', email:'rosa@example.com', password:'x'}}); const sp=s.getState().spaces.find(x=>x.kind==='personal'&&x.memberIds[0]===m.id); return {shape}")
    print('new homepage:', new)
    if new!=['dashboard Dashboard 6 14', 'vault My vault 6 14']: errs.append('new homepage should be Dashboard and vault, half and half')
    pg.evaluate("location.hash='#'"); pg.wait_for_timeout(2600); print('frames drawn:', pg.locator('.module-grid .module-frame').count())
    pg.screenshot(path='test-output/standard-homepage.png')
    # Customize on the Dashboard's full page (Leo's)
    st(pg, "a.signIn('m-leo'); return 1")
    did=st(pg, "const sp=s.getState().spaces.find(x=>x.kind==='personal'&&x.memberIds[0]==='m-leo'); return sp.modules.find(m=>m.type==='dashboard').id")
    pg.evaluate(f"location.hash='#module-{did}'"); pg.wait_for_timeout(900)
    heads=lambda: pg.locator('.dashboard--page .dashboard__section h2, .dashboard--page .dashboard__section h3').evaluate_all("els=>els.map(e=>e.textContent.trim()).filter(t=>/Coming up|For you|Your tasks|Your groups/.test(t))")
    print('before:', heads())
    pg.get_by_role('button', name='Customize').click(); pg.wait_for_timeout(200)
    pg.locator('.dashboard__customize-list label', has_text='Your groups').locator('input').uncheck(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Move Your tasks up').click(); pg.wait_for_timeout(200)
    after=heads(); print('after hiding groups, tasks moved up:', after, '| saved:', st(pg, f"return s.getModule('{did}').data.sections"))
    if any('Your groups' in t for t in after): errs.append('groups still shown')
    pg.screenshot(path='test-output/dashboard-customize.png')
    pg.get_by_role('button', name='Reset to the usual').click(); pg.wait_for_timeout(200); print('reset:', st(pg, f"return s.getModule('{did}').data.sections ?? null"))
    grp=st(pg, "const grp=g.createGroup({name:'Okafors', template:'friends'}); return s.getSpace(grp.id).modules.map(m=>[m.type,m.span,m.rows].join(' '))")
    print('new friends-and-family group:', grp)
    if grp!=['upnext 12 7','chat 6 10','calendar 6 10']: errs.append('group template')
    print('errors', errs)
    b.close()
