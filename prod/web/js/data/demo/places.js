// @ts-check
/**
 * places.js (demo) — where the demo's events are, and what they're about:
 * an area (js/utils/places.js) and tags (js/events/event-tags.js) for each
 * event, added after the groups are built. Also two public events out of
 * town, so "events near you" has something to leave out, and the demo
 * people's areas (Account settings → Your area).
 */

import { daysFromToday, nextWeekday } from './helpers.js';

const EVENT_DETAILS = {
  'tenants-ev-1': { area: 'crestline', tags: ['meeting', 'community'] },
  'tenants-ev-2': { area: 'juniper', tags: ['workshop', 'free', 'community'] },
  'tenants-ev-3': { area: 'crestline', tags: ['food', 'meeting'] },
  'band-ev-2': { area: 'juniper', tags: ['music', 'free', 'outdoors'] },
  'aid-ev-1': { area: 'eastside', tags: ['volunteering', 'food', 'free'] },
  'aid-ev-2': { area: 'eastside', tags: ['volunteering', 'party'] },
  'larsen-ev-dinner': { area: 'north-hills', tags: ['food', 'family'] },
  'u210-ev-trip': { area: 'downtown', tags: ['meeting'] },
  'soccer-ev-1': { area: 'riverside', tags: ['sports', 'outdoors', 'free'] },
  'bookclub-ev-1': { area: 'juniper', tags: ['arts', 'free'] },
  'parents-ev-1': { area: 'lincoln', tags: ['family', 'arts', 'volunteering'] },
  'supper-ev-1': { area: 'juniper', tags: ['food'] },
  'leo-ev-1': { area: 'eastside', tags: ['workshop', 'free', 'volunteering'] },
  'jamal-gig-1': { area: 'eastside', tags: ['music'] },
  'jamal-gig-2': { area: 'downtown', tags: ['music', 'party'] },
  'priya-ev-1': { area: 'juniper', tags: ['meeting', 'free'] },
};

/** Public events farther out: shown only with a big radius (or "Show them"). */
const OUT_OF_TOWN = {
  'soccer-calendar': {
    id: 'soccer-ev-2', kind: 'event', title: 'Regional tournament', date: daysFromToday(12), allDay: false, time: '09:00', endTime: '16:00',
    location: 'Maple Falls Sports Complex', area: 'maple-falls', tags: ['sports', 'outdoors'], notes: 'Carpools leave Riverside Park at 7:30.',
    color: 'green', createdBy: 'm-marcus', repeat: 'none', visibility: 'public', capacity: null, inviteeIds: [],
    rsvps: { 'm-marcus': 'going', 'm-erik': 'going' }, attendeeIds: ['m-marcus', 'm-erik'],
  },
  'bookclub-calendar': {
    id: 'bookclub-ev-2', kind: 'event', title: 'Author talk and signing', date: daysFromToday(9), allDay: false, time: '18:00', endTime: '19:30',
    location: 'Lake Ridge Public Library', area: 'lake-ridge', tags: ['arts', 'free'], notes: 'A field trip! Carpool sign-up in the forum.',
    color: 'purple', createdBy: 'm-elena', repeat: 'none', visibility: 'public', capacity: 60, inviteeIds: [],
    rsvps: { 'm-elena': 'going' }, attendeeIds: ['m-elena'],
  },
  'aid-calendar': {
    id: 'aid-ev-3', kind: 'event', title: 'Harbor cleanup', date: nextWeekday(0), allDay: false, time: '09:00', endTime: '12:00',
    location: 'Harbor pier 3', area: 'harbor', tags: ['volunteering', 'outdoors', 'free'], notes: 'Gloves and bags provided.', cover: { kind: 'preset', preset: 'harbor' },
    color: 'blue', createdBy: 'm-grace', repeat: 'none', visibility: 'public', capacity: null, inviteeIds: [],
    rsvps: { 'm-grace': 'going' }, attendeeIds: ['m-grace'],
  },
};

/** Where demo people are (only Leo is set, so the others show "Set your area"). */
export const DEMO_LOCATIONS = {
  'm-leo': { placeId: 'juniper', radiusMiles: 5 },
};

/** Give every demo event its area and tags, and add the out-of-town events. */
export function placeDemoEvents(spaces) {
  for (const space of spaces) {
    for (const module of space.modules) {
      if (!Array.isArray(module.data?.events)) continue;
      module.data.events = module.data.events.map((event) => ({ ...event, ...EVENT_DETAILS[event.id] }));
      if (OUT_OF_TOWN[module.id]) module.data.events.push(OUT_OF_TOWN[module.id]);
    }
  }
  return spaces;
}
