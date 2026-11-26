// Prints two of the web app's demo groups as JSON, for the server's seeder
// (server/seed/load.py). Run by `make seed`, in a Node container that sees
// prod/web at /srv/web, with TZ set to your Mac's time zone (the demo's dates
// are relative to today).
//
//   14 Juniper Lane       a private household: Leo, Maya, Theo, Owen
//   Eastside Mutual Aid   a public group with public events
//
// Output: { timeZone, people: [...], spaces: [{ ..., members, events }] }.
// Keys are the prototype's ids ('m-leo', 'juniper', 'house-ev-2'); the
// seeder turns them into fixed UUIDs.

import { createHouse } from '../../web/js/data/demo/house.js';
import { createMutualAid } from '../../web/js/data/demo/mutual-aid.js';
import { PEOPLE } from '../../web/js/data/demo/people.js';
import { normalizeEvent, rsvpOf } from '../../web/js/modules/calendar/calendar-data.js';

const spaces = [createHouse(), createMutualAid()];
const people = new Map(PEOPLE.map((p) => [p.id, p]));
const used = new Set();
const known = (id) => people.has(id) && (used.add(id), true);

function exportEvent(raw) {
  const e = normalizeEvent(raw);
  const rsvps = {};
  for (const id of new Set([...Object.keys(e.rsvps), ...e.attendeeIds])) {
    const answer = rsvpOf(e, id);
    if (answer && known(id)) rsvps[id] = answer;
  }
  return {
    key: e.id,
    kind: e.kind,
    title: e.title,
    date: e.date,
    endDate: e.endDate,
    allDay: e.allDay,
    time: e.time,
    endTime: e.endTime,
    repeat: e.repeat, // loaded as one date for now
    location: e.location,
    notes: e.notes,
    color: e.color,
    visibility: e.visibility,
    capacity: e.capacity ? Number(e.capacity) : null,
    createdBy: known(e.createdBy) ? e.createdBy : null,
    inviteeIds: e.inviteeIds.filter(known),
    // Entries have no RSVPs (attendees there just mean "involved").
    rsvps: e.kind === 'event' ? rsvps : {},
  };
}

const out = spaces.map((space) => ({
  key: space.id,
  kind: space.kind,
  name: space.name,
  description: space.description ?? '',
  visibility: space.visibility === 'public' ? 'public' : 'private',
  permissions: space.permissions ?? {},
  members: space.memberIds.filter(known).map((id) => ({ key: id, role: space.roles?.[id] ?? 'member' })),
  events: space.modules
    .filter((m) => m.type === 'calendar')
    .flatMap((m) => m.data.events ?? [])
    .map(exportEvent),
}));

const result = {
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  people: [...used].map((id) => {
    const p = people.get(id);
    return { key: id, name: p.name, username: p.username, email: p.email };
  }),
  spaces: out,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
