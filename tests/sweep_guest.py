# Guest sweep: every public page signed out, at 1440 and 400: no null/undefined/NaN, no overflow, no errors.
import os; os.makedirs('test-output', exist_ok=True)
import re
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1440,400]:
        pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(300)
        pg.evaluate("""async () => { const a = await import('./js/state/accounts.js'); a.signOut(); }"""); pg.wait_for_timeout(200)
        hashes=pg.evaluate("""async () => {
          const s = await import('./js/state/store.js'); const ev = await import('./js/state/events.js');
          const out = [];
          for (const [i, sp] of s.getSpaces().entries()) {
            if ((sp.id.startsWith('y-grp-') || sp.id.startsWith('blog-y-')) && i % 10) continue;
            if (sp.kind === 'blog') { const m = s.getMember(sp.memberIds[0]); out.push('#blog-' + m.username); sp.modules.forEach(x => out.push('#module-' + x.id)); }
            if (sp.kind === 'group' && s.publicTabsOf(sp).length) { out.push('#space-' + sp.id); sp.modules.forEach(x => out.push('#module-' + x.id)); }
          }
          ev.getPublicEvents().filter((o, i) => !o.event.id.startsWith('y-grp-') || i % 8 === 0).forEach(o => out.push('#event-' + o.event.id));
          out.push('#join-supper24');
          return out; }""")
        bad=[]
        for h in hashes:
            pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(200)
            text=pg.evaluate("document.querySelector('main').innerText")
            for w in ['null','undefined','NaN']:
                if re.search(r'\b'+w+r'\b', text): bad.append((h,w))
            if pg.evaluate("document.documentElement.scrollWidth - innerWidth")>2: bad.append((h,'overflow'))
        shown=pg.evaluate("location.hash")
        print(vw,'checked',len(hashes),'problems',bad)
        pg.close()
    b.close()
print('ERRORS', errs)
