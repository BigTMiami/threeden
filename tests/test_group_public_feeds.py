"""Groups' public pages (Nov 20): General feed and Carousel come first in the
module list on a public tab; Carousel can now be added to groups; a visitor
sees both on the public tab."""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const fd=await import('./js/modules/blog-feeds/feed-data.js'); {js}}})()")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    # Porch Lights: Home is public
    pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(900)
    st(pg, "s.setCurrentTab('home')")
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(500)
    lib = pg.locator('#module-library')
    check(lib.locator('.library__section').first.text_content().strip() == 'For your public page', 'a public tab starts the list with "For your public page"')
    first = [t.strip() for t in lib.locator('.library__list').first.locator('.library-item__label').all_inner_texts()]
    check(first == ['General feed', 'Carousel'], f'General feed and Carousel ({first})')
    lib.screenshot(path='test-output/out/library-public-page.png')

    # A members-only tab: no public section, and no Carousel or General feed (Nov 20: public-page modules only)
    st(pg, "s.setCurrentTab('band-tab-room')"); pg.wait_for_timeout(400)
    check(lib.get_by_text('For your public page').count() == 0, 'a members-only tab has no public section')
    for t in lib.locator('.library__more').all():
        if t.get_attribute('aria-expanded') == 'false': t.click()
    names = [t.strip() for t in lib.locator('.library-item__label').all_inner_texts()]
    check('Carousel' not in names and 'General feed' not in names, 'neither is offered on a members-only tab')

    # Add a Carousel to the public Home tab
    st(pg, "s.setCurrentTab('home')"); pg.wait_for_timeout(400)
    before = st(pg, "return s.getSpace('porchlights').modules.length")
    lib.locator('.library__list--public .library-item', has_text='Carousel').click(); pg.wait_for_timeout(500)
    car = st(pg, "const m=s.getSpace('porchlights').modules.find(m=>m.type==='carousel'); return m ? {type:m.type, tab:m.tabId ?? 'home', id:m.id} : {type:null, tab:null}")
    check(st(pg, "return s.getSpace('porchlights').modules.length") == before + 1 and car['type'] == 'carousel' and car['tab'] == 'home', f'Carousel added to the public tab ({car})')
    st(pg, 's.setEditMode(false)'); pg.wait_for_timeout(500)
    cid = car.get('id')
    frame = pg.locator(f'[data-module-id="{cid}"]')
    check(frame.get_by_role('button', name='New post').count() == 1, 'an admin gets New post on the group’s Carousel')

    # Two posts, through the composer
    for text in ['Tour dates are up', 'New single Friday']:
        frame.get_by_role('button', name='New post').click(); pg.wait_for_timeout(400)
        dlg = pg.locator('.feed-compose-modal, dialog[open]').last
        dlg.get_by_label('Post text').fill(text)
        dlg.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(500)
    check(st(pg, f"return s.getModule('{cid}').data.posts.length") == 2, 'members with permission post into it')
    frame = pg.locator(f'[data-module-id="{cid}"]')
    check(frame.locator('.feed-carousel__slide').count() >= 1, 'the Carousel shows its posts as slides')
    frame.screenshot(path='test-output/out/group-carousel.png')

    # A visitor on the public tab sees it
    visitor = st(pg, "const band=s.getSpace('porchlights'); return s.getSpaces().flatMap(x=>x.memberIds).find(id=>!band.memberIds.includes(id) && s.getMember(id) && !s.getMember(id).isGuest)")
    pg.evaluate(f"(async()=>{{const a=await import('./js/state/accounts.js'); a.signIn('{visitor}')}})()"); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(900)
    frame = pg.locator(f'[data-module-id="{cid}"]')
    check(frame.count() == 1 and frame.locator('.feed-carousel__slide').count() >= 1, 'a visitor sees the Carousel on the public tab')
    check(frame.get_by_role('button', name='New post').count() == 0, 'and can’t post in it')

    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
