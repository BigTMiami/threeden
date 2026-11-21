# The vault's "+ New": Note, Spreadsheet, Presentation, Article, Upload files, Folder; "More" shows List, Tasks, Relationship map,
# Gantt chart, Survey, and Link (no Calendar, Forum, or Canvas). Article makes an article draft note; Survey
# and Presentation work as files. Survey: questions, answers, results. Presentation: slides, typing on the slide, presenting.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js} }})()")
def new(v, pg, label, name, more=False):
    v.get_by_role('button', name='New').first.click(); pg.wait_for_timeout(200)
    if more: v.locator('.vault__menu-more-toggle').click(); pg.wait_for_timeout(100)
    v.get_by_role('menuitem', name=label).first.click(); pg.wait_for_timeout(300)
    v.locator('.vault__create-form input[type=text]').first.fill(name); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1400,'height':950}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('.app-bar', timeout=20000)
    pg.evaluate("location.hash='#module-tenants-vault'"); pg.wait_for_timeout(900)
    v=pg.locator('#module-page-view')
    v.get_by_role('button', name='New').first.click(); pg.wait_for_timeout(200)
    menu=v.locator('.vault__menu')
    top=[t.split('\n')[0] for t in menu.locator(':scope > .vault__menu-item').all_inner_texts()]
    hidden=menu.locator('.vault__menu-more').is_hidden()
    menu.locator('.vault__menu-more-toggle').click(); pg.wait_for_timeout(100)
    more=[t.split('\n')[0] for t in menu.locator('.vault__menu-more .vault__menu-item').all_inner_texts()]
    print('top:', top); print('more hidden at first:', hidden, '| more:', more, '| toggle:', menu.locator('.vault__menu-more-toggle').inner_text())
    if top!=['Document','Spreadsheet','Presentation','Survey','Article','Upload files','Folder']: errs.append('top order')
    if more[:4]!=['Tasks','Relationship map','Gantt chart','Link']: errs.append('more order')  # List folded into Tasks; Survey moved up (Nov 20)
    if any(x in top+more for x in ['Calendar','Forum','Canvas']): errs.append('calendar/forum/canvas still listed')
    pg.screenshot(path='test-output/vault-new-menu.png'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    if v.locator('.vault__menu').count(): v.get_by_role('button', name='New').first.click(); pg.wait_for_timeout(200)

    # Article
    new(v, pg, 'Article', 'Why the boiler keeps failing')
    print('article view:', v.locator('.vault-note__kind').inner_text() if v.locator('.vault-note__kind').count() else None, '| publish:', v.get_by_role('button', name='Publish to Articles').count(), '| hint:', v.locator('.vault-note__article').inner_text()[:80])
    print('saved:', st(pg, "const it=s.getModule('tenants-vault').data.items.find(i=>i.name==='Why the boiler keeps failing'); return [it.kind, it.article]"))
    v.locator('.vault__back, .vault-editor__back').first.click(); pg.wait_for_timeout(400)
    print('tile label:', v.locator('.vault-tile', has_text='Why the boiler').locator('.vault-tile__meta').inner_text() if v.locator('.vault-tile', has_text='Why the boiler').count() else v.locator('text=Why the boiler').count())

    # Survey
    new(v, pg, 'Survey', 'Cleanup day', more=True)
    sv=v.locator('.survey')
    print('survey opens in Edit:', sv.locator('.survey__tab[aria-selected=true]').inner_text())
    sv.locator('.survey__edit-prompt').first.fill('Which Saturday works?')
    opts=sv.locator('.survey__edit-option input'); opts.nth(0).fill('Nov 21'); opts.nth(1).fill('Nov 28')
    sv.get_by_role('button', name='Add a question').click(); pg.wait_for_timeout(150)
    sv.locator('.survey__edit-prompt').nth(1).fill('How was the last one?')
    sv.locator('select').nth(1).select_option('scale'); pg.wait_for_timeout(150)
    sv.get_by_role('button', name='Add a question').click(); pg.wait_for_timeout(150)
    sv.locator('.survey__edit-prompt').nth(2).fill('Anything else?'); sv.locator('select').nth(2).select_option('text'); pg.wait_for_timeout(150)
    sv.get_by_role('tab', name='Answer').click(); pg.wait_for_timeout(150)
    print('answer form questions:', sv.locator('.survey__question').count())
    sv.locator('.survey__option', has_text='Nov 28').click(); sv.locator('.survey__options--scale .survey__option', has_text='4').click(); sv.locator('textarea').fill('Bring gloves')
    sv.get_by_role('button', name='Send answers').click(); pg.wait_for_timeout(300)
    print('results tab:', sv.locator('.survey__tab[aria-selected=true]').inner_text(), '|', sv.locator('.survey__count').inner_text(), '| bars:', sv.locator('.survey__bar-row').count(), '| text answer:', sv.locator('.survey__answers').inner_text())
    pg.screenshot(path='test-output/survey-results.png')
    print('saved:', st(pg, "const it=s.getModule('tenants-vault').data.items.find(i=>i.name==='Cleanup day'); return [it.moduleType, it.data.questions.length, it.data.responses.length, JSON.stringify(it.data.responses[0].answers).length>10]"))
    v.locator('.vault__back, .vault-editor__back').first.click(); pg.wait_for_timeout(400)

    # Presentation
    new(v, pg, 'Presentation', 'Rent strike basics')
    pp=v.locator('.pres-page')
    pp.locator('.pres-page__stage .pres-slide__title').fill('Rent strike basics'); pp.locator('.pres-page__stage .pres-slide__body').fill('Juniper Tenants Union')
    pp.get_by_role('button', name='Slide', exact=True).click(); pg.wait_for_timeout(200)
    pp.locator('.pres-page__stage .pres-slide__title').fill('What we want'); pp.locator('.pres-page__stage .pres-slide__body').fill('Heat that works\nFair rent\nRepairs on time')
    pg.wait_for_timeout(200)
    print('slides:', pp.locator('.pres-page__thumb').count(), '| thumb 1 title:', pp.locator('.pres-page__thumb').first.locator('.pres-slide__title').inner_text())
    pg.screenshot(path='test-output/presentation-edit.png')
    pp.locator('.pres-page__thumb').first.click(); pg.wait_for_timeout(150)
    pp.get_by_role('button', name='Present').click(); pg.wait_for_timeout(400)
    show=pg.locator('.pres-show')
    print('presenting:', show.count(), '|', show.locator('.pres-show__count').inner_text(), '|', show.locator('.pres-slide__title').inner_text())
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(150)
    print('  next:', show.locator('.pres-show__count').inner_text(), '| points:', show.locator('li').count())
    pg.screenshot(path='test-output/presentation-show.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    print('  Esc stops:', pg.locator('.pres-show').count()==0)

    # Library lists the two new modules
    pg.evaluate("location.hash='#space-tenants'"); pg.wait_for_timeout(800)
    print('registry:', st(pg, "const r=await import('./js/modules/registry.js'); return ['survey','presentation'].map(t=>r.getModuleType(t).available)"))

    # No "click to scroll": the wheel over a scrolling module scrolls it right away
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(1000)
    body=pg.evaluate("""(()=>{const b=[...document.querySelectorAll('.module-frame__body')].find(e=>e.scrollHeight>e.clientHeight+20 && getComputedStyle(e).overflowY!=='visible'); if(!b) return null; b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2, b.closest('.module-frame').dataset.moduleId]})()""")
    if body:
        pg.mouse.move(body[0], body[1]); before=pg.evaluate(f"document.querySelector('[data-module-id=\"{body[2]}\"] .module-frame__body').scrollTop")
        pg.mouse.wheel(0, 200); pg.wait_for_timeout(300)
        after=pg.evaluate(f"document.querySelector('[data-module-id=\"{body[2]}\"] .module-frame__body').scrollTop")
        print('module scrolls with the wheel without a click:', after>before, '| hint shown:', pg.locator('.scroll-hint').count())
        if not after>before: errs.append('module did not scroll')
    print('grid gap:', pg.evaluate("getComputedStyle(document.querySelector('.module-grid')).rowGap"))
    print('errors', errs)
    b.close()
