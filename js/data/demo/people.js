// @ts-check
/**
 * people.js — the demo accounts.
 *
 * They have no password: on the sign-in screen you can pick any of them,
 * which is handy for seeing the app as an admin or as an ordinary member.
 * (See js/state/accounts.js for the account shape.)
 *
 *   demoOnline: shown as online in the demo (there's no server to say who
 *               really is; see js/state/presence.js)
 *   socialOff:  uses 3den just for groups, with blogs and the Feed turned off
 */

import { parseIcs } from '../../modules/calendar/calendar-import.js';
import { sampleIcs } from './sample-calendar.js';

// Leo's connected outside calendar (Account → Calendars; js/state/external-calendars.js).
const SAMPLE_CALENDAR = () => ({ id: 'cal-leo-work', name: 'Work (Google)', provider: 'google', url: null, events: parseIcs(sampleIcs()), on: true, syncedAt: Date.now() - 2 * 3600000 });

const person = (id, name, color, fields = {}) => {
  const [first, last = ''] = name.split(' ');
  return {
    id, name, color,
    username: first.toLowerCase(),
    email: `${first.toLowerCase()}@example.com`,
    initials: `${first[0]}${last[0] ?? ''}`.toUpperCase(),
    bio: '',
    password: null,
    ...fields,
  };
};

export const PEOPLE = [
  // Leo is who you are when the demo starts.
  // feedSeenAt: Leo last opened the Feed yesterday evening, so it shows what's new since then (and "You're caught up").
  person('m-leo', 'Leo L', '#3366CC', { bio: 'Urban policy student. Guitar in Porch Lights. Bikes everywhere.', helpWith: ['spreadsheets', 'charts', 'bike repair'], calendars: [SAMPLE_CALENDAR()], feedSeenAt: Date.now() - 20 * 60 * 60 * 1000 }),

  // His housemates at 14 Juniper Lane.
  person('m-maya', 'Maya Chen', '#7B3FA0', { demoOnline: true, helpWith: ['cooking', 'Cantonese', 'flyers'] }),
  person('m-theo', 'Theo Ramirez', '#14866D', { helpWith: ['driving', 'Spanish', 'moving'] }),
  person('m-owen', 'Owen Walsh', '#AC6600', { socialOff: true }),

  // Porch Lights, the band.
  person('m-jamal', 'Jamal Brooks', '#2F5D8A', { bio: 'Songs, porches, and the occasional banjo.', demoOnline: true }),
  person('m-iris', 'Iris Novak', '#C2185B', { instagramHandle: 'iris.novak', instagramFindable: true, helpWith: ['photos', 'design', 'drawing'] }),

  // The tenants union and the mutual aid group.
  // Priya lets anyone signed in comment on her blog (most people allow only friends).
  person('m-priya', 'Priya Nair', '#B32424', { instagramHandle: 'priya.organizes', instagramFindable: true, helpWith: ['tenant rights', 'public speaking'], bio: 'Tenant organizer on Juniper Lane.', blogSettings: { likes: true, comments: 'everyone', sharing: true } }),
  person('m-grace', 'Grace Okafor', '#14866D', { bio: 'Runs the Saturday pantry with Eastside Mutual Aid.', demoOnline: true, helpWith: ['driving', 'cooking', 'Yoruba'] }),

  // Leo's family, who all end up at Aunt Ingrid's for Thanksgiving.
  person('m-ingrid', 'Ingrid Larsen', '#8A5A3C', { bio: 'Hosting Thanksgiving since 1994.' }),
  person('m-joe', 'Joe Larsen', '#54595D'),
  person('m-nora', 'Nora Larsen', '#D9472B'),
  person('m-erik', 'Erik Larsen', '#3F8A3A'),
  person('m-bea', 'Bea Larsen-Ortiz', '#6B4A9A'),

  // People in the public groups Leo isn't in yet.
  person('m-marcus', 'Marcus Bell', '#2A6F97', { instagramHandle: 'marcus.bell', instagramFindable: true }),
  person('m-elena', 'Elena Park', '#9C4A6A', { instagramHandle: 'elena.park', instagramFindable: true }),

  // The classroom.
  person('m-hale', 'Dana Hale', '#202122', { email: 'hale@example.edu', username: 'hale', bio: 'Professor. Teaches Urban Policy 210.' }),
  person('m-sam', 'Sam Quinn', '#C2185B', { email: 'sam@example.edu' }),
  person('m-jordan', 'Jordan Tate', '#14866D', { instagramHandle: 'jordan_t', instagramFindable: true, email: 'jordan@example.edu' }),
];
