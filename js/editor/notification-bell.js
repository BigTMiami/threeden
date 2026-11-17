/**
 * notification-bell.js — the bell in the top bar, left of your avatar.
 *
 *                                        [🔔 3]  (LL)
 *   ┌ Notifications ────────── Mark all as read ┐
 *   │ (AA) Anna A invited you to the event       │  ● = unread
 *   │      “Steering committee dinner” · 2h ago ●│
 *   │ (WW) William W mentioned you in …          │
 *   └────────────────────────────────────────────┘
 *
 * Clicking a notification marks it read and takes you to the thing: the
 * event's page, or the module's full page opened at that item.
 *
 * Several people doing the same thing to the same thing (likes, comments,
 * replies, follows, RSVPs) within three days come as one line: "Maya and
 * 3 others liked your post “…”" (groupNotifications).
 * Notifications themselves come from js/state/notifications.js.
 *
 * On phones the bell stays in the slim top bar (between search and your
 * avatar), and the list opens as a sheet from the bottom.
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { timeAgo } from '../utils/dates.js';
import { getModule, getSpaceOfModule } from '../state/store.js';
import { getModuleType } from '../modules/registry.js';
import { getNotifications, unreadCount, markRead, markAllRead, actorOf, canAnswerAssignment, answerAssignment } from '../state/notifications.js';
import { showToast } from '../ui/toast.js';
import { requestModuleFocus } from './module-context.js';
import { goTo, openModulePage, spaceHref } from '../router.js';

const SHOWN = 30;

/** Kept across re-renders, so marking one read doesn't close the panel. */
let isOpen = false;
let current = null; // { element, setOpen }

document.addEventListener('pointerdown', (event) => {
  // Anything marked data-toggles-notifications toggles the list itself.
  if (event.target.closest?.('[data-toggles-notifications]')) return;
  // On phones the dimmed backdrop belongs to the menu's wrapper itself.
  const outside = !current?.element.contains(event.target) || event.target === current?.element;
  if (current && isOpen && outside) current.setOpen(false);
});

/** Open or close the notifications list from somewhere other than the bell. */
export function toggleNotifications() {
  current?.setOpen(!isOpen);
}

export function areNotificationsOpen() {
  return isOpen;
}

export function renderNotificationBell(user) {
  const unread = unreadCount(user.id);
  const notifications = getNotifications(user.id).slice(0, SHOWN);

  const trigger = h('button', {
    type: 'button',
    class: 'app-bar__bell',
    'aria-haspopup': 'true',
    'aria-expanded': String(isOpen),
    'aria-label': unread ? `Notifications, ${unread} unread` : 'Notifications',
    title: 'Notifications',
  }, icon('bell', 18), unread ? h('span', { class: 'unread-badge app-bar__bell-count' }, unread > 9 ? '9+' : String(unread)) : null);

  const panel = h('div', { class: 'groups-menu notifications-menu', role: 'region', 'aria-label': 'Notifications' },
    h('div', { class: 'notifications-menu__header' },
      h('span', { class: 'notifications-menu__title' }, 'Notifications'),
      unread ? h('button', { type: 'button', class: 'link-button', onClick: () => markAllRead(user.id) }, 'Mark all as read') : null),
    notifications.length === 0
      ? h('p', { class: 'notifications-menu__empty' }, 'Nothing yet. You’ll hear here when someone mentions you, assigns you something, or invites you to an event.')
      : h('ul', { class: 'notifications-menu__list' }, groupNotifications(notifications).map((group) => renderNotification(group, setOpen))),
  );

  const wrapper = h('div', { class: `app-bar__menu app-bar__menu--account${isOpen ? ' is-open' : ''}` }, trigger, panel);

  function setOpen(open) {
    isOpen = open;
    // The phone tab bar dims its lit tab while the sheet is open.
    window.dispatchEvent(new CustomEvent('3den:notifications-toggled'));
    wrapper.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
  }

  trigger.addEventListener('click', () => setOpen(!isOpen));
  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { setOpen(false); trigger.focus(); }
  });

  current = { element: wrapper, setOpen };
  return wrapper;
}

const GROUPED_KINDS = ['like', 'comment', 'reply', 'follow', 'rsvp', 'friend', 'photos'];
const GROUP_WINDOW_MS = 3 * 864e5;

