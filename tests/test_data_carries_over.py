# Updates keep your data (js/state/upgrade.js): a save from an older version is brought up to date when it loads.
# Things you made and deleted stay that way; sample content that's new since your last load is added; a note says so.
# The first load after the switch moves the old versioned save ('3den.homepage-prototype.v67') into the one slot.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
IDB="""
const open=()=>new Promise((res,rej)=>{const r=indexedDB.open('3den',1); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);});
const tx=(db,mode,fn)=>new Promise((res,rej)=>{const t=db.transaction('state',mode); const q=fn(t.objectStore('state')); let out=null; if(q) q.onsuccess=()=>{out=q.result}; t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error);});
"""
def edit_save(pg, js, move_to=None):
    # change the saved record with `js` (s = the saved state), optionally under another key
    return pg.evaluate(f"""(async()=>{{ {IDB}
      const db=await open(); const rec=await tx(db,'readonly',st=>st.get('3den.homepage-prototype'));
      const s=JSON.parse(rec.json); const result=(()=>{{ {js} }})(); rec.json=JSON.stringify(s);
      {"await tx(db,'readwrite',st=>st.delete('3den.homepage-prototype'));" if move_to else ''}
      await tx(db,'readwrite',st=>st.put(rec, {repr(move_to) if move_to else "'3den.homepage-prototype'"}));
      return result; }})()""")
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1300,'height':900}); pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.app-bar', timeout=20000); pg.wait_for_timeout(800)
    # make something: a note module on Leo's homepage with words in it
    st(pg, "s.addModule('note', undefined, {title:'Leo’s test note', data:{title:'', html:'<p>Remember the plumber</p>'}}); return 1"); pg.wait_for_timeout(800)
    print('fresh save has version + seen ids:', edit_save(pg, "return [s.dataVersion, (s.demoSeen||[]).length]"))

    # ── 1. an old save (v67 slot, no version): moved over and kept ──
    # (before Nov 16, starter modules on sample pages had random ids: put some back to check they're matched up, not doubled)
    renamed=edit_save(pg, """delete s.dataVersion; delete s.demoSeen; s.spaces=s.spaces.filter(x=>x.id!=='league'); let n=0;
      for (const sp of s.spaces) for (const m of sp.modules) if (m.id.includes('--')) { m.id='mod-'+Math.random().toString(36).slice(2,9); n++; } return n""", move_to='3den.homepage-prototype.v67')
    print('old-style random module ids put back:', renamed)
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=30000); pg.wait_for_timeout(1500)
    note=st(pg, "return s.getState().spaces.flatMap(x=>x.modules).some(m=>m.title==='Leo’s test note')")
    league=st(pg, "return s.getState().spaces.some(x=>x.id==='league')")
    toast=pg.locator('.toast').all_inner_texts()
    keys=pg.evaluate(f"(async()=>{{ {IDB} const db=await open(); return await tx(db,'readonly',st=>st.getAllKeys()); }})()")
    extra=st(pg, "return s.getState().spaces.flatMap(x=>x.modules).filter(m=>/^mod-/.test(m.id) && m.title!=='Leo’s test note').length")
    print('old save: my note kept', note, '| sample modules left with random ids', extra, '| new group added', league, '| slots now', keys, '| note:', toast)
    if not note: errs.append('old save lost my note')
    if extra: errs.append('old random module ids not matched up')
    if not league: errs.append('new sample group not added')
    if keys!=['3den.homepage-prototype']: errs.append('old slot not moved')

    # ── 2. a later update: what I deleted stays deleted, my things stay, only new sample content comes in ──
    gone=st(pg, "const f=s.getModule('leo-feed'); const d=structuredClone(f.data); const gone=d.posts.shift(); s.updateModuleData('leo-feed', d); return gone.id"); pg.wait_for_timeout(800)
    edit_save(pg, """s.dataVersion=67; const g=s.spaces.find(x=>x.id==='porchlights'); s.spaces=s.spaces.filter(x=>x.id!=='porchlights');
      const ids=new Set(); (function walk(v){ if(Array.isArray(v)) v.forEach(walk); else if(v&&typeof v==='object'){ if(typeof v.id==='string') ids.add(v.id); Object.values(v).forEach(walk);} })(g);
      s.demoSeen=s.demoSeen.filter(id=>!ids.has(id)); return 1""")
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=30000); pg.wait_for_timeout(1500)
    back=st(pg, f"return s.getModule('leo-feed').data.posts.some(p=>p.id==='{gone}')")
    band=st(pg, "return s.getState().spaces.some(x=>x.id==='porchlights')")
    note=st(pg, "return s.getState().spaces.flatMap(x=>x.modules).some(m=>m.title==='Leo’s test note')")
    dupes=st(pg, "const ids=s.getState().spaces.flatMap(x=>x.modules.map(m=>m.id)); return ids.length-new Set(ids).size")
    toast=pg.locator('.toast').all_inner_texts()
    print('update: deleted post stays deleted', not back, '| new group added', band, '| my note kept', note, '| duplicate modules', dupes, '| note:', toast)
    if back: errs.append('a deleted post came back')
    if not band or not note: errs.append('update lost something or missed the new group')
    if dupes: errs.append('duplicate modules after the update')
    if not toast or 'updated' not in toast[0]: errs.append('no update note')
    pg.screenshot(path='test-output/data-carried-over.png')

    # ── 3. same version again: nothing changes, no note ──
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=30000); pg.wait_for_timeout(1200)
    print('reload, same version: note shown', pg.locator('.toast', has_text='updated').count())
    if pg.locator('.toast', has_text='updated').count(): errs.append('note on a plain reload')

    # ── 4. clearing site data still starts fresh ──
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=30000); pg.wait_for_timeout(1200)
    print('after clearing: my note gone', not st(pg, "return s.getState().spaces.flatMap(x=>x.modules).some(m=>m.title==='Leo’s test note')"))
    print('errors', errs)
