# Child accounts: "Set up an account for a child" under sign-up makes the parent's account and the child's. The child can't explore
# (no Explore tab, search finds only their groups), and joining a group (an invitation, Join, an invite link) asks a parent, who says
# Yes or Not now in Account settings → Children; Yes puts the child in. Messages: only parents and people in their groups.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const c=await import('./js/state/children.js'); const g=await import('./js/state/groups.js'); const a=await import('./js/state/accounts.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    st(pg, "a.signOut(); return 1"); pg.evaluate("location.hash='#signup'"); pg.wait_for_timeout(700)
    link=pg.get_by_role('link', name='Set up an account for a child'); print('sign-up has the child link:', link.count())
    link.click(); pg.wait_for_timeout(500)
    print('child page:', pg.locator('.auth__title').inner_text(), '| rules:', pg.locator('.child-rules li').count())
    pg.screenshot(path='test-output/child-signup.png', full_page=True)
    pg.get_by_label('Your name').fill('Dana Rivera'); pg.get_by_label('Your email').fill('dana@example.com'); pg.get_by_label('Your password').fill('a-long-password')
    pg.get_by_label('Child’s name').fill('Ava'); pg.get_by_label('Year they were born').select_option('2015'); pg.get_by_label('Child’s password').fill('ava-password-1')
    pg.get_by_role('button', name='Create both accounts').click(); pg.wait_for_timeout(1200)
    print('landed:', pg.evaluate('location.hash'), '| children listed:', pg.locator('.children__child').count())
    ids=st(pg, "const me=s.getCurrentUser(); const kid=c.childrenOf(me.id)[0]; return [me.id, kid.id, kid.socialOff, kid.child.birthYear]"); print('parent/child:', ids)
    parent, kid = ids[0], ids[1]
    # someone else invites the child (Leo invites Ava to 14 Juniper Lane)
    st(pg, f"g.inviteToGroup('juniper', '{kid}', 'm-leo'); return 1")
    # parent adds child to their own new group: no request needed
    gid=st(pg, f"const grp=g.createGroup({{name:'Rivera Family'}}); return [grp.id, g.addMember(grp.id, '{kid}')]"); print('parent adds own child:', gid)
    # open the child's account
    pg.evaluate("location.hash='#account-children'"); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Open their account').click(); pg.wait_for_timeout(800)
    print('as child: tabs:', pg.locator('.groups-page__tabs a').all_inner_texts(), '| create button:', pg.locator('.groups-page__create').count(), '| note:', pg.locator('.groups-page__child-note').count())
    pg.evaluate("location.hash='#groups-explore'"); pg.wait_for_timeout(500); print('explore link shows:', pg.locator('.groups-page__tabs .is-active').inner_text())
    inv=pg.locator('.invitations .explore-list__row', has_text='14 Juniper Lane'); print('invitation button:', inv.locator('button').first.inner_text())
    inv.locator('button').first.click(); pg.wait_for_timeout(500)
    print('asked:', st(pg, f"return c.waitingRequests('{kid}').map(r=>[r.spaceId, r.via])"), '| in group yet:', st(pg, f"return s.getSpace('juniper').memberIds.includes('{kid}')"))
    # search
    found=st(pg, "const q=await import('./js/state/search.js'); return [q.searchGroups('porch').length, q.searchGroups('rivera').length, q.searchPeople('jamal').length]"); print('child search (porch, own group, a stranger):', found)
    if found[0]!=0 or found[2]!=0: errs.append('child search should not find strangers or public groups')
    # public group: join button asks a parent
    pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(700)
    print('public group button:', pg.locator('.space-header__actions').inner_text().replace('\n',' | ')[:120])
    # messaging
    print('child can message: parent', st(pg, f"return c.canMessage('{kid}', '{parent}')"), '| stranger', st(pg, f"return c.canMessage('{kid}', 'm-jamal')"), '| stranger to child', st(pg, f"return c.canMessage('m-jamal', '{kid}')"))
    # back to the parent: approve
    st(pg, f"a.signIn('{parent}'); return 1"); pg.evaluate("location.hash='#account-children'"); pg.wait_for_timeout(700)
    print('parent sees waiting:', pg.locator('.children__request').count(), '|', pg.locator('.children__request strong').first.inner_text())
    print('parent notified:', st(pg, f"return (s.getState().notifications||[]).filter(n=>n.recipientId==='{parent}' && /Juniper/.test(n.text)).length"))
    pg.screenshot(path='test-output/child-parent-settings.png', full_page=True)
    pg.locator('.children__request').get_by_role('button', name='Yes').click(); pg.wait_for_timeout(700)
    print('after Yes: child in group:', st(pg, f"return s.getSpace('juniper').memberIds.includes('{kid}')"), '| groups listed:', pg.locator('.children__groups li').all_inner_texts())
    # an admin adding a child asks the parent
    r=st(pg, f"a.signIn('m-leo'); const grp=g.createGroup({{name:'Leo test'}}); return g.addMember(grp.id, '{kid}')"); print('admin adds child:', r)
    if r!='asked': errs.append('admin adding a child should ask the parent')
    print('errors', errs)
    b.close()
