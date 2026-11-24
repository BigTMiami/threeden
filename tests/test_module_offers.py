"""Nov 20 module review: where the module list offers each module, on a
group's public page, a group's private page, a user's homepage, and a
user's blog (js/modules/module-lists.js OFFERED_ON). About and Photo
gallery work on a group's public page; About shows the group there. New
groups with a public page start it with General feed and Upcoming events."""
from playwright.sync_api import sync_playwright
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)

EXPECT = {
  'groupPublic': ['calendar', 'events', 'forum', 'submissions', 'articles', 'generalfeed', 'textfeed', 'carousel', 'vaultfile', 'about', 'gallery'],
  'groupPrivate': ['upnext', 'announcements', 'calendar', 'chat', 'todo', 'forum', 'vault', 'submissions', 'budget', 'shifts', 'gantt', 'vaultfile'],
  'homepage': ['calendar', 'todo', 'vault', 'budget', 'gantt', 'vaultfile', 'dashboard', 'recentgroups', 'recents'],
  'blog': ['events', 'articles', 'generalfeed', 'textfeed', 'carousel', 'vaultfile', 'about', 'gallery'],
}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(1000)
    got = pg.evaluate("""async()=>{const r=await import('./js/modules/registry.js'); const L=await import('./js/modules/module-lists.js');
      const list=(k,pub)=>r.moduleTypesFor(k).filter(t=>!t.hiddenFromLibrary && t.available!==false && L.offeredOn(t,k,{publicTab:pub})).map(t=>t.type);
      return {groupPublic:list('group',true), groupPrivate:list('group',false), homepage:list('personal',false), blog:list('blog',false)}}""")
    for page, want in EXPECT.items():
        check(sorted(got[page]) == sorted(want), f'{page}: {sorted(got[page])}')

    # The module list on a new group's Public tab, in edit mode
    gid = pg.evaluate("""async()=>{const g=await import('./js/state/groups.js'); return g.createGroup({name:'Porch Band', visibility:'public', joining:'invite', setup:true}).id}""")
    tabs = pg.evaluate(f"""async()=>{{const s=await import('./js/state/store.js'); return s.getSpace('{gid}').modules.map(m=>[m.type, m.tabId||'home', m.span])}}""")
    check(tabs == [['generalfeed', 'home', 8], ['events', 'home', 4]], f'a new public page starts with General feed and Upcoming events ({tabs})')
    pg.evaluate(f"(async()=>{{const r=await import('./js/router.js'); r.goTo(r.spaceHref('{gid}'))}})()"); pg.wait_for_timeout(900)
    pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); s.setEditMode(true)})()"); pg.wait_for_timeout(500)
    lib = pg.locator('#module-library')
    for t in lib.locator('.library__more').all():
        if t.get_attribute('aria-expanded') == 'false': t.click()
    names = [x.split('\n')[0].strip() for x in lib.locator('.library-item').all_inner_texts()]
    check('About' in names and 'Photo gallery' in names and 'Up next' not in names and 'Board' not in names and 'Chat' not in names, f'Public tab list ({names})')

    # About and Photo gallery on the group's public page
    lib.locator('.library-item', has_text='About').first.click(); pg.wait_for_timeout(500)
    lib.locator('.library-item', has_text='Photo gallery').first.click(); pg.wait_for_timeout(500)
    pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); s.setEditMode(false)})()"); pg.wait_for_timeout(600)
    about = pg.locator('.about-block--group').first
    check(about.count() == 1 and 'Porch Band' in about.inner_text(), 'About shows the group')
    about.get_by_role('button', name='Write the group’s About').click(); pg.wait_for_timeout(300)
    form = pg.locator('.about-block__form').first
    form.get_by_label('About the group').fill('A porch band from the east side.')
    form.get_by_label('Ask us about (separate with commas)').fill('booking, lessons')
    form.get_by_role('button', name='Save').click(); pg.wait_for_timeout(400)
    txt = pg.locator('.about-block--group').first.inner_text()
    check('A porch band from the east side.' in txt and 'Ask us about' in txt and 'booking' in txt, 'admins write the group’s About')
    gal = pg.locator('[data-module-id]', has_text='Photo gallery').first
    check(gal.count() == 1 and 'share them here' in gal.inner_text(), 'Photo gallery on the group')
    pg.screenshot(path='test-output/out/group-about-gallery.png')

    # A blog still gets the person's About
    blog = pg.evaluate("""async()=>{const s=await import('./js/state/store.js'); const me=s.getCurrentUser(); const b=s.getSpaces().find(x=>x.kind==='blog'&&x.memberIds[0]===me.id); return b&&b.id}""")
    if blog:
        pg.evaluate(f"(async()=>{{const r=await import('./js/router.js'); r.goTo(r.spaceHref('{blog}'))}})()"); pg.wait_for_timeout(900)
        check(pg.locator('.about-block--group').count() == 0, 'a blog’s About is still about the person')
    check(not errs, f'no page errors {errs[:2]}')
    b.close()
print('FAILED' if fails else 'ALL PASSED', len(fails))
