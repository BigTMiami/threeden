// @ts-check
/**
 * starter-layouts.js — the homepages a new account can start with, one per
 * way of arriving (see js/onboarding/). Each starts small: two or three
 * modules that help with what the person came for. Everything else waits
 * in the module library.
 *
 *   STARTER_LAYOUTS.event.modules()   → fresh modules for the "event" layout
 *   layoutForArrival(any source)      → 'standard' (Dashboard and vault, Nov 16)
 *
 * The one-line note on a new homepage ("We set this up for your event ·
 * Change") lists these, so people can swap to another one.
 */

import { makeId } from '../ui/dom.js';

const module = (type, title, span, rows, data) => ({ id: makeId('mod'), type, title, span, rows, data });

export const STARTER_LAYOUTS = {
  // Every new homepage starts with the Dashboard and the vault, side by side (Nov 16).
  // The arrival-based ones below stay available from the "Change" note on a new homepage.
  standard: {
    label: 'Dashboard and vault',
    note: 'you',
    description: 'Your Dashboard and your vault, side by side',
    modules: () => [
      module('dashboard', 'Dashboard', 6, 14, {}),
      module('vault', 'My vault', 6, 14, { items: [] }),
    ],
  },
  event: {
    label: 'For events',
    note: 'your event',
    description: 'Upcoming events and your calendar',
    // The Dashboard first (Coming up shows their event); the calendar is where it lands.
    modules: () => [
      module('dashboard', 'Dashboard', 12, 20, {}),
      module('calendar', 'My calendar', 12, 12, { events: [] }),
    ],
  },
  groups: {
    label: 'For groups',
    note: 'your group',
    description: 'What’s new in your groups, and their events',
    // The Dashboard first, focused on their group while they're new.
    modules: () => [
      module('dashboard', 'Dashboard', 12, 18, { sections: ['needs', 'groups'] }),
      module('events', 'Upcoming events', 12, 10, { events: [], ownEvents: false }),
    ],
  },
  friends: {
    label: 'For friends',
    note: 'keeping up with friends',
    description: 'What your friends are posting',
    modules: () => [
      module('dashboard', 'Dashboard', 12, 14, { sections: ['needs', 'friends'] }),
    ],
  },
  messages: {
    label: 'For messages',
    note: 'your conversations',
    description: 'What’s waiting for you',
    modules: () => [
      module('dashboard', 'Dashboard', 12, 12, { sections: ['needs'] }),
    ],
  },
  organized: {
    label: 'For getting organized',
    note: 'getting organized',
    description: 'Your tasks, calendar, and notes',
    modules: () => [
      module('todo', 'My tasks', 8, 12, { tasks: [] }),
      module('calendar', 'My calendar', 4, 12, { events: [] }),
      module('note', 'Notes to self', 12, 10, { html: '<p></p>' }),
    ],
  },
  everything: {
    label: 'A bit of everything',
    note: null,
    description: 'Dashboard, calendar, and a vault for your files',
    // The default order: Dashboard, calendar, vault (Leo, Nov 14). Tasks and notes are in the library.
    modules: () => [
      module('dashboard', 'Dashboard', 12, 10, {}),
      module('calendar', 'My calendar', 7, 12, { events: [] }),
      module('vault', 'My vault', 5, 12, { items: [] }),
    ],
  },
  blank: {
    label: 'Start blank',
    note: null,
    description: 'Nothing yet: add modules yourself',
    modules: () => [],
  },
};

/** Which layout each way of arriving starts with. */
// eslint-disable-next-line no-unused-vars -- the old per-arrival defaults, kept for reference
const LAYOUT_FOR_SOURCE = {
  event: 'event',
  host: 'event',
  group: 'groups',
  organizer: 'groups',
  blog: 'friends',
  follow: 'friends',
  message: 'messages',
  organized: 'organized',
  direct: 'everything',
};

/** Every new homepage starts with the standard layout (Dashboard and vault); LAYOUT_FOR_SOURCE is kept for reference. */
export function layoutForArrival(_source) {
  return 'standard';
}

// ─── Group templates ─────────────────────────────────────────────────────────

/**
 * Templates for a new group (the Create a group page). The first four
 * (`featured`) are broad and always shown; "See more templates" opens the
 * rest. `hidden` ones aren't offered any more but keep older groups and
 * sample data working (createStarterGroupModules looks them up by id).
 */
