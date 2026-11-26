// @ts-check
/**
 * family.js — "Larsen Family", Leo's big extended family.
 *
 * They're spread across three states and mostly get together once a year,
 * for Thanksgiving at Aunt Ingrid's. Shows a family using 3den around one
 * big event: an invite-only RSVP for dinner (always the next Thanksgiving,
 * worked out from today), a "who's bringing what" list, a cleanup
 * crew to-do list, a family chat, and a "Photos & recipes" tab with last year's
 * pictures and Grandma Ruth's stuffing.
 */

import { createThanksgivingBudget } from './budgets.js';
import { daysFromToday, hoursAgo, nextThanksgiving, shiftDate, touched, task, post, groceryItem } from './helpers.js';
import { demoPhoto } from '../demo-photos.js';
import { toDateKey } from '../../utils/dates.js';

export const FAMILY_IDS = ['m-ingrid', 'm-joe', 'm-leo', 'm-nora', 'm-erik', 'm-bea'];

export function createFamily() {
  const thanksgiving = nextThanksgiving();
  const photo = (id, scene, name, parentId) => ({
    id, kind: 'file', name, parentId, ...touched('m-bea', 24 * 340),
    file: { mimeType: 'image/svg+xml', size: 48000, dataUrl: demoPhoto(scene) },
  });

  return {
    id: 'larsen',
    groupType: 'Family',
    kind: 'group',
    name: 'Larsen Family',
    visibility: 'private', joining: 'admins',
    description: 'All the Larsens, near and far. Thanksgiving is at Ingrid and Joe’s, as always.',
    memberIds: FAMILY_IDS,
    roles: { 'm-ingrid': 'owner', 'm-joe': 'admin', 'm-leo': 'member', 'm-nora': 'member', 'm-erik': 'member', 'm-bea': 'member' },
    permissions: {},
    appearance: { font: 'book', accent: '#ac6600', background: 'paper', cover: { kind: 'preset', preset: 'sand', focus: 50, height: 'short' }, cards: 'raised', corners: 'rounded' },
    tabs: [{ id: 'home', name: 'Home' }, { id: 'larsen-tab-photos', name: 'Photos & recipes' }],
    modules: [
      // ─── Home ─────────────────────────────────────────────────────────────
      {
        id: 'larsen-announcements', type: 'announcements', title: 'Family news', span: 8, rows: 12,
        data: {
          posts: [
            post('larsen-post-1', 'm-ingrid', 'Thanksgiving at our place!', 'Dinner at 3, come any time after noon. Please RSVP on the calendar and sign up for a dish on the list, so we don’t end up with five pies again (looking at you, Joe). Beds are spoken for, but the couch and an air mattress are free.', {
              pinned: true, createdAt: hoursAgo(72), seenBy: ['m-joe', 'm-bea', 'm-nora'],
              comments: [
                { id: 'larsen-post-1-c1', authorId: 'm-bea', body: 'We’re driving up Wednesday night. Can’t wait!', createdAt: hoursAgo(60) },
                { id: 'larsen-post-1-c2', authorId: 'm-joe', body: 'Five pies was a GOOD year.', createdAt: hoursAgo(58) },
              ],
            }),
            post('larsen-post-2', 'm-nora', 'Cousins’ gift swap', 'Same as last year, names drawn after dinner. Put your wish list in the vault if you want. Vote on the limit below!', {
              createdAt: hoursAgo(30), seenBy: ['m-erik'],
              poll: {
                id: 'larsen-poll-1', question: 'What should the gift limit be?', multiple: false, anonymous: false, closesOn: null, closed: false, chosenId: null,
                createdBy: 'm-nora', createdAt: hoursAgo(30),
                options: [{ id: 'lp-25', text: '$25, same as always', when: null }, { id: 'lp-30', text: '$30', when: null }, { id: 'lp-40', text: '$40, go big', when: null }],
                votes: { 'm-nora': ['lp-30'], 'm-erik': ['lp-40'], 'm-bea': ['lp-30'], 'm-joe': ['lp-25'] },
              },
            }),
          ],
        },
      },
      {
        id: 'larsen-calendar', type: 'calendar', title: 'Family calendar', span: 4, rows: 12,
        data: {
          events: [
            {
              id: 'larsen-ev-dinner', title: 'Thanksgiving dinner', date: toDateKey(thanksgiving), allDay: false, time: '15:00', endTime: '20:00', repeat: 'none',
              location: 'Ingrid & Joe’s, 88 Orchard Road', color: 'orange', createdBy: 'm-ingrid', visibility: 'invite', capacity: null,
              notes: 'Come any time after noon. Football in the yard at 1, dinner at 3, pie whenever.', cover: { kind: 'image', image: demoPhoto('feast', 'panorama'), focus: 50 },
              inviteeIds: FAMILY_IDS.filter((id) => id !== 'm-ingrid'), attendeeIds: ['m-ingrid', 'm-joe', 'm-bea', 'm-nora'],
              rsvps: { 'm-ingrid': 'going', 'm-joe': 'going', 'm-bea': 'going', 'm-nora': 'going', 'm-erik': 'maybe' },
            },
            {
              id: 'larsen-ev-hike', title: 'Leftovers hike', date: shiftDate(thanksgiving, 1), allDay: false, time: '10:00', endTime: '13:00', repeat: 'none',
              location: 'Miller Creek trailhead', color: 'green', createdBy: 'm-nora', attendeeIds: ['m-nora', 'm-erik'],
              notes: 'Bring a turkey sandwich.',
            },
            {
              id: 'larsen-ev-bday', title: 'Grandpa Walt’s 90th (video call)', date: daysFromToday(3), allDay: false, time: '18:00', endTime: '19:00', repeat: 'none',
              location: 'Video call (link in the chat)', color: 'purple', createdBy: 'm-bea', attendeeIds: FAMILY_IDS, notes: '',
            },
          ],
        },
      },
      {
        id: 'larsen-dishes', type: 'todo', title: 'Who’s bringing what', span: 6, rows: 13,
        data: {
          view: 'lists', tasks: [], // Tasks on its Lists view (the List module until Nov 20)
          items: [
            groceryItem('larsen-d-1', 'Turkey (22 lb)', 'meat', 'm-ingrid', { claimedBy: 'm-ingrid', note: 'Brining Tuesday night.' }),
            groceryItem('larsen-d-2', 'Grandma Ruth’s stuffing', 'other', 'm-ingrid', { claimedBy: 'm-ingrid', note: 'Recipe is in Photos & recipes.' }),
            groceryItem('larsen-d-3', 'Mashed potatoes', 'produce', 'm-joe', { claimedBy: 'm-joe' }),
            groceryItem('larsen-d-4', 'Green bean casserole', 'produce', 'm-bea', { claimedBy: 'm-bea' }),
            groceryItem('larsen-d-5', 'Pumpkin pie', 'bakery', 'm-nora', { claimedBy: 'm-nora' }),
            groceryItem('larsen-d-6', 'Pecan pie', 'bakery', 'm-ingrid', { note: 'Leo, you made a great one last year…' }),
            groceryItem('larsen-d-7', 'Rolls', 'bakery', 'm-erik', { claimedBy: 'm-erik', quantity: '3 dozen' }),
            groceryItem('larsen-d-8', 'Cranberry sauce', 'other', 'm-ingrid', { note: 'Homemade AND the canned kind. Joe insists.' }),
            groceryItem('larsen-d-9', 'Cider and wine', 'drinks', 'm-joe'),
            groceryItem('larsen-d-10', 'Ice (2 bags)', 'frozen', 'm-joe'),
          ],
          history: [],
        },
      },
      {
        id: 'larsen-cleanup', type: 'todo', title: 'Cleanup crew', span: 6, rows: 13,
        data: {
          // The cooks (Ingrid and Joe) get the night off.
          tasks: [
            task('lc-clear', 'Clear the table', { assigneeIds: ['m-leo'] }),
            task('lc-wash', 'Wash dishes', { assigneeIds: ['m-nora'] }),
            task('lc-dry', 'Dry and put away', { assigneeIds: ['m-erik'] }),
            task('lc-leftovers', 'Pack up leftovers', { assigneeIds: ['m-ingrid'], notes: 'She knows which containers are whose.' }),
            task('lc-trash', 'Trash and recycling', { assigneeIds: ['m-bea'] }),
          ],
        },
      },
      {
        id: 'larsen-todo', type: 'todo', title: 'Before the big day', span: 5, rows: 12,
        data: {
          tasks: [
            task('larsen-task-1', 'Book train tickets', { assigneeIds: ['m-leo'], due: daysFromToday(2), priority: 'high', notes: 'Wednesday evening train, back Saturday.', createdAt: hoursAgo(40) }),
            task('larsen-task-2', 'Borrow folding chairs from church', { assigneeIds: ['m-joe'], due: shiftDate(thanksgiving, -2), priority: 'medium', createdAt: hoursAgo(70) }),
            task('larsen-task-3', 'Bring the table leaf up from the basement', { assigneeIds: ['m-erik'], due: shiftDate(thanksgiving, -1), createdAt: hoursAgo(70) }),
            task('larsen-task-4', 'Blow up the air mattress', { assigneeIds: ['m-ingrid'], createdAt: hoursAgo(70) }),
            task('larsen-task-5', 'Order Grandpa Walt’s birthday cake', { done: true, assigneeIds: ['m-bea'], createdAt: hoursAgo(120) }),
          ],
        },
      },
      { id: 'larsen-chat', type: 'chat', title: 'Family chat', span: 7, rows: 12, data: { conversationId: 'conv-larsen' } },
      createThanksgivingBudget(), // Budget: Group event, linked to Thanksgiving dinner

      // ─── Photos & recipes ─────────────────────────────────────────────────
      {
        id: 'larsen-vault', type: 'vault', title: 'Photos & recipes', span: 12, rows: 14, tabId: 'larsen-tab-photos',
        data: {
          items: [
            { id: 'larsen-folder-photos', kind: 'folder', name: `Thanksgiving ${thanksgiving.getFullYear() - 1}`, parentId: null, ...touched('m-bea', 24 * 340) },
            { id: 'larsen-folder-recipes', kind: 'folder', name: 'Recipes', parentId: null, ...touched('m-ingrid', 24 * 300) },
            photo('larsen-photo-1', 'feast', 'The table.jpg', 'larsen-folder-photos'),
            photo('larsen-photo-2', 'pie', 'Leo’s pecan pie.jpg', 'larsen-folder-photos'),
            photo('larsen-photo-3', 'leaves', 'Leaf pile (Erik, age 24).jpg', 'larsen-folder-photos'),
            {
              id: 'larsen-stuffing', kind: 'note', name: 'Grandma Ruth’s stuffing', parentId: 'larsen-folder-recipes', ...touched('m-ingrid', 24 * 300),
              html: '<h3>Grandma Ruth’s stuffing</h3><ul><li>1 loaf day-old bread, cubed</li><li>1 stick butter</li><li>2 onions, 4 celery stalks</li><li>Sage, thyme, salt, pepper</li><li>2 cups stock, 2 eggs</li></ul><p>Soften the onions and celery in the butter, toss everything together, bake at 350°F for 45 minutes. Ruth always added a handful of chopped apple.</p>',
            },
            {
              id: 'larsen-sleeping', kind: 'note', name: 'Who’s sleeping where', parentId: null, ...touched('m-ingrid', 30),
              html: '<ul><li>Bea and family: guest room</li><li>Nora: Erik’s old room</li><li>Erik: air mattress, den</li><li>Leo: the couch (sorry!)</li></ul>',
            },
            {
              id: 'larsen-wishlists', kind: 'note', name: 'Gift swap wish lists', parentId: null, ...touched('m-nora', 30),
              html: '<p><b>Nora:</b> wool socks, a good novel.<br><b>Erik:</b> anything for camping.<br><b>Leo:</b> guitar strings (12–53), bike lights.</p>',
            },
          ],
        },
      },
    ],
  };
}
