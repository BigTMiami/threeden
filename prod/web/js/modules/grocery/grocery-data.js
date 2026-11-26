// @ts-check
/**
 * grocery-data.js — the shared grocery list: items, aisles, who's buying.
 *
 * Data saved for a Grocery list module:
 *
 *   {
 *     items: [ {
 *       id, name,
 *       quantity: '2' | '1 bag' | '',
 *       category: 'produce',      ← one of CATEGORIES
 *       note: '',
 *       addedBy: 'm-maya',
 *       claimedBy: 'm-leo' | '',  ← "I'll get it"
 *       bought: false,
 *       boughtBy: '', boughtAt: 0,
 *       createdAt,
 *     } ],
 *     history: ['oat milk', …],   ← names of bought items that were cleared,
 *                                   for the "usual items" shortcuts
 *   }
 *
 * Every function here works on plain data and never touches the page.
 */

import { makeId } from '../../ui/dom.js';

/** Store sections, in the order you walk through a typical store. */
export const CATEGORIES = [
  { id: 'produce', label: 'Produce' },
  { id: 'bakery', label: 'Bakery' },
  { id: 'dairy', label: 'Dairy & eggs' },
  { id: 'meat', label: 'Meat & fish' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'frozen', label: 'Frozen' },
  { id: 'drinks', label: 'Drinks' },
  { id: 'household', label: 'Household' },
  { id: 'other', label: 'Other' },
];

/** Words that suggest a section, so most items sort themselves. */
const CATEGORY_HINTS = {
  produce: ['apple', 'banana', 'lemon', 'lime', 'onion', 'garlic', 'potato', 'tomato', 'lettuce', 'spinach', 'kale', 'carrot', 'pepper', 'avocado', 'herb', 'basil', 'cilantro', 'fruit', 'berries', 'ginger', 'cucumber', 'celery', 'mushroom', 'broccoli', 'zucchini', 'squash', 'orange'],
  bakery: ['bread', 'bagel', 'tortilla', 'bun', 'roll', 'baguette', 'croissant', 'pita'],
  dairy: ['milk', 'cheese', 'butter', 'yogurt', 'egg', 'cream', 'oat milk', 'feta', 'parmesan'],
  meat: ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tofu', 'tempeh', 'turkey', 'bacon', 'sausage', 'shrimp'],
  pantry: ['rice', 'pasta', 'beans', 'lentil', 'flour', 'sugar', 'oil', 'vinegar', 'salt', 'spice', 'cereal', 'oats', 'peanut butter', 'jam', 'honey', 'sauce', 'stock', 'broth', 'coffee', 'tea', 'can ', 'chips', 'crackers', 'nuts'],
  frozen: ['frozen', 'ice cream', 'peas'],
  drinks: ['juice', 'soda', 'beer', 'wine', 'seltzer', 'water'],
  household: ['soap', 'detergent', 'toilet paper', 'paper towel', 'sponge', 'trash bag', 'foil', 'batteries', 'shampoo', 'toothpaste', 'dish', 'bleach', 'cleaner'],
};

/** A best guess at an item's section from its name ('other' if nothing fits). */
export function guessCategory(name) {
  const text = ` ${name.toLowerCase()} `;
  for (const [category, words] of Object.entries(CATEGORY_HINTS)) {
    if (words.some((word) => text.includes(word))) return category;
  }
  return 'other';
}

/**
 * Split "2 lemons" or "1 bag rice" into a quantity and a name.
 * Text without a leading number is all name.
 */
export function parseItemText(text) {
  const match = text.trim().match(/^(\d+(?:[.,/]\d+)?\s*(?:x|bags?|boxes?|cans?|jars?|lbs?|kg|g|oz|bunch(?:es)?|dozen|packs?|bottles?)?)\s+(.+)$/i);
  if (!match) return { quantity: '', name: text.trim() };
  return { quantity: match[1].trim(), name: match[2].trim() };
}

export function normalizeItem(item) {
  return {
    quantity: '',
    category: 'other',
    note: '',
    addedBy: '',
    claimedBy: '',
    bought: false,
    boughtBy: '',
    boughtAt: 0,
    createdAt: 0,
    ...item,
  };
}

export function createItem({ name, quantity = '', category, addedBy }) {
  return normalizeItem({
    id: makeId('groc'),
    name,
    quantity,
    category: category || guessCategory(name),
    addedBy,
    createdAt: Date.now(),
  });
}

/** Items in store order, grouped by section; empty sections are left out. */
export function groupByCategory(items) {
  return CATEGORIES
    .map((category) => ({ ...category, items: items.filter((item) => item.category === category.id) }))
    .filter((group) => group.items.length > 0);
}

/**
 * Names you've bought before but don't have on the list now, most
 * often bought first: one tap to add them again.
 */
export function usualItems(items, history = [], limit = 8) {
  const onList = new Set(items.filter((i) => !i.bought).map((i) => i.name.toLowerCase()));
  const counts = new Map();
  for (const name of [...history, ...items.filter((i) => i.bought).map((i) => i.name)]) {
    const key = name.toLowerCase();
    if (onList.has(key)) continue;
    counts.set(key, { name, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit).map((entry) => entry.name);
}

// ─── Changing (these change `data` in place; callers clone first) ───────────

const HISTORY_LIMIT = 60;

export function toggleBought(data, itemId, memberId) {
  const item = data.items.find((i) => i.id === itemId);
  item.bought = !item.bought;
  item.boughtBy = item.bought ? memberId : '';
  item.boughtAt = item.bought ? Date.now() : 0;
}

export function claimItem(data, itemId, memberId) {
  data.items.find((i) => i.id === itemId).claimedBy = memberId;
}

export function removeItem(data, itemId) {
  data.items = data.items.filter((i) => i.id !== itemId);
}

/** Take bought items off the list, remembering their names for "usual items". */
export function clearBought(data) {
  const bought = data.items.filter((i) => i.bought);
  data.history = [...(data.history ?? []), ...bought.map((i) => i.name)].slice(-HISTORY_LIMIT);
  data.items = data.items.filter((i) => !i.bought);
  return bought.length;
}
