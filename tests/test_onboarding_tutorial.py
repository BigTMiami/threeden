"""Nov 21: the onboarding tutorial, as Leo's onboarding board lays it out
(js/onboarding/tutorial.js). Each preview on the sign-in page makes a real
new account by hand, and the tour runs its lane, then home, then part 2.
Between the lanes every branch on the board is taken once:

  A  group invite: A1, A2 per module → 15 s → H0 → H1–H3 → P1 → contacts (P2a)
     → P3 (counts a friend added) → N1 → Start a group (G1) → set up its page
     → G2 Plan the first event → V1 → V2 → All set (P1 already seen)
  B  event: B1 You're going! → B2 (Add to calendar outlined) → home early
     (skips H0) → H1–H3 → P1 → Instagram (P2b) → P3 → N1 → I'm done → All set
  C  friend's link: CL wording → C1 → × → next visit R1 → Resume (back on
     the blog) → C2 → H1–H3 → P1 skip → N1 (offers Import contacts) → Edit my
     homepage (M1, M2) → All set
  E  no link: "Welcome to 3den" splash → H0 → H1–H3 → E2 → Start a group → G2
     → Later → P1 (not seen yet) → Skip → N1 → I'm done → All set
  phone: lane A's App Store card; G1's Create reachable under the card; M1
     outlines Add modules
  also: four previews (no "Wants to start a group"); Help → Replay the tour;
  the group checklist waits for the tour; templates only place allowed modules
"""
from playwright.sync_api import sync_playwright
import os, random
os.makedirs('test-output/out', exist_ok=True)
fails = []
RUN = random.randint(1000, 9999)
def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok: fails.append(label)
def step(pg):
    c = pg.locator('.onboarding-tour')
    return c.first.get_attribute('data-step') if c.count() else None
def title(pg): return pg.locator('.onboarding-tour .tour-card__title').first.inner_text()
def kicker(pg): return pg.locator('.onboarding-tour .tour-card__count').first.inner_text()
def spotted(pg): return pg.evaluate("[...document.querySelectorAll('.tour-spot')].map(e=>e.className+' '+(e.dataset.moduleId||e.dataset.widgetId||''))")
def press(pg, name, wait=900):
    pg.locator('.onboarding-tour').get_by_role('button', name=name, exact=True).click(); pg.wait_for_timeout(wait)
def st(pg, js): return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js}}})()")
def tour(pg): return st(pg, 'return s.getCurrentUser()?.onboarding?.tour ?? null')

def fresh(b, w=1300, h=900):
    ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 600, has_touch=w < 600)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    st(pg, "const a=await import('./js/state/accounts.js'); a.signOut()"); pg.evaluate("location.hash='#signin'"); pg.wait_for_timeout(700)
    return ctx, pg, errs

def sign_up(pg, box, name, submit):
    user = f"{name.split()[0].lower()}{RUN}{random.randint(10, 99)}"
    quick = box.get_by_label('Phone number or email')
    if quick.count():  # the quick sign-up (name, and a phone number or email), where a link still asks for it
        box.get_by_label('Your name').fill(name); quick.fill(f'{user}@example.com')
        box.locator('button.button--primary').first.click(); pg.wait_for_timeout(1300)
        return
    for label, value in [('Your name', name), ('Name', name), ('Username', user), ('Email', f'{user}@example.com'), ('Password', 'correct-horse-battery')]:
        if box.get_by_label(label, exact=True).count(): box.get_by_label(label, exact=True).first.fill(value)
    box.get_by_role('button', name=submit, exact=True).click(); pg.wait_for_timeout(1300)

def through_home(pg, label, lane_e=False):
    for at, ttl in [('H1', 'Welcome to your homepage!'), ('H2', 'Your dashboard'), ('H3', 'Your vault')]:
        ok = step(pg) == at and title(pg) == ttl
        if at != 'H1': ok = ok and any('tour-spot' in s for s in spotted(pg))
        check(ok, f'{label}: {at} {ttl} ({kicker(pg) if step(pg) else None})')
        press(pg, 'Next')
    want = 'E2' if lane_e else 'P1'
    check(step(pg) == want, f'{label}: after H3 → {want} ({step(pg)})')

def create_group(pg, name):
    form = pg.locator('.new-group-form')
    form.get_by_label('Group name').fill(name)
    # A quick account (where a link still makes one) finishes its account on this same form.
    for label, value in [('Username', f'grp{RUN}{random.randint(100, 999)}'), ('Password', 'correct-horse-battery')]:
        box = form.get_by_label(label, exact=True)
        if box.count() and box.first.is_visible(): box.first.fill(value)
    btn = form.get_by_role('button', name='Create group'); btn.evaluate("e=>e.scrollIntoView({block:'start'})"); pg.wait_for_timeout(300)
    btn.click(); pg.wait_for_timeout(1200)

