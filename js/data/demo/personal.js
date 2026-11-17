// @ts-check
/**
 * personal.js — Leo's personal homepage, private to him.
 */

import { createPersonalBudget } from './budgets.js';
import { daysFromToday, hoursAgo, nextThanksgiving, shiftDate } from './helpers.js';

/** A personal homepage: same modules as a group, but only its owner is in it. */
export function createPersonalSpace(ownerId) {
  return {
    id: 'me',
    kind: 'personal',
    name: 'My homepage',
    privacy: 'Only you',
    memberIds: [ownerId],
    modules: [
      // What's new in Leo's groups and on his friends' blogs (read live, nothing saved).
      { id: 'me-dashboard', type: 'dashboard', title: 'Dashboard', span: 12, rows: 13, data: {} },
      {
        id: 'me-calendar',
        type: 'calendar',
        title: 'My calendar',
        span: 7,
        rows: 12,
        data: {
          events: [
            { id: 'me-ev-1', title: 'Plumber (water off)', date: daysFromToday(2), allDay: false, time: '13:00', endTime: '16:00', location: '14 Juniper Lane', notes: '', color: 'orange', attendeeIds: [ownerId], repeat: 'none', createdBy: ownerId },
            { id: 'me-ev-2', title: 'Class: Urban Policy', date: daysFromToday(2), allDay: false, time: '14:00', endTime: '15:30', location: 'Room 210', notes: 'Bring the reading notes.', color: 'blue', attendeeIds: [ownerId], repeat: 'weekly', createdBy: ownerId },
            { id: 'me-ev-3', title: 'Dentist', date: daysFromToday(5), allDay: false, time: '10:30', endTime: '11:30', location: '', notes: '', color: 'red', attendeeIds: [ownerId], repeat: 'none', createdBy: ownerId },
            { id: 'me-ev-4', title: 'Train to Aunt Ingrid’s', date: shiftDate(nextThanksgiving(), -1), allDay: false, time: '18:10', endTime: '21:40', location: 'Union Station', notes: '', color: 'purple', attendeeIds: [ownerId], repeat: 'none', createdBy: ownerId },
            { id: 'me-ev-6', title: 'Camping trip', date: daysFromToday(29), endDate: daysFromToday(31), allDay: false, time: '17:00', endTime: '14:00', location: 'Lake Ridge campground', notes: 'Tent, stove, headlamp.', color: 'orange', attendeeIds: [ownerId], repeat: 'none', createdBy: ownerId },
            { id: 'me-ev-5', title: 'Run', date: daysFromToday(-3), allDay: false, time: '07:00', endTime: '07:45', location: 'River path', notes: '', color: 'green', attendeeIds: [ownerId], repeat: 'weekly', createdBy: ownerId },
          ],
        },
      },
      {
        id: 'me-vault',
        type: 'vault',
        title: 'My vault',
        span: 5,
        rows: 12,
        data: {
          items: [
            { id: 'me-folder-school', kind: 'folder', name: 'School', parentId: null, createdBy: ownerId, updatedBy: ownerId, updatedAt: hoursAgo(30) },
            { id: 'me-folder-docs', kind: 'folder', name: 'Personal documents', parentId: null, createdBy: ownerId, updatedBy: ownerId, updatedAt: hoursAgo(400) },
            {
              id: 'me-pedals', kind: 'note', name: 'Pedalboard plans', parentId: null,
              createdBy: ownerId, updatedBy: ownerId, updatedAt: hoursAgo(40),
              html: '<h3>Pedalboard</h3><p>18 in × 12 in plank, angled. Velcro strips.</p><ul><li>Tuner, then overdrive</li><li>Delay last</li></ul>',
            },
            {
              id: 'me-link-seeds', kind: 'link', name: 'Guitar strings (example link)', parentId: null,
              createdBy: ownerId, updatedBy: ownerId, updatedAt: hoursAgo(90), url: 'https://example.org/strings',
            },
            {
              id: 'me-ch6', kind: 'note', name: 'Jacobs ch. 2 reading notes', parentId: 'me-folder-school',
              createdBy: ownerId, updatedBy: ownerId, updatedAt: hoursAgo(30),
              html: '<h3>Jacobs, chapter 2: sidewalks and safety</h3><p>Key ideas so far:</p><ul><li>“Eyes on the street”: shops and stoops keep a street watched</li><li>Compare: our pantry Saturdays fill the library lot with people</li></ul>',
            },
          ],
        },
      },
      createPersonalKanban(ownerId),
      createPersonalBudget(), // Budget: Personal, this month
      {
        id: 'me-todo',
        type: 'todo',
        title: 'My tasks',
        span: 7,
        rows: 12,
        data: {
          tasks: [
            { id: 'me-task-1', text: 'Read Jacobs, chapter 2 for Tuesday’s class', done: false, assigneeIds: [ownerId], due: daysFromToday(2), priority: 'high', notes: 'Take notes in the vault for the reading response.', subtasks: [], createdAt: hoursAgo(30) },
            { id: 'me-task-2', text: 'Make the heat log chart for the tenants union', done: false, assigneeIds: [ownerId], due: daysFromToday(6), priority: 'medium', notes: '', subtasks: [], createdAt: hoursAgo(60) },
            { id: 'me-task-3', text: 'Call Mom back', done: false, assigneeIds: [ownerId], due: daysFromToday(0), priority: '', notes: '', subtasks: [], createdAt: hoursAgo(8) },
            {
              id: 'me-task-4', text: 'Build a pedalboard for my guitar', done: false, assigneeIds: [ownerId], due: daysFromToday(12), priority: 'low',
              notes: 'Plans are in my vault. Ask Theo for the drill.',
              subtasks: [
                { id: 'me-sub-1', text: 'Measure the pedals', done: true },
                { id: 'me-sub-2', text: 'Buy a plank and velcro', done: false },
                { id: 'me-sub-3', text: 'Wire it up', done: false },
              ],
              createdAt: hoursAgo(40),
            },
            { id: 'me-task-5', text: 'Send the November bill split to housemates', done: true, assigneeIds: [ownerId], due: daysFromToday(-4), priority: '', notes: '', subtasks: [], createdAt: hoursAgo(120) },
          ],
        },
      },
      {
        id: 'me-note',
        type: 'note',
        title: 'Notes to self',
        span: 5,
        rows: 12,
        data: {
          html:
            '<h3>This week</h3>' +
            '<ul><li>Bring last winter’s heating bills to the house meeting</li><li>Pecan pie for Thanksgiving: practice once first</li><li>New strings before the street fair</li></ul>' +
            '<p><i>Ideas for 3den:</i> a set list module for the band?</p>',
          lastEditedBy: ownerId,
          lastEditedAt: hoursAgo(5),
        },
      },
    ],
  };
}

