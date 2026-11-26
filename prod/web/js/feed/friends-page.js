// @ts-check
/**
 * friends-page.js — the Friends tab (#feed-friends), opened from Home →
 * Friends: requests to you, your friends, requests you sent, people from
 * your Instagram (if connected), and people from your groups.
 *
 * (Split out of feed-page.js, which draws the Feed itself.)
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { timeAgo } from '../utils/dates.js';
import { getMember, getSpaces, getBlogOf } from '../state/store.js';
import {
  getFriendIds, incomingRequests, outgoingRequests, friendStatus, sendFriendRequest, acceptFriendRequest, removeFriendship, restoreFriendship,
} from '../state/friends.js';
import { instagramSuggestions, dismissSuggestion as dismissInstagram, RELATION_LABEL, getInstagram } from '../state/instagram.js';
import { openInstagramConnect } from '../account/instagram-connect.js';
import { blogHref } from '../router.js';

export function renderFriends(me, redraw) {
  const requests = incomingRequests(me.id);
  const sent = outgoingRequests(me.id);
  const friends = getFriendIds(me.id).map(getMember).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));

  // People in your groups who use blogs and aren't friends yet.
  const groupmates = new Set(getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(me.id)).flatMap((s) => s.memberIds));
  const fromInstagram = instagramSuggestions(me.id);
  const instagramIds = new Set(fromInstagram.map((s) => s.member.id));
  const suggestions = [...groupmates].filter((id) => friendStatus(me.id, id) === 'none' && !instagramIds.has(id)).map(getMember).filter(Boolean);

  const personRow = (member, actions, detail = null) => h('li', { class: 'friend-row' },
    avatar(member, 36),
    h('div', { class: 'friend-row__text' },
      h('a', { href: blogHref(member), class: 'friend-row__name' }, member.name),
      h('span', { class: 'friend-row__meta' }, detail ?? `@${member.username}${getBlogOf(member.id)?.description ? ` · ${getBlogOf(member.id).description}` : ''}`)),
    h('div', { class: 'friend-row__actions' }, actions));

  return h('div', { class: 'friends-page' },
    // Find friends from your contacts or a group chat, or send your invite link (js/feed/bring-page.js).
    h('p', { class: 'friends-page__bring' }, h('a', { class: 'button button--small', href: '#bring' }, icon('people', 14), ' Bring your people'),
      h('span', { class: 'settings-field__hint' }, ' From your contacts, a group chat, or your invite link.')),
    requests.length ? h('section', { class: 'settings-section' },
      h('h2', { class: 'settings-section__title' }, `Friend requests (${requests.length})`),
      h('ul', { class: 'friend-list' }, requests.map((request) => {
        const member = getMember(request.from);
        return personRow(member, [
          h('button', { type: 'button', class: 'button button--primary button--small', onClick: () => { acceptFriendRequest(me.id, member.id); showToast(`You and ${member.name} are now friends.`); redraw(); } }, 'Accept'),
          h('button', { type: 'button', class: 'button button--small', onClick: () => { removeFriendship(me.id, member.id); redraw(); } }, 'Decline'),
        ], `@${member.username} · asked ${timeAgo(request.createdAt)}`);
      }))) : null,

    h('section', { class: 'settings-section' },
      h('h2', { class: 'settings-section__title' }, `Your friends (${friends.length})`),
      friends.length === 0 ? h('p', { class: 'module-empty' }, 'No friends yet.') : h('ul', { class: 'friend-list' }, friends.map((member) => personRow(member, [
        h('a', { class: 'button button--small', href: blogHref(member) }, 'Blog'),
        h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { const copy = removeFriendship(me.id, member.id); showToast(`You and ${member.name} are no longer friends.`, { actionLabel: 'Undo', onAction: () => { restoreFriendship(copy); redraw(); } }); redraw(); } }, 'Unfriend'),
      ])))),

    sent.length ? h('section', { class: 'settings-section' },
      h('h2', { class: 'settings-section__title' }, 'Requests you sent'),
      h('ul', { class: 'friend-list' }, sent.map((request) => {
        const member = getMember(request.to);
        return personRow(member, h('button', { type: 'button', class: 'link-button', onClick: () => { removeFriendship(me.id, member.id); redraw(); } }, 'Cancel request'), `@${member.username} · sent ${timeAgo(request.createdAt)}`);
      }))) : null,

    fromInstagram.length ? h('section', { class: 'settings-section', id: 'friends-instagram' },
      h('h2', { class: 'settings-section__title' }, 'From your Instagram'),
      h('ul', { class: 'friend-list' }, fromInstagram.map(({ member, handle, relation }) => personRow(member, [
        h('button', { type: 'button', class: 'button button--small', onClick: () => { sendFriendRequest(me.id, member.id); showToast(`Friend request sent to ${member.name}.`); redraw(); } }, icon('plus', 12), ' Add friend'),
        h('button', { type: 'button', class: 'link-button', onClick: () => { dismissInstagram(me.id, handle); redraw(); } }, 'Not now'),
      ], `@${handle} · ${RELATION_LABEL[relation]}`)))) : !getInstagram(me.id) && me.username ? h('p', { class: 'friends-page__instagram' },
      h('button', { type: 'button', class: 'link-button', onClick: () => openInstagramConnect({ onDone: redraw }) }, 'Find people you know from Instagram')) : null,

    suggestions.length ? h('section', { class: 'settings-section' },
      h('h2', { class: 'settings-section__title' }, 'People from your groups'),
      h('ul', { class: 'friend-list' }, suggestions.map((member) => personRow(member,
        h('button', { type: 'button', class: 'button button--small', onClick: () => { sendFriendRequest(me.id, member.id); showToast(`Friend request sent to ${member.name}.`); redraw(); } }, icon('plus', 12), ' Add friend'))))) : null,
  );
}
