// @ts-check
/**
 * events-source.js — where an Upcoming events module gets its events.
 *
 * Upcoming events lists the *events* (gatherings with RSVPs) of its space,
 * not the plain calendar entries like "Rent due" (see KINDS in
 * calendar-data.js). It's another way of looking at a calendar, not a
 * second calendar. So:
 *
 *   - If its space has a Calendar module, it shows (and saves into) that
 *     calendar's events. Add an event in either and it's in both.
 *   - If there's no Calendar, it keeps its own list of events. (Add a
 *     Calendar later and those stay put; the module keeps using its own.)
 *   - On your personal homepage it also shows group events you're going
 *     or invited to, like your calendar does.
 *
 * Usage:
 *   const source = eventsSource(context);
 *   source.events()                → visible events, linked ones carrying `_link`
 *   source.change(event, fn)       → edit one event where it's saved
 *   source.add(event)              → save a new event
 *   source.remove(eventId)         → delete (own/calendar events only)
 *   source.calendar                → the calendar module it reads, or null
 */

import { getModule, getSpace, updateModuleData } from '../../state/store.js';
import { normalizeEvent, canSeeEvent, isEvent } from '../calendar/calendar-data.js';
import { getLinkedItems, updateLinkedItem } from '../../editor/linked-items.js';

/** The calendar module this events module shows, or null if it keeps its own. */
export function linkedCalendarOf(context) {
  const data = context.getData();
  if (data.ownEvents) return null;
  const space = getSpace(context.spaceId);
  const calendar = space?.modules.find((m) => m.type === 'calendar');
  return calendar ?? null;
}

export function eventsSource(context) {
  const calendar = linkedCalendarOf(context);
  const me = context.currentUser;

  /** The module whose `data.events` we read and write. */
  const home = () => (calendar ? getModule(calendar.id) : getModule(context.moduleId));

  function saveHome(changeFn) {
    const module = home();
    const data = structuredClone(module.data);
    data.events = data.events ?? [];
    changeFn(data);
    // Saved directly so a visitor's RSVP to a public event goes through;
    // the pages only offer editing to members.
    updateModuleData(module.id, data);
  }

  return {
    calendar,

    events() {
      // Outsiders on a public tab see public events only (not members looking at a shared calendar).
      const publicOnly = context.isVisitor && context.spaceKind === 'group' && !context.sharedFrom;
      const own = (home()?.data.events ?? []).map(normalizeEvent).filter((event) => isEvent(event) && canSeeEvent(event, me.id, { publicOnly }));
      const ownIds = new Set(own.map((e) => e.id));
      // In a group: what its calendar shows from elsewhere (hosted with it, or shared with it).
      const links = calendar && context.spaceKind === 'group' ? getLinkedItems(calendar.id) : context.getLinkedItems();
      const linked = links
        .filter((link) => !ownIds.has(link.itemId))
        .map((link) => ({ ...normalizeEvent(link.item), _link: link }))
        .filter(isEvent);
      return [...own, ...linked];
    },

    change(event, changeFn) {
      if (event._link) {
        updateLinkedItem(event._link, changeFn);
        return;
      }
      saveHome((data) => {
        const index = data.events.findIndex((e) => e.id === event.id);
        if (index === -1) return;
        const saved = normalizeEvent(data.events[index]);
        changeFn(saved);
        data.events[index] = saved;
      });
    },

    add(event) {
      saveHome((data) => { data.events.push(event); });
    },

    replace(event) {
      const { _link: link, ...fields } = event;
      if (link) {
        updateLinkedItem(link, (saved) => Object.assign(saved, fields));
        return;
      }
      saveHome((data) => {
        const index = data.events.findIndex((e) => e.id === event.id);
        if (index === -1) data.events.push(fields);
        else data.events[index] = fields;
      });
    },

    remove(eventId) {
      saveHome((data) => { data.events = data.events.filter((e) => e.id !== eventId); });
    },

    /** Everything in the module that holds the events, to put back with restore(). */
    snapshot: () => structuredClone(home().data),
    restore: (data) => (calendar ? updateModuleData(calendar.id, data) : context.saveData(data)),
  };
}
