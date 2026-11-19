"""
Security tabs (Nov 18).

Account settings → Security:
  - a tab between Privacy and Notifications; Password moved here from Profile
  - add a passkey (pick where: this device / password manager / security key /
    phone), it's listed, the nudge asks for a second one; remove works
  - two-step: picking "A passkey" with none opens the add form; app codes show
    a key; no text-message option
  - encryption facts, recovery key (twelve words, shown once, date saved),
    disappearing default applies to a new direct conversation, previews off by
    default, leave no trace
Group settings → Security (admins):
  - at a glance: encryption, n of m admins use a passkey, who's missing
  - requiring passkeys for admins shows a notice in the group for an admin
    without one, gone once they add one
  - "New members: nothing from before they joined" hides earlier group chat
    messages for a member who joined later, with a note
  - disappearing messages for the group chat sets the chat's timer
  - reset invite links changes the link
  - members (not admins) don't get the tab
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
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const sec=await import('./js/state/security.js'); const msg=await import('./js/state/messages.js'); const a=await import('./js/state/accounts.js'); const perm=await import('./js/state/permissions.js'); {js}}})()")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1200, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    # ─── Account → Security ───
    pg.evaluate("location.hash='#account'"); pg.wait_for_timeout(600)
    tabs = pg.locator('.account-tabs a').all_inner_texts()
    check('Security' in tabs and tabs.index('Security') == tabs.index('Privacy') + 1, f'a Security tab after Privacy ({tabs})')
    check(pg.get_by_role('heading', name='Password').count() == 0, 'Password is no longer on Profile')
    pg.evaluate("location.hash='#account-security'"); pg.wait_for_timeout(600)
    heads = pg.locator('.settings-section__title').all_inner_texts()
    print('   sections:', heads)
    for name in ['Passkeys', 'Signing in on a new device', 'Encryption', 'Recovery key', 'Messages', 'This device', 'Password']:
        check(name in heads, f'section: {name}')
    check(pg.get_by_text('by text', exact=False).count() >= 1 and pg.get_by_role('radio', name='text', exact=False).count() == 0, 'no text-message codes, and it says why')

    # two-step: passkey with none opens the add form
    pg.get_by_role('radio', name='A passkey (recommended)').check(); pg.wait_for_timeout(300)
    check(pg.locator('.security-add__form').count() == 1, 'picking “A passkey” with none opens Add a passkey')
    form = pg.locator('.security-add__form')
    check(form.get_by_role('radio').count() == 4, 'four places to keep a passkey')
    form.get_by_role('radio', name='A security key').check()
    form.get_by_label('Passkey name').fill('YubiKey on my keys')
    form.get_by_role('button', name='Add passkey').click(); pg.wait_for_timeout(400)
    check(pg.locator('.security-list__item', has_text='YubiKey on my keys').count() == 1, 'the passkey is listed')
    check(pg.locator('.security-nudge').count() == 1, 'it asks for a second one')
    mine = st(pg, "return sec.mySecurity()")
    check(mine['twoStep'] == 'passkey' and mine['passkeys'][0]['kind'] == 'key', 'saved, and sign-ins now ask for a passkey')
    pg.get_by_role('button', name='Add another passkey').click(); pg.wait_for_timeout(200)
    pg.locator('.security-add__form').get_by_role('button', name='Add passkey').click(); pg.wait_for_timeout(400)
    check(pg.locator('.security-list__item').count() == 2 and pg.locator('.security-nudge').count() == 0, 'a second passkey, and the nudge goes')
    pg.get_by_role('button', name='Remove This phone or computer').click(); pg.wait_for_timeout(300)
    check(pg.locator('.security-list__item').count() == 1, 'Remove works')
    pg.get_by_role('radio', name='A code from an authenticator app').check(); pg.wait_for_timeout(300)
    check(pg.locator('.security-secret__key').count() == 1, 'app codes show a key to add')
    pg.get_by_role('radio', name='A passkey (recommended)').check(); pg.wait_for_timeout(300)

    # recovery key
    pg.get_by_role('button', name='Make a recovery key').click(); pg.wait_for_timeout(300)
    words = pg.locator('.security-words__list li').all_inner_texts()
    check(len(words) == 12, f'twelve words ({" ".join(words[:3])}…)')
    check(st(pg, "return Boolean(sec.mySecurity().recoveryKeyAt)") and 'recoveryKey' not in str(st(pg, "return s.getMember('m-leo').security")).replace('recoveryKeyAt', ''), 'only the date is saved, not the words')
    pg.get_by_role('button', name='I’ve written them down').click(); pg.wait_for_timeout(300)
    check(pg.locator('.security-words__list').count() == 0 and pg.get_by_text('Made ', exact=False).count() >= 1, 'the words go away; it says when it was made')

    # previews off by default; disappearing default applies to new chats
    check(not pg.get_by_label('Show what messages say in notifications').is_checked(), 'notification previews are off by default')
    pg.get_by_label('Disappearing messages in new direct conversations').select_option('7d'); pg.wait_for_timeout(300)
    other = st(pg, "return s.getState().members.find(m => m.id !== 'm-leo' && !msg.findDirectConversation?.('m-leo', m.id))?.id")
    after = st(pg, f"const c = msg.openDirectConversation('m-leo', '{other}'); return c.disappearAfter")
    check(after == 7 * 864e5, f'a new direct conversation disappears after a week ({after})')
    pg.get_by_label('Leave no trace on this device').check(); pg.wait_for_timeout(300)
    check(st(pg, "return sec.mySecurity().leaveNoTrace") is True, 'leave no trace saves')
    pg.screenshot(path='test-output/out/account-security.png', full_page=True)

    # ─── Group → Security ───
    pg.evaluate("location.hash='#settings-juniper--security'"); pg.wait_for_timeout(700)
    tab = pg.locator('.settings-tabs__tab', has_text='Security')
    check(tab.count() == 1 and 'is-active' in tab.get_attribute('class'), 'the group has a Security tab')
    glance = pg.locator('.security-glance')
    check('Encrypted' in glance.inner_text() and 'admin' in glance.inner_text(), f'at a glance: {glance.inner_text()[:90]}')
    for name in ['Encryption', 'Passkeys', 'New members', 'Invite links', 'Group chat', 'Vault', 'Always on']:
        check(pg.locator('.settings-section__title', has_text=name).count() == 1, f'group section: {name}')
    pg.get_by_role('radio', name='Admins and the owner').check(); pg.wait_for_timeout(300)
    check(st(pg, "return sec.groupSecurity('juniper').requirePasskey") == 'admins', 'require passkeys for admins saves')
    # Another admin without a passkey sees the notice in the group
    admin = st(pg, "const g = s.getSpace('juniper'); return g.memberIds.find(id => id !== 'm-leo' && ['admin','owner'].includes(perm.roleOf(g, id)))")
    print('   other admin:', admin)
    if admin:
        st(pg, f"a.signIn('{admin}'); return 1"); pg.wait_for_timeout(500)
        pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(700)
        check(pg.locator('.passkey-ask').count() == 1, 'an admin without a passkey is asked in the group')
        st(pg, "sec.setMySecurity({ passkeys: [{ id: 'pk1', kind: 'device', name: 'Phone', addedAt: Date.now() }] }); return 1"); pg.wait_for_timeout(300)
        pg.evaluate("location.hash='#feed'"); pg.wait_for_timeout(300); pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(600)
        check(pg.locator('.passkey-ask').count() == 0, 'gone once they add one')
        st(pg, "a.signIn('m-leo'); return 1"); pg.wait_for_timeout(500)

    # New members can't read back
    pg.evaluate("location.hash='#settings-juniper--security'"); pg.wait_for_timeout(600)
    check(pg.get_by_role('radio', name='Nothing from before they joined').is_checked(), 'new members see nothing from before they joined, by default')
    member = st(pg, "const g = s.getSpace('juniper'); return g.memberIds.find(id => perm.roleOf(g, id) === 'member')")
    conv = st(pg, "return sec.groupChatIds(s.getSpace('juniper'))[0]")
    total = st(pg, f"return msg.getConversation('{conv}').messages.filter(m => !m.threadOf).length")
    # Say this member joined an hour ago
    st(pg, f"s.changeState(state => {{ const g = state.spaces.find(x => x.id === 'juniper'); g.joinedAt = {{ ...(g.joinedAt ?? {{}}), '{member}': Date.now() - 3600e3 }}; }}, 'space'); return 1")
    st(pg, f"a.signIn('{member}'); return 1"); pg.wait_for_timeout(500)
    pg.evaluate(f"location.hash='#settings-juniper'"); pg.wait_for_timeout(500)
    check(pg.locator('.settings-tabs__tab', has_text='Security').count() == 0, 'members don’t get the Security tab')
    pg.evaluate(f"location.hash='#messages-{conv}'"); pg.wait_for_timeout(800)
    shown = pg.locator('.thread').first.locator('.message').count()
    check(pg.locator('.thread__notice--history').count() >= 1, 'a note says earlier messages are hidden')
    check(shown < total, f'earlier messages are hidden ({shown} of {total})')
    st(pg, "a.signIn('m-leo'); return 1"); pg.wait_for_timeout(500)

    # Disappearing messages for the group chat
    pg.evaluate("location.hash='#settings-juniper--security'"); pg.wait_for_timeout(600)
    pg.locator('.security-tab').get_by_label('Disappearing messages', exact=True).select_option('1d'); pg.wait_for_timeout(300)
    check(st(pg, f"return msg.getConversation('{conv}').disappearAfter") == 864e5, 'the group chat’s timer is set to a day')
    check('disappear after 1 day' in st(pg, f"return msg.getConversation('{conv}').messages.at(-1).body"), 'with the usual notice in the chat')

    # Reset invite links
    before = st(pg, "return s.getSpace('juniper').inviteCode ?? null")
    if before:
        pg.get_by_role('button', name='Reset invite links').click(); pg.wait_for_timeout(300)
        check(st(pg, "return s.getSpace('juniper').inviteCode") != before, 'reset invite links makes a new link')
    pg.screenshot(path='test-output/out/group-security.png', full_page=True)

    # Phone width: nothing runs off
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(400)
    wide = pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    check(not wide, 'phone: the group Security tab fits')
    pg.evaluate("location.hash='#account-security'"); pg.wait_for_timeout(500)
    check(not pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), 'phone: your Security tab fits')

    check(not errs, f'no page errors {errs[:2]}')
    b.close()

print('\n', 'ALL PASS' if not fails else f'{len(fails)} FAILED: {fails}')
