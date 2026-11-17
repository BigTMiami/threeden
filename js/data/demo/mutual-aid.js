// @ts-check
/**
 * mutual-aid.js — "Eastside Mutual Aid", a public volunteer group.
 *
 * Shows organizing and volunteering: a board of neighbors' requests, a
 * pantry list of what's running low, public events anyone can RSVP to, and
 * a "Coat drive" tab with a Gantt plan and a vault holding a checklist kept
 * as a to-do file.
 */

import { demoPhoto } from '../demo-photos.js';
import { daysFromToday, hoursAgo, nextWeekday, touched, post, card, groceryItem, task } from './helpers.js';

export function createMutualAid() {
  return {
    id: 'mutualaid',
    groupType: 'Mutual aid network',
    kind: 'group',
    name: 'Eastside Mutual Aid',
    visibility: 'public', joining: 'open',
    description: 'Neighbors helping neighbors: a free pantry every Saturday, rides, repairs, and a winter coat drive. Anyone can ask, anyone can help.',
    memberIds: ['m-grace', 'm-priya', 'm-leo', 'm-theo', 'm-nora'],
    roles: { 'm-grace': 'owner', 'm-priya': 'admin', 'm-leo': 'member', 'm-theo': 'member', 'm-nora': 'member' },
    // Leo joined last week, so he sees the "Welcome to…" checklist (welcome-checklist.js).
    joinedAt: { 'm-leo': hoursAgo(5 * 24) },
    intros: {
      'm-grace': 'Started the pantry in 2021. Ask me about anything food-related.',
      'm-priya': 'I do the schedules and the van. Text me if you can drive.',
      'm-theo': 'Retired carpenter. Happy to fix shelves or build a ramp.',
    },
    permissions: {},
    appearance: { font: 'friendly', accent: '#14866d', background: 'mint', cover: { kind: 'preset', preset: 'meadow', focus: 50, height: 'short' }, cards: 'bordered', corners: 'rounded' },
    joinRequests: [],
    tabs: [{ id: 'home', name: 'Home', visibility: 'public' }, { id: 'aid-tab-coats', name: 'Coat drive', visibility: 'public' }],
    modules: [
      // ─── Home ─────────────────────────────────────────────────────────────
      {
        id: 'aid-announcements', type: 'announcements', title: 'News', span: 8, rows: 11,
        data: {
          posts: [
            post('aid-post-1', 'm-grace', 'Coat drive starts this week', 'Drop off clean coats, hats, and gloves at the pantry on Saturdays, or ask for a pickup on the requests board. Kids’ sizes are the most needed.', { pinned: true, createdAt: hoursAgo(26), seenBy: ['m-priya', 'm-nora'] }),
            post('aid-post-2', 'm-priya', 'Thank you!', 'Last Saturday we served 86 households, our biggest week yet. Special thanks to the Larsen cousins for the van.', { createdAt: hoursAgo(120), seenBy: ['m-leo', 'm-grace', 'm-theo', 'm-nora'] }),
          ],
        },
      },
      {
        id: 'aid-calendar', type: 'calendar', title: 'Calendar', span: 4, rows: 11,
        data: {
          events: [
            {
              id: 'aid-ev-1', title: 'Saturday free pantry', date: nextWeekday(6), allDay: false, time: '10:00', endTime: '13:00', repeat: 'weekly',
              location: 'Eastside Library parking lot', color: 'green', createdBy: 'm-grace', visibility: 'public', capacity: null, inviteeIds: [],
              notes: 'Free groceries, no questions asked. Volunteers come at 9:15 to set up.', cover: { kind: 'image', image: demoPhoto('pantry', 'panorama'), focus: 50 },
              attendeeIds: ['m-grace', 'm-leo'], rsvps: { 'm-grace': 'going', 'm-leo': 'going', 'm-theo': 'maybe' },
              // Saturdays before the sample data starts (js/events/regulars.js): both are regulars.
              pastVisits: { 'm-grace': 14, 'm-leo': 5 },
              // Rides (js/events/event-rides.js): Theo drives, Iris needs one.
              rides: { drivers: { 'm-theo': 3 }, riders: { 'm-iris': null } },
            },
            // Last weekend's cleanup, already over: Leo went, so its page asks him for a recap (js/events/event-recap.js).
            {
              id: 'aid-ev-0', title: 'Riverside cleanup', date: daysFromToday(-2), allDay: false, time: '09:00', endTime: '12:00', repeat: 'none',
              location: 'Riverside Park, south lawn', color: 'blue', createdBy: 'm-grace', visibility: 'public', capacity: null, inviteeIds: [], area: 'riverside',
              notes: 'Gloves, bags, and coffee provided.', attendeeIds: ['m-grace', 'm-leo'], rsvps: { 'm-grace': 'going', 'm-leo': 'going', 'm-priya': 'going', 'm-theo': 'going' },
              photos: [
                { id: 'aid-ph-1', src: demoPhoto('leaves', 'tall'), by: 'm-leo', at: hoursAgo(40) },
                { id: 'aid-ph-2', src: demoPhoto('sunset', 'wide'), by: 'm-priya', at: hoursAgo(39) },
                { id: 'aid-ph-3', src: demoPhoto('pantry', 'square'), by: 'm-grace', at: hoursAgo(38) },
              ],
            },
            {
              id: 'aid-ev-2', title: 'Coat sorting party', date: daysFromToday(11), allDay: false, time: '18:00', endTime: '20:00', repeat: 'none',
              location: 'St. Mark’s church hall', color: 'orange', createdBy: 'm-priya', visibility: 'public', capacity: 25, inviteeIds: [],
              notes: 'Sort by size, check zippers, bag them up. Pizza provided.', cover: { kind: 'preset', preset: 'stripes' },
              attendeeIds: ['m-priya'], rsvps: { 'm-priya': 'going', 'm-nora': 'going', 'm-maya': 'maybe' },
            },
          ],
        },
      },
      {
        id: 'aid-requests', type: 'kanban', title: 'Requests', span: 8, rows: 12,
        data: {
          columns: [
            { id: 'aid-col-new', title: 'New' },
            { id: 'aid-col-matched', title: 'Someone’s on it' },
            { id: 'aid-col-done', title: 'Done' },
          ],
          cards: [
            card('aid-req-1', 'aid-col-new', 'Ride to a doctor’s appointment (Tue 10am)', { description: 'Wheelchair-friendly car needed.', due: daysFromToday(5), color: 'orange', createdAt: hoursAgo(8) }),
            card('aid-req-2', 'aid-col-new', 'Kids’ winter coats, sizes 6 and 8', { description: 'Family of four on Birch St.', color: 'blue', createdAt: hoursAgo(20) }),
            card('aid-req-3', 'aid-col-matched', 'Fix a flat on a delivery bike', { assigneeIds: ['m-leo'], due: daysFromToday(1), createdAt: hoursAgo(30) }),
            card('aid-req-4', 'aid-col-matched', 'Groceries for Mr. Haddad (recovering from surgery)', { assigneeIds: ['m-theo', 'm-nora'], color: 'green', createdAt: hoursAgo(50) }),
            card('aid-req-5', 'aid-col-done', 'Help moving a couch', { assigneeIds: ['m-leo', 'm-theo'], createdAt: hoursAgo(160) }),
          ],
        },
      },
      {
        id: 'aid-pantry', type: 'grocery', title: 'Pantry is low on', span: 4, rows: 12,
        data: {
          items: [
            groceryItem('aid-g-1', 'Rice', 'pantry', 'm-grace', { quantity: '20 lb', claimedBy: 'm-priya' }),
            groceryItem('aid-g-2', 'Canned beans', 'pantry', 'm-grace', { quantity: '2 cases' }),
            groceryItem('aid-g-3', 'Diapers (size 4)', 'household', 'm-nora'),
            groceryItem('aid-g-4', 'Cooking oil', 'pantry', 'm-grace', { claimedBy: 'm-leo' }),
            groceryItem('aid-g-5', 'Apples', 'produce', 'm-theo', { quantity: '2 boxes', note: 'The orchard on Route 9 donates seconds.' }),
          ],
          history: ['Rice', 'Rice', 'Pasta', 'Pasta', 'Peanut butter'],
        },
      },
      { id: 'aid-events', type: 'events', title: 'Come help', span: 12, rows: 8, data: { events: [], ownEvents: false } },
      // Volunteer shifts (js/modules/shifts/): this Saturday's are under way; next week's need people.
      {
        id: 'aid-shifts', type: 'shifts', title: 'Pantry shifts', span: 12, rows: 13,
        data: {
          shifts: [
            { id: 'aid-sh-1', date: daysFromToday(0), start: '08:30', end: '10:00', role: 'Setup', location: 'Pantry', spots: 3, memberIds: ['m-grace', 'm-theo', 'm-nora'] },
            { id: 'aid-sh-2', date: daysFromToday(0), start: '10:00', end: '12:00', role: 'Doors', location: 'Pantry', spots: 4, memberIds: ['m-grace', 'm-priya', 'm-leo'] },
            { id: 'aid-sh-3', date: daysFromToday(0), start: '12:00', end: '13:00', role: 'Cleanup', location: 'Pantry', spots: 2, memberIds: ['m-theo'] },
            { id: 'aid-sh-4', date: daysFromToday(6), start: '15:00', end: '17:00', role: 'Driver: orchard pickup', location: 'Van', spots: 1, memberIds: ['m-nora'], notes: 'Ask for Dale at the barn. About 25 crates.' },
            { id: 'aid-sh-5', date: daysFromToday(7), start: '08:30', end: '10:00', role: 'Setup', location: 'Pantry', spots: 3, memberIds: ['m-grace'] },
            { id: 'aid-sh-6', date: daysFromToday(7), start: '10:00', end: '12:00', role: 'Doors', location: 'Pantry', spots: 4, memberIds: ['m-priya'] },
            { id: 'aid-sh-7', date: daysFromToday(7), start: '12:00', end: '13:00', role: 'Cleanup', location: 'Pantry', spots: 2, memberIds: [] },
            { id: 'aid-sh-8', date: daysFromToday(3), start: '18:00', end: '20:00', role: 'Coat sorting', location: 'Grace’s garage', spots: 3, memberIds: ['m-grace'] },
          ],
        },
      },

      // ─── Coat drive ───────────────────────────────────────────────────────
      {
        id: 'aid-gantt', type: 'gantt', title: 'Coat drive plan', span: 12, rows: 10, tabId: 'aid-tab-coats',
        data: {
          tasks: [
            { id: 'ag-1', name: 'Spread the word (flyers, posts)', start: daysFromToday(-6), end: daysFromToday(4), progress: 60, color: 'blue', assigneeIds: ['m-nora'], notes: '' },
            { id: 'ag-2', name: 'Collect at Saturday pantries', start: daysFromToday(-2), end: daysFromToday(20), progress: 20, color: 'green', assigneeIds: ['m-grace', 'm-leo'], notes: '' },
            { id: 'ag-3', name: 'Sorting party', start: daysFromToday(11), end: daysFromToday(11), milestone: true, color: 'orange', assigneeIds: ['m-priya'], notes: '' },
            { id: 'ag-4', name: 'Giveaway day', start: daysFromToday(22), end: daysFromToday(22), milestone: true, color: 'red', assigneeIds: ['m-grace', 'm-priya', 'm-leo', 'm-theo', 'm-nora'], notes: '' },
          ],
        },
      },
      {
        id: 'aid-vault', type: 'vault', title: 'Coat drive files', span: 12, rows: 11, tabId: 'aid-tab-coats',
        data: {
          items: [
            {
              id: 'aid-guide', kind: 'note', name: 'Volunteer guide', parentId: null, ...touched('m-grace', 200),
              html: '<h3>Pantry volunteers</h3><ol><li>Arrive 9:15, set up tables by food type.</li><li>Nobody has to prove they need anything.</li><li>Write down what runs out on the “Pantry is low on” list.</li></ol>',
            },
            {
              id: 'aid-checklist', kind: 'module', moduleType: 'todo', name: 'Giveaway day checklist', parentId: null, ...touched('m-priya', 24),
              data: {
                tasks: [
                  task('aid-ck-1', 'Book the church hall', { done: true, assigneeIds: ['m-priya'], createdAt: hoursAgo(90) }),
                  task('aid-ck-2', 'Borrow clothing racks', { assigneeIds: ['m-nora'], due: daysFromToday(18), createdAt: hoursAgo(40) }),
                  task('aid-ck-3', 'Print size signs', { assigneeIds: ['m-leo'], due: daysFromToday(20), createdAt: hoursAgo(30) }),
                  task('aid-ck-4', 'Hot cocoa and cups', { createdAt: hoursAgo(20) }),
                ],
              },
            },
            { id: 'aid-flyer', kind: 'link', name: 'Coat drive flyer (example link)', parentId: null, ...touched('m-nora', 50), url: 'https://example.org/coat-drive-flyer' },
          ],
        },
      },
    ],
  };
}
