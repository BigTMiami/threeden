# Answering an RSVP never moves the view or closes anything: in a calendar card's list (scrolled), in an event pop-up,
# and on the calendar page's event panel, the buttons stay where they were, focus stays on them, and changing the
# answer works right there. Compact lists that only ask until you answer keep the buttons for the rest of the visit.
from playwright.sync_api import sync_playwright
import os; os.makedirs('test-output', exist_ok=True)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.app-bar', timeout=20000); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#space-league'"); pg.wait_for_timeout(1200)
    cal=pg.locator('#homepage-view .module-frame[data-module-type=calendar]').first
    cal.scroll_into_view_if_needed()
    body=cal.locator('.module-frame__body')
    scroll=lambda: pg.evaluate("el=>[Math.round(el.scrollTop), Math.round(scrollY)]", body.element_handle())
    body.evaluate("el=>el.scrollTop=el.scrollHeight"); pg.wait_for_timeout(200)
    def answer(name, which):
        row=cal.locator('.calendar-event-wrap', has_text=name).first
        btn=row.locator(f'.rsvp__button--{which}'); y0=btn.bounding_box()['y']; s0=scroll()
        btn.click(); pg.wait_for_timeout(500)
        btn=cal.locator('.calendar-event-wrap', has_text=name).first.locator(f'.rsvp__button--{which}')
        y1=btn.bounding_box()['y']; s1=scroll()
        focus=pg.evaluate("document.activeElement.dataset.rsvpKey ?? document.activeElement.tagName")
        print(f'card {which}: button y {round(y0)} -> {round(y1)} | scroll {s0} -> {s1} | focus {focus} | pressed', btn.get_attribute('aria-pressed'))
        if abs(y1-y0)>2: errs.append(f'card {which}: the button moved')
        if s1[1]!=s0[1]: errs.append(f'card {which}: the page scrolled')
    answer('Foxes vs. Pirates', 'going')
    answer('Foxes vs. Pirates', 'maybe')
    answer('Foxes vs. Pirates', 'no')
    pg.screenshot(path='test-output/rsvp-card.png')

    # the event pop-up stays open and still
    cal.locator('.calendar-event', has_text='Thunder practice').first.click(); pg.wait_for_timeout(400)
    o=pg.locator('.item-overlay--event')
    for which in ['going', 'maybe', 'going']:
        btn=o.locator(f'.rsvp__button--{which}'); y0=btn.bounding_box()['y']
        btn.click(); pg.wait_for_timeout(400)
        y1=o.locator(f'.rsvp__button--{which}').bounding_box()['y']
        print(f'pop-up {which}: open {o.count()} | button y {round(y0)} -> {round(y1)} | focus', pg.evaluate("document.activeElement.dataset.rsvpKey ?? document.activeElement.tagName"))
        if not o.count() or abs(y1-y0)>2: errs.append(f'pop-up {which}: closed or moved')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # the calendar page's event panel
    pg.evaluate("location.hash='#module-league-calendar'"); pg.wait_for_timeout(1000)
    v=pg.locator('#module-page-view')
    v.locator('.event-chip', has_text='Pirates').first.click(); pg.wait_for_timeout(400)
    for which in ['maybe', 'going']:
        # (by slot: when it's full, Going becomes "Join the waitlist" in the same place)
        btn=v.locator(f'.calendar-page__editor [data-rsvp-key$=":{which}"]'); y0=btn.bounding_box()['y']; w0=pg.evaluate('scrollY')
        btn.click(); pg.wait_for_timeout(400)
        btn=v.locator(f'.calendar-page__editor [data-rsvp-key$=":{which}"]')
        print(f'page panel {which}: panel open {v.locator(".calendar-page__editor .event-details").count()} | button y {round(y0)} -> {round(btn.bounding_box()["y"])} | page scroll {w0} -> {pg.evaluate("scrollY")}')
        if abs(btn.bounding_box()['y']-y0)>2: errs.append(f'page panel {which}: moved')
    print('errors', errs)
