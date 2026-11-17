from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
STUB = r"""
window.__calls = [];
class FakeMap {
  constructor(o){ this.o=o; this.c={lat:o.center[1],lng:o.center[0]}; this.z=o.zoom; this.h={}; this.src={}; window.__map=this; setTimeout(()=>this.fire('load'),50); }
  once(e,f){ (this.h[e] ||= []).push(f); } on(e,f){ (this.h[e] ||= []).push(f); }
  fire(e){ (this.h[e]||[]).forEach(f=>f()); }
  getCenter(){ return {...this.c}; } getZoom(){ return this.z; }
  jumpTo({center}){ this.c={lat:center[1],lng:center[0]}; this.fire('move'); }
  fitBounds(b,o){ window.__calls.push(['fitBounds', b]); this.c={lat:(b[0][1]+b[1][1])/2,lng:(b[0][0]+b[1][0])/2}; this.fire('move'); }
  zoomTo(z){ window.__calls.push(['zoomTo', z]); this.z=z; }
  addSource(id,s){ this.src[id]={data:s.data, setData:(d)=>{ this.src[id].data=d; window.__calls.push(['setData']); }}; }
  getSource(id){ return this.src[id]; } addLayer(l){ window.__calls.push(['addLayer', l.id]); }
  getContainer(){ return this.o.container; } remove(){}
  touchZoomRotate = { disableRotation(){} };
  // test helper: the user drags the map
  userPan(dLat,dLng){ this.c={lat:this.c.lat+dLat,lng:this.c.lng+dLng}; this.fire('move'); }
}
window.maplibregl = { Map: FakeMap };
"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    # 1) no network: the built-in map stays
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#account-location'"); pg.wait_for_timeout(9500)
    print('fallback: street map?', pg.locator('.area-map__stage.has-street-map').count(), '| svg visible:', pg.locator('.area-map__svg').first.is_visible())
    pg.close()
    # 2) with a stand-in MapLibre: the wiring
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(STUB)
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#account-location'"); pg.wait_for_timeout(800)
    st=pg.locator('.area-map__stage').first
    print('street map:', st.evaluate("e=>e.classList.contains('has-street-map')"), '| layers:', pg.evaluate("__calls.filter(c=>c[0]==='addLayer').map(c=>c[1])"), '| label:', st.locator('.area-map__street-label').inner_text())
    print('style:', pg.evaluate("__map.o.style"))
    print('privacy:', pg.locator('.area-map__privacy').first.inner_text()[-80:])
    near=lambda: pg.evaluate("document.querySelector('.area-map__summary > span:not(.visually-hidden)').textContent")
    before=near()
    pg.evaluate("__map.userPan(0.6, 0.6)"); pg.wait_for_timeout(100)
    print('place before/after a drag:', before, '→', near())
    pg.evaluate("__calls.length=0"); pg.locator('.area-map__radius').first.select_option('10'); pg.wait_for_timeout(100)
    print('radius 10 →', [c[0] for c in pg.evaluate("__calls")][:4], '| label:', st.locator('.area-map__street-label').inner_text())
    pg.evaluate("__calls.length=0"); pg.get_by_role('button', name='Zoom in').first.click(); print('zoom in →', pg.evaluate("__calls"))
    pg.get_by_label('Where you are').first.fill('Lyon'); pg.locator('.area-map__suggestion').first.click(); pg.wait_for_timeout(100)
    print('after search, map center:', pg.evaluate("[__map.c.lat.toFixed(2), __map.c.lng.toFixed(2)]"), '|', near())
    pg.evaluate("__calls.length=0"); pg.evaluate("__map.getContainer().dispatchEvent(new KeyboardEvent('keydown',{key:']',bubbles:true}))"); pg.wait_for_timeout(100)
    print('] key →', pg.locator('.area-map__radius').first.input_value(), 'miles,', [c[0] for c in pg.evaluate("__calls")][:2])
    pg.screenshot(path='test-output/street.png')
    print('errors', errs)
