// @ts-check
/**
 * events.js — finding calendar events wherever they live.
 *
 * Events are saved inside the modules that show them: a group's Calendar
 * module (and the Upcoming events module, which shows the same calendar
 * as a list). An event page (#event-<id>) or a public-event search needs
 * to find an event without knowing its module, so these helpers look
 * through every module whose data has an `events` list.
 *
 *   findEvent('ev-3')        → { event, moduleId, space } or null
 *   updateEvent('ev-3', (event) => { event.title = 'Potluck'; })
 *   getPublicEvents()        → upcoming public events from every group
 *   areaOf(member)           → { point, label, radiusMiles } from Account settings → Your area, or null
 *   eventsNear(occurrences, area) → { near, farther, unplaced } with each occurrence's distance
 *   canViewEvent(found, memberId)
 *   addConversationEvent(conversation, me, fields)   → a new event made in Messages
 */

import { placeById, distanceMiles } from '../utils/places.js';
import { getSpaces, getModule, getSpace, getMember, updateModuleData, changeState, getState } from './store.js';
import { normalizeEvent, canSeeEvent, rsvpOf, occurrencesBetween, createEvent } from '../modules/calendar/calendar-data.js';
import { makeId } from '../ui/dom.js';
import { todayKey, addDays } from '../utils/dates.js';

/** Every module that keeps events, with its space. */
function eventModules() {
  const found = [];
  for (const space of getSpaces()) {
    for (const module of space.modules) {
      if (Array.isArray(module.data?.events)) found.push({ module, space });
    }
  }
  return found;
}

export function findEvent(eventId) {
  for (const { module, space } of eventModules()) {
    const event = module.data.events.find((e) => e.id === eventId);
    if (event) return { event: normalizeEvent(event), moduleId: module.id, space };
  }
  return null;
}

/** Change an event where it's saved. `changeFn(event)` edits it in place. */
export function updateEvent(eventId, changeFn) {
  const found = findEvent(eventId);
  if (!found) return;
  const module = getModule(found.moduleId);
  const data = structuredClone(module.data);
  const index = data.events.findIndex((e) => e.id === eventId);
  const event = normalizeEvent(data.events[index]);
  changeFn(event);
  data.events[index] = event;
  updateModuleData(found.moduleId, data);
}

/**
 * Can this member open the event's page?
 *   public  → anyone
 *   group   → the group's members, plus anyone invited or who answered
 *   invite  → the host and the people invited
 */
export function canViewEvent({ event, space }, memberId) {
  if (event.visibility === 'public') return true;
  if (event.visibility === 'invite') return canSeeEvent(event, memberId);
  return space.memberIds.includes(memberId) || event.inviteeIds.includes(memberId) || Boolean(rsvpOf(event, memberId));
}

/** Public events in the next `daysAhead` days, soonest first, one entry per event. */
export function getPublicEvents(daysAhead = 120) {
  const start = todayKey();
  const results = [];
  for (const { module, space } of eventModules()) {
    // A blog whose owner turned blogs off is hidden, events and all.
    if (space.kind === 'blog' && getMember(space.memberIds[0])?.socialOff) continue;
    const events = module.data.events.map(normalizeEvent).filter((e) => e.visibility === 'public');
    const seen = new Set();
    for (const occurrence of occurrencesBetween(events, start, addDays(start, daysAhead))) {
      if (seen.has(occurrence.event.id) || occurrence.dayNumber !== 1) continue;
      seen.add(occurrence.event.id);
      results.push({ ...occurrence, moduleId: module.id, space });
    }
  }
  return results.sort((a, b) => a.date.localeCompare(b.date) || a.event.time.localeCompare(b.event.time));
}

// ─── Near you ────────────────────────────────────────────────────────────────

/**
 * Someone's area (member.location, set in Account settings → Your area):
 *   { placeId: 'juniper' }                       ← one of the known areas
 *   { lat, lng, label: 'Near Eastside' }         ← "use my current location"
 *   radiusMiles: 5 (or null for anywhere)
 * Returns { point: { lat, lng }, label, radiusMiles }, or null if not set.
 */
export function areaOf(member) {
  const location = member?.location;
  if (!location) return null;
  const place = location.placeId ? placeById(location.placeId) : null;
  const point = place ?? (location.lat != null ? { lat: location.lat, lng: location.lng } : null);
  if (!point) return null;
  return { point: { lat: point.lat, lng: point.lng }, label: place?.name ?? location.label ?? 'your location', radiusMiles: location.radiusMiles ?? null };
}

/**
 * Sort events by where they are, for someone in `area`:
 *   near      within the radius (each with .distance in miles), the rest of the list
 *   farther   placed, but outside the radius
 *   unplaced  no area given, so we can't tell
 * With no area set, everything counts as near.
 */
export function eventsNear(occurrences, area) {
  const result = { near: [], farther: [], unplaced: [] };
  for (const occurrence of occurrences) {
    const place = placeById(occurrence.event.area);
    if (!area) { result.near.push({ ...occurrence, distance: null, place }); continue; }
    if (!place) { result.unplaced.push({ ...occurrence, distance: null, place: null }); continue; }
    const distance = distanceMiles(area.point, place);
    const withDistance = { ...occurrence, distance, place };
    if (area.radiusMiles == null || distance <= area.radiusMiles) result.near.push(withDistance);
    else result.farther.push(withDistance);
  }
  return result;
}

/**
 * Make an event from a conversation's "+" menu and return it. Where it's saved:
 *   - a group's chat → that group's Calendar (a group event)
 *   - any other chat → your own calendar, invite-only, with everyone in the
 *     chat invited (it shows on their calendars too; see linked-items.js)
 * If there's no calendar to put it in, a Calendar module is added to your homepage.
 */
export function addConversationEvent(conversation, me, memberIds, fields) {
  const groupCalendar = conversation.spaceId
    ? getSpace(conversation.spaceId)?.modules.find((m) => m.type === 'calendar')
    : null;
  const event = createEvent({
    ...fields,
    kind: 'event',
    createdBy: me.id,
    attendeeIds: [me.id],
    rsvps: { [me.id]: 'going' },
    visibility: groupCalendar ? 'group' : 'invite',
    inviteeIds: groupCalendar ? [] : memberIds.filter((id) => id !== me.id),
  });

  if (groupCalendar) {
    updateModuleData(groupCalendar.id, { ...groupCalendar.data, events: [...(groupCalendar.data.events ?? []), event] });
    return event;
  }

  const personal = getState().spaces.find((s) => s.kind === 'personal' && s.memberIds[0] === me.id);
  let calendar = personal?.modules.find((m) => m.type === 'calendar');
  if (!calendar && personal) {
    calendar = { id: makeId('mod'), type: 'calendar', title: 'My calendar', span: 4, rows: 12, data: { events: [] } };
    changeState(() => { personal.modules.push(calendar); }, 'layout');
  }
  if (calendar) updateModuleData(calendar.id, { ...calendar.data, events: [...(calendar.data.events ?? []), event] });
  return event;
}
