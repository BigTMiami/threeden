# Following a public group you can't join (a venue): Explore offers Follow. In the Feed's All view a followed group shows at most
# one post a day ("+N more today" opens Following), and followed groups never fill more than a quarter of the Feed;
# the Following chip shows every post. The setting can be turned off.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const g=await import('./js/state/groups.js'); const f=await import('./js/state/follows.js'); const fd=await import('./js/modules/blog-feeds/feed-data.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    # The Lantern: a public venue run by Jamal, admins add people, posting promos all day
    gid=st(pg, """const grp=g.createGroup({name:'The Lantern', template:'business', visibility:'public', joining:'admins'});
      const placeId=s.getMember('m-leo').location?.placeId ?? null;
      s.changeState(st=>{ const sp=st.spaces.find(x=>x.id===grp.id); sp.memberIds=['m-jamal']; sp.roles={'m-jamal':'owner'}; sp.area=placeId;
        const feed=sp.modules.find(m=>m.type==='photofeed'); feed.data.posts=[0,1,2,3,4,5].map(i=>({...fd.createPost({authorId:'m-jamal', text:'Happy hour special #'+i}), createdAt: Date.now()-i*60e3}));
        const ann=sp.modules.find(m=>m.type==='announcements'); }, 'space');
      return grp.id""")
    pg.evaluate("location.hash='#groups-explore'"); pg.wait_for_timeout(800)
    row=pg.locator('.explore-list__row', has_text='The Lantern')
    if not row.count():
        sel=pg.locator('.explore-where select')
        if sel.count(): sel.select_option(value='anywhere'); pg.wait_for_timeout(300)
        box=pg.get_by_label('Search public groups and events')
        box.fill('Lantern'); pg.wait_for_timeout(500); row=pg.locator('.explore-list__row', has_text='The Lantern')
    print('explore row:', row.count(), '|', row.locator('.explore-list__actions').inner_text().replace('\n',' | ') if row.count() else '')
    row.get_by_role('button', name='Follow').click(); pg.wait_for_timeout(400)
    print('following:', st(pg, f"return f.isFollowing('m-leo', {{kind:'space', id:'{gid}'}})"), '| toast:', pg.locator('.toast').last.inner_text())
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(1200)
    lantern=pg.locator('.feed li', has_text='Happy hour special')
    print('All view: Lantern posts:', lantern.count(), '| same-day link:', pg.locator('.feed-item__same-day').first.inner_text() if pg.locator('.feed-item__same-day').count() else None)
    if lantern.count()>1: errs.append('more than one post a day from a followed group')
    pg.screenshot(path='test-output/calm-follows.png')
    pg.locator('.feed-item__same-day').first.click(); pg.wait_for_timeout(500)
    print('Following view:', pg.locator('.feed-filters__chip.is-on').inner_text(), '| Lantern posts:', pg.locator('.feed li', has_text='Happy hour special').count())
    # quarter cap
    share=pg.evaluate("""(async()=>{const fs=await import('./js/feed/feed-settings.js'); const items=[]; for(let i=0;i<20;i++) items.push({followed: i%2===0, space:{id:'g'+i}, timestamp: Date.now()-i}); return fs.calmFollowed(items).filter(x=>x.followed).length})()""")
    print('20 items, 10 from followed groups → kept followed:', share)
    if share>5: errs.append('more than a quarter from followed groups')
    # turn it off
    pg.evaluate("(async()=>{const fs=await import('./js/feed/feed-settings.js'); fs.updateFeedSettings('m-leo', s=>{s.calmFollows=false})})()"); pg.evaluate("location.hash='#'"); pg.wait_for_timeout(300); pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(1000)
    pg.locator('.feed-filters__chip', has_text='All').click(); pg.wait_for_timeout(400)
    print('setting off: Lantern posts in All:', pg.locator('.feed li', has_text='Happy hour special').count())
    print('errors', errs)
    b.close()
