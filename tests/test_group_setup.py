# Start a group: one page, no steps. Who can see it and how people join come before the templates, and start where that kind of
# group usually wants them (a band: public, admins add people), until you pick them yourself; a private group can't be "Anyone can join"
# or "Ask to join". Then a short tour shows you around the new group, ending with Plan an event.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    st=lambda js: pg.evaluate("async()=>{const s=await import('./js/state/store.js'); "+js+"}")
    pg.evaluate("location.hash='#new-group'"); pg.wait_for_timeout(600)
    form=pg.locator('.new-group-form')
    print('one page:', form.count(), '| steps:', pg.locator('.new-event__count').count(), '| All options button:', pg.get_by_role('button', name='All options').count())
    if pg.locator('.new-event__count').count(): errs.append('steps still shown')
    order=pg.evaluate("""(()=>{const f=document.querySelector('.new-group-form'); const pos=(el)=>el?[...f.querySelectorAll('*')].indexOf(el):-1;
      return {visibility: pos(f.querySelector('input[name=new-visibility]')), joining: pos(f.querySelector('input[name=new-joining]')), templates: pos(f.querySelector('.template-choices'))}})()""")
    print('order:', order)
    # Nov 20: templates first, then the access choices.
    if not (0 <= order['templates'] < order['visibility'] < order['joining']): errs.append('templates should come before the access choices')
    shown=[t.split('\n')[0] for t in pg.locator('.template-choices:not(.template-choices--more) .template-choice strong').all_inner_texts()]
    print('first four:', shown, '| more hidden:', pg.locator('.template-choices--more').is_hidden())
    if shown!=['Friends and family','IRL community','Digital community','Business']: errs.append('the four broad templates')
    pg.get_by_role('button', name='See more templates').click(); pg.wait_for_timeout(100)
    more=pg.locator('.template-choices--more .template-choice strong').all_inner_texts(); print('more:', more)
    for need in ['Band, club, or team','Class','Community organizing','News outlet or newsletter']:
        if need not in more: errs.append(f'missing {need}')
    if 'Something else' in more or 'Family' in more: errs.append('old templates still offered')
    pg.screenshot(path='test-output/new-group-one-page.png', full_page=True)
    pg.get_by_role('button', name='Create group').click(); print('needs a name:', pg.locator('.new-group-form .form-error').inner_text())
    pg.locator('input[aria-label="Group name"]').fill('The Night Owls')
    pg.locator('.template-choice', has_text='Band').locator('input').check(); pg.wait_for_timeout(100)
    acc=pg.evaluate("[document.querySelector('input[name=new-visibility]:checked').value, document.querySelector('input[name=new-joining]:checked').value]"); print('band starts at:', acc)
    if acc!=['public','admins']: errs.append('a band should start public, admins add people')
    pg.locator('input[name=new-visibility][value=private]').check(); pg.wait_for_timeout(100)
    print('private: disabled =', pg.evaluate("[...document.querySelectorAll('input[name=new-joining]:disabled')].map(i=>i.value)"))
    pg.locator('input[name=new-visibility][value=public]').check()
    pg.locator('.template-choice', has_text='Friends and family').locator('input').check(); pg.wait_for_timeout(100)
    print('after touching, friends and family keeps:', pg.evaluate("document.querySelector('input[name=new-visibility]:checked').value"))
    pg.locator('.template-choice', has_text='Band').locator('input').check()
    pg.get_by_role('button', name='Create group').click(); pg.wait_for_timeout(900)
    g=st("const g=s.getSpaces().find(x=>x.name==='The Night Owls'); return [g.id, g.visibility, g.joining, g.template]"); print('made:', g)
    if g[1:]!=['public','admins','club']: errs.append('wrong group made')
    titles=[]
    for i in range(8):
        card=pg.locator('.group-tour')
        if not card.count(): break
        titles.append(card.locator('.tour-card__title').inner_text())
        spot=pg.locator('.tour-spot').count()
        if not spot: errs.append(f'nothing outlined on {titles[-1]}')
        nxt=card.get_by_role('button', name='Next')
        if not nxt.count(): break
        nxt.click(); pg.wait_for_timeout(700)
    print('tour:', titles)
    if not titles or titles[-1] != 'Plan the first event': errs.append('the tour should end with planning an event')
    pg.locator('.group-tour').get_by_role('button', name='Plan an event').click(); pg.wait_for_timeout(700)
    print('plan an event →', pg.evaluate('location.hash'))
    print('errors', errs)
    b.close()
