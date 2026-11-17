# The saved state lives in IndexedDB now: changes survive a reload; it holds far more than localStorage's ~5 MB;
# clearing localStorage still starts fresh (its token goes); an old localStorage save is moved over once;
# and a save in one window still reaches another.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1300,'height':900})
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    st=lambda js: pg.evaluate("async()=>{const s=await import('./js/state/store.js'); const g=await import('./js/state/storage.js'); "+js+"}")
    print('localStorage keys:', pg.evaluate("Object.keys(localStorage)"))
    print('in localStorage, the big save?', pg.evaluate("Object.keys(localStorage).some(k=>k.startsWith('3den.homepage-prototype'))"))
    # 1. a change survives a reload
    st("s.changeState(st=>{st.members.find(m=>m.id==='m-leo').bio='Saved in IndexedDB';}, 'account'); return 1"); pg.wait_for_timeout(400)
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    bio=st("return s.getMember('m-leo').bio"); print('after reload:', bio)
    if bio!='Saved in IndexedDB': errs.append('change lost on reload')
    # 2. bigger than localStorage could hold: ~8 MB
    st("s.changeState(st=>{st.bigTest='x'.repeat(8_000_000);}); return 1"); pg.wait_for_timeout(1500)
    print('save failed toast:', pg.locator('.toast', has_text='save').count())
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    size=st("return [s.getState().bigTest?.length ?? 0, g.savedSize()]"); print('8 MB kept:', size)
    if size[0]!=8_000_000: errs.append('big save lost')
    st("s.changeState(st=>{delete st.bigTest;}); return 1"); pg.wait_for_timeout(600)
    # 3. clearing localStorage starts fresh
    pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    print('after clearing localStorage:', st("return s.getMember('m-leo').bio"))
    if st("return s.getMember('m-leo').bio")=='Saved in IndexedDB': errs.append('should start fresh')
    # 4. an old localStorage save is moved over
    st("const st2=structuredClone(s.getState()); st2.members.find(m=>m.id==='m-leo').bio='From localStorage'; localStorage.removeItem('3den.saved-token'); localStorage.setItem('3den.homepage-prototype.v67', JSON.stringify(st2)); return 1")
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    print('moved over:', st("return s.getMember('m-leo').bio"), '| left in localStorage:', pg.evaluate("localStorage.getItem('3den.homepage-prototype.v67') !== null"))
    if st("return s.getMember('m-leo').bio")!='From localStorage': errs.append('old save not moved over')
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    print('still there after another reload:', st("return s.getMember('m-leo').bio"))
    # 5. live between windows
    other=ctx.new_page(); other.on('pageerror', lambda e: errs.append(str(e)))
    other.goto('http://localhost:8765/index.html'); other.wait_for_selector('.app-bar', timeout=20000)
    st("s.changeState(st=>{st.members.find(m=>m.id==='m-leo').bio='Live';}, 'account'); return 1"); pg.wait_for_timeout(2500)
    seen=other.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getMember('m-leo').bio})()"); print('other window sees:', seen)
    if seen!='Live': errs.append('live update missed')
    # 6. Reset the sample data (the demo tour's button) starts fresh
    pg.evaluate("(async()=>{const g=await import('./js/state/storage.js'); g.clearSavedState();})()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    print('after reset:', st("return s.getMember('m-leo').bio")[:40])
    print('errors', errs)
    b.close()
