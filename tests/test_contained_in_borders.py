# Containment sweep: nothing spills past the border of a card, module, or panel.
import os; os.makedirs('test-output', exist_ok=True)
import json, sys
from playwright.sync_api import sync_playwright
CHECK = r"""() => {
  const out = [];
  const boxes = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect(); if (r.width < 120 || r.height < 30) return false;
    const bordered = parseFloat(cs.borderLeftWidth) > 0 && parseFloat(cs.borderRightWidth) > 0 && cs.borderLeftStyle !== 'none';
    const shadow = cs.boxShadow !== 'none';
    return (bordered || shadow) && parseFloat(cs.borderTopLeftRadius) > 0;
  });
  for (const box of boxes) {
    if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(box).overflowX)) continue;
    const br = box.getBoundingClientRect();
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_ELEMENT);
    let n; let found = 0;
    while ((n = walker.nextNode()) && found < 2) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' || cs.position === 'absolute') { continue; }
      // skip anything inside a scroller or clipper below the box
      let clipped = false;
      for (let a = n.parentElement; a && a !== box; a = a.parentElement) {
        const ac = getComputedStyle(a);
        if (/(auto|scroll|hidden|clip)/.test(ac.overflowX) || ac.position === 'absolute' || ac.position === 'fixed') { clipped = true; break; }
      }
      if (clipped) continue;
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const over = Math.max(r.right - br.right, br.left - r.left);
      if (over > 2) {
        found++;
        out.push({ box: (box.className && box.className.baseVal === undefined ? box.className : box.tagName).toString().slice(0, 60), el: (n.className && n.className.baseVal === undefined ? n.className : n.tagName).toString().slice(0, 60), over: Math.round(over), text: (n.innerText || '').slice(0, 40) });
      }
    }
  }
  return out;
}"""
problems = {}
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300, 390]:
        pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(400)
        hashes=pg.evaluate("""async () => { const { getSpaces, getState } = await import('./js/state/store.js');
          const ev = []; for (const s of getSpaces()) for (const m of s.modules) for (const e of (m.data?.events ?? [])) if (e.kind !== 'entry' && ev.length < 40 && !e.id.startsWith('y-')) ev.push('#event-' + e.id);
          return ['#feed', '#feed-friends', '#groups', '#explore', '#messages', '#week', '#account', '#calendar', ...getSpaces().filter(s => !s.id.startsWith('y-grp-') && !s.id.startsWith('blog-y-')).flatMap(s => ['#space-'+s.id, ...s.modules.map(m => '#module-'+m.id)]), ...ev]; }""")
        for hsh in hashes:
            pg.evaluate(f"location.hash = '{hsh}'"); pg.wait_for_timeout(220)
            if hsh == '#feed':
                # open every "See all" so all asks render
                for btn in pg.locator('.needs__more').all(): btn.click(); pg.wait_for_timeout(200)
            res = pg.evaluate(CHECK)
            for r in res: problems.setdefault((r['box'], r['el']), []).append((vw, hsh, r['over'], r['text']))
        # notifications panel
        pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(300)
        bell = pg.locator('.app-bar [aria-label*="otification"]').first
        if bell.count(): bell.click(); pg.wait_for_timeout(400); [problems.setdefault((r['box'], r['el']), []).append((vw, 'bell', r['over'], r['text'])) for r in pg.evaluate(CHECK)]
        print(vw, 'pages', len(hashes)); sys.stdout.flush()
        pg.close()
    b.close()
for k, v in sorted(problems.items(), key=lambda kv: -len(kv[1])):
    print(len(v), k, v[:3])
print('errors', errs[:3] + [f'{k[0]} > {k[1]}' for k in problems][:5])
