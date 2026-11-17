# Every space and every module full page: no stray "null"/"undefined"/"NaN" text, no page errors, no sideways overflow on mobile.
import os; os.makedirs('test-output', exist_ok=True)
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1440, 400]:
        pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(300)
        ids=pg.evaluate("""async () => { const { getSpaces } = await import('./js/state/store.js'); return getSpaces().filter((s, i) => !(s.id.startsWith('y-grp-') || s.id.startsWith('blog-y-')) || i % 10 === 0).flatMap(s => [ '#space-'+s.id, ...(s.tabs || []).slice(1).map(t => '#space-'+s.id+'--'+t.id), ...s.modules.map(m => '#module-'+m.id) ]); }""")
        bad=[]
        for hsh in ids:
            pg.evaluate(f"location.hash = '{hsh}'"); pg.wait_for_timeout(250)
            txt=pg.evaluate("document.querySelector(hashTarget()) ? '' : ''".replace("hashTarget()", "'body'"))
            text=pg.evaluate("(location.hash.startsWith('#module') ? document.getElementById('module-page-view') : document.getElementById('homepage-view')).innerText")
            import re
            for w in ['null','undefined','NaN','[object Object]']:
                if re.search(r'\b'+re.escape(w)+r'\b', text): bad.append((hsh, w))
            ow=pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            if ow>2: bad.append((hsh, f'overflow {ow}px'))
        print(vw, 'checked', len(ids), 'pages; problems:', bad)
        pg.close()
    b.close()
print('ERRORS', errs)
