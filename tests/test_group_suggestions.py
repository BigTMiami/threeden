from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
import os; os.makedirs('test-output/out', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const g=await import('./js/state/groups.js'); {js} }})()")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()')
    pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    for t in ['house','club','organizing','family','class','news','forum','other']:
        n=st(pg, f"const x=await import('./js/data/starters.js'); return x.createStarterGroupModules('{t}').length")
        print(t, n, end=' | ')
    print()
    gid=st(pg, "const grp=g.createGroup({name:'Fir Street Band', template:'club', joining:'invite'}); return grp.id")
    pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(800)
    print('modules:', st(pg, f"return s.getSpace('{gid}').modules.map(m=>m.type)"))
    print('suggestion now:', pg.locator('.group-suggestion').count())
    # add 3 events to its Upcoming events
    st(pg, f"""const sp=s.getSpace('{gid}'); const ev=sp.modules.find(m=>m.type==='events'); s.changeState(()=>{{ ev.data.events=[1,2,3].map(i=>({{id:'fe'+i, title:'Show '+i, date:'2026-12-0'+i, time:'20:00', rsvps:{{}}}})) }}, 'layout'); return 1""")
    pg.evaluate("location.hash='#groups'"); pg.wait_for_timeout(300); pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(800)
    print('suggestion:', pg.locator('.group-suggestion').inner_text().replace('\n',' | '))
    pg.screenshot(path='test-output/group-suggestion.png')
    pg.locator('.group-suggestion .next-step__go').click(); pg.wait_for_timeout(500)
    print('toast:', pg.locator('.toast').last.inner_text())
    print('after:', st(pg, f"const sp=s.getSpace('{gid}'); return sp.modules.map(m=>m.type+':'+(m.data?.events?.length??'-')+(m.data?.ownEvents===false?':shared':''))"))
    print('next suggestion:', pg.locator('.group-suggestion').count())
    # dismiss path: add 5 members
    st(pg, f"const sp=s.getSpace('{gid}'); s.changeState(()=>{{ sp.memberIds=[...sp.memberIds,'m-maya','m-theo','m-iris','m-priya'] }}, 'space'); return 1")
    pg.evaluate("location.hash='#groups'"); pg.wait_for_timeout(300); pg.evaluate(f"location.hash='#space-{gid}'"); pg.wait_for_timeout(800)
    print('chat suggestion:', pg.locator('.group-suggestion').inner_text().replace('\n',' | ') if pg.locator('.group-suggestion').count() else 'none')
    pg.locator('.group-suggestion .next-step__hide').click(); pg.wait_for_timeout(300)
    print('after no thanks:', pg.locator('.group-suggestion').count(), st(pg, f"return s.getSpace('{gid}').dismissedSuggestions"))
    # as a member (not editor): none
    print('demo group suggestion:', end=' '); pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(700); print(pg.locator('.group-suggestion').count())
    print('errors', errs[:3])
    b.close()
