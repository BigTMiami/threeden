// @ts-check
/**
 * sync.js — server mode's copy of your groups and their events (Cycle 4).
 *
 * The app's views all read local data (js/state/store.js). In server mode,
 * this file keeps a copy of what the server says in that local data, so the
 * calendar, Upcoming events, Up next, the event page, and the RSVP buttons
 * work unchanged:
 *
 *   syncFromServer()        your groups (GET /v1/me/spaces), their members,
 *                           and their events, copied in as groups marked
 *                           `server: true`, with Up next, Calendar, and
 *                           Upcoming events modules. Called after sign-in
 *                           and on each load.
 *   fetchServerEvent(id)    one event you have a link to (a public event of a
 *                           group you're not in), for the event page.
 *   forgetServerData()      remove the copies (signing out, switching modes).
 *
 * RSVPs: every RSVP button saves through the store, so one watcher
 * (onModuleDataChange) sees your answer to a server event change and sends
 * it (PUT /v1/events/{id}/rsvp). The answer shows at once; if the server
 * refuses, the old one comes back with a toast saying why.
 *
 * Ids: a server group or event keeps its server id; a person is
 * "m-<account id>", as for your own account (js/state/accounts.js). People
 * copied in for their names are marked `serverPerson`.
 *
 * Anything else changed in a server group (editing an event, adding a
 * module) stays in this browser for now; the group's header says so
 * (js/editor/space-header.js).
 */

import { api, ApiError } from './client.js';
import { changeState, getState, getCurrentUser, getModule, getSpaceOfModule, onModuleDataChange } from '../state/store.js';
import { AVATAR_COLORS, initialsFor } from '../state/accounts.js';
import { upNextStarter } from '../data/starters.js';
import { normalizeEvent, rsvpOf } from '../modules/calendar/calendar-data.js';
import { addDays } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAST_DAYS = 60; // the calendar can look back this far
const FUTURE_DAYS = 180;

export const memberIdOf = (accountId) => `m-${accountId}`;
const calendarIdOf = (spaceId) => `${spaceId}--calendar`;

/** Is this one of the server's ids (a UUID), rather than a local one like 'ev-3'? */
export const isServerId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '');

// ─── Server shapes → local shapes ───────────────────────────────────────────

