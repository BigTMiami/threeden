// @ts-check
/**
 * more-menu.js — a "…" button with a short menu of actions (Nov 18).
 *
 *   [ … ]  click →  ┌─────────┐
 *                   │ Share   │
 *                   │ Rename  │
 *                   │ Delete  │   (danger: red)
 *                   └─────────┘
 *
 *   moreMenu({ label: 'More for “Budget”', items: [
 *     { label: 'Share', icon: 'share', onSelect: () => … },
 *     { label: 'Delete', icon: 'trash', danger: true, onSelect: () => … },
 *   ] })  → the button
 *
 * The menu floats on the page (placed on screen and above the phone's tab
 * bar by media-attach.js), so a module's scrolling body can't cut it off.
 * ↑ ↓ move, Enter picks, Esc or a click outside closes.
 */

import { h } from './dom.js';
import { icon } from './icons.js';
import { followAnchor } from './media-attach.js';

/**
 * @param {{ label: string, items: ({ label: string, icon?: string, danger?: boolean, onSelect: () => void } | null)[], className?: string }} options
 */
export function moreMenu({ label, items, className = '' }) {
  const shown = items.filter(Boolean);
  let menu = null;
  let stopFollowing = () => {};
  // While open: if the list redraws and takes the button away, close the menu too.
  const watcher = new MutationObserver(() => { if (menu && !button.isConnected) close(); });

  const button = h('button', {
    type: 'button', class: `icon-button more-menu__button ${className}`.trim(),
    'aria-label': label, title: label, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onClick: (event) => { event.stopPropagation(); if (menu) close(); else open(); },
  }, icon('more', 16));

  function close({ focus = false } = {}) {
    if (!menu) return;
    stopFollowing();
    menu.remove();
    menu = null;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    watcher.disconnect();
    if (focus) button.focus();
  }

  function open() {
    menu = h('div', { class: 'more-menu', role: 'menu', 'aria-label': label },
      shown.map((item) => h('button', {
        type: 'button', role: 'menuitem', class: `more-menu__item${item.danger ? ' is-danger' : ''}`,
        onClick: (event) => { event.stopPropagation(); close(); item.onSelect(); },
      }, item.icon ? icon(item.icon, 15) : null, h('span', {}, item.label))));
    document.body.append(menu);
    button.setAttribute('aria-expanded', 'true');
    stopFollowing = followAnchor(menu, button, () => close(), { align: 'end' });
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    watcher.observe(document.body, { childList: true, subtree: true });
    /** @type {HTMLElement | null} */ (menu.querySelector('button'))?.focus();
  }

  function onOutside(event) {
    if (menu && !menu.contains(event.target) && !button.contains(event.target)) close();
  }
  function onKey(event) {
    if (!menu) return;
    const buttons = [...menu.querySelectorAll('button')];
    const at = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close({ focus: true }); }
    if (event.key === 'ArrowDown') { event.preventDefault(); buttons[(at + 1) % buttons.length]?.focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); buttons[(at - 1 + buttons.length) % buttons.length]?.focus(); }
    if (event.key === 'Tab') close();
  }

  return button;
}
