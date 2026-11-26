// @ts-check
/**
 * upnext-add.js — Up next's "+ Add" (Nov 18). Two choices:
 *
 *   New event             the new-event page for this group (#new-event-<group>)
 *   From your calendar    pick an upcoming event or entry from your own
 *                         calendar (your homepage's calendars); a copy goes
 *                         into the group as an event for its members, with
 *                         you going, so it shows as the group's next event
 *
 * The copy goes into the group's first Calendar module, else its first
 * Upcoming events module, else Up next keeps it in its own data.events
 * (upnext-data.js reads every module that has events).
 *
 *   upNextAddButton({ space, moduleId, me, onAdded })
 */

import { h, replaceChildren, makeId } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { followAnchor } from '../../ui/media-attach.js';
import { changeState, getPersonalSpace } from '../../state/store.js';
import { normalizeEvent, occurrencesBetween, isEvent, occurrenceTimeLabel } from '../calendar/calendar-data.js';
import { addDays, todayKey } from '../../utils/dates.js';

const LOOK_AHEAD_DAYS = 365;

/** Upcoming events and entries in your own calendars, soonest first (one row per event). */
export function myUpcoming() {
  const personal = getPersonalSpace();
  const start = todayKey();
  const seen = new Set();
  const rows = [];
  for (const module of personal?.modules ?? []) {
    if (!Array.isArray(module.data?.events)) continue;
    const events = module.data.events.map(normalizeEvent);
    for (const occurrence of occurrencesBetween(events, start, addDays(start, LOOK_AHEAD_DAYS))) {
      if (occurrence.dayNumber !== 1 || seen.has(occurrence.event.id)) continue;
      seen.add(occurrence.event.id);
      rows.push(occurrence);
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || (a.event.time ?? '').localeCompare(b.event.time ?? ''));
}

/** A copy of one of your events or entries, as an event for the group's members. */
function copyIntoGroup(space, upNextModuleId, original, me) {
  const copy = {
    ...structuredClone(original),
    id: makeId('ev'),
    kind: 'event',
    visibility: 'group',
    inviteeIds: [],
    createdBy: me.id,
    attendeeIds: [me.id],
    rsvps: { [me.id]: 'going' },
    capacity: null,
    timePoll: null,
    copiedFrom: original.id,
  };
  changeState((state) => {
    const group = state.spaces.find((s) => s.id === space.id);
    if (!group) return;
    const target = group.modules.find((m) => m.type === 'calendar')
      ?? group.modules.find((m) => m.type === 'events')
      ?? group.modules.find((m) => m.id === upNextModuleId);
    if (!target) return;
    target.data = target.data ?? {};
    target.data.events = [...(target.data.events ?? []), copy];
  }, 'layout');
  return copy;
}

function openCalendarPicker({ space, moduleId, me, onAdded }) {
  const rows = myUpcoming();
  const dateText = (key) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const list = h('div', { class: 'upnext-pick__list' });
  const search = h('input', { type: 'search', class: 'input', placeholder: 'Search your calendar', 'aria-label': 'Search your calendar' });
  function draw() {
    const q = search.value.trim().toLowerCase();
    const shown = rows.filter(({ event }) => !q || [event.title, event.location].join(' ').toLowerCase().includes(q));
    replaceChildren(list, shown.length ? shown.map((occurrence) => h('button', {
      type: 'button', class: 'upnext-pick__row',
      onClick: () => {
        const copy = copyIntoGroup(space, moduleId, occurrence.event, me);
        modal.close();
        showToast(`Added “${copy.title}” to ${space.name}.`);
        onAdded?.();
      },
    },
      h('span', { class: 'upnext-pick__date' }, dateText(occurrence.date)),
      h('span', { class: 'upnext-pick__text' },
        h('strong', {}, occurrence.event.title || 'Untitled'),
        h('span', { class: 'settings-field__hint' }, [isEvent(occurrence.event) ? 'Event' : 'Calendar entry', occurrenceTimeLabel(occurrence), occurrence.event.location].filter(Boolean).join(' · '))),
      icon('plus', 14)))
      : h('p', { class: 'module-empty' }, rows.length ? 'Nothing matches.' : 'Nothing coming up on your calendar.'));
  }
  search.addEventListener('input', draw);
  draw();
  const modal = openModal(h('div', { class: 'upnext-pick' },
    h('div', { class: 'upnext-pick__head' },
      h('h2', { class: 'upnext-pick__title' }, 'From your calendar'),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => modal.close() }, icon('close', 16))),
    h('p', { class: 'settings-field__hint' }, `Pick an event or entry. A copy goes on ${space.name}’s calendar as an event for its members, with you going.`),
    search,
    list), { label: 'Add from your calendar', className: 'upnext-pick-modal' });
  requestAnimationFrame(() => search.focus());
}

export function upNextAddButton({ space, moduleId, me, onAdded }) {
  const menu = h('div', { class: 'media-attach__menu', role: 'menu', hidden: true });
  const toggle = h('button', {
    type: 'button', class: 'button button--primary button--small upnext__post', 'aria-haspopup': 'true', 'aria-expanded': 'false',
    onClick: () => setOpen(menu.hidden),
  }, icon('plus', 14), ' Add');
  const wrap = h('span', { class: 'media-attach upnext__add' }, toggle, menu);
  const outside = (event) => { if (!wrap.contains(event.target)) setOpen(false); };
  const onKey = (event) => { if (event.key === 'Escape') { setOpen(false); toggle.focus(); } };
  let stopFollowing = () => {};
  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    const listen = open ? 'addEventListener' : 'removeEventListener';
    document[listen]('pointerdown', outside);
    document[listen]('keydown', onKey);
    stopFollowing();
    stopFollowing = open ? followAnchor(menu, toggle, () => setOpen(false)) : () => {};
  }
  const choice = (iconName, text, hint, run) => h('button', {
    type: 'button', role: 'menuitem', class: 'media-attach__choice',
    onClick: () => { setOpen(false); run(); },
  }, icon(iconName, 16), h('span', {}, h('strong', {}, text), h('span', { class: 'media-attach__hint' }, hint)));
  replaceChildren(menu,
    choice('ticket', 'New event', 'Plan one for the group, with RSVPs', () => { window.location.hash = `#new-event-${space.id}`; }),
    choice('calendar', 'From your calendar', 'An event or entry you already have', () => openCalendarPicker({ space, moduleId, me, onAdded })));
  return wrap;
}
