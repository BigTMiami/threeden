// @ts-check
/**
 * next-step.js — the one line a newcomer sees, instead of a checklist card,
 * floating tips, and suggestions all at once:
 *
 *   → Next: Answer “Street fair”   [Show me]   1 of 4   ×
 *
 * A group uses it for your first weeks there (welcome-checklist.js) and for
 * suggestions as it grows (group-suggestions.js). Finishing a
 * step moves the line on to the next one; × hides it for good.
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/**
 * @param {{
 *   label: string,
 *   ariaLabel: string,
 *   done?: number,
 *   total?: number,
 *   action?: { label: string, run: () => void } | null,
 *   href?: string | null,
 *   extra?: HTMLElement | null,
 *   onHide?: (() => void) | null,
 *   hideLabel?: string,
 *   className?: string,
 * }} options
 */
export function nextStepLine({ label, ariaLabel, done, total, action = null, href = null, extra = null, onHide = null, hideLabel = 'Hide this', className = '' }) {
  return h('section', { class: `next-step ${className}`, 'aria-label': ariaLabel },
    h('p', { class: 'next-step__line' },
      h('span', { class: 'next-step__arrow', 'aria-hidden': 'true' }, icon('arrowLeft', 14)),
      h('span', { class: 'next-step__label' }, h('strong', {}, 'Next: '), href ? h('a', { href }, label) : label),
      action ? h('button', { type: 'button', class: 'button button--small button--primary next-step__go', onClick: action.run }, action.label) : null,
      total ? h('span', { class: 'next-step__count' }, `${done} of ${total}`) : null,
      onHide ? h('button', { type: 'button', class: 'icon-button icon-button--subtle next-step__hide', 'aria-label': hideLabel, title: hideLabel, onClick: onHide }, icon('close', 14)) : null),
    extra);
}
