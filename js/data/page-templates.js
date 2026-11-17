// @ts-check
/**
 * page-templates.js — ready-made pages for different kinds of people,
 * offered in Settings → Layout → Templates (js/groups/layout-tab.js).
 *
 *   PERSONAL_TEMPLATES   for your own homepage: a student, an organizer, a musician…
 *   BLOG_TEMPLATES       for your blog: a photographer, a writer, a performer…
 *   (groups use GROUP_TEMPLATES from starter-layouts.js, the same ones
 *    Create a group offers)
 *
 * Each template: { id, label, who, modules() }. `who` says who it's for, in
 * a line. `modules()` returns fresh modules; any with `data: null` get their
 * type's own starting data when the template is used.
 */

import { makeId } from '../ui/dom.js';

const module = (type, title, span, rows, data = null) => ({ id: makeId('mod'), type, title, span, rows, data });

export const PERSONAL_TEMPLATES = [
  {
    id: 'student', label: 'Student', who: 'Classes, readings, assignments, and deadlines',
    modules: () => [
      module('todo', 'Assignments', 8, 12, { tasks: [] }),
      module('calendar', 'Class schedule', 4, 12, { events: [] }),
      module('note', 'Reading notes', 6, 12, { html: '<p></p>' }),
      module('vault', 'School files', 6, 12),
    ],
  },
  {
    id: 'organizer', label: 'Organizer', who: 'Running several groups, events, and campaigns',
    modules: () => [
      module('dashboard', 'Dashboard', 12, 12, {}),
      module('events', 'Upcoming events', 6, 12, { events: [], ownEvents: false }),
      module('todo', 'My tasks', 6, 12, { tasks: [] }),
      module('calendar', 'My calendar', 12, 12, { events: [] }),
    ],
  },
  {
    id: 'musician', label: 'Musician', who: 'Gigs, rehearsals, songs, and set lists',
    modules: () => [
      module('events', 'Upcoming gigs', 6, 12, { events: [], ownEvents: false }),
      module('calendar', 'Rehearsals & gigs', 6, 12, { events: [] }),
      module('note', 'Song ideas', 6, 12, { html: '<p></p>' }),
      module('vault', 'Set lists & charts', 6, 12),
    ],
  },
  {
    id: 'parent', label: 'Parent or family planner', who: 'The family calendar, the shopping list, and everyone’s to-dos',
    modules: () => [
      module('calendar', 'Family calendar', 8, 12, { events: [] }),
      module('grocery', 'Shopping list', 4, 12),
      module('todo', 'To-do', 6, 12, { tasks: [] }),
      module('note', 'Notes', 6, 12, { html: '<p></p>' }),
    ],
  },
  {
    id: 'freelancer', label: 'Freelancer', who: 'Clients, projects, and deadlines',
    modules: () => [
      module('todo', 'Clients & projects', 12, 13, { tasks: [], view: 'board' }),
      module('gantt', 'Project timeline', 8, 12),
      module('calendar', 'Calendar', 4, 12, { events: [] }),
      module('vault', 'Contracts & invoices', 12, 11),
    ],
  },
  {
    id: 'business', label: 'Small business owner', who: 'Orders, contacts, and the week ahead',
    modules: () => [
      module('todo', 'Orders', 8, 13, { tasks: [], view: 'board' }),
      module('calendar', 'Calendar', 4, 13, { events: [] }),
      module('relationship', 'Contacts & suppliers', 8, 14),
      module('todo', 'To-do', 4, 14, { tasks: [] }),
    ],
  },
  {
    id: 'teacher', label: 'Teacher', who: 'Lesson plans, the school calendar, and grading',
    modules: () => [
      module('calendar', 'School calendar', 6, 12, { events: [] }),
      module('todo', 'Grading & prep', 6, 12, { tasks: [] }),
      module('vault', 'Lesson plans', 8, 12),
      module('note', 'Notes', 4, 12, { html: '<p></p>' }),
    ],
  },
  {
    id: 'volunteer', label: 'Community volunteer', who: 'Shifts, events, and what your groups need',
    modules: () => [
      module('dashboard', 'What’s happening', 8, 12, { sections: ['needs', 'groups'] }),
      module('events', 'Upcoming events', 4, 12, { events: [], ownEvents: false }),
      module('calendar', 'My shifts', 12, 12, { events: [] }),
    ],
  },
  {
    id: 'social', label: 'Keeping up with friends', who: 'What your friends and groups are posting',
    modules: () => [
      module('dashboard', 'From friends', 8, 13, { sections: ['needs', 'friends'] }),
      module('events', 'Upcoming events', 4, 13, { events: [], ownEvents: false }),
    ],
  },
  {
    id: 'simple', label: 'Keep it simple', who: 'Just a to-do list and a calendar',
    modules: () => [
      module('todo', 'My tasks', 8, 12, { tasks: [] }),
      module('calendar', 'My calendar', 4, 12, { events: [] }),
    ],
  },
];

export const BLOG_TEMPLATES = [
  {
    id: 'photographer', label: 'Photographer', who: 'A photo grid first, a gallery, and a line about you',
    modules: () => [
      module('photofeed', 'Photos', 8, 18, { posts: [], events: [] }),
      module('note', 'About me', 4, 9, { title: '', html: '<p></p>', updatedAt: null }),
      module('gallery', 'Portfolio', 12, 14),
    ],
  },
  {
    id: 'writer', label: 'Writer', who: 'Short posts, articles, and an About page',
    modules: () => [
      module('textfeed', 'Notes', 5, 16, { posts: [], events: [] }),
      module('articles', 'Articles', 7, 16, { articles: [] }),
      module('note', 'About me', 12, 8, { title: '', html: '<p></p>', updatedAt: null }),
    ],
  },
  {
    id: 'performer', label: 'Musician or performer', who: 'Upcoming shows people can RSVP to, posts, and a slideshow',
    modules: () => [
      module('generalfeed', 'Posts', 8, 16, { posts: [], events: [] }),
      module('events', 'Upcoming shows', 4, 16, { events: [], ownEvents: true }),
      module('carousel', 'On stage', 12, 14),
    ],
  },
  {
    id: 'creator', label: 'Creator', who: 'Photos and posts side by side',
    modules: () => [
      module('generalfeed', 'Posts', 7, 16, { posts: [], events: [] }),
      module('photofeed', 'Photos', 5, 16, { posts: [], events: [] }),
      module('note', 'About me', 12, 8, { title: '', html: '<p></p>', updatedAt: null }),
    ],
  },
  {
    id: 'simple', label: 'Simple', who: 'One feed for everything, and an About page',
    modules: () => [
      module('generalfeed', 'Posts', 8, 16, { posts: [], events: [] }),
      module('note', 'About me', 4, 8, { title: '', html: '<p></p>', updatedAt: null }),
    ],
  },
];
