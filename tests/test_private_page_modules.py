"""Nov 20: a group's private page. The basics are Board, Up next, Calendar,
Chat, Vault, and Tasks, in that order, in the edit-mode module list and in
"Set up your group's page". A group's private tabs don't offer Upcoming
events, Articles, General feed, Text feed, Relationship map, Survey, or
Carousel; its public tab still does. Chat's blurb is new. Survey is in the
vault's "+ New" list without opening "More"."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js}}})()")
def create(pg, name, public):
    pg.evaluate("location.hash='#new-group'"); pg.wait_for_timeout(700)
    form = pg.locator('.new-group-form')
    form.get_by_label('Group name').fill(name)
    if public: form.locator('label', has_text='Yes, give it a public page').click()
    form.get_by_role('button', name='Create group').click(); pg.wait_for_timeout(900)

BASICS = ['Board', 'Up next', 'Calendar', 'Chat', 'Vault', 'Tasks']
GONE = ['Upcoming events', 'Articles', 'General feed', 'Text feed', 'Relationship map', 'Survey', 'Carousel']
CHAT = 'Good for full conversations, mirrored in messages. Has channels.'

def library_labels(pg, section=None):
    root = pg.locator('#module-library')
    return [t.strip() for t in root.locator('.library-item__name, .library-item strong').all_inner_texts()]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    # The picker, on a group with a public page (its Private tab).
    create(pg, 'Porch Band', True)
    sheet = pg.locator('.group-setup')
    names = [c.inner_text().split('\n')[0] for c in sheet.locator('.group-setup__choice').all()]
    check(names[:6] == BASICS, f'picker: the basics first, in order ({names[:6]})')
    check(not any(n in names for n in GONE), f'picker: no public-page modules ({[n for n in GONE if n in names]})')
    chat = sheet.locator('.group-setup__choice', has_text='Chat').first.inner_text()
    check(CHAT in chat, 'picker: Chat’s new blurb')
    pg.screenshot(path='test-output/out/private-page-picker.png')
    sheet.get_by_role('button', name='Add to my page').click(); pg.wait_for_timeout(900)
    for _ in range(4):
        tip = pg.locator('.group-setup-tip')
        if tip.count() == 0: break
        tip.locator('button.button--primary').last.click(); pg.wait_for_timeout(300)

    # The module list on the Private tab (edit mode is on).
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(400)
    lib = pg.locator('#module-library')
    basics = [t.split('\n')[0].strip() for t in lib.locator('.library__list').first.locator('.library-item').all_inner_texts()]
    check(basics[:6] == BASICS, f'Private tab: the basics, in order ({basics})')
    for toggle in lib.locator('.library__more').all():
        if toggle.get_attribute('aria-expanded') == 'false': toggle.click()
    allnames = [t.split('\n')[0].strip() for t in lib.locator('.library-item').all_inner_texts()]
    check(not any(n in allnames for n in GONE), f'Private tab: no public-page modules ({[n for n in GONE if n in allnames]})')
    check('Forum' in allnames and 'Budget' in allnames, 'Private tab: the other modules are still offered')
    pg.screenshot(path='test-output/out/private-page-library.png')

    # The Public tab still offers them.
    gid = st(pg, "return s.getCurrentSpace().id")
    pg.evaluate(f"(async()=>{{const r=await import('./js/router.js'); r.goTo(r.spaceHref('{gid}','home'))}})()"); pg.wait_for_timeout(700)
    check(st(pg, "return s.getCurrentTabId()") == 'home', 'on the Public tab')
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(400)
    for toggle in lib.locator('.library__more').all():
        if toggle.get_attribute('aria-expanded') == 'false': toggle.click()
    pubnames = [t.split('\n')[0].strip() for t in lib.locator('.library-item').all_inner_texts()]
    check(all(n in pubnames for n in GONE), f'Public tab: still offers them ({[n for n in GONE if n not in pubnames]})')

    # A group without a public page: Home is private too.
    st(pg, 's.setEditMode(false)')
    create(pg, 'Book Club', False)
    pg.locator('.group-setup').get_by_role('button', name='Add to my page').click(); pg.wait_for_timeout(900)
    for _ in range(4):
        tip = pg.locator('.group-setup-tip')
        if tip.count() == 0: break
        tip.locator('button.button--primary').last.click(); pg.wait_for_timeout(300)
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(400)
    for toggle in lib.locator('.library__more').all():
        if toggle.get_attribute('aria-expanded') == 'false': toggle.click()
    homenames = [t.split('\n')[0].strip() for t in lib.locator('.library-item').all_inner_texts()]
    check(not any(n in homenames for n in GONE), f'Home of a private group: no public-page modules ({[n for n in GONE if n in homenames]})')
    st(pg, 's.setEditMode(false)')

    # The vault's + New: Survey without opening More.
    pg.evaluate("location.hash='#home'"); pg.wait_for_timeout(800)
    opened = pg.evaluate("""(async()=>{const m=await import('./js/modules/vault/vault-parts.js');
      return {top:m.NEW_MENU_ENTRIES.map(e=>e.label), more:m.MORE_MENU_ENTRIES.map(e=>e.label)}})()""")
    check('Survey' in opened['top'] and 'Survey' not in opened['more'], f'vault + New: Survey in the main list ({opened["top"]})')
    newbtn = pg.get_by_role('button', name='New').first
    if newbtn.count():
        newbtn.click(); pg.wait_for_timeout(300)
        menu = pg.locator('.vault__menu').first
        check(menu.locator('.vault__menu-item[data-action="module:survey"]:visible').count() == 1, 'vault + New: Survey shows without More')
        pg.screenshot(path='test-output/out/vault-new-survey.png')
        menu.locator('.vault__menu-item[data-action="module:survey"]').first.click(); pg.wait_for_timeout(400)
        form = pg.locator('.vault__create-form').first
        check(form.count() == 1 and 'New survey' in form.inner_text(), 'vault + New: Survey opens “New survey”')
    check(not errs, f'no page errors {errs[:2]}')
    b.close()

print('FAILED' if fails else 'ALL PASSED', len(fails))
