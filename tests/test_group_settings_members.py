# Group settings: the group's name at the top goes back to the group (even after switching tabs); no Layout tab;
# the invite link sits in Add people, and its button just says "Invite link"; a search box over the members list;
# over 50 members, 50 at a time with Previous and Next.
from playwright.sync_api import sync_playwright
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    pg.evaluate("location.hash='#settings-juniper'"); pg.wait_for_timeout(600)
    tabs=pg.locator('.settings-tabs__tab').all_inner_texts(); print('tabs:', tabs)
    if any('Layout' in t for t in tabs): errs.append('layout tab still there')
    pg.locator('.settings-tabs__tab', has_text='Members').click(); pg.wait_for_timeout(500)
    add=pg.locator('.settings-section', has=pg.locator('h2', has_text='Add people'))
    print('Add people box has the invite link:', add.locator('.invite-link-block').count(), '| separate Invite link section:', pg.locator('h2.settings-section__title', has_text='Invite link').count())
    btn=add.get_by_role('button', name='Invite link', exact=True)
    print('just a button at first:', btn.count(), '| link hidden:', pg.locator('.invite-link__field').count()==0)
    if pg.locator('.invite-link__field').count(): errs.append('link shown before clicking')
    btn.click(); pg.wait_for_timeout(300); print('link shown after the click:', pg.locator('.invite-link__field').count())
    add=pg.locator('.settings-section', has=pg.locator('h2', has_text='Add people'))
    add.get_by_role('button', name='Turn off').click(); pg.wait_for_timeout(300)
    print('turned off, button again:', pg.get_by_role('button', name='Invite link', exact=True).count())
    pg.get_by_role('button', name='Invite link', exact=True).click(); pg.wait_for_timeout(300); print('new link made and shown:', pg.locator('.invite-link__field').count())
    pg.screenshot(path='test-output/settings-members.png')
    # search
    s=pg.locator('.members-search'); n0=pg.locator('.members-list:not(.members-list--invites) > .members-list__row').count()
    s.fill('maya'); pg.wait_for_timeout(200)
    print('search:', n0, '->', pg.locator('.members-section .members-list__row').count(), '| focus kept:', pg.evaluate("document.activeElement.classList.contains('members-search')"))
    s.fill('zzzz'); pg.wait_for_timeout(100); print('no match:', pg.locator('.members-list__none').inner_text())
    s.fill('')
    # back to the group, after switching tabs
    pg.locator('.module-page__back').click(); pg.wait_for_timeout(600)
    print('back goes to:', pg.evaluate('location.hash'))
    if pg.evaluate('location.hash')!='#space-juniper': errs.append('back did not go to the group')
    # paging: give the bike crew 120 members
    gid=st(pg, """const st=s.getState(); const g=st.spaces.find(x=>x.name==='Juniper Lane Bike Crew'); const ids=st.members.filter(m=>!g.memberIds.includes(m.id)).slice(0,120).map(m=>m.id); s.changeState(()=>{ g.memberIds.push(...ids); }, 'space'); return g.id""")
    pg.evaluate(f"location.hash='#settings-{gid}--members'"); pg.wait_for_timeout(800)
    total=st(pg, f"return s.getSpace('{gid}').memberIds.length")
    sec=pg.locator('.members-section')
    print('members:', total, '| shown:', sec.locator('.members-list__row').count(), '|', sec.locator('.members-pager__count').inner_text())
    sec.get_by_role('button', name='Next').click(); pg.wait_for_timeout(200)
    print('next page:', sec.locator('.members-list__row').count(), '|', sec.locator('.members-pager__count').inner_text())
    sec.get_by_role('button', name='Next').click(); pg.wait_for_timeout(200)
    print('last page:', sec.locator('.members-list__row').count(), '|', sec.locator('.members-pager__count').inner_text(), '| next off:', sec.get_by_role('button', name='Next').is_disabled())
    pg.locator('.members-search').fill('a'); pg.wait_for_timeout(200); print('search resets to page 1:', sec.locator('.members-pager__count').inner_text() if sec.locator('.members-pager__count').count() else 'one page')
    pg.screenshot(path='test-output/settings-members-pages.png', full_page=True)
    # phone
    pg.set_viewport_size({'width':390,'height':844}); pg.wait_for_timeout(300); print('phone overflow:', pg.evaluate('document.documentElement.scrollWidth>innerWidth'))
    print('errors', errs)
    b.close()
