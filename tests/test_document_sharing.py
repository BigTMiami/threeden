# Documents in a vault have a small Sharing button: who can open it and what group members can do (item.memberAccess),
# where it's shared (posts and pages, each with its own access), and whether it's published (an article's status and views).
# Published articles count views (not by their authors), shown to authors and moderators.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const a=await import('./js/state/accounts.js'); {js} }})()")
def open_note(pg, name, folder=None):
    pg.evaluate("location.hash='#module-tenants-vault'"); pg.wait_for_timeout(900)
    v=pg.locator('#module-page-view')
    if folder: v.get_by_text(folder, exact=True).first.click(); pg.wait_for_timeout(400)
    v.get_by_text(name, exact=True).first.click(); pg.wait_for_timeout(600)
    return v
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.app-bar', timeout=20000); pg.wait_for_timeout(500)
    roles=st(pg, "const p=await import('./js/state/permissions.js'); const sp=s.getState().spaces.find(x=>x.id==='tenants'); return sp ? sp.memberIds.map(id=>id+':'+p.roleOf(sp,id)) : s.getState().spaces.filter(x=>x.name.includes('Tenants')).map(x=>x.id)")
    print('tenants roles:', roles)

    # ── the co-written note that became a draft article ──
    v=open_note(pg, 'Meeting prep: our asks', 'Crestline meeting')
    btn=v.locator('.doc-share__button').first
    print('button:', btn.inner_text().strip())
    if 'Draft' not in btn.inner_text(): errs.append('button should say Draft')
    btn.click(); pg.wait_for_timeout(300)
    panel=v.locator('.doc-share__panel')
    print('panel sections:', [t.strip() for t in panel.locator('.doc-share__heading').all_inner_texts()])
    print('published line:', panel.locator('.doc-share__pub').inner_text().replace('\n',' '))
    pg.screenshot(path='test-output/doc-share-panel.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    print('closed on Escape:', panel.is_hidden())

    # publish the article (as Priya, its author), then read it as Leo: a view counts
    st(pg, "const m=s.getModule('tenants-bulletin'); const d=structuredClone(m.data); const x=d.articles.find(y=>y.id==='tenants-art-3'); x.status='published'; x.publishedAt=Date.now(); s.updateModuleData('tenants-bulletin', d); return 1")
    v=open_note(pg, 'Meeting prep: our asks', 'Crestline meeting')
    print('after publishing:', v.locator('.doc-share__button').first.inner_text().strip())
    # a reader who isn't an author opens a published article: +1 view, +1 reader; reopening in the same visit doesn't count again
    before=st(pg, "const x=s.getModule('tenants-bulletin').data.articles.find(y=>y.id==='tenants-art-1'); return [x.views, x.readers]")
    pg.evaluate("location.hash='#module-tenants-bulletin'"); pg.wait_for_timeout(800)
    pg.locator('#module-page-view .article-teaser__link', has_text='Crestline wants 9%').first.click(); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='All articles').click(); pg.wait_for_timeout(300)
    pg.locator('#module-page-view .article-teaser__link', has_text='Crestline wants 9%').first.click(); pg.wait_for_timeout(500)
    after=st(pg, "const x=s.getModule('tenants-bulletin').data.articles.find(y=>y.id==='tenants-art-1'); return [x.views, x.readers]")
    print('Leo reads Priya’s article: views/readers', before, '->', after, '| Leo sees counts:', pg.locator('.news-article__views').count())
    if after!=[before[0]+1, before[1]+1]: errs.append('view not counted once')
    if pg.locator('.news-article__views').count(): errs.append('a reader should not see the counts')
    # Priya (its author) sees the counts and doesn't add a view
    st(pg, "a.signIn('m-priya'); return 1"); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#module-tenants-bulletin'"); pg.wait_for_timeout(800)
    print('Priya’s byline:', pg.locator('#module-page-view .article-teaser', has_text='Crestline wants 9%').locator('.article-byline').first.inner_text())
    pg.locator('#module-page-view .article-teaser__link', has_text='Crestline wants 9%').first.click(); pg.wait_for_timeout(500)
    print('Priya sees:', pg.locator('.news-article__views').inner_text() if pg.locator('.news-article__views').count() else '-', '| views now:', st(pg, "return s.getModule('tenants-bulletin').data.articles.find(y=>y.id==='tenants-art-1').views"))
    if not pg.locator('.news-article__views').count(): errs.append('the author should see views')
    if st(pg, "return s.getModule('tenants-bulletin').data.articles.find(y=>y.id==='tenants-art-1').views")!=after[0]: errs.append('author view counted')
    pg.screenshot(path='test-output/article-views.png')

    # ── member access: Maya made the flyer; she limits members to viewing ──
    st(pg, "a.signIn('m-maya'); return 1"); pg.wait_for_timeout(500)
    v=open_note(pg, 'Flyer text: why join the union')
    v.locator('.doc-share__button').first.click(); pg.wait_for_timeout(200)
    sel=v.locator('.doc-share__member-access')
    print('Maya can set member access:', sel.count())
    sel.select_option('view'); pg.wait_for_timeout(200)
    print('button now:', v.locator('.doc-share__button').first.inner_text().strip(), '| saved:', st(pg, "return s.getModule('tenants-vault').data.items.find(i=>i.id==='tenants-note-flyer').memberAccess"))
    pg.keyboard.press('Escape')
    # Iris (a member, not an admin) can read but not edit
    who=st(pg, "const p=await import('./js/state/permissions.js'); const sp=s.getSpaceOfModule('tenants-vault'); return sp.memberIds.find(id=>id!=='m-maya' && !p.can(sp,id,'moderate'))")
    print('plain member:', who)
    st(pg, f"a.signIn('{who}'); return 1"); pg.wait_for_timeout(500)
    v=open_note(pg, 'Flyer text: why join the union')
    print('member sees: editor', v.locator('.rich-text-editor, [contenteditable=true]').count(), '| read-only text', v.locator('.vault-note__read').count(), '| title disabled', v.locator('.vault-note__title').is_disabled())
    if v.locator('[contenteditable=true]').count() or not v.locator('.vault-note__read').count(): errs.append('limited member can still edit')
    v.locator('.doc-share__button').first.click(); pg.wait_for_timeout(200)
    print('member sees member access as text:', v.locator('.doc-share__member-access').count()==0, '|', v.locator('.doc-share__section').first.inner_text().replace('\n',' ')[:160])
    pg.screenshot(path='test-output/doc-share-member.png')
    pg.keyboard.press('Escape')

    # ── shares: Leo's own note in a post shows under Shared in, with its access ──
    st(pg, "a.signIn('m-leo'); return 1"); pg.wait_for_timeout(500)
    st(pg, """const sp=s.getState().spaces.find(x=>x.kind==='personal'&&x.memberIds[0]==='m-leo'); const vm=sp.modules.find(m=>m.type==='vault'); const note=vm.data.items.find(i=>i.kind==='note');
      const f=s.getModule('leo-feed'); const d=structuredClone(f.data); d.posts.push({id:'p-share-1', authorId:'m-leo', createdAt:Date.now(), editedAt:null, text:'My notes', media:[], attachments:[{kind:'file', access:'comment', item:{id:'cp1', kind:'note', name:note.name, html:note.html, from:{vaultModuleId:vm.id, itemId:note.id}}}]}); s.updateModuleData('leo-feed', d);
      window.__note=[vm.id, note.id, note.name]; return 1""")
    name=st(pg, "return window.__note[2]")
    pg.evaluate("location.hash='#'"); pg.wait_for_timeout(900)
    vid=st(pg, "return window.__note[0]")
    pg.evaluate(f"location.hash='#module-{vid}'"); pg.wait_for_timeout(800)
    v=pg.locator('#module-page-view'); v.get_by_text(name, exact=True).first.click(); pg.wait_for_timeout(500)
    btn=v.locator('.doc-share__button').first; print('Leo’s note:', btn.inner_text().strip())
    btn.click(); pg.wait_for_timeout(200)
    rows=v.locator('.doc-share__row'); print('shared in:', rows.count(), '|', rows.first.inner_text().replace('\n',' ') if rows.count() else '-')
    if not rows.count(): errs.append('share not listed')
    rows.first.locator('select').select_option('edit'); pg.wait_for_timeout(200)
    print('post access now:', st(pg, "return s.getModule('leo-feed').data.posts.find(p=>p.id==='p-share-1').attachments[0].access"))
    if st(pg, "return s.getModule('leo-feed').data.posts.find(p=>p.id==='p-share-1').attachments[0].access")!='edit': errs.append('share access not changed')
    print('errors', errs)
