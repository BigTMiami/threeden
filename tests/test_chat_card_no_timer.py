"""Nov 20: the Chat module's card has no disappearing-messages setting; the
full page (expand) and Messages do. When it's on, the card says so."""
from playwright.sync_api import sync_playwright
fails = []
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    chat = pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); for (const sp of s.getSpaces()) { if (!sp.memberIds.includes(s.getCurrentUser().id)) continue; const m=sp.modules.find(m=>m.type==='chat'); if (m) return [sp.id, m.id]; } })()")
    gid, mid = chat
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(900)
    card = pg.locator(f'[data-module-id="{mid}"]'); card.scroll_into_view_if_needed()
    check(card.locator('.thread').count() == 1, 'the chat card shows its conversation')
    check(card.get_by_label('Disappearing messages').count() == 0, 'no disappearing-messages setting on the card')
    pg.evaluate(f"location.hash='#module-{mid}'"); pg.wait_for_timeout(900)
    page = pg.locator('#module-page-view')
    sel = page.get_by_label('Disappearing messages')
    check(sel.count() == 1, 'the full page has it')
    sel.select_option(index=2); pg.wait_for_timeout(300)
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(900)
    card = pg.locator(f'[data-module-id="{mid}"]')
    note = card.locator('.thread__timer')
    check(note.is_visible() and 'disappear after' in note.inner_text(), f'with it on, the card says so ({note.inner_text().strip() if note.count() else ""})')
    check(card.get_by_label('Disappearing messages').count() == 0, 'still without the setting')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
