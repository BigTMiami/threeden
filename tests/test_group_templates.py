# Every template on the Create a group page makes a group whose page draws without errors.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    ids=pg.evaluate("(async()=>{const t=await import('./js/data/starter-layouts.js'); return t.GROUP_TEMPLATES.filter(x=>!x.hidden).map(x=>x.id)})()")
    for tid in ids:
        gid=pg.evaluate(f"(async()=>{{const g=await import('./js/state/groups.js'); return g.createGroup({{name:'T {tid}', template:'{tid}'}}).id}})()")
        pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(700)
        mods=pg.locator('.module-frame').evaluate_all("els=>els.map(e=>e.dataset.moduleType)")
        print(tid, mods)
        if len(mods) < {'blank': 0, 'forum': 2}.get(tid, 3): errs.append(f'{tid}: too few modules')
    print('errors', errs)
    b.close()
