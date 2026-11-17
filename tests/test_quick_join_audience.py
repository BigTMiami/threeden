from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
def store(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const g=await import('./js/state/groups.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(600)
    # 73: blog composer chip, friends-only post
    pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(900)
    pg.locator('.feed-module__new-post:visible').first.click(); pg.wait_for_timeout(300); 
    comp=pg.locator('.feed-composer').first
    chip=comp.locator('.audience-chip'); print('73 blog chip:', chip.inner_text().strip())
    chip.click(); print('   after tap:', chip.inner_text().strip())
    comp.locator('textarea').fill('Only for friends: house show next week'); comp.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(400)
    print('   saved audience:', store(pg,"for (const m of s.getBlogOf(s.getCurrentUser().id).modules) for (const p of (m.data?.posts||[])) if (p.text.startsWith('Only for friends')) return p.audience; return null"))
    print('   label on post:', pg.locator('.feed-post__audience').first.inner_text().strip() if pg.locator('.feed-post__audience').count() else None)
    # a non-friend and a friend
    ids=store(pg,"const f=await import('./js/state/friends.js'); const me=s.getCurrentUser().id; const all=s.getState().members.filter(m=>m.id!==me&&!m.quick&&m.username); return [all.find(m=>f.friendStatus(me,m.id)==='friends')?.id, all.find(m=>f.friendStatus(me,m.id)==='none'||!f.friendStatus(me,m.id))?.id]")
    print('   friend/stranger:', ids)
    for who in ids:
        if not who: continue
        pg.evaluate(f"(async()=>{{const a=await import('./js/state/accounts.js'); a.signIn('{who}'); location.hash='#blog-leo'}})()"); pg.wait_for_timeout(900)
        print('   ', who, 'sees it on blog:', pg.locator('main').get_by_text('Only for friends: house show', exact=False).count())
    pg.evaluate("(async()=>{const a=await import('./js/state/accounts.js'); a.signIn('m-leo')})()"); pg.wait_for_timeout(500)
    # group chip (members-only tab) in announcements
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    print('73 announcements chip:', pg.locator('.module-frame[data-module-type=announcements] .audience-chip').first.inner_text().strip())
    # quick create chip follows the place
    pg.evaluate("(async()=>{const q=await import('./js/editor/quick-create.js'); q.openQuickCreate()})()"); pg.wait_for_timeout(200)
    print('73 quick-create chip:', pg.locator('.quick-create .audience-chip').inner_text().strip()); pg.keyboard.press('Escape')
    # 60: guest joins from an invite link with name + phone
    link=store(pg,"const sp=s.getSpace('mutualaid')||s.getSpaces().find(x=>x.kind==='group'); if(!sp.inviteCode){g.resetInviteLink(sp.id)} return [s.getSpace(sp.id).id, g.inviteLinkOf(s.getSpace(sp.id))]")
    print('60 link:', link)
    pg.evaluate("(async()=>{const a=await import('./js/state/accounts.js'); a.signOut()})()"); pg.wait_for_timeout(300)
    code=link[1].split('#join-')[1]
    pg.evaluate(f"location.hash='#join-{code}'"); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Join', exact=False).first.click(); pg.wait_for_timeout(300)
    sh=pg.locator('.signup-sheet'); print('   sheet:', sh.locator('h2').inner_text(), '| fields:', sh.locator('input').count())
    sh.get_by_label('Your name').fill('Rita Gomez'); sh.get_by_label('Phone number or email').fill('555-201-3344'); pg.wait_for_timeout(100)
    print('   hint:', sh.locator('.signup-sheet__hint').first.inner_text())
    sh.locator('button[type=submit]').click(); pg.wait_for_timeout(1000)
    print('   after:', pg.evaluate('location.hash'), '| member:', store(pg,f"return s.getSpace('{link[0]}').memberIds.includes(s.getCurrentUser().id) && s.getCurrentUser().quick"))
    print('   finish page shown:', pg.locator('main').get_by_text('Finish', exact=False).count(), '| next line:', pg.locator('.next-step__label').first.inner_text() if pg.locator('.next-step__label').count() else None)
    pg.screenshot(path='test-output/quickjoin.png')
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(700)
    print('   feed asks to finish:', pg.evaluate('location.hash'), pg.locator('main').inner_text()[:160].replace(chr(10),' | '))
    print('errors', errs); b.close()
