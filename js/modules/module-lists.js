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
 * A group's private tabs (every tab that isn't public, Nov 20) don't offer
 * NOT_ON_PRIVATE_PAGE: those are for a group's public page. Modules already
 * on a private tab stay; they just aren't offered there.
 */

/** "The basics", in order, for each kind of page; the rest are one tap away. */
export const BASICS = {
  group: ['announcements', 'upnext', 'calendar', 'chat', 'vault', 'todo', 'vaultfile'],
  personal: ['dashboard', 'calendar', 'events', 'todo', 'vault', 'vaultfile', 'budget', 'gantt', 'recentgroups'],
};

/** Modules few pages use: in their own "Less common modules" menu at the bottom of the list (unless they're one of the basics). */
export const LESS_COMMON = ['gantt', 'relationship', 'survey', 'shifts', 'recents', 'recentgroups', 'gallery', 'carousel'];

/** Not offered on a group's private tabs (Nov 20). */
export const NOT_ON_PRIVATE_PAGE = new Set(['events', 'articles', 'generalfeed', 'textfeed', 'relationship', 'survey', 'carousel']);

/**
 * Whether a module type is offered on this kind of page.
 * @param {{type: string}} moduleType
 * @param {string} kind
 * @param {{publicTab?: boolean}} [where]
 */
export function offeredOn(moduleType, kind, { publicTab = false } = {}) {
  return !(kind === 'group' && !publicTab && NOT_ON_PRIVATE_PAGE.has(moduleType.type));
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
