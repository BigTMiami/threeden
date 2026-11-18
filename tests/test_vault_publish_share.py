"""
Vault sharing, publishing, photo tiles, and selecting several (Nov 17).

1. Photos and videos in a vault show as picture tiles above the other files.
2. An open note's Sharing tile: three rows (Who can open it, Shared in,
   Published) that each open to change them.
3. Who can open it → share with Jamal → it's in Jamal's vault under
   "Shared with you", and opens there.
4. Published → Publish → the places (your blog first, groups folded and
   opening to their feeds) → a feed → the post editor with the note
   attached → Post: a post with a preview, listed back under Published.
   Photos say Post instead of Publish.
5. A folder: its tile beside the path; Publish asks for a cover photo first;
   the post carries the folder with its cover.
6. Select: tick a note and two photos; Post opens the editor with all three
   in order; ↑ moves the second up (it becomes the preview); posting keeps
   that order. Move, Download, Make a copy, Share, and Delete are offered.
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


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1300, 'height': 1000})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html')
    pg.evaluate('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("3den")')
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=30000)

    # Two photos and a folder (with a photo) in Leo's vault.
    vid = st(pg, """
      const c=document.createElement('canvas'); c.width=120; c.height=90; const x=c.getContext('2d');
      const photo=(color)=>{ x.fillStyle=color; x.fillRect(0,0,120,90); return c.toDataURL('image/png'); };
      const v=s.getPersonalSpace().modules.find(m=>m.type==='vault'); const d=structuredClone(v.data); const now=Date.now();
      d.items.push({id:'t-ph1', kind:'file', name:'Porch.png', parentId:null, createdBy:'m-leo', updatedAt:now, file:{mimeType:'image/png', size:900, dataUrl:photo('#c33')}});
      d.items.push({id:'t-ph2', kind:'file', name:'Stage.png', parentId:null, createdBy:'m-leo', updatedAt:now-1, file:{mimeType:'image/png', size:900, dataUrl:photo('#36c')}});
      d.items.push({id:'t-fold', kind:'folder', name:'Show photos', parentId:null, createdBy:'m-leo', updatedAt:now});
      d.items.push({id:'t-ph3', kind:'file', name:'Crowd.png', parentId:'t-fold', createdBy:'m-leo', updatedAt:now, file:{mimeType:'image/png', size:900, dataUrl:photo('#3a3')}});
      d.items.push({id:'t-note', kind:'note', name:'Set list', parentId:null, createdBy:'m-leo', updatedAt:now, html:'<p>Opener, ballad, closer</p>'});
      s.updateModuleData(v.id, d); return v.id""")
    pg.evaluate(f"location.hash='#module-{vid}'"); pg.wait_for_timeout(900)
    page = pg.locator('#module-page-view')

    # 1. Photo tiles.
    tiles = page.locator('.vault-media__tile')
    check(tiles.count() >= 2 and page.locator('.vault-table__row', has_text='Porch.png').count() == 0, f'photos show as tiles, not table rows ({tiles.count()})')

    # 2. The note's tile and its rows.
    page.locator('.vault-item__name', has_text='Set list').click(); pg.wait_for_timeout(500)
    page.locator('.doc-share__button').click(); pg.wait_for_timeout(200)
    rows = [t.split('\n')[0].strip().lower() for t in page.locator('.doc-share__row-toggle').all_inner_texts()]
    check(rows == ['who can open it', 'shared in', 'published'], f'three rows ({rows})')
    check(page.locator('.doc-share__editor').count() == 0, 'rows start closed')

    # 3. Share with Jamal.
    page.locator('.doc-share__row-toggle', has_text='Who can open it').click(); pg.wait_for_timeout(200)
    box = page.locator('.doc-share__add .people-search__input')
    box.fill('jamal'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    page.locator('.doc-share__add').get_by_role('button', name='Share').click(); pg.wait_for_timeout(300)
    shared = st(pg, f"return s.getModule('{vid}').data.items.find(i=>i.id==='t-note').sharedWith")
    check(bool(shared) and shared[0]['id'] == 'm-jamal' and shared[0]['access'] == 'view', f'shared with Jamal, Can view ({shared})')
    check('Jamal Brooks' in page.locator('.doc-share__people').inner_text(), 'Jamal is listed under Also shared with')

    # 4. Publish.
    page.locator('.doc-share__row-toggle', has_text='Published').click(); pg.wait_for_timeout(200)
    publish = page.locator('.doc-share__publish button')
    check(publish.inner_text().strip() == 'Publish', 'a note says Publish')
    publish.click(); pg.wait_for_timeout(400)
    dialog = pg.locator('dialog.publish-dialog-modal')
    sections = [t.upper() for t in dialog.locator('.publish-dialog__section').all_inner_texts()]
    check(sections == ['YOUR BLOG', 'YOUR GROUPS'], f'your blog first, then your groups ({sections})')
    check(dialog.locator('.publish-dialog__places--nested').count() == 0 and dialog.locator('.publish-dialog__group-toggle').count() > 0, 'groups start folded')
    dialog.locator('.publish-dialog__group-toggle').first.click(); pg.wait_for_timeout(150)
    check(dialog.locator('.publish-dialog__places--nested .publish-dialog__place').count() > 0, 'a group opens to its places')
    check(dialog.locator('.publish-dialog__place', has_text='Articles').count() >= 1, 'a note can also go to Articles')
    dialog.locator('.publish-dialog__places').first.locator('.publish-dialog__place', has_text='General feed').first.click(); pg.wait_for_timeout(400)
    check(dialog.locator('.feed-composer').count() == 1 and 'Set list' in dialog.locator('.feed-composer__attachment').inner_text(), 'the post editor opens with the note attached')
    dialog.locator('textarea').first.fill('Tonight’s set list')
    dialog.get_by_role('button', name='Post').click(); pg.wait_for_timeout(500)
    post = st(pg, "const f=s.getModule('leo-feed'); const p=f.data.posts[f.data.posts.length-1]; return [p.text, p.attachments.map(a=>a.item?.name)]")
    check(post == ['Tonight’s set list', ['Set list']], f'the post is in the feed ({post})')
    page.locator('.doc-share__button').click(); pg.wait_for_timeout(200)
    if page.locator('.doc-share__editor').count() == 0:
        page.locator('.doc-share__row-toggle', has_text='Published').click(); pg.wait_for_timeout(200)
    check('Post in' in page.locator('.doc-share__editor').inner_text(), 'Published lists the post')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)

    # Photos say Post.
    page.locator('.vault__back, .vault-editor__back').first.click(); pg.wait_for_timeout(400)
    page.locator('.vault-media__open').first.click(); pg.wait_for_timeout(400)
    page.locator('.doc-share__button').click(); pg.wait_for_timeout(200)
    if page.locator('.doc-share__publish').count() == 0:
        page.locator('.doc-share__row-toggle', has_text='Published').click(); pg.wait_for_timeout(200)
    check(page.locator('.doc-share__publish button').inner_text().strip() == 'Post', 'a photo says Post')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    page.locator('.vault__back, .vault-editor__back').first.click(); pg.wait_for_timeout(400)

    # 5. A folder: tile by the path, cover photo, post.
    page.locator('.vault-item__name', has_text='Show photos').click(); pg.wait_for_timeout(400)
    check(page.locator('.vault-page__path .doc-share__button').count() == 1, 'a folder has the tile beside its path')
    page.locator('.vault-page__path .doc-share__button').click(); pg.wait_for_timeout(200)
    page.locator('.doc-share__row-toggle', has_text='Published').click(); pg.wait_for_timeout(200)
    page.locator('.doc-share__publish button').click(); pg.wait_for_timeout(400)
    dialog.locator('.publish-dialog__places').first.locator('.publish-dialog__place', has_text='General feed').first.click(); pg.wait_for_timeout(300)
    check(dialog.locator('.publish-dialog__cover').count() >= 2, 'Publish asks for a cover photo (No cover, and the folder’s photo)')
    dialog.locator('.publish-dialog__cover img').first.click(); pg.wait_for_timeout(100)
    dialog.get_by_role('button', name='Next').click(); pg.wait_for_timeout(300)
    dialog.get_by_role('button', name='Post').click(); pg.wait_for_timeout(500)
    fpost = st(pg, "const f=s.getModule('leo-feed'); const p=f.data.posts[f.data.posts.length-1]; const it=p.attachments[0].item; return [it.kind, it.name, Boolean(it.cover), it.children.length]")
    check(fpost == ['folder', 'Show photos', True, 1], f'the post carries the folder with its cover ({fpost})')
    pg.screenshot(path='test-output/out/vault-folder.png')

    # 6. Select several and post them in a chosen order.
    page.locator('.vault-tree__folder').first.click(); pg.wait_for_timeout(400)
    page.locator('.vault-page__select').click(); pg.wait_for_timeout(200)
    actions = [t.strip() for t in page.locator('.vault-select__actions button').all_inner_texts()]
    check(all(a in actions for a in ['Move', 'Share', 'Download', 'Make a copy', 'Delete']), f'Move, Share, Download, Make a copy, Delete ({actions})')
    page.locator('.vault-table__row', has_text='Set list').locator('.vault-select__check').click(); pg.wait_for_timeout(150)
    page.locator('.vault-media__tile', has_text='Porch.png').locator('.vault-media__open').click(); pg.wait_for_timeout(100)
    page.locator('.vault-media__tile', has_text='Stage.png').locator('.vault-media__open').click(); pg.wait_for_timeout(100)
    check('3 selected' in page.locator('.vault-select__all').inner_text(), '3 selected')
    pg.screenshot(path='test-output/out/vault-select.png')
    page.locator('.vault-select__actions button', has_text='Post').click(); pg.wait_for_timeout(400)
    check(dialog.locator('.publish-dialog__title').inner_text().startswith('Post 3 files'), 'a mix says Post 3 files')
    dialog.locator('.publish-dialog__places').first.locator('.publish-dialog__place', has_text='General feed').first.click(); pg.wait_for_timeout(400)
    names = lambda: [n.strip() for n in dialog.locator('.feed-composer__attachment .sub-item__name').all_inner_texts()]
    before = names()
    check(len(before) == 3 and dialog.locator('.feed-composer__first').count() == 1, f'all three, the first marked Preview ({before})')
    dialog.locator('.feed-composer__attachment li').nth(1).get_by_role('button', name='Move up').click(); pg.wait_for_timeout(150)
    after = names()
    check(after == [before[1], before[0], before[2]], f'↑ moves the second to first ({after})')
    pg.screenshot(path='test-output/out/vault-post-order.png')
    dialog.get_by_role('button', name='Post').click(); pg.wait_for_timeout(500)
    order = st(pg, "const f=s.getModule('leo-feed'); return f.data.posts[f.data.posts.length-1].attachments.map(a=>a.item.name)")
    check(order == after, f'the post keeps that order ({order})')

    # 3b. Jamal's vault.
    st(pg, "const a=await import('./js/state/accounts.js'); a.signIn('m-jamal'); return 1"); pg.wait_for_timeout(400)
    jv = st(pg, "return s.getPersonalSpace().modules.find(m=>m.type==='vault')?.id ?? null")
    if jv:
        pg.evaluate(f"location.hash='#module-{jv}'"); pg.wait_for_timeout(800)
        link = page.locator('.vault-page__shared-link')
        check(link.count() == 1 and 'Shared with you' in link.inner_text(), 'Jamal’s vault has Shared with you')
        link.click(); pg.wait_for_timeout(300)
        check(page.locator('.vault-table__row', has_text='Set list').count() == 1, 'the note is listed there')
        page.locator('.vault-item__name', has_text='Set list').click(); pg.wait_for_timeout(500)
        check('Opener, ballad, closer' in page.locator('.vault-page__shared-file').inner_text(), 'it opens, live from Leo’s vault')
    else:
        check(False, 'Jamal has a vault')

    print('page errors:', errs[:3])
    check(not errs, 'no page errors')
    b.close()

print('PASS' if not fails else f'{len(fails)} FAILED')
