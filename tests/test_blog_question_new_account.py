"""Nov 20: a new account (from an invite link) isn't asked whether to show
its blog to the group, since it has none yet. Someone with a blog still is."""
from playwright.sync_api import sync_playwright
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const a=await import('./js/state/accounts.js'); const g=await import('./js/state/groups.js'); {js}}})()")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    # Leo has a blog: joining from the invite link asks
    pg.evaluate("location.hash='#join-supper24'"); pg.wait_for_timeout(800)
    check(pg.locator('.join-page').get_by_text('Show my blog to the members').count() == 1, 'Leo (has a blog): the join page offers the blog choice')
    st(pg, "const grp=s.getSpaces().find(x=>x.inviteCode==='supper24'); g.addMember(grp.id, s.getCurrentUser().id, 'member', {via:'link'})")
    pg.evaluate("location.hash='#space-' + 'x'"); pg.wait_for_timeout(200)
    gid = st(pg, "return s.getSpaces().find(x=>x.inviteCode==='supper24').id")
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(900)
    check(pg.locator('.blog-question').count() == 1, 'Leo: the group asks once about his blog')

    # A brand-new account joins the same way: no question
    new_id = st(pg, "const m=a.createAccount({name:'Rosa Diaz', username:'rosad', email:'rosa@example.com', password:null}); a.signIn(m.id); return m.id")
    pg.wait_for_timeout(300)
    check(st(pg, f"return g.hasSetUpBlog(s.getMember('{new_id}'))") is False, 'a new account has no blog yet')
    pg.evaluate("location.hash='#join-supper24'"); pg.wait_for_timeout(800)
    check(pg.locator('.join-page').get_by_text('Show my blog').count() == 0, 'new account: no blog choice on the join page')
    st(pg, f"g.addMember('{gid}', '{new_id}', 'member', {{via:'link'}})")
    pg.evaluate("location.hash='#'"); pg.wait_for_timeout(200)
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(900)
    check(pg.locator('.blog-question').count() == 0, 'new account: the group doesn’t ask about a blog')
    pg.evaluate(f"location.hash='#settings-{gid}'"); pg.wait_for_timeout(800)
    check(pg.get_by_text('Show my blog to members of').count() == 0, 'and group settings has no "Your blog" section')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
