from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1300,'height':900})
    errs=[]
    a=ctx.new_page(); a.on('pageerror', lambda e: errs.append(str(e)))
    a.goto('http://localhost:8765/index.html'); a.evaluate("localStorage.clear()"); a.reload(); a.wait_for_selector('.app-bar', timeout=20000)
    a.evaluate("location.hash='#module-band-merch'"); a.wait_for_timeout(1200)
    c=ctx.new_page(); c.on('pageerror', lambda e: errs.append(str(e)))
    c.goto('http://localhost:8765/index.html#module-band-merch'); c.wait_for_selector('.app-bar', timeout=20000); c.wait_for_timeout(1200)
    cellA=a.locator('#module-page-view td[data-col="0"][data-row="5"]')
    print('A6 exists', cellA.count())
    cellA.click(); a.keyboard.type('Poster'); a.keyboard.press('Enter'); a.wait_for_timeout(1500)
    print('other window A6:', c.locator('#module-page-view td[data-col="0"][data-row="5"]').inner_text())
    print('errors', errs[:5])
    b.close()
