// @ts-check
/**
 * classroom.js — "Urban Policy 210", a seminar run on 3den.
 *
 * Prof. Hale owns the group, so she posts assignments and reviews
 * submissions; Leo and four others are students. Three tabs: Home
 * (announcements, the class calendar), Coursework (assignments and the
 * readings vault) and Discussion (a Q&A forum).
 */

import { daysFromToday, hoursAgo, nextWeekday, touched } from './helpers.js';

export function createClassroom() {
  const STUDENTS = ['m-leo', 'm-nora', 'm-theo', 'm-sam', 'm-jordan'];
  const sub = (memberId, fields) => ({ memberId, items: [], note: '', status: 'draft', turnedInAt: null, grade: null, feedback: '', returnedAt: null, ...fields });
  const text = (id, body) => ({ id, kind: 'text', name: 'Written answer', text: body });

  return {
    id: 'urban210',
    groupType: 'Class',
    kind: 'group',
    name: 'Urban Policy 210',
    visibility: 'private', joining: 'admins',
    description: 'Tue & Thu, 2:00–3:30 in Room 210. Readings, assignments, and discussion for the seminar.',
    memberIds: ['m-hale', ...STUDENTS],
    roles: { 'm-hale': 'owner', ...Object.fromEntries(STUDENTS.map((id) => [id, 'member'])) },
    permissions: {},
    tabs: [{ id: 'home', name: 'Home' }, { id: 'u210-coursework', name: 'Coursework' }, { id: 'u210-discussion', name: 'Discussion' }],
    appearance: { font: 'classic', accent: '#2f5d8a', background: 'plain', cover: { kind: 'preset', preset: 'blueprint', focus: 50, height: 'short' }, cards: 'bordered', corners: 'square' },
    modules: [
      // ─── Home ─────────────────────────────────────────────────────────────
      {
        id: 'u210-announcements', type: 'announcements', title: 'Board', span: 8, rows: 12,
        data: {
          posts: [
            { id: 'u210-post-1', authorId: 'm-hale', title: 'Welcome to Urban Policy 210', body: 'Everything for the class lives here: the calendar, assignments under Coursework, and questions under Discussion. Turn work in with the Submissions module: attach notes straight from your vault.', pinned: true, createdAt: hoursAgo(600), seenBy: STUDENTS, comments: [] },
            { id: 'u210-post-2', authorId: 'm-hale', title: 'Reading response 3 is posted', body: 'Due Monday night. Two pages on Jacobs, chapter 2. Questions go in the Discussion tab so everyone sees the answer.', pinned: false, createdAt: hoursAgo(20), seenBy: ['m-nora'], comments: [{ id: 'u210-post-2-c1', authorId: 'm-sam', body: 'Can we include photos from our own neighborhood?', createdAt: hoursAgo(18) }] },
          ],
        },
      },
      {
        id: 'u210-calendar', type: 'calendar', title: 'Class calendar', span: 4, rows: 12,
        data: {
          events: [
            { id: 'u210-ev-tue', title: 'Seminar', date: nextWeekday(2), allDay: false, time: '14:00', endTime: '15:30', location: 'Room 210', notes: 'Bring the week’s reading.', color: 'blue', repeat: 'weekly', createdBy: 'm-hale', attendeeIds: [] },
            { id: 'u210-ev-thu', title: 'Seminar', date: nextWeekday(4), allDay: false, time: '14:00', endTime: '15:30', location: 'Room 210', notes: '', color: 'blue', repeat: 'weekly', createdBy: 'm-hale', attendeeIds: [] },
            { id: 'u210-ev-trip', title: 'Field trip: city council meeting', date: daysFromToday(9), allDay: false, time: '18:00', endTime: '20:00', location: 'City Hall, Room 300', notes: 'Optional, counts as participation. Meet in the lobby at 5:45.', color: 'green', createdBy: 'm-hale', attendeeIds: ['m-hale'], rsvps: { 'm-hale': 'going', 'm-nora': 'going', 'm-sam': 'maybe' } },
            { id: 'u210-ev-proposal', title: 'Paper proposals due', date: daysFromToday(12), allDay: true, time: '', endTime: '', location: '', notes: 'Turn it in under Coursework → Submissions.', color: 'red', createdBy: 'm-hale', attendeeIds: [] },
          ],
        },
      },

      // ─── Coursework ───────────────────────────────────────────────────────
      {
        id: 'u210-submissions', type: 'submissions', title: 'Assignments', span: 7, rows: 14, tabId: 'u210-coursework',
        data: {
          assignments: [
            {
              id: 'u210-a1', title: 'Field notes: a public space', createdBy: 'm-hale', createdAt: hoursAgo(300),
              instructions: 'Spend 30 minutes in a public space near you. Who uses it, when, and how? Note one thing that makes it work and one that doesn’t.\n\nOne page. Photos welcome.',
              due: daysFromToday(-3), dueTime: '23:59', points: 10,
              submissions: [
                sub('m-leo', { status: 'returned', turnedInAt: hoursAgo(100), items: [text('u210-a1-leo', 'The Eastside Library parking lot during the Saturday pantry. Eighty-odd households, three generations…')], grade: 9, feedback: 'Great observation about who stays and who passes through. Next time, note the time of day for each observation.', returnedAt: hoursAgo(30) }),
                sub('m-nora', { status: 'returned', turnedInAt: hoursAgo(110), items: [text('u210-a1-nora', 'The bus shelter at 3rd and Main…')], grade: 8, feedback: 'Good detail. The second half needed more about what doesn’t work.', returnedAt: hoursAgo(30) }),
                sub('m-theo', { status: 'turned-in', turnedInAt: hoursAgo(80), items: [text('u210-a1-theo', 'The library steps at lunchtime…')] }),
                sub('m-sam', { status: 'turned-in', turnedInAt: hoursAgo(40), items: [text('u210-a1-sam', 'The skate spot under the overpass…')], note: 'Sorry this is late, I was sick on Thursday.' }),
              ],
            },
            {
              id: 'u210-a2', title: 'Reading response 3: Jacobs, chapter 2', createdBy: 'm-hale', createdAt: hoursAgo(20),
              instructions: 'Two pages responding to “The uses of sidewalks: safety.” Do “eyes on the street” still work today? Use one example from your own neighborhood.\n\nYou can attach your reading notes from your vault.',
              due: daysFromToday(4), dueTime: '23:59', points: 5,
              submissions: [
                sub('m-nora', { status: 'turned-in', turnedInAt: hoursAgo(3), items: [text('u210-a2-nora', 'Jacobs argues that a well-used street is a safe street…')] }),
              ],
            },
            {
              id: 'u210-a3', title: 'Paper proposal', createdBy: 'm-hale', createdAt: hoursAgo(10),
              instructions: 'One page: your question, the place you’ll study, and two sources. Proposals can be a note, a document, or a relationship map of who’s involved.',
              due: daysFromToday(12), dueTime: '17:00', points: 20,
              submissions: [],
            },
          ],
        },
      },
      {
        id: 'u210-readings', type: 'vault', title: 'Course readings', span: 5, rows: 14, tabId: 'u210-coursework',
        data: {
          items: [
            { id: 'u210-r-week9', kind: 'folder', name: 'Week 9: Sidewalks', parentId: null, ...touched('m-hale', 30) },
            { id: 'u210-r-syllabus', kind: 'note', name: 'Syllabus', parentId: null, ...touched('m-hale', 700), html: '<h3>Urban Policy 210</h3><p>How cities decide who gets what: streets, housing, parks, and transit.</p><ul><li>Participation: 20%</li><li>Field notes and responses: 30%</li><li>Paper: 50%</li></ul>' },
            { id: 'u210-r-guide', kind: 'note', name: 'How to write a reading response', parentId: null, ...touched('m-hale', 650), html: '<p>Summarize the argument in two sentences, then spend the rest arguing with it. Use one example you’ve seen yourself.</p>' },
            { id: 'u210-r-jacobs', kind: 'link', name: 'Jacobs, chapter 2 (library copy, example link)', parentId: 'u210-r-week9', ...touched('m-hale', 30), url: 'https://example.org/library/jacobs-ch2' },
          ],
        },
      },

      // ─── Discussion ───────────────────────────────────────────────────────
      {
        id: 'u210-forum', type: 'forum', title: 'Questions and discussion', span: 12, rows: 14, tabId: 'u210-discussion',
        data: {
          tags: ['Readings', 'Assignments', 'Logistics'],
          settings: { whoCanStart: 'everyone', downvotes: false, qa: true, defaultSort: 'active', guidelines: 'Ask here instead of emailing, so everyone gets the answer. Be generous with each other. If someone answers your question, mark it as the best answer.' },
          threads: [
            {
              id: 'u210-t1', authorId: 'm-jordan', title: 'Is the paper proposal one page or two?', body: 'The syllabus says one, but the assignment mentions sources. Do sources count?', tag: 'Assignments', createdAt: hoursAgo(9),
              votes: { 'm-jordan': 1, 'm-sam': 1 }, answerId: 'u210-t1-r1', followers: ['m-jordan', 'm-hale'],
              replies: [{ id: 'u210-t1-r1', authorId: 'm-hale', body: 'One page plus the sources, which don’t count toward the page.', createdAt: hoursAgo(7), votes: { 'm-jordan': 1, 'm-nora': 1 } }],
            },
            {
              id: 'u210-t2', authorId: 'm-sam', title: 'Do “eyes on the street” still work with cameras everywhere?', body: 'Jacobs wrote before doorbell cameras. Is a camera the same as a neighbor watching?', tag: 'Readings', createdAt: hoursAgo(16),
              votes: { 'm-sam': 1, 'm-leo': 1, 'm-nora': 1 }, followers: ['m-sam', 'm-nora'],
              replies: [
                { id: 'u210-t2-r1', authorId: 'm-nora', body: 'A camera records, but it doesn’t step in. Jacobs’ point was people who would actually say something.', createdAt: hoursAgo(14), votes: { 'm-sam': 1 } },
                { id: 'u210-t2-r2', authorId: 'm-theo', parentId: 'u210-t2-r1', body: 'And cameras don’t make a street feel used, which is what keeps people coming.', createdAt: hoursAgo(12), votes: {} },
              ],
            },
          ],
        },
      },
    ],
  };
}
