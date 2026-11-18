"""
Aliases in groups (Nov 18): admins turn on "Members can go by another name
in this group" in Group settings → General → Names; each member sets their
own. Inside the group (modules, chat, member list) they show by that name;
the member list shows their own name beside it; turning it off goes back.
Members who aren't admins can set their name when it's on, not the switch.
"""
from playwright.sync_api import sync_playwright
import os
os.makedirs('test-output/out', exist_ok=True)
fails = []


def check(ok, label):
    print(('ok   ' if ok else 'FAIL ') + label)
    if not ok:
        fails.append(label)


def st(pg, js):
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); {js}}})()")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)
    me = st(pg, "const u=s.getCurrentUser(); return [u.id, u.name]")

    pg.evaluate("location.hash='#settings-juniper'"); pg.wait_for_timeout(900)
    names = pg.locator('.settings-section', has_text='Members can go by another name')
    check(names.count() == 1, 'General has a Names section')
    names.get_by_label('Members can go by another name in this group (an alias)').check(); pg.wait_for_timeout(400)
    check(st(pg, "return s.getSpace('juniper').allowAliases") is True, 'an admin can turn aliases on')
    box = pg.get_by_label('Your name in 14 Juniper Lane')
    box.fill('Lee'); pg.locator('.names__mine').get_by_role('button', name='Save').click(); pg.wait_for_timeout(400)
    check(st(pg, f"return s.getSpace('juniper').aliases?.['{me[0]}']") == 'Lee', 'you can set the name you go by')
    pg.screenshot(path='test-output/out/group-aliases-settings.png', full_page=True)

    # Inside the group: an announcement you post, the chat, and the member list.
    pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(900)
    card = pg.locator('.module-frame', has=pg.locator('.announcements__compose')).first
    card.locator('.announcements__compose button').first.click(); pg.wait_for_timeout(250)
    card.locator('input[aria-label="Announcement title"]').fill('Alias check')
    card.get_by_role('button', name='Post', exact=True).click(); pg.wait_for_timeout(500)
    post = card.locator('.announcement', has_text='Alias check').first
    meta = post.locator('.announcement__meta').inner_text()
    check('Lee' in meta and me[1] not in meta, f'an announcement shows you as Lee ({meta.strip()[:40]!r})')
    chat = pg.locator('.module-frame[data-module-type="chat"]')
    chat.locator('textarea').first.fill('Hello as Lee'); chat.get_by_role('button', name='Send').click(); pg.wait_for_timeout(500)
    authors = chat.evaluate("c => [...c.querySelectorAll('.thread__author, .message__author, strong')].map(e => e.innerText)")
    check(any(a.strip().startswith('Lee') for a in authors), f'the chat shows you as Lee ({[a for a in authors if "Lee" in a][:2]})')
    pg.evaluate("location.hash='#settings-juniper--members'"); pg.wait_for_timeout(800)
    row = pg.locator('.members-list__row', has_text='@').filter(has_text='you').first
    text = row.inner_text()
    check('Lee' in text and me[1] in text, f'the member list shows Lee with your own name beside it ({" ".join(text.split())[:60]!r})')

    # Your profile and other places keep your own name.
    check(st(pg, f"return s.getMember('{me[0]}').name") == me[1], 'your own name is unchanged outside the group')

    # Off again
    pg.evaluate("location.hash='#settings-juniper'"); pg.wait_for_timeout(800)
    pg.get_by_label('Members can go by another name in this group (an alias)').uncheck(); pg.wait_for_timeout(400)
    check(st(pg, f"return s.memberIn(s.getSpace('juniper'), '{me[0]}').name") == me[1], 'turning it off goes back to your own name')

    # A group where you're not an admin: the switch explains itself; your name works when it's on.
    st(pg, "s.setAllowAliases('tenants', true); return 1")
    pg.evaluate("location.hash='#settings-tenants'"); pg.wait_for_timeout(900)
    sw = pg.get_by_label('Members can go by another name in this group (an alias)')
    check(sw.is_disabled() and pg.get_by_text('An admin turned this on.').count() == 1, 'not an admin: the switch says an admin turned it on')
    pg.get_by_label('Your name in Juniper Tenants Union').fill('Unit 4B'); pg.locator('.names__mine').get_by_role('button', name='Save').click(); pg.wait_for_timeout(400)
    check(st(pg, f"return s.aliasIn(s.getSpace('tenants'), '{me[0]}')") == 'Unit 4B', 'not an admin: you can still set your name')
    check(not errs, f'no page errors {errs}')
    b.close()
print('PASS' if not fails else f'FAILED: {fails}')
