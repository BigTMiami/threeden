"""
Editing controls in the page header (Nov 17): while editing, Edit becomes
Layouts, Preview, and Done editing; there's no bar at the bottom.

1. A group, My Homepage, and a blog, on a computer and a phone: the three
   buttons show (and Edit doesn't), with no bottom bar.
2. Layouts opens under its button, inside the screen; choosing one applies
   it; a featured layout shows Featured in the menu; Escape closes it.
3. Preview: groups show "Previewing as a member" (admin-only things gone),
   other pages "Previewing"; Back to editing returns; leaving the page ends
   a preview.
4. Done editing leaves edit mode and Edit is back.
"""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
errs = []
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js}}})()")


def start_editing(pg, space):
    header = pg.locator('#space-header')
    header.get_by_role('button', name='Edit', exact=True).first.click(); pg.wait_for_timeout(200)
    if space != '#blog-leo':
        pg.get_by_role('menuitem', name='Edit this page').click()
    pg.wait_for_timeout(500)
    return header


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for width, tag in [(1300, 'desktop'), (390, 'phone')]:
        pg = b.new_page(viewport={'width': width, 'height': 860}, has_touch=tag == 'phone', is_mobile=tag == 'phone')
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8765/index.html')
        if tag == 'desktop':
            pg.evaluate('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("3den")'); pg.reload()
        pg.wait_for_selector('.app-bar', timeout=30000)
        for space in ['#space-juniper', '#space-me', '#blog-leo']:
            pg.evaluate(f"location.hash='{space}'"); pg.wait_for_timeout(900)
            header = start_editing(pg, space)
            who = f'{tag} {space}'
            # Phones: groups and homepages have one layout (widgets, then modules; Nov 18), so no Layouts there.
            layouts = not (tag == 'phone' and space != '#blog-leo')
            want = ['Layouts', 'Preview', 'Done editing'] if layouts else ['Preview', 'Done editing']
            check(all(header.get_by_role('button', name=n).count() == 1 for n in want), f'{who}: {", ".join(want)}')
            if not layouts:
                check(header.locator('.layout-menu__button').count() == 0, f'{who}: no Layouts on a phone')
            check(header.get_by_role('button', name='Edit', exact=True).count() == 0, f'{who}: no Edit while editing')
            check(pg.locator('.edit-bar').count() == 0, f'{who}: no bottom bar')
            names = [n.strip() for n in header.locator('.space-header__actions > *').all_inner_texts()]
            order = [n for n in names if n in ('Layouts', 'Preview', 'Done editing')]
            check(order == want, f'{who}: in that order, left to right ({order})')

            # 2. Layouts (not on a phone for groups and homepages).
            if layouts:
                header.locator('.layout-menu__button').click(); pg.wait_for_timeout(300)
                menu = pg.locator('.layout-menu')
                box, btn = menu.bounding_box(), header.locator('.layout-menu__button').bounding_box()
                check(box['y'] > btn['y'] + btn['height'] - 1 and box['x'] >= 0 and box['x'] + box['width'] <= width, f'{who}: Layouts opens under its button, on screen')
                if space == '#space-juniper':
                    menu.locator('.layout-menu__item', has_text='Spotlight').click(); pg.wait_for_timeout(500)
                    check(st(pg, 'return s.getPageLayout().kind') == 'spotlight', f'{who}: choosing Spotlight applies it')
                    header.locator('.layout-menu__button').click(); pg.wait_for_timeout(300)
                    check(menu.locator('.layout-menu__featured select').count() == 1, f'{who}: Featured is in the Layouts menu')
                    menu.locator('.layout-menu__item', has_text='Grid').click(); pg.wait_for_timeout(500)
                else:
                    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
                    check(menu.is_hidden(), f'{who}: Escape closes Layouts')

            # 3. Preview.
            header.get_by_role('button', name='Preview').click(); pg.wait_for_timeout(500)
            note = header.locator('.space-header__previewing').inner_text().strip() if header.locator('.space-header__previewing').count() else ''
            want = 'Previewing as a member' if space == '#space-juniper' else 'Previewing'
            check(note == want and not st(pg, 'return s.isEditMode()'), f'{who}: Preview shows "{want}" ({note})')
            check(header.get_by_role('button', name='Done editing').count() == 0 and pg.locator('#module-library:visible').count() == 0, f'{who}: no editing controls while previewing')
            if tag == 'desktop' and space == '#space-juniper':
                pg.screenshot(path='test-output/out/edit-controls-preview.png')
            header.get_by_role('button', name='Back to editing').click(); pg.wait_for_timeout(500)
            check(st(pg, 'return s.isEditMode()'), f'{who}: Back to editing')

            # 4. Done editing.
            header.get_by_role('button', name='Done editing').click(); pg.wait_for_timeout(400)
            check(not st(pg, 'return s.isEditMode()') and header.get_by_role('button', name='Edit', exact=True).count() == 1, f'{who}: Done editing, and Edit is back')

        # Leaving the page ends a preview.
        pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(800)
        header = start_editing(pg, '#space-me')
        header.get_by_role('button', name='Preview').click(); pg.wait_for_timeout(400)
        pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(600)
        pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(800)
        check(pg.locator('.space-header__previewing').count() == 0 and header.get_by_role('button', name='Edit', exact=True).count() == 1, f'{tag}: leaving the page ends the preview')
        if tag == 'desktop':
            pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
            start_editing(pg, '#space-juniper')
            pg.screenshot(path='test-output/out/edit-controls.png')
        pg.close()

    print('page errors:', errs[:3])
    check(not errs, 'no page errors')
    b.close()

print('PASS' if not fails else f'{len(fails)} FAILED')
