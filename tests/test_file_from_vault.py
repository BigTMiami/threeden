"""
File from vault replaces Document, Spreadsheet, and Presentation in the module
list; Canvas is gone; My Homepage's list (Nov 17).

1. My Homepage: "The basics" is Dashboard, Calendar, Upcoming events, Tasks,
   Vault, File from vault, Budget, Gantt chart, Recent groups; no
   Announcements, Forum, Submissions, Document, Spreadsheet, Presentation,
   or Canvas anywhere in the list.
2. A group and a blog: no Document, Spreadsheet, Presentation, or Canvas;
   File from vault is there (in a group's basics, where Document was).
3. File from vault opens the picker (no folders), choosing a note adds a
   module drawn by the Document module (same editor, last-edited line), with
   the "from My vault" line; typing changes the vault note; the header icon
   is the document's.
4. A spreadsheet chosen from a group's vault shows the spreadsheet itself.
5. Dragged on empty, it says "Choose a file", and choosing fills it.
6. Canvas: no module type, not in the vault's + New, and an old save's Canvas
   module and Canvas vault file are dropped on load.
7. On a phone, the picker fits the screen.
"""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
errs = []
fails = []
GONE = ['Document', 'Spreadsheet', 'Presentation', 'Canvas']


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const r=await import('./js/modules/registry.js'); {js}}})()")


