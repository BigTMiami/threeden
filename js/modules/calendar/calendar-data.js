// @ts-check
/**
 * calendar-data.js — calendar data, plus the rules shared by the homepage
 * card and the full-page calendar.
 *
 * A calendar holds two kinds of things (`kind`):
 *
 *   'entry'  a calendar entry: something to remember or do, like "Rent due"
 *            or "Plumber, 1–4". Just a time, a place, notes and who's
 *            involved. Seen by the calendar's group (or just you on your
 *            homepage). No RSVPs, no guests.
 *   'event'  an event: a gathering with a host, its own page and RSVPs, like
 *            "Thanksgiving dinner". Its group, the people invited, or anyone
 *            can see it (`visibility`). It belongs to one place: the
 *            calendar (or a blog's Upcoming events) of the group or blog
 *            hosting it. It also shows on the calendars of people who are
 *            going or invited (js/editor/linked-items.js).
 *
 * Item shape (both kinds):
 *   {
 *     id, title,
 *     kind,            // 'entry' | 'event' (older items: worked out by normalizeEvent)
 *     date,            // 'YYYY-MM-DD', the day it starts
 *     endDate,         // 'YYYY-MM-DD', the day it ends (same as `date` for one-day events)
 *     allDay,          // true = no times
 *     time, endTime,   // 'HH:MM' (24-hour) start and end, '' when allDay
 *     repeat,          // 'none' | 'daily' | 'weekly' | 'monthly'
 *     location, notes,
 *     color,           // one of EVENT_COLORS' ids
 *     attendeeIds,     // member ids: who's involved (entries) or who's going (events)
 *     createdBy,       // member id: who added it (an event's host). A group item
 *                      // you add also shows on your homepage calendar, unless
 *     hiddenFrom,      // member ids who unticked "Show on my calendar"
 *
 *   Events only (entries always have visibility 'group' and none of the rest):
 *     visibility,      // who can see it, one of VISIBILITY:
 *                      //   'group'  everyone in the hosting group
 *                      //   'invite' only the host and the people invited
 *                      //   'public' anyone; it shows up in search and Explore
 *     inviteeIds,      // people invited (any account, in the group or not)
 *     cohostIds,       // people hosting with the creator: the "Hosts" field
 *     hostGroupIds,    // groups hosting it: their members can edit it, and it
 *                      // shows on their calendars (js/editor/linked-items.js)
 *     sharedGroupIds,  // groups it was shared with: on their calendars, Upcoming
 *                      // events, and members' Dashboards (js/events/event-share.js)
 *     rsvps,           // { [memberId]: 'going' | 'maybe' | 'no' }  (Partiful-style RSVPs)
 *     rsvpAt,          // { [memberId]: when they said Going } (optional; regulars.js)
 *     capacity,        // most people who can say "going", or null for no limit
 *     timePoll,        // null, or a "Which time works?" poll (js/utils/polls.js) whose
 *                      // options have `when`; the host picks one and the event moves there
 *   }
 *
 * Older saved events only had { id, title, date, time, location };
 * `normalizeEvent` fills in the rest.
 *
 * Events can cover several days (`endDate` after `date`). Repeating events
 * are stored once. `occurrencesBetween` expands both into one "occurrence"
 * per day the event touches in a date range:
 *
 *   { event, date, startDate, dayNumber, dayCount }
 *     date       the day this occurrence is drawn on
 *     startDate  the day this repeat of the event began
 *     dayNumber  1 for the first day, 2 for the second, …
 *     dayCount   how many days the event covers (1 for one-day events)
 *
 * Editing a repeating event changes every occurrence.
 */

import { makeId } from '../../ui/dom.js';
import { addDays, addMonths, daysBetween, fromDateKey, formatTime, formatShortDate } from '../../utils/dates.js';

export const EVENT_COLORS = [
  { id: 'blue', label: 'Blue', value: '#3366cc' },
  { id: 'green', label: 'Green', value: '#14866d' },
  { id: 'orange', label: 'Orange', value: '#ac6600' },
  { id: 'purple', label: 'Purple', value: '#7b3fa0' },
  { id: 'red', label: 'Red', value: '#b32424' },
];

export const REPEAT_OPTIONS = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekly', label: 'Every week' },
  { id: 'monthly', label: 'Every month' },
];

export const DEFAULT_EVENT_LENGTH_MINUTES = 60;

/** The card's "Make an event" link asks the full page for this: open a new event. */
export const NEW_EVENT = 'new-event';

export const KINDS = [
  { id: 'entry', label: 'Calendar entry', description: 'Something to remember: a time, a place, who’s involved' },
  { id: 'event', label: 'Event', description: 'A gathering with a host, an event page, and RSVPs' },
];

