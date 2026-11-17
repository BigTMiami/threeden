from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
JS_OVER = r"""
(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const scrollers = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX)) return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[hidden]') || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.right > vw + 2 && !scrollers(el)) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(r.right)}`);
  }
  return { docOverflow: document.documentElement.scrollWidth > vw + 1, items: [...new Set(out)].slice(0, 6) };
})()
"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    mods = pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); const me=s.getCurrentUser(); return s.getSpaces().filter(sp=>sp.memberIds.includes(me.id)||sp.kind==='blog').flatMap(sp=>sp.modules.map(m=>[m.id,m.type])).slice(0,400)})()")
    seen=set(); bad=0
    pages = [f'#module-{mid}' for mid,t in mods if not (t in seen or seen.add(t))]
    pages += ['#feed','#space-me','#space-mutualaid','#directory-tenants','#help','#help-events','#welcome','#saved','#tag-mutualaid','#series-priya-ev-1','#event-tenants-ev-3','#account','#settings-league--moderation','#new-group','#messages-conv-pantry']
    for h in pages:
        pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(450)
        r=pg.evaluate(JS_OVER)
        if r['docOverflow'] or r['items']:
            bad+=1; print(h, r)
    print('checked', len(pages), 'pages; with overflow:', bad)
    print('errors', errs)
