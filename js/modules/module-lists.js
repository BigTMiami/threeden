// @ts-check
/**
 * module-lists.js — which modules a page's module list offers, and in what
 * order. Shared by the edit-mode module list (js/editor/library.js), the
 * "Set up your group's page" picker (js/groups/group-setup.js), and the
 * group's Layout settings (js/groups/layout-tab.js).
 *
 *   The basics      BASICS[kind], in that order
 *   More modules    everything else, in the registry's order
 *   Less common     LESS_COMMON, at the bottom
 *
 * Where each module is offered is OFFERED_ON, from Leo's review (Nov 20):
 * four kinds of page, a group's public page (its public tab), a group's
 * private page (every other group tab: Home on a group without a public
 * page, Private on one with), a user's homepage, and a user's blog.
 * Modules already on a page stay where they are; they just aren't offered.
 * A type missing from OFFERED_ON is offered wherever its spaceKinds allow.
 */

/** "The basics", in order, for each kind of page; the rest are one tap away. */
export const BASICS = {
  group: ['announcements', 'upnext', 'calendar', 'chat', 'vault', 'todo', 'vaultfile'],
  personal: ['dashboard', 'calendar', 'events', 'todo', 'vault', 'vaultfile', 'budget', 'gantt', 'recentgroups'],
};

/** Modules few pages use: in their own "Less common modules" menu at the bottom of the list (unless they're one of the basics). */
export const LESS_COMMON = ['gantt', 'relationship', 'survey', 'shifts', 'recents', 'recentgroups', 'gallery', 'carousel'];

/** Where the module list offers each module (Nov 20 review). An empty list: no module list offers it. */
export const OFFERED_ON = {
  upnext: ['groupPrivate'],
  announcements: ['groupPrivate'],
  calendar: ['groupPublic', 'groupPrivate', 'homepage'],
  events: ['groupPublic', 'blog'],
  chat: ['groupPrivate'],
  todo: ['groupPrivate', 'homepage'],
  forum: ['groupPublic', 'groupPrivate'],
  vault: ['groupPrivate', 'homepage'],
  submissions: ['groupPublic', 'groupPrivate'],
  budget: ['groupPrivate', 'homepage'],
  shifts: ['groupPrivate'],
  gantt: ['groupPrivate', 'homepage'],
  relationship: [],
  survey: [],
  articles: ['groupPublic', 'blog'],
  generalfeed: ['groupPublic', 'blog'],
  textfeed: ['groupPublic', 'blog'],
  carousel: ['groupPublic', 'blog'],
  vaultfile: ['groupPublic', 'groupPrivate', 'homepage', 'blog'],
  dashboard: ['homepage'],
  recentgroups: ['homepage'],
  recents: ['homepage'],
  about: ['groupPublic', 'blog'],
  gallery: ['groupPublic', 'blog'],
};

/** The OFFERED_ON name for a kind of page. */
export function pageKey(kind, { publicTab = false } = {}) {
  if (kind === 'group') return publicTab ? 'groupPublic' : 'groupPrivate';
  return kind === 'personal' ? 'homepage' : 'blog';
}

/**
 * Whether a module type is offered on this kind of page.
 * @param {{type: string}} moduleType
 * @param {string} kind
 * @param {{publicTab?: boolean}} [where]
 */
export function offeredOn(moduleType, kind, where = {}) {
  const places = OFFERED_ON[moduleType.type];
  return places ? places.includes(pageKey(kind, where)) : true;
}

/**
 * Split module types into the list's three parts, each in order.
 * @template {{type: string}} T
 * @param {T[]} types
 * @param {string} kind
 * @returns {{basics: T[], more: T[], rare: T[]}}
 */
export function splitForList(types, kind) {
  const basicIds = BASICS[kind] ?? BASICS.group;
  const isRare = (t) => LESS_COMMON.includes(t.type) && !basicIds.includes(t.type);
  const rare = types.filter(isRare);
  const rest = types.filter((t) => !isRare(t));
  const basics = basicIds.map((type) => rest.find((t) => t.type === type)).filter(Boolean);
  const more = rest.filter((t) => !basicIds.includes(t.type));
  return { basics, more, rare };
}

/**
 * Module types in the module list's order: the basics, more, then less common.
 * @template {{type: string}} T
 * @param {T[]} types
 * @param {string} kind
 * @returns {T[]}
 */
export function inListOrder(types, kind) {
  const { basics, more, rare } = splitForList(types, kind);
  return [...basics, ...more, ...rare];
}
