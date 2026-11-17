// @ts-check
/**
 * helpers.js — small tools the demo data files share.
 *
 * Dates are worked out from today, so the calendars and due dates in the
 * demo always look current.
 */

import { toDateKey } from '../../utils/dates.js';

/** A date `days` from today, as 'YYYY-MM-DD'. Negative = in the past. */
export function daysFromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** Milliseconds timestamp for `hours` ago. */
export function hoursAgo(hours) {
  return Date.now() - hours * 60 * 60 * 1000;
}

/** The next given weekday after today, as 'YYYY-MM-DD' (0 = Sunday … 6 = Saturday). */
export function nextWeekday(weekday) {
  const date = new Date();
  date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7 || 7));
  return toDateKey(date);
}

/**
 * The next Thanksgiving (the fourth Thursday of November) that hasn't
 * happened yet, as a Date.
 */
export function nextThanksgiving() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let year = today.getFullYear(); ; year++) {
    const firstOfNovember = new Date(year, 10, 1);
    const firstThursday = 1 + ((4 - firstOfNovember.getDay() + 7) % 7);
    const thanksgiving = new Date(year, 10, firstThursday + 21);
    if (thanksgiving >= today) return thanksgiving;
  }
}

/** `date` moved by `days`, as 'YYYY-MM-DD'. */
export function shiftDate(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return toDateKey(copy);
}

/** Who made and last changed a vault item, and when (`hours` ago). */
export function touched(memberId, hours) {
  return { createdBy: memberId, updatedBy: memberId, updatedAt: hoursAgo(hours) };
}

/** A to-do task. */
export function task(id, text, fields = {}) {
  return { id, text, done: false, assigneeIds: [], due: '', priority: '', notes: '', subtasks: [], createdAt: hoursAgo(24), ...fields };
}

/** A calendar entry (pass kind: 'event' and RSVP fields for an event; see calendar-data.js). */
export function event(id, title, date, fields = {}) {
  return {
    id, title, date, allDay: false, time: '', endTime: '', location: '', notes: '', color: 'blue',
    attendeeIds: [], repeat: 'none', createdBy: '', ...fields,
  };
}

/** A grocery list item. */
export function groceryItem(id, name, category, addedBy, fields = {}) {
  return {
    id, name, quantity: '', category, note: '', addedBy, claimedBy: '', bought: false, boughtBy: '', boughtAt: 0,
    createdAt: hoursAgo(10), ...fields,
  };
}

/** An announcement. */
export function post(id, authorId, title, body, fields = {}) {
  return { id, authorId, title, body, pinned: false, createdAt: hoursAgo(24), seenBy: [], comments: [], ...fields };
}

/** A chat or direct message, sent `minutes` ago. */
export function message(id, authorId, minutes, body, reactions = {}) {
  return { id, authorId, body, createdAt: Date.now() - minutes * 60 * 1000, editedAt: null, deleted: false, reactions };
}

/** A kanban card. */
export function card(id, columnId, title, fields = {}) {
  return { id, columnId, title, description: '', assigneeIds: [], due: '', color: '', createdAt: hoursAgo(24), ...fields };
}

/** A forum thread. */
export function thread(id, authorId, title, body, fields = {}) {
  return { id, authorId, title, body, tag: '', createdAt: hoursAgo(24), votes: { [authorId]: 1 }, replies: [], followers: [authorId], ...fields };
}

/** A forum reply. */
export function reply(id, authorId, body, fields = {}) {
  return { id, authorId, body, createdAt: hoursAgo(12), votes: {}, ...fields };
}