/**
 * A personal board. Group cards assigned to Leo (on the mutual aid
 * requests board and the tenants' door board) show up under it. 
 */
export function createPersonalKanban(ownerId) {
  return {
    id: 'me-kanban',
    type: 'kanban',
    title: 'My board',
    span: 12,
    rows: 12,
    data: {
      columns: [
        { id: 'me-col-ideas', title: 'Someday' },
        { id: 'me-col-next', title: 'Next up' },
        { id: 'me-col-doing', title: 'Doing' },
        { id: 'me-col-done', title: 'Done' },
      ],
      cards: [
        { id: 'me-card-1', columnId: 'me-col-ideas', title: 'Learn to fix my own derailleur', description: '', assigneeIds: [ownerId], due: '', color: 'blue', createdAt: hoursAgo(300) },
        { id: 'me-card-2', columnId: 'me-col-next', title: 'Apply for the summer fellowship', description: 'Deadline is in the email from the department.', assigneeIds: [ownerId], due: daysFromToday(9), color: 'orange', createdAt: hoursAgo(50) },
        { id: 'me-card-3', columnId: 'me-col-doing', title: 'Practice the street fair set', description: '', assigneeIds: [ownerId], due: daysFromToday(2), color: '', createdAt: hoursAgo(20) },
      ],
    },
  };
}
