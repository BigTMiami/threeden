// @ts-check
/**
 * house.js — "14 Juniper Lane", the house Leo shares with three others.
 *
 * Shows a household's everyday modules: announcements, the house calendar,
 * a to-do list, groceries, a house chat, a shared note and a
 * vault for bills and the lease.
 */

import { createHouseBudget } from './budgets.js';
import { daysFromToday, hoursAgo, touched, task, event, groceryItem, post } from './helpers.js';

export const HOUSEMATE_IDS = ['m-leo', 'm-maya', 'm-theo', 'm-owen'];

export function createHouse() {
  return {
    id: 'juniper',
    groupType: 'Household',
    kind: 'group',
    name: '14 Juniper Lane',
    visibility: 'private', joining: 'admins',
    description: 'The four of us at 14 Juniper Lane: bills, chores, groceries, and the house calendar.',
    memberIds: HOUSEMATE_IDS,
    roles: { 'm-leo': 'owner', 'm-maya': 'admin', 'm-theo': 'member', 'm-owen': 'member' },
    permissions: {},
    appearance: {},
    modules: [
      {
        id: 'house-announcements', type: 'announcements', title: 'Board', span: 8, rows: 12,
        data: {
          posts: [
            post('house-post-1', 'm-maya', 'House meeting Sunday at 7', 'Living room. I’ll make dumplings. Agenda is in the note below. Add anything you want to talk about.', {
              pinned: true, createdAt: hoursAgo(5), seenBy: ['m-theo'],
              comments: [{ id: 'house-post-1-c1', authorId: 'm-theo', body: 'I’ll bring beer. Can we talk about the heating bill?', createdAt: hoursAgo(4) }],
            }),
            post('house-post-2', 'm-owen', 'Plumber coming Wednesday', 'For the upstairs shower. Sometime between 1 and 4. I’ll be home but the water will be off.', {
              createdAt: hoursAgo(30), seenBy: ['m-leo', 'm-maya', 'm-theo'],
              comments: [{ id: 'house-post-2-c1', authorId: 'm-leo', body: 'Thanks Owen. I’ll shower at the gym.', createdAt: hoursAgo(28) }],
            }),
          ],
        },
      },
      {
        id: 'house-calendar', type: 'calendar', title: 'House calendar', span: 4, rows: 12,
        data: {
          events: [
            event('house-ev-1', 'Plumber (upstairs shower)', daysFromToday(2), { time: '13:00', endTime: '16:00', location: 'Upstairs bathroom', notes: 'Water off while he works.', color: 'orange', attendeeIds: ['m-owen'], createdBy: 'm-owen' }),
            // An event (with RSVPs), not just a calendar entry: Maya and Theo have said they're going.
            event('house-ev-2', 'House meeting', daysFromToday(4), {
              kind: 'event', visibility: 'group', time: '19:00', endTime: '20:30', location: 'Living room', notes: 'Agenda is in the note on the homepage.', color: 'blue',
              attendeeIds: ['m-maya', 'm-theo'], rsvps: { 'm-maya': 'going', 'm-theo': 'going' }, inviteeIds: [], createdBy: 'm-maya',
            }),
            event('house-ev-3', 'Rent due', daysFromToday(19), { allDay: true, color: 'red', repeat: 'monthly', createdBy: 'm-leo' }),
            event('house-ev-4', 'Recycling out', daysFromToday(-1), { time: '20:00', endTime: '20:15', location: 'Curb', notes: 'Pickup is early Tuesday.', color: 'green', attendeeIds: ['m-theo'], repeat: 'weekly', createdBy: 'm-theo' }),
            event('house-ev-5', 'Maya away (conference)', daysFromToday(8), { endDate: daysFromToday(10), allDay: true, notes: 'Water the fern please!', color: 'purple', attendeeIds: ['m-maya'], createdBy: 'm-maya' }),
          ],
        },
      },
      {
        id: 'house-todo', type: 'todo', title: 'House to-do', span: 5, rows: 13,
        data: {
          tasks: [
            task('house-task-1', 'Pay the internet bill', { done: true, assigneeIds: ['m-leo'], due: daysFromToday(-3), priority: 'high', notes: 'Receipt is in the vault.', createdAt: hoursAgo(150) }),
            task('house-task-2', 'Deep clean the kitchen', {
              assigneeIds: ['m-theo', 'm-owen'], due: daysFromToday(3), priority: 'medium', notes: 'Before the house meeting, please!', createdAt: hoursAgo(60),
              subtasks: [
                { id: 'house-sub-1', text: 'Clean out the fridge', done: true },
                { id: 'house-sub-2', text: 'Wipe down cabinets', done: false },
                { id: 'house-sub-3', text: 'Mop the floor', done: false },
              ],
            }),
            task('house-task-3', 'Find last winter’s heating bills', { assigneeIds: ['m-leo'], due: daysFromToday(4), priority: 'medium', notes: 'For the meeting. Should be in the vault under Bills.', createdAt: hoursAgo(26) }),
            task('house-task-4', 'Fix the sticky back door', { notes: 'Theo has a plane.', priority: 'low', createdAt: hoursAgo(90) }),
            task('house-task-5', 'Put up the winter curtains', { assigneeIds: ['m-maya'], due: daysFromToday(6), priority: 'low', createdAt: hoursAgo(20) }),
          ],
        },
      },
      {
        id: 'house-note', type: 'note', title: 'Sunday meeting agenda', span: 7, rows: 13,
        data: {
          html:
            '<h3>House meeting: Sunday 7pm</h3>' +
            '<ol><li>Heating bill: thermostat at 68 by day, 64 at night?</li><li>Chores: is the to-do list working?</li><li>Who’s around over Thanksgiving (someone feed the cat)</li><li>The tenants union meeting: who wants to go?</li></ol>',
          lastEditedBy: 'm-maya',
          lastEditedAt: hoursAgo(4),
        },
      },
      {
        id: 'house-grocery', type: 'todo', title: 'Groceries', span: 5, rows: 13,
        data: {
          view: 'lists', tasks: [], // Tasks on its Lists view (the List module until Nov 20)
          items: [
            groceryItem('house-g-1', 'Rice', 'pantry', 'm-maya', { quantity: '1 big bag', claimedBy: 'm-maya' }),
            groceryItem('house-g-2', 'Scallions', 'produce', 'm-maya'),
            groceryItem('house-g-3', 'Lemons', 'produce', 'm-theo', { quantity: '3' }),
            groceryItem('house-g-4', 'Oat milk', 'dairy', 'm-leo', { claimedBy: 'm-leo' }),
            groceryItem('house-g-5', 'Dish soap', 'household', 'm-owen', { note: 'the unscented one' }),
            groceryItem('house-g-6', 'Bread', 'bakery', 'm-theo', { quantity: '1 loaf', claimedBy: 'm-theo' }),
            groceryItem('house-g-7', 'Coffee', 'pantry', 'm-owen', { bought: true, boughtBy: 'm-owen', boughtAt: hoursAgo(2) }),
          ],
          history: ['Bananas', 'Bananas', 'Eggs', 'Eggs', 'Eggs', 'Toilet paper', 'Rice', 'Coffee'],
        },
      },
      createHouseBudget(), // Budget: Shared household, split four ways
      {
        id: 'house-vault', type: 'vault', title: 'House vault', span: 5, rows: 12,
        data: {
          items: [
            { id: 'house-folder-bills', kind: 'folder', name: 'Bills & receipts', parentId: null, ...touched('m-leo', 72) },
            { id: 'house-folder-lease', kind: 'folder', name: 'Lease & landlord', parentId: null, ...touched('m-owen', 300) },
            {
              id: 'house-agreements', kind: 'note', name: 'House agreements', parentId: null, ...touched('m-maya', 50),
              html: '<h3>House agreements</h3><ul><li>Quiet hours 11pm to 7am on weeknights.</li><li>Dishes done the same day.</li><li>Give a day’s notice before overnight guests.</li><li>Shared groceries split evenly; label anything that’s yours.</li></ul>',
            },
            {
              id: 'house-heating', kind: 'note', name: 'Last winter’s heating bills', parentId: 'house-folder-bills', ...touched('m-leo', 72),
              html: '<h3>Heating, last winter</h3><ul><li>December: $212</li><li>January: $268</li><li>February: $231</li></ul><p>Split four ways. January was the cold snap.</p>',
            },
            { id: 'house-landlord', kind: 'link', name: 'Landlord repair request form (example link)', parentId: 'house-folder-lease', ...touched('m-owen', 300), url: 'https://example.org/repairs' },
          ],
        },
      },
      { id: 'house-chat', type: 'chat', title: 'House chat', span: 7, rows: 12, data: { conversationId: 'conv-juniper' } },
    ],
  };
}

