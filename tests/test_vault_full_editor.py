"""
Vault files (Nov 18):
1. "Note" is "Document" in the New menu and labels.
2. Rows have a … menu (Share, Open in the full editor, Rename, Delete) instead of Rename/Delete links;
   Share opens the share dialog; Rename and Delete work. The full page's rows too (with Move).
3. A document, spreadsheet, and presentation open inside the vault card; the module's expand
   button opens that file in its full editor (document: every tool and Contents; spreadsheet
   and presentation: their full pages), with "Back to the vault"; the tree steps aside.
   Back returns to the vault's list.
"""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    def card():
        pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
        v = pg.locator('.module-frame', has=pg.locator('.vault__toolbar, .vault__item-view')).first
        v.scroll_into_view_if_needed()
        return v

    def create(v, action, name):
        if not v.locator('.vault__menu').count():
            v.get_by_role('button', name='New').click(); pg.wait_for_timeout(200)
        if not v.locator(f'[data-action="{action}"]').is_visible():
            v.locator('.vault__menu-more-toggle').click(); pg.wait_for_timeout(150)
        v.locator(f'[data-action="{action}"]').click(); pg.wait_for_timeout(200)
        v.locator('form input').first.fill(name); v.locator('form').first.press('Enter'); pg.wait_for_timeout(600)

    v = card()
    # 1
    v.get_by_role('button', name='New').click(); pg.wait_for_timeout(200)
    labels = v.locator('.vault__menu-label').all_inner_texts()
    check(labels[0] == 'Document' and 'Note' not in labels, f'Document, not Note ({labels[:4]})')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)

    # 3: document
    create(v, 'note', 'House rules')
    check(v.locator('.vault-note').count() == 1, 'a new document opens inside the card')
    v.locator('.module-frame__open').click(); pg.wait_for_timeout(900)
    ed = pg.locator('.vault-editor')
    check(ed.count() == 1 and pg.locator('.vault-page.is-editing').count() == 1, 'expand opens it in the full editor, the tree stepping aside')
    check(ed.locator('.rich-text__toolbar.is-full').count() == 1 and ed.locator('.note-page__outline').count() == 1, 'the document’s full editor: every tool, and Contents')
    check(ed.locator('.vault-editor__back').inner_text().strip() == 'Back to the vault', '“Back to the vault” is there')
    ed.locator('.rich-text__content').first.click(); pg.keyboard.type('Quiet hours after 10.'); pg.wait_for_timeout(700)
    html = pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getModule('house-vault').data.items.find(i=>i.name==='House rules').html})()")
    check('Quiet hours' in html, 'typing in the full editor saves the document')
    pg.screenshot(path='test-output/out/vault-full-editor.png')
    ed.locator('.vault-editor__back').click(); pg.wait_for_timeout(500)
    check(pg.locator('.vault-editor').count() == 0 and pg.locator('.vault-tree').is_visible(), 'Back returns to the vault, with the tree')

    # 2 on the full page: … menu
    row = pg.locator('#module-page-view').locator('.vault-item, tr', has_text='House rules').first
    row.locator('.more-menu__button').click(); pg.wait_for_timeout(200)
    items = pg.locator('.more-menu .more-menu__item').all_inner_texts()
    check(items == ['Share', 'Rename', 'Move', 'Delete'], f'full page … menu: {items}')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)

    # 3: spreadsheet and presentation
    for action, name, full_sel in [('module:sheet', 'Chores budget', '.sheet-editor, .sheet'), ('module:presentation', 'House meeting slides', '.presentation, .slides, [class*="presentation"]')]:
        v = card()
        if v.locator('.vault__back').count():
            v.locator('.vault__back').first.click(); pg.wait_for_timeout(300)
        create(v, action, name)
        inline = v.locator('.vault-module-file.is-compact')
        check(inline.count() == 1, f'{name}: opens inside the card (its card view)')
        v.locator('.module-frame__open').click(); pg.wait_for_timeout(900)
        ed = pg.locator('.vault-editor')
        check(ed.count() == 1 and ed.locator('.vault-module-file:not(.is-compact)').count() == 1, f'{name}: expand opens its full page in the full editor')
        check(ed.locator('input[aria-label="Name"]').input_value() == name, f'{name}: named at the top')
        ed.locator('.vault-editor__back').click(); pg.wait_for_timeout(400)

    # 2 in the card: … menu Share, Rename, Delete
    v = card()
    if v.locator('.vault__back').count():
        v.locator('.vault__back').first.click(); pg.wait_for_timeout(300)
    row = v.locator('.vault-item', has_text='House rules')
    check(row.locator('.link-button', has_text='Rename').count() == 0, 'no Rename/Delete links on rows')
    row.locator('.more-menu__button').click(); pg.wait_for_timeout(200)
    items = pg.locator('.more-menu .more-menu__item').all_inner_texts()
    check(items == ['Share', 'Open in the full editor', 'Rename', 'Delete'], f'card … menu: {items}')
    pg.locator('.more-menu__item', has_text='Share').click(); pg.wait_for_timeout(400)
    dialog = pg.locator('dialog[open], [role=dialog]').last
    check(dialog.count() == 1 and 'Share' in dialog.inner_text(), 'Share opens the share dialog')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    v = card()
    v.locator('.vault-item', has_text='House rules').locator('.more-menu__button').click(); pg.wait_for_timeout(200)
    pg.locator('.more-menu__item', has_text='Rename').click(); pg.wait_for_timeout(200)
    inp = v.locator('.vault-item__rename')
    inp.fill('House rules (2026)'); inp.press('Enter'); pg.wait_for_timeout(400)
    check(v.locator('.vault-item', has_text='House rules (2026)').count() == 1, 'Rename works')
    v.locator('.vault-item', has_text='House rules (2026)').locator('.more-menu__button').click(); pg.wait_for_timeout(200)
    pg.locator('.more-menu__item', has_text='Delete').click(); pg.wait_for_timeout(400)
    check(v.locator('.vault-item', has_text='House rules (2026)').count() == 0, 'Delete works')

    check(not errs, f'no page errors {errs[:2]}')
    b.close()

print('\n', 'ALL PASS' if not fails else f'{len(fails)} FAILED: {fails}')
