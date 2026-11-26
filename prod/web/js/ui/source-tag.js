/**
 * source-tag.js — the small label on a linked item saying which group it
 * comes from. Clicking it opens the item in the group's module.
 *
 *   ☐ Fix the truing stand   [↗ Saturday Bike Kitchen]
 *
 * See js/editor/linked-items.js for what a link is.
 */

import { h } from './dom.js';
import { icon } from './icons.js';
import { getCurrentSpace } from '../state/store.js';

/**
 * What the tag says: the group's name, or, when you're already on that
 * group's page, just the module it's from ("Calendar"), so the page doesn't
 * keep repeating its own name.
 */
function labelOf(link) {
  return getCurrentSpace()?.id === link.spaceId ? link.moduleTitle : link.spaceName;
}

/**
 * @param {object}   link     a linked item from context.getLinkedItems()
 * @param {function} onOpen   called when the tag is clicked
 */
export function sourceTag(link, onOpen) {
  return h('button', {
    type: 'button',
    class: 'source-tag',
    title: `From “${link.moduleTitle}” in ${link.spaceName}. Click to open it there.`,
    'aria-label': `Open in ${link.spaceName}`,
    onClick: (event) => {
      event.stopPropagation(); // don't also select the row it sits in
      onOpen(link);
    },
  }, icon('link', 11), ` ${labelOf(link)}`);
}

/** The same label, but not clickable: for use inside a row that is itself a button. */
export function sourceLabel(link) {
  return h('span', { class: 'source-tag source-tag--static', title: `From “${link.moduleTitle}” in ${link.spaceName}` },
    icon('link', 11), ` ${labelOf(link)}`);
}

/** A one-line note for a details panel: "From House to-do in 237 Hart Street. Open there". */
export function linkedNote(link, onOpen, extra = 'Changes here update it there too.') {
  return h('p', { class: 'linked-note' },
    icon('link', 12),
    ` From “${link.moduleTitle}” in ${link.spaceName}. ${extra} `,
    h('button', { type: 'button', class: 'link-button', onClick: () => onOpen(link) }, 'Open there'),
  );
}
