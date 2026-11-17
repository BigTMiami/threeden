# A public group that picks its own members (admins add people, or invite only) starts with two tabs: Private (members, first)
# and Public (what faces outward). Other groups keep one tab. And "Yes, set me up" on the Blog tab lands on the Feed, not Friends.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    st=lambda js: pg.evaluate("async()=>{const s=await import('./js/state/store.js'); const g=await import('./js/state/groups.js'); "+js+"}")
    def make(name, template, visibility, joining):
        return st(f"const x=g.createGroup({{name:'{name}', template:'{template}', visibility:'{visibility}', joining:'{joining}'}}); return {{tabs:x.tabs, mods:x.modules.map(m=>m.title+'@'+(m.tabId||'home'))}}")
    band=make('Band A','club','public','admins'); print('band (public, admins):', band)
    if [t['name'] for t in band['tabs']] != ['Private','Public']: errs.append('band should get Private and Public tabs')
    if not any(m.startswith('Photos@public') for m in band['mods']) or not any(m.startswith('Up next@home') for m in band['mods']): errs.append('photos public, Up next private')
    news=make('Paper B','news','public','invite'); print('newsroom (public, invite):', news)
    hood=make('Hood C','organizing','public','open'); print('neighborhood (public, open):', [t['name'] for t in hood['tabs']])
    if len(hood['tabs'])!=1: errs.append('an open public group keeps one tab')
    house=make('House D','house','private','admins'); print('house (private):', house['tabs'])
    if house['tabs']: errs.append('a private group has no tabs set')
    # a visitor sees only Public
    bid=st("return s.getSpaces().find(x=>x.name==='Band A').id")
    print('visitor tabs:', st(f"const sp=s.getSpace('{bid}'); return s.publicTabsOf(sp).map(t=>t.name)"))
    # the tour mentions the Public tab
    st(f"const t=await import('./js/onboarding/group-tour.js'); t.startGroupTour('{bid}'); return 1"); pg.wait_for_timeout(700)
    pg.locator('.group-tour').get_by_role('button', name='Next').click(); pg.wait_for_timeout(500)
    pg.locator('.group-tour').get_by_role('button', name='Next').click(); pg.wait_for_timeout(500)
    print('tour step 3:', pg.locator('.group-tour .tour-card__text').inner_text())
    print('tabs on page:', pg.locator('.page-tabs__tab, .tabs__tab, [role=tab]').all_inner_texts()[:4])
    pg.locator('.group-tour').get_by_role('button', name='End the tour').click()
    # blog start → the Feed
    st("s.changeState(st=>{st.spaces=st.spaces.filter(x=>x.id!=='blog-m-leo' && !(x.kind==='blog' && x.memberIds[0]==='m-leo'));}, 'space'); return 1")
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(800)
    btn=pg.get_by_role('button', name='Yes, set me up')
    print('asked:', btn.count())
    if btn.count():
        btn.click(); pg.wait_for_timeout(800)
        print('landed on:', pg.evaluate('location.hash'), '| feed shown:', pg.locator('.feed-page').count(), '| blog made:', st("return Boolean(s.getBlogOf('m-leo'))"))
        if pg.evaluate('location.hash') != '#feed': errs.append('should land on the Feed')
    print('errors', errs)
    b.close()
