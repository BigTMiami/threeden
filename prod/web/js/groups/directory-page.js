// @ts-check
/**
 * directory-page.js — who's in a group (#directory-<spaceId>), for its members.
 *
 *   Juniper Tenants Union · 9 people                 [ Search names or intros ]
 *   All · Admins · New this month
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ (MC) Mia Chen · Owner                     [Message] [Blog]    │
 *   │      “I knock doors in Building C on Tuesdays.”               │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Each person's intro is what they wrote when they said hello (the welcome
 * checklist) or here, on their own card. Opened from "9 members" under the
 * group's name. People you've blocked aren't listed (blocks.js).
 */

import { blogShownIn } from '../state/groups.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { getSpace, getSpaceMembers, getCurrentUser } from '../state/store.js';
import { roleOf, roleLabel } from '../state/permissions.js';
import { blogHref, goTo, spaceHref } from '../router.js';
import { openDirectConversation } from '../state/messages.js';
import { friendStatus } from '../state/friends.js';
import { saveIntro } from './welcome-checklist.js';
import { isBlocked } from '../state/blocks.js';
import { choiceMenu } from '../ui/choice-menu.js';
import { renderMetInPerson } from '../ui/met-in-person.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'admins', label: 'Organizers' },
  { id: 'new', label: 'New this month' },
];

let filter = 'all';
let query = '';
let helpFilter = ''; // "Can help with: driving" (organizers)

