from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import json
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw in [1300]:
        pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type=='warning' and 'encrypt' in m.text else None)
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(1200)
        info=pg.evaluate("""(async()=>{const s=await import('./js/state/store.js'); const st=s.getState(); const d=st.conversations.filter(c=>c.kind==='direct'&&!c.spaceId);
          const all=d.flatMap(c=>c.messages.filter(m=>!m.system&&!m.deleted)); return {convos:d.length, msgs:all.length, sealed:all.filter(m=>m.sealed).length, plainBodies:all.filter(m=>m.body).length, id:d[0].id, raw: JSON.stringify((await (await import('./js/state/storage.js')).readSavedState())).includes(d[0].messages.find(m=>!m.system)?.body||'zz')}})()""")
        print(vw, info, flush=True)
        stored=pg.evaluate("(async()=>{const st=(await (await import('./js/state/storage.js')).readSavedState()); const c=st.conversations.find(c=>c.kind==='direct'); return [c.messages.filter(m=>m.body&&!m.system).length, c.messages.filter(m=>m.sealed).length, !!st.members[0].publicKey, JSON.stringify(st).includes('privateJwk')]})()")
        print(' stored: plain bodies, sealed, publicKey, privateKeyInState:', stored)
        cid=info['id']
        pg.evaluate(f"location.hash='#messages-{cid}'"); pg.wait_for_timeout(800)
        if pg.locator('.thread').count()==0:
            pg.evaluate("location.hash='#messages'"); pg.wait_for_timeout(500); pg.locator('.conversation-row, [class*=conversation]').first.click(); pg.wait_for_timeout(600)
        print(' bodies shown:', pg.locator('.message__body').count(), 'locked:', pg.locator('.message__body--locked').count(), 'lock btn:', pg.locator('.thread__lock').count())
        pg.locator('.thread:has(.thread__lock) .thread__input').fill('secret plan 42'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        last=pg.evaluate("""(async()=>{const s=await import('./js/state/store.js'); const st=s.getState(); for (const c of st.conversations){const m=c.messages.at(-1); if(m&&m.authorId===st.currentUserId&&Date.now()-m.createdAt<5000) return [c.kind, m.body, !!m.sealed]} return null})()""")
        print(' sent:', last, 'shown:', pg.locator('.message__body', has_text='secret plan 42').count(), 'in storage:', pg.evaluate("(async()=>JSON.stringify((await (await import('./js/state/storage.js')).readSavedState())).includes('secret plan 42'))()"))
        pg.locator('.thread__lock').first.click(); pg.wait_for_timeout(500)
        print(' safety groups:', pg.locator('.safety__number span').count())
        pg.locator('.safety').get_by_role('button', name='Mark as verified').click(); pg.wait_for_timeout(300)
        print(' lock text:', pg.locator('.thread__lock').first.inner_text())
        pg.reload(); pg.wait_for_timeout(1500)
        print(' after reload shown:', pg.locator('.message__body', has_text='secret plan 42').count(), 'locked:', pg.locator('.message__body--locked').count())
        pg.screenshot(path=f'test-output/t119_{vw}.png')
        # edit
        pg.locator('.thread:has(.thread__lock) .message--mine').last.hover(); 
        btn=pg.locator('.thread:has(.thread__lock) .message--mine').last.get_by_role('button', name='Edit')
        if btn.count():
            btn.click(force=True); pg.locator('.thread:has(.thread__lock) .message__editor textarea').fill('secret plan 43'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
            print(' edited shown:', pg.locator('.message__body', has_text='secret plan 43').count(), 'stored plain:', pg.evaluate("(async()=>JSON.stringify((await (await import('./js/state/storage.js')).readSavedState())).includes('secret plan 43'))()"))
    print('errors', errs)