export const VISIBILITY = [
  { id: 'group', label: 'Group members', description: 'Everyone in the group can see it and RSVP' },
  { id: 'invite', label: 'Invite only', description: 'Only you and the people you invite' },
  { id: 'public', label: 'Public', description: 'Anyone can find it and RSVP' },
];

export const RSVP_CHOICES = [
  { id: 'going', label: 'Going', emoji: '👍' },
  { id: 'maybe', label: 'Maybe', emoji: '🤔' },
  { id: 'no', label: 'Can’t go', emoji: '😢' },
];

export function colorValue(colorId) {
  return (EVENT_COLORS.find((c) => c.id === colorId) ?? EVENT_COLORS[0]).value;
}

// ─── Creating and reading events ─────────────────────────────────────────────

/** Is it an event (with RSVPs), rather than a plain calendar entry? */
export const isEvent = (item) => item.kind === 'event';

/**
 * Older items have no `kind`: anything with RSVPs, invitations, a limit,
 * or visibility beyond the group was an event; the rest are entries.
 */
function kindOf(item) {
  if (item.kind) return item.kind;
  const hasGuests = Object.keys(item.rsvps ?? {}).length > 0 || (item.inviteeIds ?? []).length > 0 || item.capacity;
  return hasGuests || ['invite', 'public'].includes(item.visibility) ? 'event' : 'entry';
}

export function normalizeEvent(event) {
  const allDay = event.allDay ?? !event.time;
  const kind = kindOf(event);
  // Entries are seen by the calendar's group and have no guests.
  const entryOnly = kind === 'entry' ? { visibility: 'group', inviteeIds: [], rsvps: {}, capacity: null } : {};
  return {
    allDay,
    endTime: allDay ? '' : event.endTime || addMinutesToTime(event.time, DEFAULT_EVENT_LENGTH_MINUTES),
    repeat: 'none',
    location: '',
    notes: '',
    color: 'blue',
    attendeeIds: [],
    createdBy: '',
    visibility: 'group',
    inviteeIds: [],
    rsvps: {},
    capacity: null,
    cohostIds: [], // co-hosts: same powers as the host (hostIdsOf)
    hostGroupIds: [], // groups hosting it with you: their members can edit it (canEditEvent in js/state/events.js)
    sharedGroupIds: [], // groups it was shared with (Share → Add to a group's calendar): on their calendars, members can see it
    hiddenFrom: [], // people who took it off their own homepage calendar ("Show on my calendar")
    waitlist: [], // in order; the first moves up when a spot opens (applyRsvp)
    area: null, // a place id from js/utils/places.js, for "events near me"
    tags: [], // ids from js/events/event-tags.js
    ...event,
    ...entryOnly,
    kind,
    time: allDay ? '' : event.time,
    // Never end before it starts (also covers older events with no endDate).
    endDate: event.endDate && event.endDate >= event.date ? event.endDate : event.date,
  };
}

// ─── Who can see it, and RSVPs ───────────────────────────────────────────────

/**
 * Can this member see the event? Invite-only events are hidden from
 * everyone but the host and the people invited.
 */
export function canSeeEvent(event, memberId, { publicOnly = false } = {}) {
  // Someone outside a group, looking at its public tab, sees public events only.
  if (publicOnly) return event.kind === 'event' && event.visibility === 'public';
  if (event.kind !== 'event' || event.visibility !== 'invite') return true;
  return isHostOf(event, memberId) || event.inviteeIds.includes(memberId) || event.attendeeIds.includes(memberId);
}

/** 'going' | 'maybe' | 'no' | null. Older events count attendees as going. */
export function rsvpOf(event, memberId) {
  return event.rsvps?.[memberId] ?? (event.attendeeIds.includes(memberId) ? 'going' : null);
}

/** Everyone's answers, attendees from older events counting as "going". */
export function allRsvps(event) {
  const answers = Object.fromEntries(event.attendeeIds.map((id) => [id, 'going']));
  return { ...answers, ...event.rsvps };
}

/** { going: ['m-leo'], maybe: [], no: [] } */
export function rsvpLists(event) {
  const lists = { going: [], maybe: [], no: [] };
  for (const [memberId, answer] of Object.entries(allRsvps(event))) lists[answer]?.push(memberId);
  return lists;
}

/** Invited but hasn't answered yet. */
export function awaitingReply(event) {
  const answered = allRsvps(event);
  return event.inviteeIds.filter((id) => !answered[id] && !(event.waitlist ?? []).includes(id));
}

export function isFull(event) {
  return event.capacity != null && event.capacity !== '' && rsvpLists(event).going.length >= Number(event.capacity);
}

