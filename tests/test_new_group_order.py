"""Nov 20 (later): Create a group has no templates and no "Who can see it" /
"How people join". One question: "Do you want a searchable, public page for
this group?" No (default): private, invite only. Yes: public, still invite only.
(The tabs, and picking modules after: test_group_setup_flow.)"""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js}}})()")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 1100}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#new-group'"); pg.wait_for_timeout(800)
    form = pg.locator('.new-group-form')
    check(form.locator('input[name=new-template]').count() == 0 and form.get_by_text('Start from a template').count() == 0, 'no templates')
    check(form.locator('input[name=new-visibility], input[name=new-joining]').count() == 0, 'no “Who can see it” or “How people join”')
    check(form.get_by_text('Do you want a searchable, public page for this group?').count() == 1, 'the public-page question')
    check(form.get_by_text('This is useful for public facing groups like bands, businesses, official groups, and more.').count() == 1, 'with its explanation')
    check(form.locator('input[name=new-public][value=no]').is_checked(), 'No is picked to start')
    pg.screenshot(path='test-output/out/new-group-public-question.png', full_page=True)
    # No: private, invite only
    form.get_by_label('Group name').fill('Garden Crew')
    form.get_by_role('button', name='Create group').click(); pg.wait_for_timeout(900)
    g = st(pg, "const g=s.getSpaces().find(x=>x.name==='Garden Crew'); return {v:g.visibility, j:g.joining, types:g.modules.map(m=>m.type), tabs:(g.tabs||[]).map(t=>[t.name,t.visibility||''])}")
    check(g['v'] == 'private' and g['j'] == 'invite', f'No: private and invite only ({g["v"]}, {g["j"]})')
    # Yes: public, still invite only
    pg.evaluate("sessionStorage.removeItem('3den.groupSetup'); document.querySelector('dialog.group-setup-modal')?.remove(); document.querySelector('.tour-card')?.remove()")
    pg.evaluate("location.hash='#new-group'"); pg.wait_for_timeout(800)
    form = pg.locator('.new-group-form')
    form.get_by_label('Group name').fill('Porch Band')
    form.locator('label', has_text='Yes, give it a public page').click()
    form.get_by_role('button', name='Create group').click(); pg.wait_for_timeout(900)
    g = st(pg, "const g=s.getSpaces().find(x=>x.name==='Porch Band'); return {v:g.visibility, j:g.joining, mods:g.modules.map(m=>[m.type,m.tabId||'home']), tabs:(g.tabs||[]).map(t=>[t.id,t.name,t.visibility||''])}")
    check(g['v'] == 'public' and g['j'] == 'invite', f'Yes: public, still invite only ({g["v"]}, {g["j"]})')
    # Tabs and modules after this: test_group_setup_flow.
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
