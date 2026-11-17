# Sharing a vault file in a post: the composer offers Can view / Can comment / Can edit for it. "Can edit": someone else sees the
# file as it is now and can change it (the vault's copy changes); comments go under it and its owner hears about them.
# "Can view" stays a copy. A vault file on a page has the same choice for people who see it there.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const a=await import('./js/state/accounts.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    # a note in Leo's own vault to share
    info=st(pg, """const home=s.getState().spaces.find(x=>x.kind==='personal'&&x.memberIds[0]==='m-leo'); let v=home.modules.find(m=>m.type==='vault');
      if(!v){ v={id:'leo-vault-t', type:'vault', title:'My vault', span:6, rows:10, data:{items:[]}}; s.changeState(()=>home.modules.push(v)); }
      const item={id:'item-share-t', kind:'note', name:'Bike route ideas', html:'<p>Start at the pantry.</p>', parentId:null, createdBy:'m-leo', createdAt:Date.now(), updatedAt:Date.now()};
      s.updateModuleData(v.id, {...v.data, items:[...(v.data.items||[]), item]}); return v.id""")
    pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(900)
    pg.locator('.feed-module__new-post').first.click(); pg.wait_for_timeout(300)
    d=pg.locator('dialog.modal[open]')
    d.locator('.feed-composer__text').fill('Help me plan the route')
    d.get_by_role('button', name='From your vault').click(); pg.wait_for_timeout(300)
    d.locator('.sub-attach__vault-item', has_text='Bike route ideas').click(); pg.wait_for_timeout(300)
    picker=d.locator('.file-access__picker'); print('access picker:', picker.count(), picker.locator('option').all_inner_texts() if picker.count() else '')
    picker.select_option('edit')
    pg.screenshot(path='test-output/share-access-composer.png')
    d.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(600)
    print('posted with access:', st(pg, "const blog=s.getState().spaces.find(x=>x.kind==='blog'&&x.memberIds[0]==='m-leo'); for(const m of blog.modules){ for(const p of (m.data?.posts||[])) for(const at of (p.attachments||[])) if(at.item?.name==='Bike route ideas') return at.access } return null"))
    # Jamal looks at Leo's blog and edits it
    st(pg, "a.signIn('m-jamal'); return 1"); pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(1000)
    tile=pg.locator('.feed-tile', has_text='Bike route ideas').first
    if tile.count(): tile.click(); pg.wait_for_timeout(600)  # the blog shows posts as a grid; the post opens over the page
    live=pg.locator('.file-live', has_text='Bike route ideas').first
    print('Jamal sees live file:', live.count(), '| badge:', live.locator('.file-access__badge').inner_text() if live.count() else None, '| editor:', live.locator('[contenteditable=true]').count() if live.count() else 0)
    ed=live.locator('[contenteditable=true]').first; ed.click(); pg.keyboard.press('End'); pg.keyboard.type(' Then the river path.'); pg.wait_for_timeout(1200)
    html=st(pg, f"return s.getModule('{info}').data.items.find(i=>i.id==='item-share-t').html"); print('vault copy now:', html)
    if 'river path' not in html: errs.append('edit did not save to the vault')
    live.locator('.file-comments__input').fill('Love this'); live.get_by_role('button', name='Comment').click(); pg.wait_for_timeout(400)
    print('comments:', st(pg, f"return (s.getModule('{info}').data.items.find(i=>i.id==='item-share-t').comments||[]).length"), '| Leo notified:', st(pg, "return (s.getState().notifications||[]).some(n=>n.recipientId==='m-leo' && /commented on/.test(n.text))"))
    pg.screenshot(path='test-output/share-access-live.png')
    # a vault file on Leo's blog, Can comment
    st(pg, f"""a.signIn('m-leo'); const blog=s.getState().spaces.find(x=>x.kind==='blog'&&x.memberIds[0]==='m-leo'); s.changeState(()=>blog.modules.push({{id:'vf-t', type:'vaultfile', title:'Route', span:6, rows:12, data:{{vaultModuleId:'{info}', itemId:'item-share-t'}}}}), 'layout'); return 1""")
    pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(900)
    vf=pg.locator('.module-frame[data-module-id="vf-t"]'); print('owner sees access picker on the page:', vf.locator('.vaultfile__access select').count())
    vf.locator('.vaultfile__access select').select_option('comment'); pg.wait_for_timeout(300)
    st(pg, "a.signIn('m-jamal'); return 1"); pg.evaluate("location.hash='#'"); pg.wait_for_timeout(200); pg.evaluate("location.hash='#blog-leo'"); pg.wait_for_timeout(900)
    vf=pg.locator('.module-frame[data-module-id="vf-t"]'); print('visitor: comment box:', vf.locator('.file-comments__input').count(), '| editor:', vf.locator('[contenteditable=true]').count(), '| note:', vf.locator('.file-access__note').inner_text() if vf.locator('.file-access__note').count() else None)
    print('errors', errs)
    b.close()
