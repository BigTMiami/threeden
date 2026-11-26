// @ts-check
/**
 * availability-chip.js — "Are you free?" on event cards.
 *
 *   [✓ You're free]                          nothing clashes in your calendars
 *   [⚠ Clashes with Dentist · 2:00 – 3:00pm]  (hover: every clash, and where it's from)
 *
 * Shown only when there's something to say: a clash (from a connected
 * calendar or another 3den event you said yes to), or "free" when at least
 * one calendar is connected. On an event's page, people with no calendar
 * connected also get a small "Connect your calendar" link.
 */

import { h } from './dom.js';
import { icon } from './icons.js';
import { getCurrentUser } from '../state/store.js';
import { availabilityFor, calendarsOf } from '../state/external-calendars.js';

/**
 * @param {any} event
 * @param {{ date?: string, offerConnect?: boolean }} [options]
 */
export function availabilityChip(event, { date = event?.date, offerConnect = false } = {}) {
  const me = getCurrentUser();
  if (!me || me.isGuest || !event) return null;
  const { status, conflicts } = availabilityFor(me, event, date);
  if (status === 'free') return h('span', { class: 'availability availability--free', title: 'Nothing else in your calendars then' }, icon('check', 12), ' You’re free');
  if (status === 'busy') {
    const [first] = conflicts;
    const more = conflicts.length > 1 ? ` and ${conflicts.length - 1} more` : '';
    return h('span', {
      class: 'availability availability--busy',
      title: conflicts.map((c) => `${c.title} · ${c.when} (${c.source === '3den' ? 'on 3den' : c.source})`).join('\n'),
    }, '⚠ Clashes with ', h('strong', {}, first.title), ` · ${first.when}${more}`);
  }
  if (offerConnect && !calendarsOf(me).length && event.time && !event.allDay) {
    return h('a', { class: 'availability availability--connect', href: '#account-calendars' }, icon('calendar', 12), ' Connect your calendar to see if you’re free');
  }
  return null;
}
