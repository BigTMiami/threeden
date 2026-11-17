from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw,touch in [(1300,False),(400,True)]:
        ctx=b.new_context(viewport={'width':vw,'height':900}, has_touch=touch, is_mobile=touch)
        pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        mv=pg.locator('#module-page-view'); ev=pg.locator('.event-page:visible')
        pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(500)
        # Event page: natural cover + customized sections
        pg.evaluate("location.hash='#event-band-ev-2'"); pg.wait_for_timeout(600)
        cov=ev.locator('.event-page__cover')
        print(vw, 'cover size:', cov.evaluate("e=>[Math.round(e.getBoundingClientRect().width),Math.round(e.getBoundingClientRect().height)]"), '| sections:', ev.locator('.event-page__section-title').all_inner_texts())
        pg.screenshot(path=f'test-output/t113_event_{vw}.png')
        ev.get_by_role('button', name='Customize page').click(); pg.wait_for_timeout(300)
        print(' slots:', ev.locator('.event-page__slot-label').all_inner_texts())
        ev.locator('.event-page__slot', has_text='Guests').get_by_role('button', name='Hide').click(); pg.wait_for_timeout(200)
        ev.locator('.event-page__block-kind', has_text='Text').click(); pg.wait_for_timeout(200)
        ta=ev.locator('.event-page__slot').last.locator('textarea'); ta.fill('Bring a lawn chair!'); ta.press('Tab'); pg.wait_for_timeout(200)
        pg.screenshot(path=f'test-output/t113_custom_{vw}.png', full_page=True)
        ev.get_by_role('button', name='Done').click(); pg.wait_for_timeout(300)
        print(' after:', ev.locator('.event-page__section-title').all_inner_texts(), '| lawn chair:', ev.get_by_text('Bring a lawn chair!').count())
        # Calendar page: swipe on phone, tap event → page
        pg.evaluate("location.hash='#module-band-calendar'"); pg.wait_for_timeout(600)
        title=lambda: pg.locator('.calendar-page__title, .calendar-page__period, h2').first.inner_text()
        before=pg.evaluate("document.querySelector('.calendar-page__toolbar')?.innerText.split('\\n').find(t=>/20\\d\\d/.test(t))")
        if touch:
            box=mv.locator('.calendar-page__view').bounding_box()
            y=box['y']+120
            pg.evaluate(f"""(()=>{{const el=document.querySelector('#module-page-view .calendar-page__view');
              const t=(type,x)=>{{const touch=new Touch({{identifier:1,target:el,clientX:x,clientY:{y}}}); el.dispatchEvent(new TouchEvent(type,{{touches:type==='touchend'?[]:[touch],changedTouches:[touch],bubbles:true}}));}};
              t('touchstart',300); t('touchend',100);}})()""")
            pg.wait_for_timeout(300)
            after=pg.evaluate("document.querySelector('.calendar-page__toolbar')?.innerText.split('\\n').find(t=>/20\\d\\d/.test(t))")
            print(' swipe:', before, '->', after)
            pg.evaluate("location.hash='#module-band-calendar'"); pg.wait_for_timeout(500)
        chip=mv.locator('.event-chip, .agenda-view__event').filter(has_text='Street Fair').first
        if not chip.count():
            mv.get_by_role('button', name='Agenda').click(); pg.wait_for_timeout(300)
            chip=mv.locator('.agenda-view__event', has_text='Street Fair').first
        chip.click(); pg.wait_for_timeout(500)
        print(' tap event ->', pg.evaluate('location.hash'), '| panel:', mv.locator('.event-details').count())
        # Editor: cover drop zone first, limit text field
        pg.evaluate("location.hash='#module-band-calendar'"); pg.wait_for_timeout(500)
        mv.get_by_role('button', name='Event', exact=False).filter(has_text='Event').last.click(); pg.wait_for_timeout(300)
        ed=mv.locator('.event-editor')
        if ed.count():
            # Cover photo and the limit are behind "+ Add" now
            for label in ['A limit on how many can come', 'Cover photo']:
                ed.locator('.event-editor__add-button').click(); pg.wait_for_timeout(100)
                ed.locator('.event-editor__add-choice', has_text=label).click(); pg.wait_for_timeout(150)
            print(' editor first field is cover:', ed.locator('.cover-picker').count(), '| drop zone:', ed.locator('.cover-picker__drop').count(), '| limit type:', ed.locator('.event-editor__capacity').get_attribute('type'))
            ed.locator('.event-editor__capacity').fill('12abc'); print(' limit value:', ed.locator('.event-editor__capacity').input_value())
            if not os.path.exists('test-output/t99_400.png'): pg.screenshot(path='test-output/t99_400.png')  # a picture to upload as the cover
            with pg.expect_file_chooser() as fc: ed.locator('.cover-picker__drop').click()
            fc.value.set_files('test-output/t99_400.png'); pg.wait_for_timeout(700)
            fr=ed.locator('.cover-picker__frame')
            print(' framer:', fr.count())
            if fr.count():
                bb=fr.bounding_box()
                ed.locator('.cover-picker__zoom-button').last.click(); ed.locator('.cover-picker__zoom-button').last.click()
                pg.mouse.move(bb['x']+bb['width']/2, bb['y']+bb['height']/2); pg.mouse.down(); pg.mouse.move(bb['x']+bb['width']/2-80, bb['y']+bb['height']/2-30, steps=5); pg.mouse.up()
                print(' bg:', fr.evaluate("e=>[e.style.backgroundPosition, e.style.getPropertyValue('--zoom')]"))
                ed.screenshot(path=f'test-output/t113_editor_{vw}.png')
        print(' overflow:', pg.evaluate('document.documentElement.scrollWidth - innerWidth'))
        ctx.close()
    b.close()
print('ERRORS', errs)