export function renderDirectoryPage(container, spaceId) {
  const me = getCurrentUser();
  const space = getSpace(spaceId);
  if (!space || space.kind !== 'group' || !space.memberIds.includes(me.id)) {
    replaceChildren(container, h('div', { class: 'empty-state' },
      h('p', { class: 'empty-state__title' }, 'Only members can see who’s in a group.'),
      h('a', { class: 'button', href: '#groups' }, 'Your groups')));
    return;
  }
  const list = h('ul', { class: 'directory__list' });
  const count = h('span', { class: 'directory__count' });
  const search = h('input', { type: 'search', class: 'input directory__search', value: query, placeholder: 'Search names, intros, or what people can help with', 'aria-label': 'Search the directory', onInput: (e) => { query = e.target.value; draw(); } });
  const chips = h('div', { class: 'feed-filters', role: 'group', 'aria-label': 'Show' });

  function people() {
    const fresh = getSpace(spaceId);
    const q = query.trim().toLowerCase();
    const order = { owner: 0, admin: 1, moderator: 2, member: 3 };
    return getSpaceMembers(fresh)
      .filter((m) => m.id === me.id || !isBlocked(me.id, m.id))
      .map((m) => ({ member: m, role: roleOf(fresh, m.id), intro: fresh.intros?.[m.id] ?? '', joined: fresh.joinedAt?.[m.id] ?? 0 }))
      .filter((p) => filter !== 'admins' || p.role === 'owner' || p.role === 'admin')
      .filter((p) => filter !== 'new' || Date.now() - p.joined < 30 * 864e5)
      .filter((p) => !helpFilter || (p.member.helpWith ?? []).some((s) => s.toLowerCase() === helpFilter))
      .filter((p) => !q || `${p.member.name} ${p.member.username ?? ''} ${p.intro} ${(p.member.helpWith ?? []).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3) || a.member.name.localeCompare(b.member.name));
  }

  function card(p) {
    const isMe = p.member.id === me.id;
    const status = isMe ? null : friendStatus(me.id, p.member.id);
    const introLine = isMe ? introEditor(p.intro) : p.intro ? h('p', { class: 'directory__intro' }, `“${p.intro}”`) : h('p', { class: 'directory__intro directory__intro--none' }, 'Hasn’t written an intro yet.');
    return h('li', { class: 'directory__card' },
      avatar(p.member, 44),
      h('div', { class: 'directory__who' },
        h('p', { class: 'directory__name' },
          h('strong', {}, p.member.name), isMe ? ' (you)' : null,
          p.role !== 'member' ? h('span', { class: 'directory__role' }, roleLabel(p.role)) : null,
          status === 'friends' ? h('span', { class: 'directory__friend' }, 'Friend') : null,
          p.joined && Date.now() - p.joined < 30 * 864e5 ? h('span', { class: 'directory__new' }, 'New') : null),
        p.member.username ? h('p', { class: 'directory__handle' }, `@${p.member.username}`) : null,
        introLine,
        isMe ? null : renderMetInPerson(p.member.id, me),
        (p.member.helpWith ?? []).length ? h('p', { class: 'directory__help' }, h('span', { class: 'directory__help-label' }, 'Can help with'),
          p.member.helpWith.map((s) => h('button', { type: 'button', class: `chip directory__help-chip${helpFilter === s.toLowerCase() ? ' is-on' : ''}`, onClick: () => { helpFilter = helpFilter === s.toLowerCase() ? '' : s.toLowerCase(); draw(); } }, s)))
          : isMe ? h('p', { class: 'directory__help directory__help--none' }, h('a', { href: '#account-profile' }, 'Add what you can help with')) : null),
      isMe ? null : h('div', { class: 'directory__actions' },
        h('button', { type: 'button', class: 'button button--small', onClick: () => goTo(`#messages-${openDirectConversation(me.id, p.member.id).id}`) }, icon('chat', 14), ' Message'),
        p.member.username && p.member.features?.blog !== false && blogShownIn(space, p.member.id) ? h('a', { class: 'button button--small button--quiet', href: blogHref(p.member) }, 'Blog') : null));
  }

  function introEditor(current) {
    const input = h('input', { type: 'text', class: 'input input--compact', maxlength: '200', value: current, placeholder: 'Who you are, and what you can help with', 'aria-label': 'Your intro for this group' });
    return h('form', {
      class: 'directory__intro-form',
      onSubmit: (e) => { e.preventDefault(); if (!input.value.trim()) return; saveIntro(spaceId, me.id, input.value); showToast('Saved your intro.'); draw(); },
    }, input, h('button', { type: 'submit', class: 'button button--small' }, current ? 'Save' : 'Add'));
  }

  function draw() {
    const shown = people();
    count.textContent = `${getSpaceMembers(getSpace(spaceId)).length} people`;
    // Organizers can find who can help with what across the whole group.
    const organizer = ['owner', 'admin'].includes(roleOf(getSpace(spaceId), me.id));
    const skills = [...new Set(getSpaceMembers(getSpace(spaceId)).flatMap((m) => (m.helpWith ?? []).map((s) => s.toLowerCase())))].sort();
    replaceChildren(chips,
      FILTERS.map((f) => h('button', { type: 'button', class: `chip feed-filters__chip${filter === f.id ? ' is-on' : ''}`, 'aria-pressed': String(filter === f.id), onClick: () => { filter = f.id; draw(); } }, f.label)),
      organizer && skills.length ? choiceMenu({
        label: 'Can help with', prefix: 'Can help with: ',
        options: [{ id: '', label: 'Anything' }, ...skills.map((s) => ({ id: s, label: s }))],
        value: helpFilter,
        onChange: (id) => { helpFilter = id; draw(); },
      }) : null,
      helpFilter && !organizer ? h('button', { type: 'button', class: 'chip feed-filters__chip is-on', onClick: () => { helpFilter = ''; draw(); } }, `${helpFilter} ×`) : null);
    replaceChildren(list, shown.length ? shown.map(card) : h('li', { class: 'empty-state empty-state--compact' }, h('p', { class: 'empty-state__title' }, query ? `Nobody matches “${query}”.` : 'Nobody here yet.')));
  }
  draw();

  replaceChildren(container, h('div', { class: 'directory' },
    h('header', { class: 'settings-page__header directory__header' },
      h('a', { class: 'link-button directory__back', href: spaceHref(spaceId) }, '← ', space.name),
      h('h1', { class: 'settings-page__title' }, 'Members ', count)),
    h('div', { class: 'directory__tools' }, chips, search),
    list));
}