/** 'YYYY-MM-DD' and 'HH:MM' of a moment, on the clock where the event happens. */
function wallClock(iso, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** A server event in the prototype's item shape (calendar-data.js). */
export function toLocalEvent(e) {
  const start = wallClock(e.starts_at, e.time_zone);
  const end = e.ends_at ? wallClock(e.ends_at, e.time_zone) : start;
  // All day: the server's end is the midnight after the last day.
  const endDate = e.all_day && e.ends_at ? addDays(end.date, -1) : end.date;
  const rsvps = Object.fromEntries(e.rsvps.map((r) => [memberIdOf(r.account.id), r.answer]));
  return normalizeEvent({
    id: e.id,
    server: true,
    version: e.version,
    kind: e.kind,
    title: e.title,
    date: start.date,
    endDate: endDate < start.date ? start.date : endDate,
    allDay: e.all_day,
    time: e.all_day ? '' : start.time,
    endTime: e.all_day ? '' : end.time,
    repeat: 'none',
    location: e.location,
    notes: e.notes,
    color: e.color,
    visibility: e.visibility,
    capacity: e.capacity,
    createdBy: e.host ? memberIdOf(e.host.id) : '',
    inviteeIds: e.invitees.map((p) => memberIdOf(p.id)),
    rsvps,
    attendeeIds: Object.keys(rsvps).filter((id) => rsvps[id] === 'going'),
    waitlist: [],
  });
}

/** Everyone a server reply mentions, for their names and faces. */
function peopleIn({ members = [], events = [] }) {
  const people = new Map();
  for (const m of members) people.set(m.account.id, m.account);
  for (const e of events) {
    for (const r of e.rsvps) people.set(r.account.id, r.account);
    for (const p of e.invitees) people.set(p.id, p);
    if (e.host) people.set(e.host.id, e.host);
  }
  return [...people.values()];
}

/** Add or update people (in a changeState). Accounts signed in here keep their own record. */
function putPeople(state, people) {
  for (const person of people) {
    const id = memberIdOf(person.id);
    const existing = state.members.find((m) => m.id === id);
    if (existing) {
      if (existing.name !== person.name || existing.username !== person.username) {
        Object.assign(existing, { name: person.name, username: person.username, initials: initialsFor(person.name) });
      }
      continue;
    }
    state.members.push({
      id, name: person.name, username: person.username, email: '', initials: initialsFor(person.name),
      color: AVATAR_COLORS[state.members.length % AVATAR_COLORS.length], bio: '', password: null,
      server: true, serverPerson: true, createdAt: Date.now(),
    });
  }
}

/** A new local copy of a server group: Up next, Upcoming events, and the Calendar. */
function newGroupCopy(space) {
  return {
    id: space.id, server: true, slug: space.slug ?? null, kind: 'group', groupType: '',
    name: space.name, description: space.description ?? '', visibility: space.visibility, joining: 'admins',
    memberIds: [], roles: {}, permissions: {}, appearance: {}, joinRequests: [],
    modules: [
      upNextStarter(`${space.id}--upnext`),
      { id: `${space.id}--events`, type: 'events', title: 'Upcoming events', span: 8, rows: 12, data: { events: [], ownEvents: false } },
      { id: calendarIdOf(space.id), type: 'calendar', title: 'Calendar', span: 4, rows: 12, data: { events: [] } },
    ],
  };
}

/** The calendar module of a group copy, added back if it was removed. */
function calendarOf(copy) {
  let calendar = copy.modules.find((m) => m.id === calendarIdOf(copy.id));
  if (!calendar) {
    calendar = { id: calendarIdOf(copy.id), type: 'calendar', title: 'Calendar', span: 4, rows: 12, data: { events: [] } };
    copy.modules.push(calendar);
  }
  return calendar;
}

// ─── Reading from the server ────────────────────────────────────────────────

let syncing = null;

/**
 * Copy your groups and their events from the server. Groups you've left
 * disappear; your own changes to a group's layout are kept.
 */
export function syncFromServer() {
  syncing ??= (async () => {
    try {
      const me = getCurrentUser();
      if (!me?.server) return;
      const from = new Date(Date.now() - PAST_DAYS * DAY_MS).toISOString();
      const to = new Date(Date.now() + FUTURE_DAYS * DAY_MS).toISOString();
      const spaces = await api('/v1/me/spaces');
      const groups = await Promise.all(spaces.map(async (space) => {
        const [members, events] = await Promise.all([
          api(`/v1/spaces/${space.id}/members`),
          api(`/v1/spaces/${space.id}/events?${new URLSearchParams({ from, to })}`),
        ]);
        return { space, members, events };
      }));
      changeState((state) => {
        putPeople(state, groups.flatMap(peopleIn));
        const mine = new Set(spaces.map((s) => s.id));
        // Gone: groups you're no longer in (a public event you opened by link stays until sign-out).
        state.spaces = state.spaces.filter((s) => !s.server || mine.has(s.id) || s.serverVisit);
        for (const { space, members, events } of groups) {
          let copy = state.spaces.find((s) => s.id === space.id);
          if (!copy) { copy = newGroupCopy(space); state.spaces.push(copy); }
          Object.assign(copy, {
            name: space.name, description: space.description, visibility: space.visibility, serverVisit: false,
            memberIds: members.map((m) => memberIdOf(m.account.id)),
            roles: Object.fromEntries(members.map((m) => [memberIdOf(m.account.id), m.role])),
          });
          const calendar = calendarOf(copy);
          // Your own local items in the calendar stay; the server's are replaced.
          calendar.data = { ...calendar.data, events: [...(calendar.data.events ?? []).filter((e) => !e.server), ...events.map(toLocalEvent)] };
        }
      }, 'account', 'space', 'layout');
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

const notThere = new Set(); // events the server said you can't see, so the page doesn't ask again

/**
 * Fetch one event that isn't in local data (a link to a public event, say).
 * Resolves true if it's now there, false if the server says no.
 * @param {string} eventId
 */
export async function fetchServerEvent(eventId) {
  if (!isServerId(eventId) || notThere.has(eventId)) return false;
  let e;
  try {
    e = await api(`/v1/events/${eventId}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notThere.add(eventId);
    return false;
  }
  changeState((state) => {
    putPeople(state, peopleIn({ events: [e] }));
    let copy = state.spaces.find((s) => s.id === e.space.id);
    // A group you're not in: a copy holding just the events you've opened.
    if (!copy) { copy = { ...newGroupCopy(e.space), serverVisit: true }; state.spaces.push(copy); }
    const calendar = calendarOf(copy);
    calendar.data = { ...calendar.data, events: [...(calendar.data.events ?? []).filter((x) => x.id !== e.id), toLocalEvent(e)] };
  }, 'space', 'layout');
  return true;
}

/** Remove everything copied from the server (on sign-out, or switching to demo mode). */
export function forgetServerData() {
  notThere.clear();
  const state = getState();
  if (!state.spaces.some((s) => s.server) && !state.members.some((m) => m.serverPerson)) return;
  changeState((s) => {
    s.spaces = s.spaces.filter((space) => !space.server);
    s.members = s.members.filter((m) => !m.serverPerson);
  }, 'account', 'space', 'layout');
}

// ─── Sending RSVPs ──────────────────────────────────────────────────────────

/** What the views show of an event, to tell whether the server's copy needs a redraw. */
const shown = (e) => JSON.stringify([
  Object.entries(e.rsvps ?? {}).sort(), e.title, e.date, e.time, e.endDate, e.endTime, e.location, e.notes, e.capacity,
]);

/**
 * Put the server's (or the earlier) copy of an event into its calendar, and
 * redraw if that changes what's on screen. It doesn't count as a change of
 * yours (it skips the onModuleDataChange watchers).
 */
function putEvent(moduleId, event) {
  const module = getModule(moduleId);
  const current = module?.data.events?.find((e) => e.id === event.id);
  if (!module || !current) return;
  const redraw = shown(normalizeEvent(current)) !== shown(event);
  changeState(() => {
    module.data = { ...module.data, events: module.data.events.map((e) => (e.id === event.id ? event : e)) };
  }, ...(redraw ? ['account', 'layout'] : []));
}

const queues = new Map(); // eventId → the last send, so answers go in order

function sendRsvp(moduleId, before, answer) {
  const previous = queues.get(before.id) ?? Promise.resolve();
  const next = previous.then(async () => {
    const current = getModule(moduleId)?.data.events?.find((e) => e.id === before.id);
    try {
      const saved = await api(`/v1/events/${before.id}/rsvp`, { method: 'PUT', body: { answer, version: current?.version ?? before.version } });
      putEvent(moduleId, toLocalEvent(saved));
    } catch (error) {
      putEvent(moduleId, before);
      showToast(error instanceof ApiError ? error.message : 'Your answer wasn’t saved.');
      // Changed or full: show the event as it is now.
      if (error instanceof ApiError && error.status === 409) {
        api(`/v1/events/${before.id}`).then((e) => putEvent(moduleId, toLocalEvent(e))).catch(() => {});
      }
    }
  });
  queues.set(before.id, next);
  next.finally(() => { if (queues.get(before.id) === next) queues.delete(before.id); });
}

/**
 * Watch saves to server groups' calendars for your answers. Called once, by
 * server-mode.js; `isConnected()` is false when the server couldn't be
 * reached at start-up (then answers are put back, not kept only here).
 * @param {() => boolean} isConnected
 */
export function watchRsvps(isConnected) {
  onModuleDataChange((module, before, after) => {
    const me = getCurrentUser();
    if (!me || !getSpaceOfModule(module.id)?.server) return;
    const old = new Map((before?.events ?? []).map((e) => [e.id, e]));
    for (const raw of after?.events ?? []) {
      const was = old.get(raw.id);
      if (!raw.server || !was || raw === was) continue;
      const event = normalizeEvent(raw);
      if (rsvpOf(event, me.id) === rsvpOf(normalizeEvent(was), me.id) && !(event.waitlist ?? []).includes(me.id)) continue;
      if (!isConnected() || !me.server) {
        putEvent(module.id, was);
        showToast('Couldn’t reach the 3den server, so your answer wasn’t saved.');
        continue;
      }
      if ((event.waitlist ?? []).includes(me.id)) {
        putEvent(module.id, was);
        showToast('Waitlists aren’t on the 3den server yet.');
        continue;
      }
      sendRsvp(module.id, was, rsvpOf(event, me.id));
    }
  });
}
