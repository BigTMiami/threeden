// @ts-check
/**
 * regulars.js — who's going, friends first, and who's a regular.
 *
 *   friendsFirst(ids, meId)    → you, then your friends, then everyone else
 *   friendsGoingLine(event, meId) → "Maya and 2 other friends are going" (or '')
 *   visitsOf(event, memberId)  → how many times they've come to a repeating event
 *   isRegular(event, memberId) → 3 visits or more
 *
 * A visit is a date of the repeating event that has passed while they were
 * Going (from when they said Going, `event.rsvpAt[memberId]`), minus the
 * dates they skipped (`event.skips[memberId]`), plus any visits from before
 * (`event.pastVisits[memberId]`, used by the sample data). A real 3den
 * would count check-ins; the prototype counts answers.
 */

import { getFriendIds } from '../state/friends.js';
import { getMember } from '../state/store.js';
import { rsvpOf, occurrencesBetween } from '../modules/calendar/calendar-data.js';
import { todayKey, addDays, toDateKey } from '../utils/dates.js';

export const VISITS_TO_BE_A_REGULAR = 3;

export function friendsFirst(ids, meId) {
  const friends = new Set(meId ? getFriendIds(meId) : []);
  const rank = (id) => (id === meId ? 0 : friends.has(id) ? 1 : 2);
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

export function friendsGoingLine(event, meId, goingIds) {
  if (!meId) return '';
  const friends = new Set(getFriendIds(meId));
  const going = goingIds.filter((id) => friends.has(id));
  if (!going.length) return '';
  const first = getMember(going[0])?.name.split(' ')[0] ?? 'A friend';
  if (going.length === 1) return `${first} is going`;
  if (going.length === 2) return `${first} and ${getMember(going[1])?.name.split(' ')[0] ?? 'a friend'} are going`;
  return `${first} and ${going.length - 1} other friends are going`;
}

export function visitsOf(event, memberId) {
  if (!event.repeat || event.repeat === 'none' || rsvpOf(event, memberId) !== 'going') return 0;
  const before = event.pastVisits?.[memberId] ?? 0;
  const since = event.rsvpAt?.[memberId] ? toDateKey(new Date(event.rsvpAt[memberId])) : event.date;
  const yesterday = addDays(todayKey(), -1);
  if (since > yesterday) return before;
  const skipped = new Set(event.skips?.[memberId] ?? []);
  return occurrencesBetween([event], since > event.date ? since : event.date, yesterday)
    .filter((o) => o.dayNumber === 1 && !skipped.has(o.date)).length + before;
}

export const isRegular = (event, memberId) => visitsOf(event, memberId) >= VISITS_TO_BE_A_REGULAR;