/**
 * Notifications in groups: the same kind, about the same thing, from
 * different people, within three days of the newest. Each group =
 * { first, all, actors } (newest first).
 */
export function groupNotifications(list) {
  const groups = [];
  for (const n of list) {
    const target = n.href ?? `${n.moduleId ?? ''}:${n.itemId ?? ''}`;
    const group = GROUPED_KINDS.includes(n.kind) && !n.anonymous
      ? groups.find((g) => g.kind === n.kind && g.target === target && g.first.createdAt - n.createdAt < GROUP_WINDOW_MS)
      : null;
    if (group) {
      group.all.push(n);
      const actor = actorOf(n);
      if (actor && !group.actors.some((a) => a.id === actor.id)) group.actors.push(actor);
    } else {
      const actor = actorOf(n);
      groups.push({ kind: n.kind, target, first: n, all: [n], actors: actor ? [actor] : [] });
    }
  }
  return groups;
}

/** "Maya liked your post" + 3 more people → "Maya and 3 others liked your post". */
function groupText(group) {
  const { first, actors } = group;
  if (actors.length < 2) return first.text;
  const lead = actors[0];
  const rest = first.text.startsWith(lead.name) ? first.text.slice(lead.name.length) : ` · ${first.text}`;
  const others = actors.length === 2 ? ` and ${actors[1].name.split(' ')[0]}` : ` and ${actors.length - 1} others`;
  return `${lead.name.split(' ')[0]}${others}${rest}`;
}

function renderNotification(group, setOpen) {
  const notification = group.first;
  const unread = group.all.some((n) => !n.read);
  const faces = group.actors.slice(0, 3);
  // "Assigned you": ✓ to accept (you stay on it), ✕ to pass (you come off it, and whoever assigned you hears).
  const answerable = group.all.length === 1 && canAnswerAssignment(notification);
  const answer = (value) => { answerAssignment(notification.id, value); showToast(value === 'accept' ? 'You’re on it.' : 'Passed. They’ll hear you’re off it.'); };
  return h('li', { class: answerable || notification.answer ? 'notifications-menu__answerable' : '' },
    h('button', {
      type: 'button',
      class: `notifications-menu__item${unread ? ' is-unread' : ''}`,
      onClick: () => {
        setOpen(false);
        for (const n of group.all) if (!n.read) markRead(n.id);
        openNotification(notification);
      },
    },
      faces.length > 1
        ? h('span', { class: 'notifications-menu__faces' }, faces.map((a) => avatar(a, 22)))
        : faces[0] ? avatar(faces[0], 26) : h('span', { class: 'avatar avatar--empty' }),
      h('span', { class: 'notifications-menu__text' },
        groupText(group),
        h('span', { class: 'notifications-menu__time' }, ` · ${timeAgo(notification.createdAt)}${notification.texted ? ' · 📱 also texted' : ''}${notification.emailed ? ' · ✉ also emailed' : ''}`)),
      unread ? h('span', { class: 'notifications-menu__dot', 'aria-label': 'Unread' }) : null),
    answerable ? h('span', { class: 'notifications-menu__answer' },
      h('button', { type: 'button', class: 'notifications-menu__accept', 'aria-label': 'Accept', title: 'Accept: you stay on it', onClick: (event) => { event.stopPropagation(); answer('accept'); } }, icon('check', 16)),
      h('button', { type: 'button', class: 'notifications-menu__decline', 'aria-label': 'Reject', title: 'Reject: you come off it, and whoever assigned you hears', onClick: (event) => { event.stopPropagation(); answer('decline'); } }, icon('close', 16)))
      : notification.answer ? h('span', { class: `notifications-menu__answered is-${notification.answer}` }, notification.answer === 'accepted' ? '✓ Accepted' : '✕ Passed') : null);
}

/** Go to what a notification is about. */
export function openNotification({ href, moduleId, itemId, spaceId }) {
  if (href) { goTo(href); return; }
  const module = moduleId ? getModule(moduleId) : null;
  if (module && getModuleType(module.type).renderFullPage) {
    if (itemId) requestModuleFocus(moduleId, itemId);
    openModulePage(moduleId);
    return;
  }
  const space = module ? getSpaceOfModule(moduleId) : null;
  goTo(spaceHref(space?.id ?? spaceId));
}
