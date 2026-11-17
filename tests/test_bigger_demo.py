# The sample: about 830 people, 40 groups with weeks of history, blogs, and Leo in four of the groups (halved on Nov 15 to fit storage).
import time
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear()")
    t=time.time(); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000); load=time.time()-t; print('first load s:', round(load,1))
    if load > 6: errs.append(f'slow first load {load:.1f}s')
    info=pg.evaluate("""async()=>{const s=await import('./js/state/store.js'); const st=s.getState();
      const y=st.spaces.filter(x=>x.id.startsWith('y-grp-'));
      const bike=y.find(x=>x.name==='Juniper Lane Bike Crew');
      const leoGroups=y.filter(x=>x.memberIds.includes('m-leo')).map(x=>x.name);
      const thin=y.filter(g=>{const posts=g.modules.flatMap(m=>[...(m.data?.posts??[]), ...(m.data?.articles??[])]); const past=g.modules.flatMap(m=>m.data?.events??[]).filter(e=>e.date<new Date().toISOString().slice(0,10)&&e.attendeeIds?.length); return posts.length<3||(!past.length && g.createdAt < Date.now()-30*864e5)}).map(g=>g.name);
      const size=(await import('./js/state/storage.js')).savedSize();
      return { people: st.members.filter(m=>m.growth?.year).length, groups: y.length, bikeOwner: bike?.roles['m-leo'], leoGroups,
        friends: st.friendships.filter(f=>f.status==='accepted'&&(f.from==='m-leo'||f.to==='m-leo')).length,
        asks: st.friendships.filter(f=>f.status==='pending'&&f.to==='m-leo').length,
        blogs: st.spaces.filter(x=>x.id.startsWith('blog-y-')).length,
        unread: st.notifications.filter(n=>n.recipientId==='m-leo'&&!n.read).length,
        chats: st.conversations.filter(c=>c.id.startsWith('y-conv-')).length, thin, size, joinRequests: bike?.joinRequests.length }}""")
    print(info)
    if not 700 <= info['people'] <= 950: errs.append('people')
    if info['groups'] != 40: errs.append('groups')
    if info['bikeOwner'] != 'owner': errs.append('Leo should own the Bike Crew')
    if len(info['leoGroups']) != 4: errs.append('Leo in 4 groups')
    if info['friends'] < 30 or info['asks'] < 3: errs.append('friends')
    if info['blogs'] < 150: errs.append('blogs')
    if info['unread'] < 15: errs.append('notifications')
    if info['thin']: errs.append(f"thin groups: {info['thin'][:3]}")
    if info['size'] > 2_600_000: errs.append(f"storage {info['size']}")
    pg.evaluate("location.hash='#groups-explore'"); pg.wait_for_timeout(1000)
    n=pg.locator('.explore-group, .groups-explore__group, [class*=explore] li').count(); print('explore rows:', n)
    pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(1000); pg.locator('.feed-page').get_by_role('button', name='Friends', exact=True).first.click(); pg.wait_for_timeout(800)
    print('friends feed items:', pg.locator('.feed-item').count())
    if pg.locator('.feed-item').count() < 10: errs.append('friends feed thin')
    pg.evaluate("location.hash='#messages'"); pg.wait_for_timeout(1200)
    print('conversations:', pg.locator('.messages__list li, .conversation-list li, [class*=conversation-row]').count())
    print('errors', errs)
    b.close()
