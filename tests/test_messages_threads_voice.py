from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
    ctx=b.new_context(viewport={'width':1300,'height':900}); ctx.grant_permissions(['microphone'])
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#messages-conv-pantry'"); pg.wait_for_timeout(900)
    v=pg.locator('#messages-view')
    print('pin bar:', v.locator('.thread__pins').inner_text()[:60].replace('\n',' '))
    print('main list hides thread replies:', v.locator('[data-message-id="pc-3t1"]').count() == 0 or v.locator('.thread__side [data-message-id="pc-3t1"]').count())
    print('replies chip:', v.locator('.message__replies').first.inner_text())
    print('quote:', v.locator('.message__quote').first.inner_text())
    print('voice:', v.locator('.voice').count(), '| file:', v.locator('.file-card').inner_text().replace('\n',' '))
    v.locator('.voice__play').click(); pg.wait_for_timeout(1200); print('voice playing:', v.locator('.voice__wave .is-played').count() > 0)
    # thread
    v.locator('.message__replies').first.click(); pg.wait_for_timeout(300)
    side=v.locator('.thread__side'); print('side replies:', side.locator('.message').count())
    side.locator('textarea').fill('I can bring crates too'); side.locator('textarea').press('Enter'); pg.wait_for_timeout(300)
    print('side after:', side.locator('.message').count(), '| chip:', v.locator('.message__replies').first.inner_text().split(' ·')[0])
    pg.keyboard.press('Escape'); side.locator('button[aria-label="Close the thread"]').click() if side.is_visible() else None; pg.wait_for_timeout(200)
    print('side closed:', not side.is_visible())
    # reply
    m=v.locator('[data-message-id="pc-3"]'); m.hover(); m.get_by_role('button', name='Reply', exact=True).click()
    print('reply bar:', v.locator('.thread__reply-bar').inner_text().replace('\n',' '))
    v.locator('.thread__composer textarea').first.fill('Count me in'); v.locator('.thread__composer textarea').first.press('Enter'); pg.wait_for_timeout(300)
    print('last has quote:', v.locator('.message').last.locator('.message__quote').count())
    # pin
    m=v.locator('[data-message-id="pc-2"]'); m.hover(); m.get_by_role('button', name='Pin to the top').click(); pg.wait_for_timeout(200)
    print('pins now:', v.locator('.thread__pins').inner_text().replace('\n',' ')[:80])
    # voice record (fake mic)
    v.get_by_role('button', name='Record a voice note').click(); pg.wait_for_timeout(1500)
    print('recording:', v.locator('.thread__recording').inner_text().replace('\n',' '))
    v.locator('.thread__recording').get_by_role('button', name='Send').click(); pg.wait_for_timeout(800)
    print('voices now:', v.locator('.voice').count())
    # file
    v.locator('.thread__attach').click(); 
    with pg.expect_file_chooser() as fc: v.get_by_role('menuitem', name='File').click()
    fc.value.set_files(files=[{'name':'notes.txt','mimeType':'text/plain','buffer':b'hello pantry'}]); pg.wait_for_timeout(500)
    print('files now:', v.locator('.file-card').count())
    pg.screenshot(path='test-output/msg.png')
    print('errors', errs)
