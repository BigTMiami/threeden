// @ts-check
/**
 * bring-page.js — "Bring your people" (#bring), and what your invite link
 * opens (#hi-<username>). The state is in js/state/bring.js.
 *
 *   Bring your people
 *   ── From your contacts ──────────────────────────────────────
 *   [Choose a contacts file]  How to get one: iPhone · Android · Google
 *   On 3den already (3)   (MC) Maya Chen  [Add friend]  …   [Add all 3]
 *   Not on 3den yet (12)  ☑ Ana Ruiz · +1 555…  …
 *                         [Text them] [Email them] [Copy the message]
 *   ── Move a group chat ───────────────────────────────────────
 *   Which group?  [Porch Lights ▾]   or start a group for it
 *   "We're moving this chat to 3den…"   [Send in WhatsApp] [Text it] [Copy]
 *   ▸ See who's in the chat (a WhatsApp export)
 *   ── Your invite link ────────────────────────────────────────
 *   …#hi-leo  [Copy]   Whoever joins with it becomes your friend.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { getCurrentUser, getSpaces, getSpace } from '../state/store.js';
import { sendFriendRequest } from '../state/friends.js';
import { canInvite, inviteLinkOf, resetInviteLink, inviteToGroup } from '../state/groups.js';
import {
  readContacts, readChatMembers, matchContacts, friendLinkOf, findInviter, befriendByLink, inviteMessage, sendLinks,
} from '../state/bring.js';
import { requireAccount } from '../onboarding/guest.js';
import { blogHref, goTo } from '../router.js';
import { isGuestBrowsing } from '../state/store.js';

/** 5553014455 → (555) 301-4455; anything else as it is. */
const showPhone = (phone) => (/^\+?1?(\d{3})(\d{3})(\d{4})$/.exec(phone ?? '') ? phone.replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : phone);

const copy = (text, done = 'Copied.') => navigator.clipboard?.writeText(text).then(() => showToast(done), () => showToast('Couldn’t copy. Select the text and copy it.'));

let chatGroupId = null; // the group picked for "Move a group chat", kept while you're on the page
// The last contacts file and chat read, kept in memory only (never saved), so the lists survive a redraw.
let lastContacts = null;
let lastChat = null;

export function renderBringPage(container) {
  const me = getCurrentUser();
  const redraw = () => renderBringPage(container);
  replaceChildren(container,
    h('header', { class: 'settings-page__header' },
      h('h1', { class: 'settings-page__title' }, 'Bring your people'),
      h('p', { class: 'settings-page__subtitle' }, '3den is better with your friends here. You send the invitations; 3den never contacts anyone for you.')),
    renderContacts(me),
    renderGroupChat(me, redraw),
    renderYourLink(me));
}

// ─── From your contacts ──────────────────────────────────────────────────────

function renderContacts(me) {
  const results = h('div', { class: 'bring__results', 'aria-live': 'polite' });
  const file = h('input', {
    type: 'file', accept: '.vcf,.vcard,.csv,text/vcard,text/csv', hidden: true, 'aria-label': 'A contacts file',
    onChange: async () => {
      const picked = file.files?.[0];
      file.value = '';
      if (!picked) return;
      const list = readContacts(await picked.text());
      if (!list.length) { lastContacts = null; replaceChildren(results, h('p', { class: 'form-error' }, 'No contacts with a phone number or email in that file.')); return; }
      lastContacts = list;
      drawMatches(me, list, results);
    },
  });
  if (lastContacts) drawMatches(me, lastContacts, results);
  return h('section', { class: 'settings-section bring__contacts' },
    h('h2', { class: 'settings-section__title' }, 'From your contacts'),
    h('p', { class: 'settings-section__description' }, 'See who’s already here, and invite the rest. The file stays on this device; nothing from it is saved.'),
    h('div', { class: 'form-row' },
      h('button', { type: 'button', class: 'button button--primary button--small', onClick: () => file.click() }, icon('upload', 14), ' Choose a contacts file'), file),
    h('details', { class: 'bring__how' },
      h('summary', {}, 'How to get one'),
      h('ul', {},
        h('li', {}, h('strong', {}, 'iPhone: '), 'Contacts → Lists → hold “All Contacts” → Export. Or on iCloud.com: Contacts → select all → Export vCard.'),
        h('li', {}, h('strong', {}, 'Android: '), 'Contacts → Fix & manage → Export to file (.vcf).'),
        h('li', {}, h('strong', {}, 'Google Contacts: '), 'Export → vCard or Google CSV.'))),
    results);
}

