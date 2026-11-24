"""
Group setup access choices and Copy this page's layout (Nov 18).

1. Group settings (Nov 20: Create a group no longer has these; a new group
   starts private and invite only): every "Who can see it" and "How people
   join" choice can be picked, on a computer and with taps on a phone; none is disabled.
   "Ask to join" on a private group makes it Public and says so; Private on
   an open group makes it Invite only and says so. The picked choice is
   highlighted. The group is created with what was picked.
2. Group settings → General follows the same rule.
3. Edit → Layouts → Copy this page's layout shows the page's tabs and
   modules as text, without what people wrote.
"""
from playwright.sync_api import sync_playwright
import json
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def state(pg, prefix=''):
    return pg.evaluate(f"""(() => {{
      const v = document.querySelector('input[name={prefix}visibility]:checked')?.value;
      const j = document.querySelector('input[name={prefix}joining]:checked')?.value;
      const off = [...document.querySelectorAll('input[name={prefix}visibility],input[name={prefix}joining]')].filter(i => i.disabled).length;
      return [v, j, off];
    }})()""")


def note(pg):
    return pg.locator('.access-note').first.inner_text().strip()


def choose(pg, text, tap=False):
    choice = pg.locator('.settings-choice', has_text=text).first
    choice.scroll_into_view_if_needed()
    choice.tap() if tap else choice.click()
    pg.wait_for_timeout(150)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    errs = []

    # 1. Computer
    pg = b.new_page(viewport={'width': 1300, 'height': 1300})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("location.hash='#new-group'"); pg.wait_for_timeout(700)
    pg.fill('input[aria-label="Group name"]', 'Open Porch')
    pg.get_by_role('button', name='Create group').click(); pg.wait_for_timeout(900)
    gid = pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); return s.getState().spaces.find(x=>x.name==='Open Porch').id})()")
    pg.evaluate("document.querySelector('.tour-card')?.remove()")
    pg.evaluate(f"location.hash='#settings-{gid}'"); pg.wait_for_timeout(800)
    v, j, off = state(pg)
    check((v, j, off) == ('private', 'invite', 0), f'a new group starts Private, Invite only, nothing disabled ({v}, {j}, {off})')
    choose(pg, 'Ask to join')
    v, j, _ = state(pg)
    check((v, j) == ('public', 'request'), f'Ask to join on a private group makes it Public ({v}, {j})')
    check('Public now' in note(pg), f'says so: {note(pg)!r}')
    hl = pg.evaluate("getComputedStyle(document.querySelector('.settings-choice:has(input[value=request]:checked)')).borderColor")
    plain = pg.evaluate("getComputedStyle(document.querySelector('.settings-choice:has(input[value=invite])')).borderColor")
    check(hl != plain, f'picked choice is highlighted ({hl} vs {plain})')
    choose(pg, 'Private')
    v, j, _ = state(pg)
    check((v, j) == ('private', 'invite'), f'Private on an ask-to-join group makes it Invite only ({v}, {j})')
    check('invite' in note(pg), f'says so: {note(pg)!r}')
    choose(pg, 'Admins add people')
    v, j, _ = state(pg)
    check((v, j) == ('private', 'admins') and note(pg) == '', f'Private + Admins add people needs no change, note clears ({v}, {j}, {note(pg)!r})')
    choose(pg, 'Public'); choose(pg, 'Anyone can join')
    v, j, _ = state(pg)
    check((v, j) == ('public', 'open'), f'Public, then Anyone can join ({v}, {j})')
    pg.screenshot(path='test-output/out/group-setup-access.png', full_page=True)
    pg.get_by_role('button', name='Save changes').first.click(); pg.wait_for_timeout(600)
    made = pg.evaluate("(async()=>{const s=await import('./js/state/store.js'); const g=s.getState().spaces.find(x=>x.name==='Open Porch'); return g && [g.visibility, g.joining, g.id]})()")
    check(made and made[:2] == ['public', 'open'], f'saved with what was picked ({made})')

    # 2. Group settings → General
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate(f"location.hash='#settings-{made[2]}'"); pg.wait_for_timeout(800)
    v, j, off = state(pg, '')
    check((v, j, off) == ('public', 'open', 0), f'settings shows Public, Anyone can join, nothing disabled ({v}, {j}, {off})')
    choose(pg, 'Private')
    v, j, _ = state(pg, '')
    check((v, j) == ('private', 'invite'), f'settings: Private moves joining to Invite only ({v}, {j})')
    choose(pg, 'Ask to join')
    v, j, _ = state(pg, '')
    check((v, j) == ('public', 'request'), f'settings: Ask to join moves it to Public ({v}, {j})')

    # 3. Copy this page's layout
    pg.evaluate("location.hash='#space-porchlights'"); pg.wait_for_timeout(900)
    header = pg.locator('#space-header')
    header.get_by_role('button', name='Edit', exact=True).first.click(); pg.wait_for_timeout(200)
    pg.get_by_role('menuitem', name='Edit this page').click(); pg.wait_for_timeout(500)
    header.locator('.layout-menu__button').click(); pg.wait_for_timeout(200)
    pg.locator('.layout-menu__copy').click(); pg.wait_for_timeout(300)
    text = pg.locator('.copy-layout__text').input_value()
    data = json.loads(text)
    types = [m['type'] for t in data['tabs'] for m in t['modules']]
    check(data['name'] == 'Porch Lights' and len(types) >= 3, f'copies the page: {data["name"]}, {len(data["tabs"])} tab(s), {types}')
    check('"posts": []' in text or '"posts"' not in text, 'what people wrote is left out (posts emptied)')
    pg.screenshot(path='test-output/out/copy-layout.png')
    pg.locator('.copy-layout .button--quiet').click(); pg.wait_for_timeout(200)
    check(pg.locator('.copy-layout').count() == 0, 'Close closes it')
    pg.close()

    # 1b. Phone, with taps
    pg = b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    pid = pg.evaluate("(async()=>{const g=await import('./js/state/groups.js'); return g.createGroup({name:'Phone Porch'}).id})()")
    pg.evaluate(f"location.hash='#settings-{pid}'"); pg.wait_for_timeout(800)
    seen = []
    for text, want in [('Public', ('public', 'invite')), ('Request', None), ('Ask to join', ('public', 'request')), ('Anyone can join', ('public', 'open')),
                       ('Invite only', ('public', 'invite')), ('Admins add people', ('public', 'admins')), ('Private', ('private', 'admins'))]:
        if want is None:
            continue
        choose(pg, text, tap=True)
        got = tuple(state(pg)[:2])
        seen.append(got == want)
        if got != want:
            print('   tap', text, '→', got, 'wanted', want)
    check(all(seen), 'phone: every choice can be tapped')
    over = pg.evaluate('document.documentElement.scrollWidth > innerWidth')
    check(not over, 'phone: no sideways scroll')
    pg.screenshot(path='test-output/out/group-setup-access-phone.png', full_page=True)

    check(not errs, f'no page errors {errs}')
    b.close()

print('PASS' if not fails else f'FAILED: {fails}')
