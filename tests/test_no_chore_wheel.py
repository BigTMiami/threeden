# The chore wheel is gone: not in the module library or vault "+ New", the Household template starts with a to-do, and the house and family pages load.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    info=pg.evaluate("""async()=>{ const r=await import('./js/modules/registry.js'); const s=await import('./js/state/store.js'); const t=await import('./js/data/starter-layouts.js');
      const all=s.getState().spaces.flatMap(x=>x.modules.map(m=>m.type));
      return { inRegistry: (r.MODULE_TYPES ?? r.moduleTypes ?? []).some?.(m=>m.type==='chores') ?? null, used: all.filter(x=>x==='chores').length,
        house: t.GROUP_TEMPLATES.find(x=>x.id==='house').modules().map(m=>m.type), cleanup: s.getModule('larsen-cleanup')?.type } }""")
    print(info)
    if info['used'] or 'chores' in info['house'] or info['cleanup']!='todo': errs.append('chores still around')
    for h in ['#space-juniper','#space-larsen','#module-larsen-cleanup']:
        pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(700)
        txt=pg.locator('main').inner_text()
        if 'Chore wheel' in txt: errs.append(f'chore wheel text on {h}')
    print('cleanup tasks:', pg.locator('#module-page-view .todo-item, #module-page-view [class*=todo] li').count())
    print('errors', errs)
    b.close()
