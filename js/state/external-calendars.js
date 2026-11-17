// @ts-check
/**
 * external-calendars.js — your other calendars (Google, Apple, Outlook),
 * so 3den can tell you whether you're free for an event.
 *
 *   member.calendars = [{
 *     id, name: 'Work', provider: 'google' | 'apple' | 'outlook' | 'file',
 *     url: 'https://…/basic.ics' | null,   ← the calendar's private iCal address
 *     events: [{ title, date, endDate, time, endTime, allDay, repeat }],
 *     on: true,                            ← off: kept, but not checked
 *     syncedAt,
 *   }]
 *
 * Connecting works the way every calendar app allows without a sign-in
 * flow: paste the calendar's private iCal (.ics) address, or upload an
 * .ics file exported from the app. Only you see these calendars and their
 * event names; nobody else learns anything from them, not even "busy".
 * (A real 3den would refresh subscribed addresses on its server; the
 * prototype fetches them in the browser, which most calendar services
 * block, so uploading a file is the dependable way here.)
 *
 *   availabilityFor(me, event, date) → { status: 'free' | 'busy' | 'unknown', conflicts: [{ title, when, source }] }
 */

import { changeState, getMember } from './store.js';
import { makeId } from '../ui/dom.js';
import { parseIcs } from '../modules/calendar/calendar-import.js';
import { normalizeEvent, occurrencesBetween, rsvpOf, isHostOf } from '../modules/calendar/calendar-data.js';
import { myUpcoming } from '../modules/dashboard/dashboard-data.js';
import { todayKey, formatTime } from '../utils/dates.js';

export const PROVIDERS = {
  google: { label: 'Google Calendar', steps: 'In Google Calendar on a computer: Settings → pick the calendar → “Integrate calendar” → copy “Secret address in iCal format”.' },
  apple: { label: 'Apple Calendar (iCloud)', steps: 'On iCloud.com or a Mac: share the calendar as a “Public Calendar” and copy its link (it starts with webcal://).' },
  outlook: { label: 'Outlook', steps: 'In Outlook on the web: Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.' },
  file: { label: 'A calendar file (.ics)', steps: 'Export the calendar from any calendar app as an .ics file, then pick it here.' },
};

export const calendarsOf = (member) => member?.calendars ?? [];

function save(memberId, change) {
  changeState(() => {
    const member = getMember(memberId);
    member.calendars = change(structuredClone(member.calendars ?? []));
  }, 'account');
}

export function connectCalendar(memberId, { name, provider, url = null, text }) {
  const events = parseIcs(text);
  const calendar = { id: makeId('cal'), name: name || PROVIDERS[provider]?.label || 'Calendar', provider, url, events, on: true, syncedAt: Date.now() };
  save(memberId, (list) => [...list, calendar]);
  return calendar;
}

export function updateCalendar(memberId, id, changes) {
  save(memberId, (list) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)));
}

export function removeCalendar(memberId, id) {
  const before = calendarsOf(getMember(memberId)).find((c) => c.id === id);
  save(memberId, (list) => list.filter((c) => c.id !== id));
  return before;
}

export function restoreCalendar(memberId, calendar) {
  save(memberId, (list) => (list.some((c) => c.id === calendar.id) ? list : [...list, calendar]));
}

/** Fetch a calendar's .ics address (webcal:// works as https://). Throws when it can't be reached. */
export async function fetchIcs(url) {
  const address = url.trim().replace(/^webcal:\/\//i, 'https://');
  const response = await fetch(address, { credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('Not a calendar');
  return text;
}

export async function refreshCalendar(memberId, calendar) {
  if (!calendar.url) return false;
  const text = await fetchIcs(calendar.url);
  updateCalendar(memberId, calendar.id, { events: parseIcs(text), syncedAt: Date.now() });
  return true;
}

const toMinutes = (time) => {
  const [h, m] = String(time || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Timed blocks on `date` from your connected calendars that are switched on. All-day items (birthdays, holidays) don't count as busy. */
function externalBlocks(member, date) {
  const blocks = [];
  for (const calendar of calendarsOf(member)) {
    if (!calendar.on) continue;
    const events = calendar.events.map((e) => normalizeEvent({ id: `${calendar.id}-${e.title}-${e.date}-${e.time}`, kind: 'entry', ...e }));
    for (const o of occurrencesBetween(events, date, date)) {
      if (o.event.allDay || !o.event.time) continue;
      // Only the part of a multi-day item that falls on this date.
      const start = o.dayNumber === 1 ? toMinutes(o.event.time) : 0;
      const end = o.dayNumber === o.dayCount ? toMinutes(o.event.endTime || o.event.time) || 24 * 60 : 24 * 60;
      blocks.push({ start, end: Math.max(end, start + 15), title: o.event.title, source: calendar.name, time: o.event.time, endTime: o.event.endTime });
    }
  }
  return blocks;
}

/** What else you've said yes to on 3den that day (hosting, going, maybe, or on your own calendar). */
function threeDenBlocks(me, date, exceptEventId) {
  const days = Math.max(0, Math.round((Date.parse(`${date}T12:00`) - Date.parse(`${todayKey()}T12:00`)) / 864e5));
  return myUpcoming(me, days)
    .filter((o) => o.date === date && o.event.id !== exceptEventId && !o.event.allDay && o.event.time)
    .filter((o) => o.role !== 'invited')
    .map((o) => ({ start: toMinutes(o.event.time), end: Math.max(toMinutes(o.event.endTime || o.event.time), toMinutes(o.event.time) + 30), title: o.event.title, source: '3den', time: o.event.time, endTime: o.event.endTime }));
}

/**
 * Are you free for `event` on `date`? 'unknown' when no calendar is
 * connected and nothing on 3den clashes (we can't say you're free).
 */
export function availabilityFor(me, event, date = event.date) {
  if (!me || me.isGuest || !event || event.allDay || !event.time || date < todayKey()) return { status: 'unknown', conflicts: [] };
  const start = toMinutes(event.time);
  const end = Math.max(toMinutes(event.endTime || event.time), start + 30);
  const connected = calendarsOf(me).some((c) => c.on);
  const blocks = [...(connected ? externalBlocks(me, date) : []), ...threeDenBlocks(me, date, event.id)];
  const conflicts = blocks.filter((b) => b.start < end && b.end > start)
    .map((b) => ({ title: b.title, source: b.source, when: b.endTime ? `${formatTime(b.time)} – ${formatTime(b.endTime)}` : formatTime(b.time) }));
  if (conflicts.length) return { status: 'busy', conflicts };
  return { status: connected ? 'free' : 'unknown', conflicts: [] };
}

/** For tests and the settings page: is `event` something you're already in (so its own time isn't a clash)? */
export const isYours = (event, memberId) => isHostOf(event, memberId) || ['going', 'maybe'].includes(rsvpOf(event, memberId));

/** A sample calendar for trying this out (js/data/demo/sample-calendar.js). */
export { sampleIcs } from '../data/demo/sample-calendar.js';