function drawMatches(me, list, results) {
  const { onThreeden, notYet } = matchContacts(me, list);
  const picked = new Set(notYet.map((_, i) => i));
  const actions = h('div', { class: 'bring__send' });

  const drawActions = () => {
    const chosen = notYet.filter((_, i) => picked.has(i));
    const message = inviteMessage({ me, link: friendLinkOf(me) });
    const phones = chosen.flatMap((c) => c.phones.slice(0, 1));
    const emails = chosen.filter((c) => !c.phones.length).flatMap((c) => c.emails.slice(0, 1));
    const links = sendLinks(message, { phones, emails });
    replaceChildren(actions, chosen.length
      ? [
        phones.length ? h('a', { class: 'button button--primary button--small', href: links.text }, icon('chat', 14), ` Text ${phones.length === 1 ? '1 person' : `${phones.length} people`}`) : null,
        emails.length ? h('a', { class: `button button--small${phones.length ? '' : ' button--primary'}`, href: links.email }, icon('mail', 14), ` Email ${emails.length === 1 ? '1 person' : `${emails.length} people`}`) : null,
        h('button', { type: 'button', class: 'button button--small', onClick: () => copy(message, 'Message copied. Paste it anywhere.') }, 'Copy the message'),
      ]
      : h('p', { class: 'settings-field__hint' }, 'Tick the people to invite.'));
  };

  const friendButton = (row) => {
    if (row.status === 'friends') return h('span', { class: 'bring__status' }, 'Friends');
    if (row.status === 'sent') return h('span', { class: 'bring__status' }, 'Asked');
    if (row.status === 'unavailable') return h('span', { class: 'bring__status' }, 'Not using friends');
    return h('button', {
      type: 'button', class: 'button button--small',
      onClick: (e) => { sendFriendRequest(me.id, row.member.id); row.status = 'sent'; e.currentTarget.replaceWith(h('span', { class: 'bring__status' }, 'Asked')); },
    }, row.status === 'received' ? 'Accept' : 'Add friend');
  };
  const askable = onThreeden.filter((r) => r.status === 'none');

  replaceChildren(results,
    h('h3', { class: 'settings-subtitle' }, `On 3den already (${onThreeden.length})`),
    onThreeden.length ? [
      h('ul', { class: 'bring__people' }, onThreeden.map((row) => h('li', { class: 'friend-row' },
        avatar(row.member, 32),
        h('div', { class: 'friend-row__text' },
          h('a', { href: blogHref(row.member), class: 'friend-row__name' }, row.member.name),
          h('span', { class: 'friend-row__meta' }, `@${row.member.username}${row.contact.name && row.contact.name !== row.member.name ? ` · “${row.contact.name}” in your contacts` : ''}`)),
        h('div', { class: 'friend-row__actions' }, friendButton(row))))),
      askable.length > 1 ? h('button', {
        type: 'button', class: 'button button--small',
        onClick: () => { askable.forEach((r) => { sendFriendRequest(me.id, r.member.id); r.status = 'sent'; }); showToast(`Sent ${askable.length} friend requests.`); drawMatches(me, list, results); },
      }, `Add all ${askable.length}`) : null,
    ] : h('p', { class: 'settings-field__hint' }, 'None of them yet. Be the first to bring them.'),
    h('h3', { class: 'settings-subtitle' }, `Not on 3den yet (${notYet.length})`),
    notYet.length ? [
      h('ul', { class: 'bring__invitees' }, notYet.map((contact, i) => h('li', {},
        h('label', { class: 'settings-choice' },
          h('input', { type: 'checkbox', checked: true, onChange: (e) => { if (e.target.checked) picked.add(i); else picked.delete(i); drawActions(); } }),
          h('span', {}, contact.name, h('span', { class: 'settings-field__hint' }, ` ${contact.phones[0] ? showPhone(contact.phones[0]) : contact.emails[0] ?? ''}`)))))),
      actions,
    ] : null);
  drawActions();
}

