/**
 * events-list.js — the event rows shared by the Upcoming events card and
 * its full page.
 *
 *   ┌─────┐
 *   │ NOV │  Fall potluck                         [Public]
 *   │ 14  │  6:00 – 9:00pm · Garden shed
 *   │ Thu │  12 going · 3 maybe       [👍 Going] [🤔 Maybe] [😢 Can't go]
 *   └─────┘
 */

import { renderEventTags } from '../../events/event-tags.js';
import { h } from '../../ui/dom.js';
import { fromDateKey, monthName, weekdayName, todayKey, addDays } from '../../utils/dates.js';
import {
  occurrencesBetween, occurrenceTimeLabel, colorValue, VISIBILITY, rsvpOf,
} from '../calendar/calendar-data.js';
import { rsvpButtons, rsvpSummary, answeredThisVisit } from '../../events/rsvp.js';
import { sourceTag } from '../../ui/source-tag.js';
import { availabilityChip } from '../../ui/availability-chip.js';

export const LOOKAHEAD_DAYS = 365;
export const LOOKBACK_DAYS = 365;

/**
 * Event occurrences in order, one row per start (a three-day event is one
 * row, a weekly event is one row a week).
 *   which: 'upcoming' (today on) | 'past' (before today, newest first)
 */
export function listOccurrences(events, which = 'upcoming') {
  const today = todayKey();
  const rows = which === 'past'
    ? occurrencesBetween(events, addDays(today, -LOOKBACK_DAYS), addDays(today, -1))
    : occurrencesBetween(events, today, addDays(today, LOOKAHEAD_DAYS));
  // Keep the first day of each event (and today's row for one already going on).
  const starts = rows.filter((o) => o.dayNumber === 1 || (which === 'upcoming' && o.date === today));
  const sorted = starts.sort((a, b) => a.date.localeCompare(b.date) || (a.event.time || '').localeCompare(b.event.time || ''));
  return which === 'past' ? sorted.reverse() : sorted;
}

/** "November 2026" headings between rows from different months. */
export function monthLabel(dateKey) {
  const date = fromDateKey(dateKey);
  return `${monthName(date.getMonth())} ${date.getFullYear()}`;
}

/** The little paper-calendar date block. */
export function dateBlock(dateKey, color) {
  const date = fromDateKey(dateKey);
  return h('div', { class: 'upcoming__date', style: { '--event-color': color }, 'aria-hidden': 'true' },
    h('span', { class: 'upcoming__date-month' }, monthName(date.getMonth()).slice(0, 3)),
    h('span', { class: 'upcoming__date-day' }, String(date.getDate())),
    h('span', { class: 'upcoming__date-weekday' }, weekdayName(date.getDay(), true)));
}

/**
 * One event row.
 * @param {object} occurrence      from listOccurrences
 * @param {object} options
 *   me, isSelected
 *   compact                       (card) once you've answered, show your answer instead of buttons
 *   onOpen()                      click the row
 *   onRsvp(answer)                answer the RSVP (omit to hide the buttons)
 *   onOpenLink(link)              (personal homepage) open a group's event in the group
 */
export function renderEventRow(occurrence, { me, isSelected = false, onOpen, onRsvp, onOpenLink, compact = false }) {
  const { event } = occurrence;
  const visibility = VISIBILITY.find((v) => v.id === event.visibility);
  const myAnswer = rsvpOf(event, me.id);
  const meta = [occurrenceTimeLabel(occurrence), event.location].filter(Boolean).join(' · ');

  const row = h('article', {
    class: `upcoming__event upcoming__event--clickable${isSelected ? ' is-selected' : ''}`,
    'data-event-id': event.id,
    onClick: (clickEvent) => {
      if (clickEvent.target.closest('button, a')) return; // RSVP buttons, links
      onOpen?.();
    },
  },
    dateBlock(occurrence.date, colorValue(event.color)),
    h('div', { class: 'upcoming__body' },
      h('div', {},
        h('a', {
          href: '#',
          class: 'upcoming__title',
          onClick: (e) => { e.preventDefault(); onOpen?.(); },
        }, event.title),
        event.visibility !== 'group' ? h('span', { class: `event-badge event-badge--${event.visibility}` }, visibility?.label) : null,
        event._link && onOpenLink ? [' ', sourceTag(event._link, onOpenLink)] : null),
      meta ? h('span', { class: 'upcoming__meta' }, meta) : null,
      renderEventTags(event),
      h('span', { class: 'upcoming__meta' }, rsvpSummary(event)),
      availabilityChip(event, { date: occurrence.date }),
      onRsvp && !compact ? rsvpButtons(event, me.id, onRsvp, { compact: true }) : null,
      // Compact rows ask only until you answer, but buttons you just used stay so you can change your mind (rsvp.js).
      onRsvp && compact && (!myAnswer || answeredThisVisit(event.id)) ? rsvpButtons(event, me.id, onRsvp, { compact: true }) : null,
      compact && myAnswer && !answeredThisVisit(event.id) ? h('span', { class: 'upcoming__meta' }, answerLabel(myAnswer)) : null,
    ));
  return row;
}

function answerLabel(answer) {
  return { going: '✓ You\'re going', maybe: 'You said maybe', no: 'You can\'t go' }[answer];
}
