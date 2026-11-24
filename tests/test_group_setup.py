# Start a group: one page, no steps, no templates (Nov 20): asking for a public page makes it public and still invite only.
# Then "Set up your group's page" opens (group-setup.js).
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    st=lambda js: pg.evaluate("async()=>{const s=await import('./js/state/store.js'); "+js+"}")
    pg.evaluate("location.hash='#new-group'"); pg.wait_for_timeout(600)
    form=pg.locator('.new-group-form')
    print('one page:', form.count(), '| steps:', pg.locator('.new-event__count').count(), '| All options button:', pg.get_by_role('button', name='All options').count())
    if pg.locator('.new-event__count').count(): errs.append('steps still shown')
    # Nov 20 (later): no templates and no access choices; one public-page question (test_new_group_order).
    if form.locator('input[name=new-template], input[name=new-visibility], input[name=new-joining]').count(): errs.append('templates or access choices still shown')
    pg.screenshot(path='test-output/new-group-one-page.png', full_page=True)
    pg.get_by_role('button', name='Create group').click(); print('needs a name:', pg.locator('.new-group-form .form-error').inner_text())
    pg.locator('input[aria-label="Group name"]').fill('The Night Owls')
    pg.locator('label', has_text='Yes, give it a public page').click()
    pg.get_by_role('button', name='Create group').click(); pg.wait_for_timeout(900)
    g=st("const g=s.getSpaces().find(x=>x.name==='The Night Owls'); return [g.id, g.visibility, g.joining, g.template]"); print('made:', g)
    if g[1:]!=['public','invite','public-page']: errs.append('wrong group made')
    # Nov 20: the setup picker replaced the group tour here (test_group_setup_flow).
    print('setup sheet:', pg.locator('.group-setup').count())
    if pg.locator('.group-setup').count() != 1: errs.append('the setup picker should open after creating')
    if pg.locator('.group-tour').count(): errs.append('the old group tour should not start')
    print('errors', errs)
    b.close()
