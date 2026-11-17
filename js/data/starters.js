// @ts-check
/**
 * starters.js — what a brand-new account or group starts with.
 *
 *   createStarterHomepage(ownerId, layoutId)  a new account's private homepage,
 *                                             laid out for how they arrived
 *   createStarterBlog(ownerId, ownerName)     a blog with just a General feed (made when someone says yes
 *                                             to "dive into 3den", not at sign-up)
 *   createStarterGroupModules(templateId)     a new group's first modules
 *
 * The layouts and group templates themselves are in starter-layouts.js.
 *
 * Used by js/state/accounts.js and js/state/groups.js, and by the demo data
 * for demo people who haven't set up their blogs.
 */

import { getModuleType } from '../modules/registry.js';
import { makeId } from '../ui/dom.js';
import { STARTER_LAYOUTS, GROUP_TEMPLATES } from './starter-layouts.js';

/** A new account's personal homepage, with the modules of one starting layout. */
export function createStarterHomepage(ownerId, layoutId = 'standard') {
  return {
    id: makeId('home'),
    kind: 'personal',
    name: 'My homepage',
    privacy: 'Only you',
    memberIds: [ownerId],
    appearance: {},
    // A module with no data yet (the budget) gets its type's fresh data.
    modules: (STARTER_LAYOUTS[layoutId] ?? STARTER_LAYOUTS.standard).modules()
      .map((m) => (m.data ? m : { ...m, data: getModuleType(m.type).createInitialData({ currentUserId: ownerId }) })),
  };
}

/**
 * A new account's blog: public, with a General feed to post in (it shows
 * up in friends' Feeds), an empty "About me" document and an Upcoming
 * events list.
 */
export function createStarterBlog(ownerId, ownerName = 'My') {
  return {
    id: `blog-${ownerId}`,
    kind: 'blog',
    name: `${ownerName.split(' ')[0]}’s blog`,
    description: '',
    memberIds: [ownerId],
    appearance: {},
    // Just a feed to start (Nov 15): the rest (About me, events, photos…) is one tap away in edit mode.
    modules: [
      { id: makeId('mod'), type: 'generalfeed', title: 'Posts', span: 12, rows: 16, data: { posts: [], events: [] } },
    ],
  };
}

/**
 * A new group's first modules, from a template (default: announcements, a
 * calendar and a to-do list). Modules whose data is null get their type's
 * own starting data when the group is made (createGroup in groups.js).
 */
export function createStarterGroupModules(templateId = 'friends') {
  const template = GROUP_TEMPLATES.find((t) => t.id === templateId) ?? GROUP_TEMPLATES.find((t) => t.id === 'other');
  // Every group starts with Up next: what's next, and everything new (js/modules/upnext/). A blank slate stays blank.
  return template.blank ? template.modules() : [upNextStarter(), ...template.modules()];
}

/** The Up next module a group starts with. */
export const upNextStarter = (id = makeId('mod')) => ({ id, type: 'upnext', title: 'Up next', span: 12, rows: 7, data: {} });