// ─── Move a group chat ───────────────────────────────────────────────────────

function renderGroupChat(me, redraw) {
  const groups = getSpaces().filter((s) => s.kind === 'group' && canInvite(s, me.id));
  if (!groups.some((g) => g.id === chatGroupId)) chatGroupId = groups[0]?.id ?? null;
  const group = chatGroupId ? getSpace(chatGroupId) : null;

  if (!group) {
    return h('section', { class: 'settings-section bring__chat' },
      h('h2', { class: 'settings-section__title' }, 'Move a group chat'),
      h('p', { class: 'settings-section__description' }, 'Start a group for your chat, then send its link to everyone in the chat.'),
      h('a', { class: 'button button--primary button--small', href: '#new-group' }, icon('plus', 14), ' Start a group'));
  }

  const link = inviteLinkOf(group);
  const message = link ? inviteMessage({ me, link, group }) : '';
  const links = sendLinks(message);
  const who = h('div', { class: 'bring__chat-who', 'aria-live': 'polite' });
  const chatFile = h('input', {
    type: 'file', accept: '.txt,text/plain', hidden: true, 'aria-label': 'A chat export',
    onChange: async () => {
      const picked = chatFile.files?.[0];
      chatFile.value = '';
      if (!picked) return;
      lastChat = readChatMembers(await picked.text());
      drawChatMembers(me, group, lastChat, who);
    },
  });
  if (lastChat) drawChatMembers(me, group, lastChat, who);

  return h('section', { class: 'settings-section bring__chat' },
    h('h2', { class: 'settings-section__title' }, 'Move a group chat'),
    h('p', { class: 'settings-section__description' }, 'Send one link to your WhatsApp, GroupMe, or text chat. Everyone who taps it joins the group, with just a name and a phone number.'),
    h('label', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Which group?'),
      h('select', { class: 'input', 'aria-label': 'Which group', onChange: (e) => { chatGroupId = e.target.value; redraw(); } },
        groups.map((g) => h('option', { value: g.id, selected: g.id === group.id }, g.name)))),
    h('p', { class: 'settings-field__hint' }, 'A different chat? ', h('a', { href: '#new-group' }, 'Start a group for it'), '.'),
    link ? [
      h('blockquote', { class: 'bring__message' }, message),
      h('div', { class: 'form-row bring__send' },
        h('a', { class: 'button button--primary button--small', href: links.whatsapp, target: '_blank', rel: 'noopener' }, 'Send in WhatsApp'),
        h('a', { class: 'button button--small', href: links.text }, 'Text it'),
        h('button', { type: 'button', class: 'button button--small', onClick: () => copy(message, 'Message copied. Paste it in the chat.') }, 'Copy')),
    ] : h('div', { class: 'form-row' },
      h('p', { class: 'settings-field__hint' }, `${group.name} has no invite link yet.`),
      h('button', { type: 'button', class: 'button button--small', onClick: () => { resetInviteLink(group.id); redraw(); } }, 'Make one')),
    h('details', { class: 'bring__how', open: Boolean(lastChat) },
      h('summary', {}, 'See who’s in the chat'),
      h('p', { class: 'settings-field__hint' }, 'In WhatsApp: open the chat → its name → Export chat → Without media. Pick the .txt file here (on an iPhone, unzip it first). People already on 3den can be invited to the group right away.'),
      h('button', { type: 'button', class: 'button button--small', onClick: () => chatFile.click() }, icon('upload', 14), ' Choose the chat file'), chatFile,
      who));
}

