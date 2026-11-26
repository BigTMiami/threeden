// @ts-check
/**
 * event-picker.js — pick one of your calendar's events (Nov 20): the Board's
 * Add → Event. Only events already on a calendar can be shared on a post;
 * making a new one happens on a calendar.
 *
 *   ┌ Add an event from your calendar ─────────────── × ┐
 *   │ [Search your events                          ]    │
 *   │ November                                          │
 *   │  SAT 21  Porch dinner · 6:00pm · 14 Juniper Lane   │
 *   │  SAT 28  Potluck · 6:00pm · Porch Lights           │
 *   │ December …                                        │
 *   └───────────────────────────────────────────────────┘
 *
 * Lists the events on your homepage calendar for the next year: ones you
 * made or host, are going to, are invited to, or that your groups share
 * (myUpcoming in dashboard-data.js), each once.
 *
 *   openEventPicker({ me, onPick: (eventId) => … })
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { myUpcoming } from '../modules/dashboard/dashboard-data.js';
import { dateBlock } from '../modules/events/events-list.js';
import { occurrenceTimeLabel } from '../modules/calendar/calendar-data.js';

/**
 * @param {{ me: any, onPick: (eventId: string) => void }} options
 */
export function openEventPicker({ me, onPick }) {
  const seen = new Set();
  const all = myUpcoming(me, 365)
    .filter((o) => o.event.kind === 'event' && o.role !== 'shift' && !seen.has(o.event.id) && seen.add(o.event.id));
  const search = h('input', { type: 'search', class: 'input', placeholder: 'Search your events', 'aria-label': 'Search your events' });
  const list = h('div', { class: 'event-picker__list' });
  let modal = null;

  function draw() {
    const words = search.value.trim().toLowerCase();
    const shown = all.filter((o) => !words || `${o.event.title} ${o.event.location ?? ''} ${o.space?.name ?? ''}`.toLowerCase().includes(words));
    if (!shown.length) {
      replaceChildren(list, h('p', { class: 'event-picker__empty' }, all.length
        ? 'No events match.'
        : 'Nothing coming up on your calendar. Make the event on a calendar first, then add it here.'));
      return;
    }
    let month = '';
    replaceChildren(list, shown.flatMap((o) => {
      const monthName = new Date(`${o.date}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const head = monthName !== month ? h('h3', { class: 'event-picker__month' }, (month = monthName)) : null;
      return [head, h('button', {
        type: 'button', class: 'event-picker__item',
        onClick: () => { modal?.close(); onPick(o.event.id); },
      },
      dateBlock(o.date, o.event.color),
      h('span', { class: 'event-picker__text' },
        h('strong', {}, o.event.title),
        h('span', { class: 'event-picker__meta' }, [o.event.allDay ? 'All day' : occurrenceTimeLabel(o), o.event.location, o.space?.kind === 'group' ? o.space.name : 'Your calendar'].filter(Boolean).join(' · '))))];
    }).filter(Boolean));
  }

  search.addEventListener('input', draw);
  draw();
  modal = openModal(h('div', { class: 'event-picker' },
    h('div', { class: 'event-picker__top' },
      h('h2', { class: 'event-picker__title' }, icon('calendar', 18), ' Add an event from your calendar'),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => modal?.close() }, icon('close', 18))),
    search, list), { label: 'Add an event from your calendar', className: 'event-picker-modal' });
  requestAnimationFrame(() => search.focus());
  return modal;
}
