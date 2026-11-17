# An opened post on a General feed has Previous post / Next post (hidden at the ends, "2 of 5").
# A file from the vault shows in the New post box's preview ("Article" for an article), and as a centered page on its tile.
# Posts can be dragged from one feed on a blog to another (or moved from the "…" menu); a feed that can't hold one says why.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.app-bar', timeout=20000); pg.wait_for_timeout(600)
    v=pg.locator('#module-page-view')

    # ── Previous / next post ──
    pg.evaluate("location.hash='#module-leo-feed'"); pg.wait_for_timeout(1000)
    v.locator('.feed-tile, .feed-row').nth(0).click(); pg.wait_for_timeout(500)
    vis=lambda: [pg.locator(s).is_visible() for s in ['.photo-viewer__post-step--prev','.photo-viewer__post-step--next','.photo-viewer__prev','.photo-viewer__next']]
    first=vis(); print('first post (side prev, side next, prev, next):', first, pg.locator('.photo-viewer__position').inner_text())
    if first!=[False, True, False, True]: errs.append('first post should only offer Next')
    pg.locator('.photo-viewer__post-step--next').click(); pg.wait_for_timeout(250)
    if vis()!=[True]*4: errs.append('a middle post should offer both')
    for _ in range(5): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(120)
    last=vis(); print('last post:', last, pg.locator('.photo-viewer__position').inner_text())
    if last[1] or last[3]: errs.append('last post should not offer Next')
    pg.get_by_role('button', name='Previous post').last.click(); pg.wait_for_timeout(200)
    print('after Previous:', pg.locator('.photo-viewer__position').inner_text())
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # ── A vault article in a new post ──
    st(pg, """const sp=s.getState().spaces.find(x=>x.kind==='personal'&&x.memberIds[0]==='m-leo'); const vm=sp.modules.find(m=>m.type==='vault'); const d=structuredClone(vm.data);
      d.items.unshift({id:'art-1',kind:'note',article:true,name:'Why our block needs a tool library',parentId:null,html:'<h2>Why our block needs a tool library</h2><p><em>By Leo L</em></p><p>Every garage on Juniper Lane has a drill that gets used twice a year. A shared tool library would fix that.</p><h3>How it would work</h3><p>Members check out tools for a week.</p>',createdBy:'m-leo',createdAt:Date.now(),updatedAt:Date.now()});
      s.updateModuleData(vm.id,d); return 1""")
    v.get_by_role('button', name='New post').first.click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='From your vault').click(); pg.wait_for_timeout(300)
    print('find-a-file box height:', round(pg.locator('.sub-attach__box input[type=search]').bounding_box()['height']))
    if pg.locator('.sub-attach__box input[type=search]').bounding_box()['height']>50: errs.append('search box too tall')
    pg.locator('.sub-attach__vault-item', has_text='tool library').first.click(); pg.wait_for_timeout(300)
    card=pg.locator('.feed-composer__preview .file-preview')
    print('composer preview:', card.count(), '|', card.locator('.file-preview__kind').inner_text() if card.count() else '-', '| row says:', pg.locator('.feed-composer .sub-item__meta').first.inner_text())
    if not card.count() or 'Article' not in card.inner_text(): errs.append('no article preview in the composer')
    pg.screenshot(path='test-output/composer-vault-preview.png')
    pg.locator('.feed-composer__text').fill('Wrote this up for the next block meeting.')
    pg.locator('.feed-composer').get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(700)
    tile=v.locator('.feed-tile').first
    print('tile:', tile.locator('.feed-tile__docname').inner_text(), '| article page:', tile.locator('.feed-layout__visual--doc.is-article').count())

    # ── Dragging between feeds ──
    st(pg, "location.hash='#space-blog-m-leo'; return 1"); pg.wait_for_timeout(900)
    st(pg, "s.addModule('photofeed', undefined, {title:'Photos', span:6, rows:14}); s.addModule('textfeed', undefined, {title:'Notes', span:6, rows:14}); return 1"); pg.wait_for_timeout(900)
    pg.set_viewport_size({'width':1300,'height':3400}); pg.wait_for_timeout(500)
    grid=pg.locator('#homepage-view')
    frame=lambda title: grid.locator('.module-frame').filter(has=pg.locator('.module-frame__title', has_text=title)).first
    posts=frame('Posts'); photos=frame('Photos'); notes=frame('Notes')
    print('frames:', posts.count(), photos.count(), notes.count(), '| draggable tiles:', posts.locator('[draggable=true]').count())
    count=lambda mid: st(pg, f"return s.getModule('{mid}').data.posts.length")
    pid=st(pg, "return s.getState().spaces.find(x=>x.id==='blog-m-leo').modules.find(m=>m.title==='Photos').id")
    nid=st(pg, "return s.getState().spaces.find(x=>x.id==='blog-m-leo').modules.find(m=>m.title==='Notes').id")
    before=(count('leo-feed'), count(pid)); print('before (Posts, Photos):', before)
    # a photo post onto Photos: moves
    def drag(src, dst, drop=True):
        a=src.bounding_box(); z=dst.bounding_box()
        pg.mouse.move(a['x']+a['width']/2, a['y']+a['height']/2); pg.mouse.down()
        for i in range(1,9): pg.mouse.move(a['x']+a['width']/2+(z['x']+z['width']/2-a['x']-a['width']/2)*i/8, a['y']+a['height']/2+(z['y']+z['height']/2-a['y']-a['height']/2)*i/8); pg.wait_for_timeout(30)
        if drop: pg.mouse.up(); pg.wait_for_timeout(500)
    drag(posts.locator('.feed-tile', has_text='Practice run').first, photos)
    after=(count('leo-feed'), count(pid)); print('after dragging a photo post to Photos:', after, '| toast:', pg.locator('.toast').last.inner_text() if pg.locator('.toast').count() else '-')
    if after!=(before[0]-1, before[1]+1): errs.append('photo post did not move')
    pg.screenshot(path='test-output/feed-drag-moved.png')
    # the event post onto Photos: refused, says why
    ev=posts.locator('.feed-tile', has_text='Free bike repair').first
    drag(ev, photos, drop=False)
    label=photos.get_attribute('data-drop-label'); print('event post over Photos:', label, '| no-drop class:', 'is-post-drop-no' in (photos.get_attribute('class') or ''))
    pg.screenshot(path='test-output/feed-drag-refused.png')
    pg.mouse.up(); pg.wait_for_timeout(400)
    print('no viewer opened after a drag:', pg.locator('.photo-viewer').count()==0)
    if count(pid)!=after[1]: errs.append('event post should not go into a photo feed')
    if not label or 'picture' not in label: errs.append('no reason shown')
    # "Move to" in the menu: open the moved post in Photos and move it back
    photos.locator('.feed-tile, .feed-row, .feed-module__square').first.click(); pg.wait_for_timeout(400)
    pg.locator('.photo-viewer__side .post-menu__button').first.click(); pg.wait_for_timeout(200)
    items=[t.strip() for t in pg.locator('.post-menu__item').all_inner_texts()]; print('menu:', [t for t in items if t.startswith('Move')])
    if 'Move to Notes' in items: errs.append('a photo post should not offer Notes')
    pg.locator('.post-menu__item', has_text='Move to Posts').click(); pg.wait_for_timeout(500)
    print('after Move to Posts:', (count('leo-feed'), count(pid)))
    if (count('leo-feed'), count(pid))!=before: errs.append('Move to did not move it back')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    print('errors', errs)
