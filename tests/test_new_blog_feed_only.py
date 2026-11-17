# A new blog starts with just a General feed, full width; everything else is in the module list.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    info=pg.evaluate("""async()=>{ const st=await import('./js/data/starters.js'); const s=await import('./js/state/store.js');
      const blog=st.createStarterBlog('m-test', 'Test Person');
      const people=s.getState().spaces.filter(x=>x.kind==='blog' && x.modules.length===1).length;
      return { modules: blog.modules.map(m=>[m.type, m.title, m.span]), demoBlogsWithJustAFeed: people } }""")
    print(info)
    if info['modules'] != [['generalfeed', 'Posts', 12]]: errs.append('a new blog should have only a General feed')
    print('errors', errs)
    b.close()