/** Everyone who hosts it: the person who made it, then any co-hosts. */
export function hostIdsOf(event) {
  return [...new Set([event.createdBy, ...(event.cohostIds ?? [])].filter(Boolean))];
}
export const isHostOf = (event, memberId) => hostIdsOf(event).includes(memberId);

/** Where someone is on the waitlist (1 = next in), or 0 if they aren't on it. */
export function waitlistPlace(event, memberId) {
  return (event.waitlist ?? []).indexOf(memberId) + 1;
}

/** Move people up from the waitlist while there's room. Returns who moved up. Changes `event`. */
export function promoteWaitlist(event) {
  const moved = [];
  while ((event.waitlist ?? []).length && !isFull(event)) {
    const next = event.waitlist.shift();
    event.rsvps = { ...event.rsvps, [next]: 'going' };
    event.attendeeIds = [...new Set([...(event.attendeeIds ?? []), next])];
    moved.push(next);
  }
  return moved;
}

/**
 * Answer an RSVP (changes `event` in place). 'waitlist' joins the waitlist
 * of a full event; leaving Going lets the first person waiting in. Saying "going" also adds you
 * to the attendees, which is what puts the event on your own calendar.
 * Passing null takes your answer back.
 */
export function applyRsvp(event, memberId, answer) {
  const wasGoing = rsvpOf({ attendeeIds: [], ...event }, memberId) === 'going';
  event.waitlist = (event.waitlist ?? []).filter((id) => id !== memberId);
  // 'waitlist': it's full, so get in line (no other answer while waiting).
  if (answer === 'waitlist') {
    event.rsvps = { ...event.rsvps };
    delete event.rsvps[memberId];
    event.attendeeIds = (event.attendeeIds ?? []).filter((id) => id !== memberId);
    event.waitlist.push(memberId);
    if (wasGoing) promoteWaitlist(event);
    return;
  }
  event.rsvps = { ...event.rsvps };
  if (answer) event.rsvps[memberId] = answer;
  else delete event.rsvps[memberId];
  const going = answer === 'going';
  // When they started going, so a repeating event can count their visits (js/events/regulars.js).
  if (going && !wasGoing) event.rsvpAt = { ...event.rsvpAt, [memberId]: Date.now() };
  event.attendeeIds = going
    ? [...new Set([...event.attendeeIds, memberId])]
    : event.attendeeIds.filter((id) => id !== memberId);
  // A spot opened up: the next person waiting gets it (they're told: watchWaitlists in event-followups.js).
  if (wasGoing && !going) promoteWaitlist(event);
}

/** How many calendar days the event touches (1 for a one-day event). */
export function dayCountOf(event) {
  return daysBetween(event.date, event.endDate) + 1;
}

export function isMultiDay(event) {
  return event.endDate !== event.date;
}

/** A new event. `createdAt` lets the Feed show friends' newly announced events. */
export function createEvent(fields) {
  return normalizeEvent({ id: makeId('ev'), createdAt: Date.now(), ...fields });
}

/**
 * The event's whole time span:
 *   'All day'                         'Nov 14 – Nov 16' (all-day, several days)
 *   '7:00 – 8:30pm'                   'Nov 14, 7:00pm – Nov 16, 11:00am'
 */
export function timeRangeLabel(event) {
  if (isMultiDay(event)) {
    if (event.allDay) return `${formatShortDate(event.date)} – ${formatShortDate(event.endDate)}`;
    return `${formatShortDate(event.date)}, ${formatTime(event.time)} – ${formatShortDate(event.endDate)}, ${formatTime(event.endTime)}`;
  }
  if (event.allDay) return 'All day';
  if (!event.endTime) return formatTime(event.time);
  const start = formatTime(event.time);
  const end = formatTime(event.endTime);
  // Drop the first "am"/"pm" when both halves share it: "7:00 – 8:30pm".
  const sameHalf = start.slice(-2) === end.slice(-2);
  return `${sameHalf ? start.slice(0, -2) : start} – ${end}`;
}

// ─── Times ───────────────────────────────────────────────────────────────────

