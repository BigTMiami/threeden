"""
Show or hide your blog from a group's members (Nov 18).

1. Group settings → General → Your blog: on by default; turning it off
   removes links to your blog from the group's directory, its chat, and
   your posts on its feeds, and your blog's About stops listing the group.
2. Joining a group (an invitation here): the group asks once, "Show your
   blog to members of …?"; Hide it hides it, and the question goes away.
3. The invite link's join page has the same choice as a checkbox.
"""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const g=await import('./js/state/groups.js'); {js}}})()")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    me = st(pg, "const u=s.getCurrentUser(); return {id:u.id, username:u.username}")

    # Another member sees Leo's blog in Porch Lights' directory: check what the directory offers for Leo.
    def blog_links_in_directory():
        pg.evaluate("location.hash='#directory-porchlights'"); pg.wait_for_timeout(800)
        return pg.evaluate(f"[...document.querySelectorAll('a[href*=\"{me['username']}\"]')].length")

    # 1. Settings
    pg.evaluate("location.hash='#settings-porchlights'"); pg.wait_for_timeout(900)
    box = pg.get_by_label('Show my blog to members of Porch Lights')
    check(box.count() == 1 and box.is_checked(), 'settings: Your blog is shown by default')
    box.uncheck(); pg.wait_for_timeout(400)
    check(st(pg, f"return g.blogShownIn(s.getSpace('porchlights'), '{me['id']}')") is False, 'settings: turning it off hides it')
    check(pg.get_by_text('Nothing in this group links to your blog').count() == 1, 'settings: says what that means')
    shown_elsewhere = st(pg, f"return g.blogShownIn(s.getSpace('juniper'), '{me['id']}')")
    check(shown_elsewhere is True, 'settings: other groups are unchanged')

    # The group's chat: your name isn't a link to your blog there.
    pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(900)
    chat = pg.locator('.module-frame[data-module-type="chat"]')
    if chat.count():
        chat.locator('textarea').first.fill('Checking my name'); chat.get_by_role('button', name='Send').click(); pg.wait_for_timeout(500)
        mine = chat.locator('.message__author').filter(has_text=st(pg, "return s.getCurrentUser().name")).count()
        check(mine == 0, 'chat: your name is not a link to your blog in this group')
    # Your blog's About doesn't list the group.
    st(pg, "const sp=s.getSpaces().find(x=>x.kind==='blog' && x.memberIds.includes(s.getCurrentUser().id)); const m=sp.modules.find(m=>m.type==='about'); if(m) s.updateModuleData(m.id, {...m.data, showGroups:true}); return 1")
    pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(900)
    listed = pg.evaluate("[...document.querySelectorAll('.about-block__row')].filter(r => r.querySelector('.about-block__label')?.innerText === 'In').map(r => r.innerText).join(' ')")
    check(bool(listed) and 'Porch Lights' not in listed and 'Juniper' in listed, f'blog About: its In list leaves out Porch Lights ({listed[:60]!r})')

    # 2. Joining: the question
    gid = st(pg, f"""const sp=s.getSpaces().find(x=>x.kind==='group' && !x.memberIds.includes('{me['id']}')); g.inviteToGroup(sp.id, '{me['id']}', sp.memberIds[0]); g.acceptInvite(sp.id, '{me['id']}'); return sp.id""")
    name = st(pg, f"return s.getSpace('{gid}').name")
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(900)
    q = pg.locator('.blog-question')
    check(q.count() == 1 and name in q.inner_text(), f'joining: asks "Show your blog to members of {name}?"')
    pg.screenshot(path='test-output/out/blog-question.png')
    q.get_by_role('button', name='Hide it').click(); pg.wait_for_timeout(400)
    check(pg.locator('.blog-question').count() == 0 and st(pg, f"return g.blogShownIn(s.getSpace('{gid}'), '{me['id']}')") is False, 'joining: Hide it hides it and the question goes away')
    check(st(pg, "return g.shouldAskAboutBlog(s.getSpace('juniper'), s.getCurrentUser())") is False, 'groups joined before this asked nothing')

    # 3. The join page's checkbox
    code = st(pg, f"""const sp=s.getSpaces().find(x=>x.kind==='group' && !x.memberIds.includes('{me['id']}') && x.inviteCode); return sp ? sp.inviteCode + '|' + sp.id : ''""")
    if code:
        c, jid = code.split('|')
        pg.evaluate(f"location.hash='#join-{c}'"); pg.wait_for_timeout(900)
        cb = pg.get_by_label('Show my blog to the members')
        check(cb.count() == 1 and cb.is_checked(), 'join page: the choice is there, on by default')
        cb.uncheck(); pg.locator('.join-page').get_by_role('button').first.click(); pg.wait_for_timeout(700)
        check(st(pg, f"return g.blogShownIn(s.getSpace('{jid}'), '{me['id']}')") is False, 'join page: joining with it unticked hides your blog')
    else:
        print('     (no sample group with an invite link to try the join page)')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
