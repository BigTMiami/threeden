// @ts-check
/**
 * compose-toggle.js — a "+ New post" button that opens a form, instead of
 * a form that's always open. Used by Announcements (card and full page);
 * the forum's "+ New thread" and the feeds' + work the same way.
 *
 *   const toggle = composeToggle(form, { label: 'New post' });
 *   container.append(toggle.element);
 *   … after posting: toggle.close();
 *
 * × closes it again (what's typed stays, for when it's opened next).
 */

import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * @param {HTMLElement} form
 * @param {{ label?: string, className?: string, startOpen?: boolean }} [options]
 */
export function composeToggle(form, { label = 'New post', className = '', startOpen = false } = {}) {
  const openButton = h('button', { type: 'button', class: 'button button--primary button--small compose-toggle__open' }, icon('plus', 14), ` ${label}`);
  const closeButton = h('button', { type: 'button', class: 'icon-button compose-toggle__close', 'aria-label': 'Close', title: 'Close (what you typed stays)' }, icon('close', 14));
  const panel = h('div', { class: 'compose-toggle__panel' }, closeButton, form);
  const element = h('div', { class: `compose-toggle ${className}` }, h('div', { class: 'compose-toggle__bar' }, openButton), panel);

  const set = (open) => {
    panel.hidden = !open;
    openButton.hidden = open;
    element.classList.toggle('is-open', open);
    if (open) requestAnimationFrame(() => /** @type {HTMLElement | null} */ (form.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea'))?.focus());
  };
  openButton.addEventListener('click', () => set(true));
  closeButton.addEventListener('click', () => { set(false); openButton.focus(); });
  set(startOpen);
  return { element, open: () => set(true), close: () => set(false) };
}
