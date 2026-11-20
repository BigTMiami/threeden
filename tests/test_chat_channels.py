"""
Chat channels (Nov 20).

1. The group chat card shows # general; an admin (Leo, in 14 Juniper Lane) can add a channel
   with + (names cleaned: "Supplies & food" → supplies-food); it opens; messages go to it;
   it's a group chat with everyone, also in Messages ("14 Juniper Lane · supplies-food").
2. Switching between channels in the card shows each one's messages; unread counts show on
   other channels.
3. Expanding opens the group's own chat page (not Messages), on the channel that was open, with
   the channel list beside the chat; switching works there; an admin can rename and delete a
   channel (not # general).
4. A member who isn't an admin sees and uses channels but can't add them.
5. Phone: the expanded chat shows channels as chips above the chat.
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
    return pg.evaluate(f"(async()=>{{const s=await import('./js/state/store.js'); const msg=await import('./js/state/messages.js'); const a=await import('./js/state/accounts.js'); const perm=await import('./js/state/permissions.js'); {js}}})()")


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto('http://localhost:8765/index.html'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.reload(); pg.wait_for_timeout(900)

    def card():
        pg.evaluate("location.hash='#space-juniper'"); pg.wait_for_timeout(800)
        f = pg.locator('.module-frame', has=pg.locator('.chat-module')).first
        f.scroll_into_view_if_needed()
        return f

    f = card()
    check(f.locator('.chat-channel.is-active', has_text='general').count() == 1, 'the card shows # general')
    f.get_by_role('button', name='New channel').click(); pg.wait_for_timeout(200)
    f.get_by_label('Channel name').fill('Supplies & food'); f.get_by_label('Channel name').press('Enter'); pg.wait_for_timeout(500)
    check(f.locator('.chat-channel.is-active', has_text='supplies-food').count() == 1, 'an admin adds a channel; the name is cleaned up and it opens')
    data = st(pg, "return s.getModule('house-chat').data")
    ch = data['channels'][0]
    conv = st(pg, f"const c = msg.getConversation('{ch['conversationId']}'); return {{ spaceId: c.spaceId, title: msg.conversationTitle(c, 'm-leo'), members: msg.conversationMemberIds(c).length }}")
    group_size = st(pg, "return s.getSpace('juniper').memberIds.length")
    check(conv['spaceId'] == 'juniper' and conv['members'] == group_size, 'it’s a group chat with everyone in the group')
    check(conv['title'] == '14 Juniper Lane · supplies-food', f'it’s in Messages as “{conv["title"]}”')
    box = f.locator('.thread__composer textarea, textarea').first
    check('supplies-food' in (box.get_attribute('placeholder') or ''), 'the writing box says which channel')
    box.fill('Who has the big pot?'); box.press('Enter'); pg.wait_for_timeout(400)
    check(st(pg, f"return msg.getConversation('{ch['conversationId']}').messages.at(-1).body") == 'Who has the big pot?', 'messages go to the channel')
    check(st(pg, f"return msg.getConversation('{data['conversationId']}').messages.some(m => m.body === 'Who has the big pot?')") is False, 'not to # general')

    # 2: switch, unread
    f.locator('.chat-channel', has_text='general').click(); pg.wait_for_timeout(300)
    check(f.get_by_text('Who has the big pot?').count() == 0 and f.locator('.chat-channel.is-active', has_text='general').count() == 1, 'switching to # general shows its messages')
    st(pg, f"msg.sendMessage('{ch['conversationId']}', 'm-maya', 'I do!'); return 1"); pg.wait_for_timeout(400)
    check(f.locator('.chat-channel', has_text='supplies-food').locator('.chat-channel__unread').count() == 1, 'a new message in another channel shows an unread count')
    f.locator('.chat-channel', has_text='supplies-food').click(); pg.wait_for_timeout(300)
    check(f.get_by_text('I do!').count() == 1, 'switching back shows it')

    # 3: expand → the group's chat page, same channel
    f.locator('.module-frame__open').click(); pg.wait_for_timeout(800)
    check(pg.evaluate('location.hash') == '#module-house-chat', 'expand opens the group’s chat page, not Messages')
    page = pg.locator('#module-page-view .chat-module--page')
    check(page.locator('.chat-channels__title').count() == 1 and page.locator('.chat-channel').count() >= 2, 'the channel list sits beside the chat')
    check(page.locator('.chat-channel.is-active', has_text='supplies-food').count() == 1 and page.get_by_text('I do!').count() == 1, 'it opens on the channel that was open')
    check(page.locator('.chat-module__channel').inner_text().replace('\n', '') == '#supplies-food', 'the header names the channel')
    pg.screenshot(path='test-output/out/chat-channels-page.png')
    page.locator('.chat-channel', has_text='general').click(); pg.wait_for_timeout(300)
    check(page.locator('.chat-module__header .more-menu__button').count() == 0, '# general can’t be renamed or deleted')
    page.locator('.chat-channel', has_text='supplies-food').click(); pg.wait_for_timeout(300)
    page.locator('.chat-module__header .more-menu__button').click(); pg.wait_for_timeout(200)
    pg.locator('.more-menu__item', has_text='Rename').click(); pg.wait_for_timeout(200)
    inp = page.get_by_label('Rename #supplies-food'); inp.fill('Kitchen'); inp.press('Enter'); pg.wait_for_timeout(400)
    check(page.locator('.chat-channel', has_text='kitchen').count() == 1, 'rename works')
    check(st(pg, f"return msg.getConversation('{ch['conversationId']}').name") == 'kitchen', 'and renames it in Messages')
    page.get_by_role('button', name='New channel').click(); pg.wait_for_timeout(150)
    page.get_by_label('Channel name').fill('events'); page.get_by_label('Channel name').press('Enter'); pg.wait_for_timeout(400)
    page.locator('.chat-module__header .more-menu__button').click(); pg.wait_for_timeout(200)
    pg.locator('.more-menu__item', has_text='Delete').click(); pg.wait_for_timeout(400)
    check(page.locator('.chat-channel', has_text='events').count() == 0 and page.locator('.chat-channel.is-active', has_text='general').count() == 1, 'delete removes it and goes back to # general')

    # 4: a member who isn't an admin
    member = st(pg, "const g = s.getSpace('juniper'); return g.memberIds.find(id => perm.roleOf(g, id) === 'member')")
    st(pg, f"a.signIn('{member}'); return 1"); pg.wait_for_timeout(500)
    f = card()
    check(f.locator('.chat-channel', has_text='kitchen').count() == 1, 'members see the channels')
    check(f.get_by_role('button', name='New channel').count() == 0, 'members can’t add channels')
    f.locator('.chat-channel', has_text='kitchen').click(); pg.wait_for_timeout(300)
    check(f.get_by_text('I do!').count() == 1, 'members can switch to them')
    st(pg, "a.signIn('m-leo'); return 1"); pg.wait_for_timeout(500)

    # 5: phone
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    ph = ctx.new_page()
    ph.on('pageerror', lambda e: errs.append(str(e)))
    ph.goto('http://localhost:8765/index.html'); ph.wait_for_timeout(300)
    ph.evaluate(f"localStorage.clear()"); ph.reload(); ph.wait_for_timeout(900)
    ph.evaluate("(async()=>{const s=await import('./js/state/store.js'); const msg=await import('./js/state/messages.js'); const c = msg.createModuleConversation({spaceId:'juniper', moduleId:'house-chat', name:'kitchen'}); const m = s.getModule('house-chat'); s.updateModuleData('house-chat', {...m.data, channels:[{id:'ch1', name:'kitchen', conversationId:c.id, createdBy:'m-leo', createdAt:Date.now()}]});})()")
    ph.evaluate("location.hash='#module-house-chat'"); ph.wait_for_timeout(900)
    chips = ph.locator('#module-page-view .chat-channels')
    cb = chips.bounding_box()
    check(cb and cb['height'] < 70 and ph.locator('#module-page-view .chat-channel').count() >= 2, 'phone: channels are chips above the chat')
    check(not ph.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), 'phone: nothing runs off the side')
    ph.screenshot(path='test-output/out/chat-channels-phone.png')

    check(not errs, f'no page errors {errs[:2]}')
    b.close()

print('\n', 'ALL PASS' if not fails else f'{len(fails)} FAILED: {fails}')
