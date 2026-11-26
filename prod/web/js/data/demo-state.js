// @ts-check
/**
 * demo-state.js — the example data the prototype starts with.
 *
 * You're signed in as Leo. His groups show the different ways people use
 * 3den (each lives in its own file in js/data/demo/):
 *
 *   house.js       "14 Juniper Lane"        his household
 *   tenants.js     "Juniper Tenants Union"  neighborhood housing organizing
 *   band.js        "Porch Lights"           a folk band (a hobby group)
 *   mutual-aid.js  "Eastside Mutual Aid"    a public volunteer group
 *   family.js      "Larsen Family"          his extended family, around Thanksgiving
 *   classroom.js   "Urban Policy 210"       a seminar he's taking
 *   explore.js     public groups he isn't in, for the Explore tab
 *   personal.js    his private homepage
 *   blogs.js       everyone's public blog, and likes and comments on posts
 *   social.js      friends, messages, and notifications
 *   places.js      where each event is (area) and its tags, two events out of town, Leo's area
 *   people.js      the demo accounts
 *   growth.js      the growth model: six people who started using 3den for
 *                  something of their own, and the ~250 who joined through
 *                  their invitations over 12 weeks (growth-model.js)
 *
 * All posts, tasks, events and files are made-up sample content. Dates are
 * calculated relative to today so calendars and due dates always look
 * current.
 */

import { migrateSpace } from './module-migrations.js';
import { upNextStarter } from './starters.js';
import { hoursAgo } from './demo/helpers.js';
import { PEOPLE } from './demo/people.js';
import { createHouse } from './demo/house.js';
import { createTenantsUnion } from './demo/tenants.js';
import { createBand } from './demo/band.js';
import { createMutualAid } from './demo/mutual-aid.js';
import { createFamily } from './demo/family.js';
import { createClassroom } from './demo/classroom.js';
import { createExploreGroups } from './demo/explore.js';
import { createLeague, createLeagueReports } from './demo/league.js';
import { createPersonalSpace } from './demo/personal.js';
import { createDemoBlogs, createDemoReactions } from './demo/blogs.js';
import { createDemoFriendships, createDemoNotifications, createDemoConversations } from './demo/social.js';
import { placeDemoEvents, DEMO_LOCATIONS } from './demo/places.js';
import { createGrowthDemo } from './demo/growth.js';
import { createYearDemo } from './demo/year.js';
import { resetBudgetIds } from './demo/budgets.js';

export function createDemoState() {
  resetBudgetIds();
  return stableIds(buildDemoState());
}

/**
 * Starter modules on demo homepages and blogs get random ids (makeId); give
 * them ids from their space instead, so every build of the demo is the same
 * and an update can tell what's new (js/state/upgrade.js).
 */
function stableIds(state) {
  const renames = new Map();
  for (const space of state.spaces) {
    let n = 0;
    for (const module of space.modules ?? []) {
      if (/^mod-[a-z0-9]{5,8}$/.test(module.id)) renames.set(module.id, `${space.id}--${module.type}-${++n}`);
    }
  }
  if (!renames.size) return state;
  const json = JSON.stringify(state).replace(/"(mod-[a-z0-9]{5,8})"/g, (whole, id) => (renames.has(id) ? `"${renames.get(id)}"` : whole));
  return JSON.parse(json);
}

function buildDemoState() {
  const growth = createGrowthDemo();
  const year = createYearDemo();
  const spaces = [
    createHouse(),
    createTenantsUnion(),
    createBand(),
    createMutualAid(),
    createFamily(),
    createClassroom(),
    ...createExploreGroups(),
    ...createLeague(), // a league calendar shared with two teams (js/state/shared-modules.js)
    createPersonalSpace('m-leo'),
    ...createDemoBlogs(),
    ...growth.spaces,
    ...year.spaces, // a year of 3den: about 1,600 people, 80 groups, and their blogs (js/data/demo/year.js)
  ];
  return {
    version: 3,
    members: [
      ...structuredClone(PEOPLE).map((m) => (DEMO_LOCATIONS[m.id] ? { ...m, location: DEMO_LOCATIONS[m.id] } : m)),
      ...growth.members,
      ...year.members,
    ],
    currentUserId: 'm-leo',
    spaces: placeDemoEvents(spaces.map(withDefaults).map(migrateSpace)),
    conversations: [...createDemoConversations(), ...year.conversations],
    notifications: [...createDemoNotifications(), ...year.notifications],
    friendships: [...createDemoFriendships(), ...growth.friendships, ...year.friendships],
    reactions: { ...createDemoReactions(), ...year.reactions },
    reports: createLeagueReports(), // the moderation queue's sample (js/groups/moderation-tab.js)
    // "I've met them in person" (js/state/vouches.js).
    vouches: [
      { fromId: 'm-maya', toId: 'm-grace', createdAt: hoursAgo(300) },
      { fromId: 'm-theo', toId: 'm-grace', createdAt: hoursAgo(200) },
      { fromId: 'm-maya', toId: 'm-priya', createdAt: hoursAgo(400) },
      { fromId: 'm-iris', toId: 'm-priya', createdAt: hoursAgo(380) },
      { fromId: 'm-priya', toId: 'm-leo', createdAt: hoursAgo(350) },
    ],
    // Thank-yous after events, shown on the thanked person's blog (js/state/thanks.js).
    thanks: [
      { id: 'thx-1', fromId: 'm-leo', toId: 'm-grace', eventId: 'aid-ev-1', eventTitle: 'Saturday free pantry', text: 'You kept the line moving and still knew everyone’s name.', createdAt: hoursAgo(50) },
      { id: 'thx-2', fromId: 'm-theo', toId: 'm-grace', eventId: 'aid-ev-1', eventTitle: 'Saturday free pantry', text: '', createdAt: hoursAgo(28) },
      { id: 'thx-3', fromId: 'm-maya', toId: 'm-priya', eventId: 'tenants-ev-1', eventTitle: 'Know your rights workshop', text: 'The Cantonese interpreter made all the difference.', createdAt: hoursAgo(20) },
    ],
    // When each person last opened each space; the Groups menu lists the most recent first.
    visits: {
      'm-leo': {
        juniper: hoursAgo(1),
        me: hoursAgo(3),
        larsen: hoursAgo(20),
        porchlights: hoursAgo(30),
        tenants: hoursAgo(50),
        mutualaid: hoursAgo(90),
        urban210: hoursAgo(120),
        ...year.visits,
      },
      ...year.othersVisits,
    },
  };
}

/** Fill in the settings every space has, so the demo files can leave out the empty ones. */
function withDefaults(space) {
  if (space.kind !== 'group') return { appearance: {}, ...space }; // personal homepages and blogs
  // Every group's first module is Up next (js/modules/upnext/), on its Home tab.
  const modules = space.modules.some((m) => m.type === 'upnext') ? space.modules : [upNextStarter(`${space.id}-upnext`), ...space.modules];
  return { description: '', permissions: {}, appearance: {}, joinRequests: [], ...space, modules };
}
