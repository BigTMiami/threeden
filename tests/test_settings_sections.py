from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1300,'height':900}, accept_downloads=True)
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    v=pg.locator('#settings-view')
    pg.evaluate("location.hash='#account'"); pg.wait_for_timeout(600)
    print('50 tabs:', [t.strip() for t in v.locator('.account-tabs .settings-tabs__tab').all_inner_texts()], '| sections:', [t for t in v.locator('.settings-section__title').all_inner_texts()])
    for hsh in ['#account-privacy','#account-notifications','#account-look','#account-feed','#account-location','#account-blocked']:
        pg.evaluate(f"location.hash='{hsh}'"); pg.wait_for_timeout(400)
        print('  ', hsh, '→', v.locator('.account-tabs .is-active').inner_text(), '|', v.locator('.settings-section__title').all_inner_texts()[:5])
    pg.evaluate("location.hash='#account-privacy'"); pg.wait_for_timeout(400)
    with pg.expect_download() as dl: v.get_by_role('button', name='Download my data').click()
    import json; d=json.load(open(dl.value.path())); print('75 export keys:', list(d.keys()), '| authored:', len(d['authored']), '| no hash:', 'passwordHash' not in d['account'])
    # 51 group settings
    pg.evaluate("location.hash='#settings-league'"); pg.wait_for_timeout(600)
    print('51 tabs:', [t.strip() for t in v.locator('nav.settings-tabs > *').all_inner_texts()])
    v.locator('.settings-tabs__more').click(); pg.wait_for_timeout(200)
    print('51 after More:', [t.strip() for t in v.locator('nav.settings-tabs > *').all_inner_texts()])
    pg.evaluate("location.hash='#settings-league--appearance'"); pg.wait_for_timeout(500)
    print('51 on a More tab:', v.locator('nav.settings-tabs .is-active').inner_text())
    # delete with posts (as a new person to avoid owner block): use Erik? sign in as theo
    pg.evaluate("void (async()=>{const a=await import('./js/state/accounts.js'); a.signIn('m-theo'); location.hash='#account-privacy';})()"); pg.wait_for_timeout(900)
    before=pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return JSON.stringify(s.getState().spaces).split('\"authorId\":\"m-theo\"').length-1})()")
    v.get_by_label(' Also delete everything I posted in groups, and the messages I sent').check() if False else v.locator('.settings-check input').last.check()
    box=v.locator('input[aria-label="Type your username to confirm"]'); print('  delete section:', box.count()); box.fill(box.get_attribute('placeholder')); v.get_by_role('button', name='Delete my account').click(); pg.wait_for_timeout(800)
    after=pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return [JSON.stringify(s.getState().spaces).split('\"authorId\":\"m-theo\"').length-1, !!s.getMember('m-theo')]})()")
    print('75 theo posts before/after, member exists:', before, after, '|', pg.evaluate('location.hash'))
    print('errors', errs)
