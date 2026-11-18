// @ts-check
/**
 * upnext-module.js — "Up next", a group's first module: what's next, and
 * everything new in the group in one stream (from the mobile redesign,
 * direction A).
 *
 *   NEXT EVENT · SATURDAY
 *   ┌SAT┐ Flyering Saturday morning
 *   └15 ┘ 10:00am · Building B lobby      [Going · 4] [Maybe · 1] [Can't go]
 *   [Everything] [Announcements] [Forum] [Posts] [Articles] [Events]
 *   Since Tuesday: 1 announcement, 3 replies, 1 post
 *   📣 Announcement
 *   (PN) We got a meeting with Crestline · Priya Nair · 14h
 *        After 112 heat complaints…
 *   …                                         Show all · [+ Add ▾]
 *
 * Nothing is saved: it reads the group's other modules each time (upnext-data.js).
 * Tapping an item opens it where it lives. The filter is kept while you're
 * on the page. The card shows a few; the full page shows all. "+ Add"
 * offers New event or one from your calendar (upnext-add.js).
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { timeAgo, weekdayName } from '../../utils/dates.js';
import { getSpace, memberIn, getVisitBefore } from '../../state/store.js';
import { updateEvent } from '../../state/events.js';
import { requestModuleFocus } from '../../editor/module-context.js';
import { openModulePage } from '../../router.js';
import { rsvpButtons } from '../../events/rsvp.js';
import { eventHref } from '../../events/event-details.js';
import { dateBlock } from '../events/events-list.js';
import { applyRsvp, occurrenceTimeLabel, colorValue } from '../calendar/calendar-data.js';
import { availabilityChip } from '../../ui/availability-chip.js';
import { upNextAddButton } from './upnext-add.js';
import { nextEventIn, streamOf, STREAM_KINDS, sinceLine } from './upnext-data.js';

const CARD_ITEMS = 5;
/** @type {Map<string, string>} the filter chosen in each module, while you're on the page */
const filters = new Map();

function render(container, context, { full = false } = {}) {
  const space = getSpace(context.spaceId);
  if (!space) return;
  const me = context.currentUser;
  const redraw = () => render(container, context, { full });
  const filter = filters.get(context.moduleId) ?? 'all';
  const all = streamOf(space, me);
  const kindsHere = STREAM_KINDS.filter((k) => all.some((item) => item.kind === k.id));
  const shown = filter === 'all' ? all : all.filter((item) => item.kind === filter);
  const list = full ? shown : shown.slice(0, CARD_ITEMS);
  const since = sinceLine(all, me, getVisitBefore(space.id));

  replaceChildren(container,
    renderNext(space, me, context, redraw),
    kindsHere.length > 1 ? h('div', { class: 'upnext__filters', role: 'group', 'aria-label': 'Show' },
      [{ id: 'all', label: 'Everything' }, ...kindsHere].map((k) => h('button', {
        type: 'button', class: `chip${filter === k.id ? ' is-on' : ''}`, 'aria-pressed': String(filter === k.id),
        onClick: () => { filters.set(context.moduleId, k.id); redraw(); },
      }, k.label))) : null,
    since ? h('p', { class: 'upnext__since' }, since) : null,
    list.length
      ? h('ul', { class: 'upnext__stream' }, list.map((item) => renderItem(item, space)))
      : h('p', { class: 'module-empty' }, all.length ? 'Nothing of this kind yet.' : 'Nothing posted yet. Say hello, or plan the first event.'),
    h('div', { class: 'upnext__foot' },
      !full && shown.length > CARD_ITEMS ? h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage() }, `Show all ${shown.length}`) : h('span', {}),
      context.isVisitor ? null : upNextAddButton({ space, moduleId: context.moduleId, me, onAdded: redraw })));
}

/** The next event: date, what and where, RSVP buttons. */
function renderNext(space, me, context, redraw) {
  const next = nextEventIn(space, me);
  if (!next) {
    return h('section', { class: 'upnext__next upnext__next--empty' },
      h('p', { class: 'upnext__label' }, 'Next event'),
      h('p', { class: 'module-empty' }, 'Nothing planned yet.',
        context.isVisitor ? null : [' ', h('a', { href: `#new-event-${space.id}` }, 'Plan an event')]));
  }
  const { event, date } = next;
  const where = [occurrenceTimeLabel(next), event.location].filter(Boolean).join(' · ');
  return h('section', { class: 'upnext__next' },
    h('p', { class: 'upnext__label' }, `Next event · ${weekdayName(new Date(`${date}T12:00:00`).getDay())}`),
    h('div', { class: 'upnext__event' },
      dateBlock(date, colorValue(event.color)),
      h('div', { class: 'upnext__event-text' },
        h('h3', { class: 'upnext__event-title' }, h('a', { href: eventHref(event.id) }, event.title)),
        where ? h('p', { class: 'upnext__event-where' }, icon('pin', 13), ` ${where}`) : null,
        context.isVisitor ? null : rsvpButtons(event, me.id, (answer) => {
          updateEvent(event.id, (saved) => applyRsvp(saved, me.id, answer));
          if (answer === 'going') showToast(`You’re going to “${event.title}”. It’s on your calendar.`);
          redraw();
        }),
        availabilityChip(event, { date }))));
}

function renderItem(item, space) {
  const author = item.authorId ? memberIn(space, item.authorId) : null; // by the name they go by here
  const open = (e) => {
    e.preventDefault();
    if (item.href) { window.location.hash = item.href; return; }
    if (item.itemId) requestModuleFocus(item.moduleId, item.itemId);
    openModulePage(item.moduleId);
  };
  return h('li', { class: 'upnext__item' },
    h('a', { href: item.href ?? `#module-${item.moduleId}`, class: 'upnext__item-link', onClick: open },
      h('p', { class: 'upnext__kind' }, icon(item.icon, 13), ` ${item.kindLabel}`, item.newCount ? h('span', { class: 'upnext__new' }, `${item.newCount} new`) : null),
      h('div', { class: 'upnext__item-main' },
        author ? avatar(author, 30) : h('span', { class: 'upnext__anon', 'aria-hidden': 'true' }, icon(item.icon, 15)),
        h('div', { class: 'upnext__item-text' },
          h('h4', { class: 'upnext__title' }, item.title),
          h('p', { class: 'upnext__meta' }, [author?.name ?? (item.anonymous ? 'Someone (anonymous)' : null), timeAgo(item.timestamp)].filter(Boolean).join(' · ')),
          item.excerpt ? h('p', { class: 'upnext__excerpt' }, item.excerpt) : null))));
}

export const upNextModule = {
  type: 'upnext',
  label: 'Up next',
  description: 'The next event, and everything new in the group in one stream',
  icon: 'sparkle',
  defaultSpan: 12,
  defaultRows: 16,
  available: true,
  spaceKinds: ['group'],
  createInitialData() { return {}; },
  render: (container, context) => render(container, context),
  renderFullPage: (container, context) => render(container, context, { full: true }),
};
