"""Nov 20: closing the joined-from-link tour partway (or leaving) asks
"Finish the tour?" on the next visit; Resume picks it up, No thanks ends it.
And: drag files onto the vault (card or full page), or onto a folder."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const a=await import('./js/state/accounts.js'); const g=await import('./js/state/groups.js'); {js}}})()")
def new_visit(pg):
    pg.evaluate("sessionStorage.clear()"); pg.reload(); pg.wait_for_timeout(1200)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 860}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    gid = st(pg, "return s.getSpaces().find(x=>x.inviteCode==='supper24').id")
    st(pg, f"a.signOut(); const m=a.createAccount({{name:'Rosa Diaz', username:'rosad', email:'rosa@example.com', password:null, arrival:{{source:'group', spaceId:'{gid}'}}}}); g.addMember('{gid}', m.id, 'member', {{via:'link'}}); location.hash='#space-{gid}'")
    pg.wait_for_timeout(16000)
    card = pg.locator('.joined-tour')
    check('Next step' in (card.text_content() or ''), 'the Next step card shows')
    card.get_by_role('button', name='Close').click(); pg.wait_for_timeout(400)
    check(pg.locator('.joined-tour').count() == 0, '× closes it')
    check(st(pg, "return s.getCurrentUser().onboarding.joinedTour.stage") == 'paused', 'and pauses the tour')
    home = st(pg, "return s.getPersonalSpace().id")
    pg.evaluate(f"location.hash='#space-{home}'"); pg.wait_for_timeout(800)
    check(pg.locator('.joined-tour').count() == 0, 'not again this visit, even at home')
    signed_in = st(pg, "return s.getCurrentUser().name")
    new_visit(pg)
    check(st(pg, "return s.getCurrentUser().name") == signed_in, 'still signed in after a reload')
    card = pg.locator('.joined-tour--resume')
    check(card.count() == 1 and 'Want to finish the tour where you left off?' in card.text_content(), 'next visit: "Finish the tour?"')
    pg.screenshot(path='test-output/out/tour-resume.png')
    card.get_by_role('button', name='Resume').click(); pg.wait_for_timeout(600)
    card = pg.locator('.joined-tour')
    on_home = pg.evaluate("location.hash").endswith(home) or pg.evaluate("location.hash") in ('', '#')
    check(('Welcome to your homepage!' in card.text_content()) if on_home else ('Next step' in card.text_content()), f'Resume picks it up (on home: {on_home})')
    if on_home:
        card.get_by_role('button', name='Next').click(); pg.wait_for_timeout(500)
    else:
        card.get_by_role('button', name='Go to my homepage').click(); pg.wait_for_timeout(800)
        pg.locator('.joined-tour').get_by_role('button', name='Next').click(); pg.wait_for_timeout(500)
    check('Your dashboard' in pg.locator('.joined-tour').text_content(), 'on to the dashboard step')
    # Leave partway (no ×), come back: asked again, and resumes on that step
    new_visit(pg)
    card = pg.locator('.joined-tour--resume')
    check(card.count() == 1, 'left partway: asked again next visit')
    pg.evaluate(f"location.hash='#space-{home}'"); pg.wait_for_timeout(600)
    pg.locator('.joined-tour--resume').get_by_role('button', name='Resume').click(); pg.wait_for_timeout(600)
    check('Your dashboard' in (pg.locator('.joined-tour').text_content() or ''), 'Resume on the homepage opens the step they were on')
    # No thanks ends it
    pg.locator('.joined-tour').get_by_role('button', name='Close').click(); pg.wait_for_timeout(300)
    new_visit(pg)
    pg.locator('.joined-tour--resume').get_by_role('button', name='No thanks').click(); pg.wait_for_timeout(300)
    check(st(pg, "return s.getCurrentUser().onboarding.joinedTour.stage") == 'done', 'No thanks ends it')
    new_visit(pg)
    check(pg.locator('.joined-tour').count() == 0, 'and it never asks again')

    # ── Vault: drag files in ──
    vault = st(pg, "return s.getPersonalSpace().modules.find(m=>m.type==='vault').id")
    pg.evaluate(f"location.hash='#space-{home}'"); pg.wait_for_timeout(800)
    target = f'[data-module-id="{vault}"] .module-frame__body, [data-module-id="{vault}"] .module__body'
    body = pg.locator(f'[data-module-id="{vault}"]').locator('.vault-drop').count()
    def drop(selector, names):
        pg.evaluate("""([sel, names]) => {
          const el = document.querySelector(sel);
          const dt = new DataTransfer();
          for (const n of names) dt.items.add(new File(['hello ' + n], n, { type: 'text/plain' }));
          const opts = { bubbles: true, cancelable: true, dataTransfer: dt };
          el.dispatchEvent(new DragEvent('dragenter', opts));
          el.dispatchEvent(new DragEvent('dragover', opts));
          window.__hint = document.querySelector('.vault-drop')?.textContent || '';
          el.dispatchEvent(new DragEvent('drop', opts));
        }""", [selector, names])
        pg.wait_for_timeout(500)
    card_sel = f'[data-module-id="{vault}"] .vault-item, [data-module-id="{vault}"] .empty-state, [data-module-id="{vault}"] .vault-card, [data-module-id="{vault}"] .module-frame__body'
    sel = pg.evaluate(f"""() => {{ const f=document.querySelector('[data-module-id="{vault}"]'); const t=f.querySelector('.empty-state') || f.querySelector('.vault-item') || f; return t === f ? '[data-module-id="{vault}"]' : null; }}""")
    drop(f'[data-module-id="{vault}"] .empty-state', ['notes.txt', 'list.txt'])
    check('Drop to add to your vault' in pg.evaluate("window.__hint"), f'dragging over the card says where they’ll go ({pg.evaluate("window.__hint")})')
    names = st(pg, f"return s.getModule('{vault}').data.items.map(i=>i.name)")
    check('notes.txt' in names and 'list.txt' in names, f'dropping files on the card adds them ({names})')
    # A folder, then drop onto it on the full page
    st(pg, f"const m=s.getModule('{vault}'); s.updateModuleData(m.id, {{...m.data, items:[...m.data.items, {{id:'fold-1', kind:'folder', name:'Recipes', parentId:null, createdAt:Date.now(), updatedAt:Date.now()}}]}})")
    pg.evaluate(f"location.hash='#module-{vault}'"); pg.wait_for_timeout(900)
    row = pg.locator('#module-page-view [data-item-id="fold-1"]').first
    check(row.count() == 1, 'the folder shows on the full page')
    drop('#module-page-view [data-item-id="fold-1"]', ['soup.txt'])
    check('Drop to add to Recipes' in pg.evaluate("window.__hint"), f'over a folder: "Drop to add to Recipes" ({pg.evaluate("window.__hint")})')
    soup = st(pg, f"return s.getModule('{vault}').data.items.find(i=>i.name==='soup.txt')")
    check(soup and soup.get('parentId') == 'fold-1', 'dropped on a folder: it goes in that folder')
    # Show the hint for a screenshot
    pg.evaluate("""() => { const el=document.querySelector('#module-page-view .vault-page'); const dt=new DataTransfer(); dt.items.add(new File(['x'],'x.txt')); el.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:dt})); el.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt})); }""")
    pg.wait_for_timeout(200)
    pg.screenshot(path='test-output/out/vault-drop.png')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
