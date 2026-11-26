// @ts-check
/**
 * empty-state.js — what a module or page shows when there's nothing in it
 * yet: an icon, a short title, one line on what goes here, and (when the
 * person can) the button that adds the first thing.
 *
 *   emptyState({ icon: 'calendar', title: 'No events yet', text: 'Plan one…',
 *                action: { label: 'Plan an event', onClick | href }, compact, tag: 'li' })
 *
 * Styles: .empty-state in css/base.css.
 */

import { h } from './dom.js';
import { icon as drawIcon } from './icons.js';

export function emptyState({ icon = null, title, text = null, action = null, compact = true, tag = 'div' }) {
  return h(tag, { class: `empty-state${compact ? ' empty-state--compact' : ''}` },
    icon ? h('span', { class: 'empty-state__icon', 'aria-hidden': 'true' }, drawIcon(icon, compact ? 18 : 24)) : null,
    h('p', { class: 'empty-state__title' }, title),
    text ? h('p', {}, text) : null,
    action ? (action.href
      ? h('a', { class: 'button button--small', href: action.href }, action.label)
      : h('button', { type: 'button', class: 'button button--small', onClick: action.onClick }, action.label)) : null);
}
