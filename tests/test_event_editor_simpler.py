# Making an event: no cover patterns, no Area field, no Color field. Cover photo, Repeat, Tags, a limit, and "which time works" are
# behind "+ Add" (and show straight away when an event already has them). The step-by-step page asks "Add a photo?" instead of colors.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#module-band-calendar'"); pg.wait_for_timeout(700)
    mv=pg.locator('#module-page-view')
    mv.get_by_role('button', name='Event', exact=False).filter(has_text='Event').last.click(); pg.wait_for_timeout(300)
    ed=mv.locator('.event-editor')
    ed.locator('.segmented__option', has_text='Event').click(); pg.wait_for_timeout(150)
    labels=[x.strip() for x in ed.locator('.event-editor__field:visible .event-editor__label').all_inner_texts()]; print('fields shown:', labels)
    for gone in ['Area','Color','Repeat','Tags','Limit']:
        if gone in labels: errs.append(f'{gone} should not show at first')
    print('patterns anywhere:', ed.locator('.cover-picker__patterns').count(), '| cover shown:', ed.locator('.cover-picker:visible').count())
    ed.locator('.event-editor__add-button').click(); pg.wait_for_timeout(100)
    print('+ Add offers:', [x.strip() for x in ed.locator('.event-editor__add-choice').all_inner_texts()])
    ed.locator('.event-editor__add-choice', has_text='Tags').click(); pg.wait_for_timeout(150)
    print('after adding Tags:', 'Tags' in [x.strip() for x in ed.locator('.event-editor__field:visible .event-editor__label').all_inner_texts()])
    ed.locator('.event-editor__add-button').click(); ed.locator('.event-editor__add-choice', has_text='Cover photo').click(); pg.wait_for_timeout(150)
    print('cover photo field:', ed.locator('.cover-picker__drop:visible').count(), '| patterns:', ed.locator('.cover-picker__patterns').count())
    pg.screenshot(path='test-output/event-editor-add.png')
    # an entry offers only Repeat
    ed.locator('.segmented__option', has_text='Calendar entry').click(); pg.wait_for_timeout(150)
    ed.locator('.event-editor__add-button').click(); pg.wait_for_timeout(100)
    print('entry + Add offers:', [x.strip() for x in ed.locator('.event-editor__add-choice').all_inner_texts()])
    # editing an event that repeats shows Repeat straight away
    rep=pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); const e=s.getState().spaces.flatMap(x=>x.modules).filter(m=>m.type==='calendar').flatMap(m=>(m.data.events||[]).map(ev=>[m.id,ev])).find(([,ev])=>ev.repeat && ev.repeat!=='none' && ev.kind!=='entry'); return e ? [e[0], e[1].id, e[1].title] : null})()")
    print('a repeating event:', rep)
    # pattern covers no longer show
    print('old pattern cover shows:', pg.evaluate("(async()=>{const c=await import('./js/events/event-cover.js'); return c.hasCover({cover:{kind:'preset', preset:'sunrise'}})})()"))
    # step by step
    pg.evaluate("location.hash='#new-event'"); pg.wait_for_timeout(600)
    pg.locator('.new-event__choice', has_text='Dinner').click(); pg.wait_for_timeout(100)
    for i in range(3):
        pg.get_by_role('button', name='Next').click(); pg.wait_for_timeout(200)
        if i == 1:
            print('where step: area field?', pg.locator('select[aria-label=Area]').count())
            pg.get_by_label('Address or place').fill('Juniper Lane community room')
    print('step 4:', pg.locator('.new-event__question').inner_text(), '| colors:', pg.locator('.new-event__swatch').count(), '| patterns:', pg.locator('.cover-picker__patterns').count(), '| photo drop:', pg.locator('.cover-picker__drop').count())
    if pg.locator('.new-event__swatch').count(): errs.append('colors should be gone')
    print('errors', errs)
    b.close()
