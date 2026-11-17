// @ts-check
/**
 * more-link.js — short homepage cards: a card shows its first few items
 * and a "4 more" link to the full page, instead of scrolling inside itself.
 *
 *   const { shown, more } = firstFew(items, () => context.openFullPage?.());
 *   replaceChildren(list, shown.map(render), more);
 */

import { h } from './dom.js';
import { icon } from './icons.js';

/** How many items a card shows before "N more". */
export const CARD_ITEMS = 3;

export function firstFew(items, onMore, { limit = CARD_ITEMS, tag = 'button' } = {}) {
  const hidden = items.length - limit;
  return {
    shown: hidden > 0 ? items.slice(0, limit) : items,
    more: hidden > 0 && onMore ? h(tag === 'li' ? 'li' : 'div', { class: 'card-more' },
      h('button', { type: 'button', class: 'link-button card-more__link', onClick: onMore }, `${hidden} more`, icon('chevronRight', 12))) : null,
  };
}