function drawChatMembers(me, group, members, who) {
  if (!members.length) { replaceChildren(who, h('p', { class: 'form-error' }, 'Couldn’t find anyone in that file. Is it a chat export (.txt)?')); return; }
  const { onThreeden, notYet } = matchContacts(me, members.map((m) => ({ name: m.name, emails: [], phones: m.phone ? [m.phone] : [] })));
  const toInvite = onThreeden.filter((r) => !group.memberIds.includes(r.member.id));
  replaceChildren(who,
    h('p', {}, `${members.length} people in the chat. ${onThreeden.length} on 3den, ${onThreeden.length - toInvite.length} already in ${group.name}.`),
    toInvite.length ? [
      h('ul', { class: 'bring__people' }, toInvite.map((row) => h('li', { class: 'friend-row' }, avatar(row.member, 28), h('span', { class: 'friend-row__name' }, row.member.name)))),
      h('button', {
        type: 'button', class: 'button button--small',
        onClick: () => {
          const sent = toInvite.filter((r) => inviteToGroup(group.id, r.member.id, me.id)).length;
          showToast(sent ? `Invited ${sent} to ${group.name}.` : 'They’re already invited.');
        },
      }, `Invite ${toInvite.length} to ${group.name}`),
    ] : null,
    notYet.length ? h('p', { class: 'settings-field__hint' }, `${notYet.length} ${notYet.length === 1 ? 'isn’t' : 'aren’t'} on 3den yet: send the link in the chat (above).`) : null);
}

// ─── Your invite link ────────────────────────────────────────────────────────

function renderYourLink(me) {
  const link = friendLinkOf(me);
  return h('section', { class: 'settings-section bring__link' },
    h('h2', { class: 'settings-section__title' }, 'Your invite link'),
    h('p', { class: 'settings-section__description' }, 'Whoever joins 3den with it becomes your friend. Put it in your Instagram bio or send it to anyone.'),
    h('div', { class: 'form-row' },
      h('input', { type: 'text', class: 'input', readOnly: true, value: link, 'aria-label': 'Your invite link', onFocus: (e) => e.target.select() }),
      h('button', { type: 'button', class: 'button button--small', onClick: () => copy(link, 'Invite link copied.') }, 'Copy')));
}

// ─── #hi-<username>: someone's invite link ───────────────────────────────────

export function renderHiPage(container, username) {
  const inviter = findInviter(username);
  const me = getCurrentUser();
  if (!inviter) {
    replaceChildren(container, h('div', { class: 'settings-section join-page' },
      h('h1', { class: 'settings-page__title' }, 'This invite link doesn’t work'),
      h('p', {}, 'The account may have changed its username. Ask whoever sent it for a fresh link.')));
    return;
  }
  if (!isGuestBrowsing() && me?.id === inviter.id) { goTo('#bring'); return; }
  const first = inviter.name.split(' ')[0];
  replaceChildren(container, h('div', { class: 'settings-section join-page' },
    h('p', { class: 'join-page__kicker' }, `${first} invited you to 3den`),
    h('div', { class: 'join-page__group' }, avatar(inviter, 56),
      h('div', {},
        h('h1', { class: 'join-page__name' }, inviter.name),
        h('p', { class: 'join-page__meta' }, 'Groups, events, and plans with the people you know. Free, with no ads.'))),
    h('div', { class: 'form-row' },
      h('button', {
        type: 'button', class: 'button button--primary',
        onClick: () => {
          const done = (id) => { befriendByLink(inviter.id, id); history.replaceState(null, '', blogHref(inviter)); };
          if (requireAccount({ reason: `to be friends with ${first}`, action: 'join', arrival: { source: 'friend', inviterId: inviter.id }, then: done })) return;
          const result = befriendByLink(inviter.id, me.id);
          showToast(result === 'already' ? `You and ${first} are already friends.` : result === 'unavailable' ? `${first} isn’t using friends right now.` : `You and ${first} are friends now.`);
          goTo(blogHref(inviter));
        },
      }, icon('heart', 14), ` Be friends with ${first}`),
      h('a', { href: '#', class: 'button button--quiet' }, 'Not now'))));
}