def finish_setup(pg):
    pg.locator('.group-setup').get_by_role('button', name='Add to my page').click(); pg.wait_for_timeout(900)
    for _ in range(4):
        tip = pg.locator('.group-setup-tip')
        if not tip.count(): break
        tip.locator('button.button--primary').last.click(); pg.wait_for_timeout(500)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')

    # ── The previews ──
    ctx, pg, errs = fresh(b)
    ids = pg.locator('.auth__preview-path').evaluate_all('els=>els.map(e=>e.dataset.preview)')
    check(ids == ['group', 'event', 'friend', 'direct'], f'four previews, one per lane ({ids})')
    ctx.close()

    # ── Lane A: a group's invite link ──
    ctx, pg, errs = fresh(b)
    pg.locator('.auth__preview-path[data-preview="group"]').click(); pg.wait_for_timeout(800)
    pg.locator('main').get_by_role('button', name='Create an account and join').click(); pg.wait_for_timeout(600)
    sign_up(pg, pg.locator('.signup-sheet'), 'Ann Tour', 'Create account and join')
    check(step(pg) == 'A1' and title(pg) == 'Welcome to Juniper Supper Club' and kicker(pg).startswith('JUNIPER SUPPER CLUB · 1 OF'), f'A: A1 on the group ({step(pg)})')
    check(any('space-header' in s for s in spotted(pg)), 'A: A1 outlines the group’s header')
    check(pg.locator('.welcome-checklist, .next-step').count() == 0, 'A: the group’s checklist waits for the tour')
    pg.screenshot(path='test-output/out/tutorial-A1.png')
    press(pg, 'Next')
    seen = []
    while step(pg) == 'A2':
        seen.append(title(pg)); check(any('tour-spot' in s for s in spotted(pg)), f'A: A2 outlines {title(pg)}'); press(pg, 'Next')
    check(seen[:3] == ['Up next', 'Board', 'Calendar'], f'A: one card per module ({seen})')
    check(step(pg) is None and tour(pg)['at'] == 'WAIT', f'A: then the wait ({tour(pg)["at"]})')
    pg.wait_for_timeout(15500)
    check(step(pg) == 'H0' and any('app-bar__home' in s for s in spotted(pg)), 'A: 15 seconds later, H0 with Home outlined')
    press(pg, 'Go to my homepage')
    through_home(pg, 'A')
    press(pg, 'Import phone contacts', 1200)
    check(step(pg) == 'P2a' and pg.evaluate('location.hash') == '#bring', 'A: P2a on Bring your people')
    phone = st(pg, "return s.getState().members.find(m=>m.phone && !m.isGuest && m.id!==s.getCurrentUser().id)?.phone")
    with pg.expect_file_chooser() as fc:
        pg.locator('.onboarding-tour').get_by_role('button', name='Choose contacts').click()
    fc.value.set_files(files=[{'name': 'c.vcf', 'mimeType': 'text/vcard', 'buffer': f'BEGIN:VCARD\nFN:Someone\nTEL:{phone}\nEND:VCARD\n'.encode()}])
    pg.wait_for_timeout(800)
    add = pg.locator('.bring__people button', has_text='Add friend')
    if add.count(): add.first.click(); pg.wait_for_timeout(900)
    check(step(pg) == 'P3' and 'You added 1 friend' in pg.locator('.onboarding-tour').inner_text(), f'A: P3 counts the friend added ({pg.locator(".onboarding-tour .tour-card__text").inner_text()})')
    press(pg, 'Next')
    check(step(pg) == 'N1' and 'Import contacts' not in pg.locator('.onboarding-tour').inner_text(), 'A: N1, without Import contacts (they did P1)')
    press(pg, 'Start a group', 1200)
    check(step(pg) == 'G1' and pg.evaluate('location.hash') == '#new-group' and any('INPUT' in s or 'input' in s for s in spotted(pg)), 'A: G1 opens Create a group, name outlined')
    create_group(pg, 'Ann’s Crew')
    check(step(pg) is None and pg.locator('.group-setup').count() == 1, 'A: G2 waits for “Set up your group’s page”')
    finish_setup(pg)
    check(step(pg) == 'G2' and title(pg) == 'Plan the first event', f'A: then G2 Plan the first event ({step(pg)})')
    press(pg, 'Plan an event', 1200)
    check(step(pg) == 'V1' and pg.evaluate('location.hash').startswith('#new-event-'), 'A: V1 opens Plan an event')
    pg.get_by_label('Event name').fill('First potluck')
    for _ in range(8):
        create = pg.locator('main button', has_text='Create and get the link')
        if create.count(): create.first.click(); pg.wait_for_timeout(1300); break
        pg.locator('main button.button--primary', has_text='Next').last.click(); pg.wait_for_timeout(400)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    check(step(pg) == 'V2' and any('event-share-button' in s for s in spotted(pg)), f'A: V2 outlines Share ({step(pg)})')
    press(pg, 'Done')
    check(step(pg) == 'END' and title(pg) == 'All set', f'A: All set (P1 already seen) ({step(pg)})')
    press(pg, 'Done')
    check(step(pg) is None and tour(pg)['at'] == 'DONE', 'A: done')
    check(not errs, f'A: no page errors {errs[:2]}')
    ctx.close()

    # ── Lane B: an event's link ──
    ctx, pg, errs = fresh(b)
    pg.locator('.auth__preview-path[data-preview="event"]').click(); pg.wait_for_timeout(800)
    pg.locator('main .rsvp__button--going').first.click(); pg.wait_for_timeout(600)
    sign_up(pg, pg.locator('.signup-sheet'), 'Bea Tour', 'Create account and RSVP')
    check(step(pg) == 'B1' and title(pg) == 'You’re going!' and any('rsvp' in s for s in spotted(pg)), f'B: B1 You’re going!, the answer outlined ({step(pg)})')
    press(pg, 'Next')
    check(step(pg) == 'B2' and any('event-ics-button' in s for s in spotted(pg)), 'B: B2 outlines Add to calendar')
    href = pg.locator('.event-ics-button').get_attribute('href') or ''
    check(href.startswith('data:text/calendar') and 'BEGIN%3AVEVENT' in href, 'B: Add to calendar is a calendar file')
    press(pg, 'Next')
    check(tour(pg)['at'] == 'WAIT', 'B: then the wait')
    st(pg, "const r=await import('./js/router.js'); r.goTo(r.spaceHref(s.getPersonalSpace().id))"); pg.wait_for_timeout(900)
    check(step(pg) == 'H1', f'B: going home sooner skips H0 ({step(pg)})')
    through_home(pg, 'B')
    press(pg, 'Find Instagram friends', 1200)
    check(step(pg) == 'P2b', 'B: P2b Instagram friends')
    press(pg, 'Connect Instagram', 900)
    check(pg.locator('dialog[open], .ig-connect').count() >= 1 and step(pg) is None, 'B: Connect Instagram opens, the card waits')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(800)
    check(step(pg) == 'P3' and 'any time from Friends' in pg.locator('.onboarding-tour').inner_text(), 'B: P3 with none added')
    press(pg, 'Next'); press(pg, 'I’m done for now')
    check(step(pg) == 'END', 'B: I’m done for now → All set')
    press(pg, 'Done')
    check(not errs, f'B: no page errors {errs[:2]}')
    ctx.close()

    # ── Lane C: a friend's invite link ──
    ctx, pg, errs = fresh(b)
    pg.locator('.auth__preview-path[data-preview="friend"]').click(); pg.wait_for_timeout(800)
    check('Join 3den to be friends with Jamal Brooks.' in pg.locator('main').inner_text(), 'C: CL “Join 3den to be friends with [Name].”')
    pg.locator('main').get_by_role('button', name='Create an account').click(); pg.wait_for_timeout(600)
    sign_up(pg, pg.locator('.signup-sheet'), 'Cal Tour', 'Create account and join')
    check(step(pg) == 'C1' and title(pg) == 'You and Jamal are friends' and pg.evaluate('location.hash') == '#blog-jamal', f'C: C1 on Jamal’s blog ({step(pg)})')
    pg.locator('.onboarding-tour').get_by_role('button', name='Close').click(); pg.wait_for_timeout(500)
    check(step(pg) is None and tour(pg)['paused'], 'C: × pauses it')
    pg.evaluate("location.hash='#'"); pg.wait_for_timeout(600)
    check(step(pg) is None, 'C: not again this visit')
    pg2 = ctx.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e)))
    pg2.goto('http://localhost:8765/index.html'); pg2.wait_for_timeout(1500)
    pg.close(); pg = pg2
    check(step(pg) == 'R1' and 'Want to finish the tour where you left off?' in pg.locator('.onboarding-tour').inner_text(), 'C: next visit, R1')
    press(pg, 'Resume')
    check(step(pg) == 'C1' and pg.evaluate('location.hash') == '#blog-jamal', 'C: Resume goes back to C1 on the blog')
    press(pg, 'Next')
    check(step(pg) == 'C2' and any('#feed' in s or 'app-bar__link' in s for s in spotted(pg)), 'C: C2 outlines the Feed')
    press(pg, 'Next')
    st(pg, "const r=await import('./js/router.js'); r.goTo(r.spaceHref(s.getPersonalSpace().id))"); pg.wait_for_timeout(900)
    through_home(pg, 'C')
    press(pg, 'Skip for now')
    check(step(pg) == 'N1' and 'Import contacts' in pg.locator('.onboarding-tour').inner_text(), 'C: N1 offers Import contacts (they skipped P1)')
    press(pg, 'Edit my homepage', 1200)
    check(step(pg) == 'M1' and st(pg, 'return s.isEditMode()') and any('library' in s for s in spotted(pg)), 'C: M1 turns on Edit, the module list outlined')
    press(pg, 'Next')
    check(step(pg) == 'M2' and any('resize-handle' in s for s in spotted(pg)), 'C: M2 outlines a corner')
    press(pg, 'Done')
    check(step(pg) == 'END' and not st(pg, 'return s.isEditMode()'), 'C: Done saves, then All set (P1 seen)')
    press(pg, 'Done')
    check(not errs, f'C: no page errors {errs[:2]}')
    ctx.close()

    # ── Lane E: no link ──
    ctx, pg, errs = fresh(b)
    pg.locator('.auth__preview-path[data-preview="direct"]').click(); pg.wait_for_timeout(800)
    pg.get_by_role('link', name='Join 3den').first.click(); pg.wait_for_timeout(700)
    sign_up(pg, pg.locator('.auth__form:visible').last, 'Eve Tour', 'Create account')
    check(pg.locator('.welcome-splash').count() == 1 and 'Welcome to 3den' in pg.locator('.welcome-splash').inner_text(), 'E: E1 “Welcome to 3den” splash')
    pg.wait_for_timeout(3500)
    check(step(pg) == 'H0', f'E: then H0 ({step(pg)})')
    press(pg, 'Go to my homepage')
    through_home(pg, 'E', lane_e=True)
    check([x.strip() for x in pg.locator('.onboarding-tour__choices button').all_inner_texts()] == ['Start a group', 'Find my friends'], 'E: E2 Start a group / Find my friends')
    press(pg, 'Start a group', 1200)
    check(step(pg) == 'G1', 'E: Start a group → G1')
    create_group(pg, 'Eve’s Group')
    finish_setup(pg)
    check(step(pg) == 'G2', 'E: G2 after setting up the page')
    press(pg, 'Later')
    check(step(pg) == 'P1', f'E: Later → P1 (not seen yet) ({step(pg)})')
    press(pg, 'Skip for now'); press(pg, 'I’m done for now')
    check(step(pg) == 'END', 'E: → All set')
    press(pg, 'Done')
    check(not errs, f'E: no page errors {errs[:2]}')
    ctx.close()

    # ── On a phone ──
    ctx, pg, errs = fresh(b, 390, 844)
    pg.locator('.auth__preview-path[data-preview="group"]').click(); pg.wait_for_timeout(800)
    pg.locator('main').get_by_role('button', name='Create an account and join').click(); pg.wait_for_timeout(600)
    sign_up(pg, pg.locator('.signup-sheet'), 'Pia Tour', 'Create account and join')
    press(pg, 'Next')
    check(step(pg) == 'A2' and any('mwidget' in s for s in spotted(pg)), 'phone: A2 outlines the widget')
    while step(pg) == 'A2': press(pg, 'Next')
    check(step(pg) == 'APP' and 'App Store' in pg.locator('.onboarding-tour').inner_text(), 'phone: “Download 3den in the App Store…”')
    pg.screenshot(path='test-output/out/tutorial-phone-app.png')
    press(pg, 'Got it')
    st(pg, "const r=await import('./js/router.js'); r.goTo(r.spaceHref(s.getPersonalSpace().id))"); pg.wait_for_timeout(900)
    for _ in range(3): press(pg, 'Next')
    press(pg, 'Skip for now'); press(pg, 'Edit my homepage', 1200)
    check(step(pg) == 'M1' and any('button' in s for s in spotted(pg)), 'phone: M1 outlines Add modules')
    press(pg, 'Next')
    check(step(pg) == 'M2' and any('mwidget__grip' in s for s in spotted(pg)), 'phone: M2 outlines a grip')
    press(pg, 'Done'); press(pg, 'Done')
    check(not errs, f'phone: no page errors {errs[:2]}')
    ctx.close()

    # ── Help → Replay the tour; templates ──
    ctx = b.new_context(viewport={'width': 1300, 'height': 900}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#help-start'"); pg.wait_for_timeout(700)
    pg.locator('summary', has_text='Can I see the tour again?').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Replay the tour').click(); pg.wait_for_timeout(900)
    check(step(pg) == 'H0', f'Help → Replay the tour starts at H0, for anyone ({step(pg)})')
    pg.evaluate("location.hash='#settings-me--layout'"); pg.wait_for_timeout(900)
    names = pg.locator('.template-card__modules li').all_inner_texts()
    check(names and not any('Upcoming events' in n or 'Relationship map' in n for n in names), 'Templates on a homepage leave out modules it doesn’t offer')
    check(not errs, f'replay: no page errors {errs[:2]}')
    b.close()

print('PASS' if not fails else f'FAILED ({len(fails)}): {fails}')
