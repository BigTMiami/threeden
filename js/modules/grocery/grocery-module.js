// @ts-check
/**
 * grocery-module.js — the List module: one shared list, sorted into
 * sections, where people claim what they'll pick up or bring. Good for
 * groceries, a pantry's needs, or who's bringing what to dinner.
 *
 * (It started life as the Grocery list, so its type and files are still
 * called "grocery"; saved homepages refer to the type.)
 *
 * Files in this folder:
 *   grocery-module.js  ← this file: the module definition
 *   grocery-card.js    the homepage card (quick add, check off, claim)
 *   grocery-page.js    the full page (sections, filters, usual items, editing)
 *   grocery-parts.js   one item row (used by both)
 *   grocery-data.js    item shape, section guessing, and list changes
 *
 *   grocery-lists.js   many lists in one module: chips on the card, a sidebar on the page
 *
 * Data shape: { lists: [{ id, name, items, history }] } (an older single
 * list is { items, history }); items: see grocery-data.js.
 */

import { renderGroceryCard } from './grocery-card.js';
import { renderGroceryPage } from './grocery-page.js';
import { renderLists } from './grocery-lists.js';

export const groceryModule = {
  type: 'grocery',
  label: 'List',
  description: 'Shared lists: groceries, supplies, who’s bringing what, as many as you like',
  icon: 'list',
  defaultSpan: 4,
  defaultRows: 13,
  available: true,

  createInitialData() {
    return { items: [], history: [] };
  },

  render: (container, context) => renderLists(container, context, { full: false, renderList: renderGroceryCard }),
  renderFullPage: (container, context) => renderLists(container, context, { full: true, renderList: renderGroceryPage }),
};
