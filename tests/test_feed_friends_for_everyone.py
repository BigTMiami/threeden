"""Nov 22: everyone starts with the Feed and friends. A quick account (made
answering an event with a name and a phone number or email) opens the Feed,
Friends, and other people's blogs, and can ask to be friends. Starting their
own blog is still their choice, and asks them to finish the account first.
A full new account has the Feed and Friends, and the Blog tab still asks
"Dive into 3den?" before making a blog."""
from playwright.sync_api import sync_playwright
import os, random
os.makedirs('test-output/out', exist_ok=True)
R = random.randint(1000, 9999)
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const a=await import('./js/state/accounts.js'); const f=await import('./js/state/friends.js'); {js}}})()")
def go(pg, h):
    pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(900)
finish = lambda pg: pg.locator('.finish-account').count() > 0

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    # A quick account, as answering an event makes one
    me = st(pg, f"a.signOut(); const m=a.createQuickAccount({{name:'Quin Test', contact:'quin{R}@example.com', arrival:{{source:'event', itemId:'band-ev-2'}}}}); a.signIn(m.id); location.hash='#'; return {{id:m.id, username:m.username, quick:!!s.getMember(m.id).quick}}")
    pg.wait_for_timeout(900)
    check(me['quick'], 'a quick account')
    links = pg.locator('.app-bar').inner_text()
    check('Feed' in links, f'the app bar has the Feed ({links.split()[:12]})')
    go(pg, '#feed')
    check(not finish(pg) and 'Dive into 3den' not in pg.locator('main').first.inner_text() and pg.locator('.welcome--blog').count() == 0, 'the Feed opens as is (no “finish your account”, no blog question first)')
    go(pg, '#feed-friends')
    check(not finish(pg), 'Friends opens')
    go(pg, '#blog-jamal')
    check(not finish(pg) and 'Jamal Brooks' in pg.locator('main').first.inner_text(), 'someone else’s blog opens')
    pg.locator('main').get_by_role('button', name='Friend', exact=True).first.click(); pg.wait_for_timeout(700)
    jamal = st(pg, "return s.getState().members.find(m=>m.username==='jamal').id")
    check(st(pg, f"return f.friendStatus('{me['id']}', '{jamal}')") == 'sent', 'and they can ask to be friends')
    go(pg, f"#blog-{me['username']}")
    check(finish(pg) and 'Your own blog needs' in pg.locator('.finish-account').inner_text(), 'their own blog still asks them to finish the account first')
    pg.screenshot(path='test-output/out/quick-own-blog.png')
    go(pg, '#account-feed')
    txt = pg.locator('main').first.inner_text()
    check('Feed' in txt and pg.locator('.blog-settings, #account-blog-section').count() == 0, f'Account → Feed settings show, blog settings wait ({txt[:120]!r})')

    # A full new account: Feed and Friends from the start; the blog is opt-in
    st(pg, f"a.signOut(); const m=a.createAccount({{name:'Fay Test', username:'fay{R}', email:'fay{R}@example.com', password:null, arrival:{{source:'direct'}}}}); a.signIn(m.id); location.hash='#'")
    pg.wait_for_timeout(3500)
    check('Feed' in pg.locator('.app-bar').inner_text(), 'a full new account has the Feed')
    go(pg, '#feed-friends')
    check(not finish(pg), 'and Friends')
    check(not st(pg, "return !!s.getBlogOf(s.getCurrentUser().id)"), 'no blog until they choose one')
    body = pg.locator('main').first.inner_text()
    go(pg, '#feed')
    check(pg.locator('.welcome--blog').count() == 0, 'a full new account’s Feed opens as is too')
    go(pg, f'#blog-fay{R}')
    body = pg.locator('main').first.inner_text()
    check('Start your blog?' in body, f'their own blog asks first ({body[:80]!r})')
    check(not st(pg, "return !!s.getBlogOf(s.getCurrentUser().id)"), 'still no blog until they say yes')
    pg.get_by_role('button', name='Start my blog').click(); pg.wait_for_timeout(900)
    check(st(pg, "return !!s.getBlogOf(s.getCurrentUser().id)"), 'Start my blog makes it')
    check(not errs, f'no page errors {errs[:2]}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