/** '19:30' → 1170 (minutes after midnight). */
export function timeToMinutes(time) {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** 1170 → '19:30'. Clamped to the same day (00:00–23:59). */
export function minutesToTime(totalMinutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function addMinutesToTime(time, minutes) {
  return minutesToTime(timeToMinutes(time) + minutes);
}

/** How long a one-day event lasts in minutes (at least 15, so short events stay visible). */
export function durationMinutes(event) {
  return Math.max(15, timeToMinutes(event.endTime) - timeToMinutes(event.time));
}

/**
 * What one day of an event looks like, for lists and labels:
 *   one-day event          → its time range ('7:00 – 8:30pm', 'All day')
 *   first day of several   → 'From 7:00pm' (or 'Starts' if all-day)
 *   middle day             → 'All day'
 *   last day               → 'Until 11:00am' (or 'Ends' if all-day)
 */
export function occurrenceTimeLabel({ event, dayNumber, dayCount }) {
  if (dayCount === 1) return timeRangeLabel(event);
  const progress = `day ${dayNumber} of ${dayCount}`;
  if (event.allDay) return `All day · ${progress}`;
  if (dayNumber === 1) return `From ${formatTime(event.time)} · ${progress}`;
  if (dayNumber === dayCount) return `Until ${formatTime(event.endTime)} · ${progress}`;
  return `All day · ${progress}`;
}

/**
 * Should this occurrence go in the all-day row (true) or the hour-by-hour
 * grid (false)? All-day events and anything spanning several days go up
 * top, so a 3-day trip reads as one band rather than three tall blocks.
 */
export function belongsInAllDayRow({ event, dayCount }) {
  return event.allDay || dayCount > 1;
}

// ─── Repeating events ────────────────────────────────────────────────────────

/** Does a repeat of `event` start on `dateKey`? (For multi-day events, the first day.) */
export function startsOn(event, dateKey) {
  if (dateKey < event.date) return false;
  if (dateKey === event.date) return true;

  switch (event.repeat) {
    case 'daily':
      return true;
    case 'weekly':
      return daysBetween(event.date, dateKey) % 7 === 0;
    case 'monthly': {
      // Same day of the month (an event on the 31st skips shorter months).
      return fromDateKey(event.date).getDate() === fromDateKey(dateKey).getDate();
    }
    default:
      return false;
  }
}

/**
 * Every occurrence of every event between two dates (inclusive): one per
 * day each event touches (see the top of this file). Sorted by day, then
 * all-day and multi-day events first, then start time.
 */
export function occurrencesBetween(events, startKey, endKey) {
  const occurrences = [];
  for (const event of events) {
    const dayCount = dayCountOf(event);
    // A repeat that started a few days before the range can still reach into it.
    for (const startDate of startDatesOf(event, addDays(startKey, -(dayCount - 1)), endKey)) {
      for (let dayNumber = 1; dayNumber <= dayCount; dayNumber++) {
        const date = addDays(startDate, dayNumber - 1);
        if (date >= startKey && date <= endKey) {
          occurrences.push({ event, date, startDate, dayNumber, dayCount });
        }
      }
    }
  }
  return occurrences.sort(compareOccurrences);
}

/** The days a repeat of `event` starts on, within the range. */
function startDatesOf(event, startKey, endKey) {
  if (event.date > endKey) return [];
  if (event.repeat === 'none') return event.date >= startKey ? [event.date] : [];

  const dates = [];
  const step = {
    daily: (key) => addDays(key, 1),
    weekly: (key) => addDays(key, 7),
    monthly: (key) => addMonths(key, 1),
  }[event.repeat];

  for (let key = event.date; key <= endKey; key = step(key)) {
    if (key >= startKey && startsOn(event, key)) dates.push(key);
  }
  return dates;
}

function compareOccurrences(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const aTop = belongsInAllDayRow(a);
  const bTop = belongsInAllDayRow(b);
  if (aTop !== bTop) return aTop ? -1 : 1;
  return a.event.time.localeCompare(b.event.time);
}

/** Occurrences on a single day. */
export function occurrencesOn(events, dateKey) {
  return occurrencesBetween(events, dateKey, dateKey);
}

// ─── Laying out overlapping events ───────────────────────────────────────────

/**
 * For the week and day views: side-by-side columns ("lanes") for timed
 * events that overlap, so none hide another.
 *
 * Takes one day's timed occurrences; returns each with `lane` (0, 1, …) and
 * `laneCount` (how many lanes its overlapping cluster needs).
 */
export function assignLanes(occurrences) {
  const sorted = [...occurrences].sort((a, b) => timeToMinutes(a.event.time) - timeToMinutes(b.event.time));
  const result = [];
  let cluster = [];
  let clusterEnd = -1;

  const finishCluster = () => {
    const laneCount = Math.max(1, ...cluster.map((item) => item.lane + 1));
    cluster.forEach((item) => result.push({ ...item, laneCount }));
    cluster = [];
  };

  for (const occurrence of sorted) {
    const start = timeToMinutes(occurrence.event.time);
    const end = start + durationMinutes(occurrence.event);

    if (start >= clusterEnd && cluster.length) finishCluster();

    // Use the first lane that's free at this start time.
    const busyLanes = new Set(cluster
      .filter((item) => item.end > start)
      .map((item) => item.lane));
    let lane = 0;
    while (busyLanes.has(lane)) lane++;

    cluster.push({ ...occurrence, lane, end });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) finishCluster();
  return result;
}