export const GROUP_TEMPLATES = [
  // Two small modules each (Nov 16): a page that fits about one screen; the rest is a click away in the module panel.
  // ── The four broad ones ──
  {
    id: 'friends', label: 'Friends and family', featured: true, description: 'A chat and a shared calendar',
    modules: () => [
      module('chat', 'Chat', 6, 10, null),
      module('calendar', 'Calendar', 6, 10, { events: [] }),
    ],
  },
  {
    id: 'community', label: 'IRL community', featured: true, description: 'People who meet in person, like a neighborhood, a club, or a congregation: announcements and events with RSVPs',
    modules: () => [
      module('announcements', 'Board', 8, 9, { posts: [] }),
      module('events', 'Upcoming events', 4, 9, { events: [], ownEvents: true }),
    ],
  },
  {
    id: 'online', label: 'Digital community', featured: true, description: 'People who gather online around a hobby, a game, or a cause: a forum and a chat',
    modules: () => [
      module('forum', 'Forum', 8, 12, null),
      module('chat', 'Chat', 4, 12, null),
    ],
  },
  {
    id: 'business', label: 'Business', featured: true, description: 'A shop, a bar, a studio: photos and upcoming events for customers (make that tab public)',
    modules: () => [
      module('generalfeed', 'Photos', 8, 9, { posts: [], events: [] }),
      module('events', 'Upcoming events', 4, 9, { events: [], ownEvents: true }),
    ],
  },
  // ── Behind "See more templates" ──
  {
    id: 'club', label: 'Band, club, or team', description: 'A photo feed and upcoming events (you could make that tab public)',
    modules: () => [
      module('generalfeed', 'Photos', 8, 9, { posts: [], events: [] }),
      module('events', 'Upcoming events', 4, 9, { events: [], ownEvents: true }),
    ],
  },
  {
    id: 'class', label: 'Class', description: 'Announcements and assignments',
    modules: () => [
      module('announcements', 'Board', 6, 9, { posts: [] }),
      module('submissions', 'Assignments', 6, 9, null),
    ],
  },
  {
    id: 'organizing', label: 'Community organizing', description: 'A forum and upcoming events with RSVPs',
    modules: () => [
      module('forum', 'Forum', 8, 9, null),
      module('events', 'Upcoming events', 4, 9, { events: [], ownEvents: true }),
    ],
  },
  {
    id: 'news', label: 'News outlet or newsletter', description: 'Articles laid out like a news site, and quick updates (make that tab public for readers)',
    modules: () => [
      module('articles', 'Stories', 8, 12, { articles: [] }),
      module('textfeed', 'Latest', 4, 12, { posts: [], events: [] }),
    ],
  },
  {
    id: 'nonprofit', label: 'Nonprofit or volunteer group', description: 'Shifts people sign up for, and upcoming events',
    modules: () => [
      module('shifts', 'Shifts', 8, 9, null),
      module('events', 'Upcoming events', 4, 9, { events: [], ownEvents: true }),
    ],
  },
  {
    id: 'faith', label: 'Faith community', description: 'Announcements and a calendar of services and gatherings',
    modules: () => [
      module('announcements', 'Board', 8, 9, { posts: [] }),
      module('calendar', 'Calendar', 4, 9, { events: [] }),
    ],
  },
  {
    id: 'trip', label: 'Trip or event planning', description: 'A calendar for the plan and a packing list',
    modules: () => [
      module('calendar', 'The plan', 6, 10, { events: [] }),
      module('todo', 'Packing list', 6, 10, { tasks: [], view: 'lists', items: [], history: [] }),
    ],
  },
  {
    id: 'hobby', label: 'Book club or hobby group', description: 'A forum for what you’re reading or making, and meetups',
    modules: () => [
      module('forum', 'Forum', 8, 9, null),
      module('events', 'Meetups', 4, 9, { events: [], ownEvents: true }),
    ],
  },
  {
    id: 'house', label: 'Household', description: 'A to-do list and a calendar',
    modules: () => [
      module('todo', 'House to-do', 6, 9, null),
      module('calendar', 'House calendar', 6, 9, { events: [] }),
    ],
  },
  {
    // Just the conversation: one forum across the whole page.
    id: 'forum', label: 'Forum', description: 'One big forum, front and center: threads, replies, and tags',
    modules: () => [
      module('forum', 'Forum', 12, 16, null),
    ],
  },
  // ── What Create a group makes now (Nov 20: no template picker) ──
  // A private group gets "friends" (a chat and a calendar). One with a public
  // page also gets a feed and upcoming events, which go on its Public tab.
  {
    id: 'public-page', label: 'Group with a public page', hidden: true,
    description: 'A chat and a calendar for members, and posts and upcoming events on a public page',
    modules: () => [
      module('chat', 'Chat', 6, 10, null),
      module('calendar', 'Calendar', 6, 10, { events: [] }),
      module('generalfeed', 'Posts', 8, 9, null),
      module('events', 'Upcoming events', 4, 9, null),
    ],
  },
  {
    // Not offered in Settings → Layout (applying it would just empty the page).
    id: 'blank', label: 'Blank slate', description: 'An empty page. Add the modules you want in edit mode.', blank: true,
    modules: () => [],
  },
  // ── No longer offered (older groups and sample data use them) ──
  {
    id: 'family', label: 'Family', hidden: true, description: 'Announcements, a calendar, and a list for who’s bringing what',
    modules: () => [
      module('announcements', 'Family news', 8, 11, { posts: [] }),
      module('calendar', 'Family calendar', 4, 11, { events: [] }),
      module('todo', 'Who’s bringing what', 12, 12, { tasks: [], view: 'lists', items: [], history: [] }),
    ],
  },
  {
    id: 'other', label: 'Something else', hidden: true, description: 'Announcements, a calendar, and a to-do list',
    modules: () => [
      module('announcements', 'Board', 8, 12, { posts: [] }),
      module('calendar', 'Calendar', 4, 12, { events: [] }),
      module('todo', 'To-do', 12, 10, { tasks: [] }),
    ],
  },
];
