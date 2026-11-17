// @ts-check
/**
 * events-card.js — the Upcoming events card on a homepage: the next few
 * events as a list, with RSVP buttons right there.
 *
 *   ┌ Upcoming events ───────────────────────────── ↗ ┐
 *   │ NOVEMBER 2026                                    │
 *   │ [NOV 14] Fall potluck  [Public]                  │
 *   │          6:00 – 9:00pm · Garden shed             │
 *   │          12 going · 3 maybe   [👍][🤔][😢]        │
 *   │ [NOV 20] Seed swap planning                      │
 *   │ …                                                │
 *   │ + Add event            From the Calendar · All → │
 *   └──────────────────────────────────────────────────┘
 *
 * Clicking an event opens it on the full page. "+ Add event" opens the
 * full page with a new event ready to fill in.
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { getModule, getRows } from '../../state/store.js';
import { applyRsvp } from '../calendar/calendar-data.js';
import { eventsSource } from './events-source.js';
import { listOccurrences, monthLabel, renderEventRow } from './events-list.js';

/** About how many events fit: one takes roughly three grid rows. */
function rowLimit(moduleId) {
  const module = getModule(moduleId);
  return Math.max(2, Math.floor((getRows(module) - 3) / 3));
}

export const NEW_EVENT = 'new';

export function renderEventsCard(container, context) {
  const me = context.currentUser;
  const list = h('div', { class: 'upcoming' });
  const footer = h('div', { class: 'upcoming__footer' });

  function draw() {
    const source = eventsSource(context);
    const occurrences = listOccurrences(source.events());
    const shown = occurrences.slice(0, rowLimit(context.moduleId));

    let lastMonth = null;
    replaceChildren(list,
      shown.length === 0 ? h('p', { class: 'upcoming__empty' }, 'Nothing coming up.', context.spaceKind === 'personal' && !context.isVisitor ? [' ', h('a', { href: '#new-event' }, 'Plan an event →')] : null) : null,
      shown.map((occurrence) => {
        const heading = monthLabel(occurrence.date);
        const showHeading = heading !== lastMonth;
        lastMonth = heading;
        return [
          showHeading ? h('h3', { class: 'upcoming__month' }, heading) : null,
          renderEventRow(occurrence, {
            me,
            compact: true,
            onOpen: () => context.openFullPage(occurrence.event.id),
            onOpenLink: context.openLinkedItem,
            onRsvp: (answer) => {
              source.change(occurrence.event, (saved) => applyRsvp(saved, me.id, answer));
              if (answer === 'going') showToast(`You're going to "${occurrence.event.title}".`);
              draw();
            },
          }),
        ];
      }));

    const more = occurrences.length - shown.length;
    replaceChildren(footer,
      context.isVisitor ? h('span') : h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage(NEW_EVENT) }, icon('plus', 12), ' Add event'),
      h('span', {},
        h('a', { href: '#', onClick: (e) => { e.preventDefault(); context.openFullPage(); } }, more > 0 ? `${more} more →` : 'All events →')),
    );
  }

  container.append(list, footer);
  draw();
}