def library_names(pg):
    lib = pg.locator('#module-library')
    for toggle in lib.locator('.library__more').all():
        if toggle.get_attribute('aria-expanded') == 'false':
            toggle.click(); pg.wait_for_timeout(100)
    return [t.strip() for t in lib.locator('.library-item__label').all_inner_texts()]


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html')
    pg.evaluate('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("3den")')
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=30000)

    # 1. My Homepage.
    pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(800)
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(400)
    basics = [t.strip() for t in pg.locator('#module-library .library__list').first.locator('.library-item__label').all_inner_texts()]
    want = ['Dashboard', 'Calendar', 'Upcoming events', 'Tasks', 'Vault', 'File from vault', 'Budget', 'Gantt chart', 'Recent groups']
    check(basics == want, f'My Homepage basics in order ({basics})')
    names = library_names(pg)
    check(not [n for n in names if n in GONE + ['Board', 'Announcements', 'Forum', 'Submissions']], f'no Announcements, Forum, Submissions, Document, Spreadsheet, Presentation, or Canvas ({[n for n in names if n in GONE + ["Announcements", "Forum", "Submissions"]]})')
    check(pg.locator('.library__vaults').count() == 0, 'no "From your vaults" list')

    # 3. Choose a note.
    pg.locator('#module-library .library-item', has_text='File from vault').click(); pg.wait_for_timeout(400)
    picker = pg.locator('dialog.vault-picker-modal')
    check(picker.is_visible() and picker.locator('.vault-picker__title').inner_text() == 'File from vault', 'the picker opens')
    details = picker.locator('.vault-picker__detail').all_inner_texts()
    check(details and not any(d.startswith('Folder') for d in details), 'no folders to choose')
    note = picker.locator('.vault-picker__item', has=pg.locator('.vault-picker__detail', has_text='Note')).first
    note_name = note.locator('.vault-picker__name').inner_text()
    note.click(); pg.wait_for_timeout(600)
    st(pg, 's.setEditMode(false)'); pg.wait_for_timeout(500)
    frame = pg.locator('.module-frame[data-module-type="vaultfile"]').last
    frame.scroll_into_view_if_needed()
    check(frame.locator('.module-frame__title').inner_text() == note_name, f'the module is titled "{note_name}"')
    check(frame.locator('.note .rich-text__content').count() == 1 and frame.locator('.note__last-edited').count() == 1, 'drawn by the Document module (editor and last-edited line)')
    check('from “My vault”' in frame.locator('.vaultfile__source').inner_text(), 'the location line shows')
    doc_icon = frame.locator('.module-frame__icon svg').inner_html()
    vault_icon = pg.evaluate("(async()=>{const i=await import('./js/ui/icons.js'); return i.icon('vault',16).innerHTML})()")
    check(doc_icon != vault_icon, 'header icon is the document’s, not the vault’s')
    frame.locator('[contenteditable=true]').first.click(); pg.keyboard.press('Control+End'); pg.keyboard.type(' Typed on the page.'); pg.wait_for_timeout(1500)
    saved = st(pg, f"const v=s.getPersonalSpace().modules.find(m=>m.type==='vault'); return v.data.items.find(i=>i.name==={note_name!r}).html.includes('Typed on the page')")
    check(saved, 'typing on the page changes the note in the vault')

    # 2. A group and a blog.
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(400)
    gbasics = [t.strip() for t in pg.locator('#module-library .library__list').first.locator('.library-item__label').all_inner_texts()]
    check(gbasics == ['Board', 'Calendar', 'Chat', 'Tasks', 'File from vault', 'Vault'], f'group basics ({gbasics})')
    gnames = library_names(pg)
    check(not [n for n in gnames if n in GONE] and 'Forum' in gnames and 'Submissions' in gnames, 'group: Forum and Submissions stay; the four are gone')

    # 4. A spreadsheet from the group's vault (made here first).
    st(pg, """const v=s.getSpace('juniper').modules.find(m=>m.type==='vault'); const d=structuredClone(v.data);
      d.items.push({id:'t-sheet', kind:'module', moduleType:'sheet', name:'Chore rota', parentId:null, createdBy:'m-leo', createdAt:Date.now(), updatedAt:Date.now(), data:r.getModuleType('sheet').createInitialData()});
      s.updateModuleData(v.id, d); return 1""")
    pg.locator('#module-library .library-item', has_text='File from vault').click(); pg.wait_for_timeout(400)
    check(picker.locator('.vault-picker__vault-name').count() >= 2, 'a group page lists the group’s vault and yours')
    picker.locator('.vault-picker__item', has_text='Chore rota').click(); pg.wait_for_timeout(600)
    st(pg, 's.setEditMode(false)'); pg.wait_for_timeout(500)
    sheet = pg.locator('.module-frame[data-module-type="vaultfile"]').last
    check(sheet.locator('.sheet--card').count() == 1, 'the spreadsheet shows as a spreadsheet')

    # 5. Empty, then chosen.
    mid = st(pg, "return s.addModule('vaultfile').id"); pg.wait_for_timeout(500)
    empty = pg.locator(f'.module-frame[data-module-id="{mid}"]')
    check('Choose a file' in empty.inner_text(), 'an empty one says Choose a file')
    empty.get_by_role('button', name='Choose a file').click(); pg.wait_for_timeout(300)
    picker.locator('.vault-picker__item').first.click(); pg.wait_for_timeout(600)
    check(st(pg, f"return Boolean(s.getModule('{mid}').data.itemId)") and 'Choose a file' not in empty.inner_text(), 'choosing fills it')

    # Blog.
    pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(800)
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(400)
    bnames = library_names(pg)
    check('File from vault' in bnames and not [n for n in bnames if n in GONE], f'blog: File from vault, none of the four ({bnames})')
    st(pg, 's.setEditMode(false)')

    # 6. Canvas.
    check(st(pg, "try { r.getModuleType('canvas'); return false } catch { return true }"), 'no Canvas module type')
    check(st(pg, "const v=await import('./js/modules/vault/vault-parts.js'); return ![...v.NEW_MENU_ENTRIES, ...v.MORE_MENU_ENTRIES].some(e=>e.action==='module:canvas')"), 'not in the vault’s + New')
    pg.evaluate("""(async()=>{
      const st=await import('./js/state/storage.js'); const s=await import('./js/state/store.js'); const u=await import('./js/state/upgrade.js');
      const state=structuredClone(s.getState()); const me=state.spaces.find(x=>x.kind==='personal'&&x.id==='me');
      me.modules.push({id:'old-canvas', type:'canvas', title:'Sketch', span:6, rows:10, data:{layers:[]}});
      const v=me.modules.find(m=>m.type==='vault'); v.data.items.push({id:'old-canvas-file', kind:'module', moduleType:'canvas', name:'Flyer', parentId:null, data:{}});
      state.dataVersion = 68;
      await st.saveState(state);
    })()""")
    pg.wait_for_timeout(500); pg.reload(); pg.wait_for_selector('.app-bar', timeout=30000); pg.wait_for_timeout(500)
    left = st(pg, "const me=s.getState().spaces.find(x=>x.id==='me'); const v=me.modules.find(m=>m.type==='vault'); return [me.modules.some(m=>m.type==='canvas'), v.data.items.some(i=>i.moduleType==='canvas')]")
    check(left == [False, False], f'an old save’s Canvas module and file are dropped ({left})')

    # 7. Phone.
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.evaluate("location.hash='#space-me'"); pg.wait_for_timeout(800)
    st(pg, 's.setEditMode(true)'); pg.wait_for_timeout(300)
    pg.locator('.space-header__add-modules').click(); pg.wait_for_timeout(300)
    pg.locator('#module-library .library-item', has_text='File from vault').click(); pg.wait_for_timeout(400)
    box = picker.bounding_box()
    check(box['x'] >= 0 and box['x'] + box['width'] <= 390, f'phone: the picker fits ({round(box["x"])}–{round(box["x"] + box["width"])})')
    pg.screenshot(path='test-output/out/file-from-vault-phone.png')

    print('page errors:', errs[:3])
    check(not errs, 'no page errors')
    b.close()

print('PASS' if not fails else f'{len(fails)} FAILED')
