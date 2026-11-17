from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
JS = r"""
(async()=>{
  const t=await import('./js/ui/themes.js'); const s=await import('./js/state/store.js');
  const parse=(c)=>{const m=c.match(/[\d.]+/g).map(Number); const v=m.slice(c.startsWith('color(')?0:0,3); return c.startsWith('color(') ? v.map(x=>x*255) : v};
  const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
  const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05)};
  const out={};
  for (const th of t.THEMES.filter(x=>x.dark)) {
    t.setTheme('m-leo', th.id); await new Promise(r=>setTimeout(r,60));
    const probe=document.createElement('div'); probe.style.cssText='position:fixed;top:0;left:0;background:var(--color-surface)'; document.body.append(probe);
    const bg=parse(getComputedStyle(probe).backgroundColor);
    const res={};
    for (const v of ['--color-danger','--color-warning-text','--color-text-muted','--color-text-faint','--color-link']) { const el=document.createElement('span'); el.style.color=`var(${v})`; probe.append(el); res[v]=ratio(parse(getComputedStyle(el).color),bg).toFixed(1); }
    // a red event chip
    const chip=document.createElement('button'); chip.className='event-chip'; chip.style.setProperty('--event-color','#b32424'); chip.textContent='x'; probe.append(chip);
    res.redChip=ratio(parse(getComputedStyle(chip).color), parse(getComputedStyle(chip).backgroundColor)).toFixed(1);
    const chip2=document.createElement('button'); chip2.className='event-chip'; chip2.style.setProperty('--event-color','#ac6600'); probe.append(chip2);
    res.orangeChip=ratio(parse(getComputedStyle(chip2).color), parse(getComputedStyle(chip2).backgroundColor)).toFixed(1);
    probe.remove(); out[th.id]=res;
  }
  t.setTheme('m-leo','daylight');
  return out;
})()
"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    import json
    for k,v in pg.evaluate(JS).items(): print(k, v)
    print('errors', errs)
