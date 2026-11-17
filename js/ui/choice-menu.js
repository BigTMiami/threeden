// @ts-check
/**
 * choice-menu.js — one choice showing, the others only when you ask.
 *
 *   [Open ▾]   click →  ┌────────┐
 *                       │ All    │
 *                       │ Open ✓ │
 *                       │ Mine   │
 *                       │ Done   │
 *                       └────────┘
 *
 * Instead of a row of buttons for every filter, the button shows the one
 * in use. ↑ ↓ move through the list, Enter picks, Esc closes.
 *
 *   choiceMenu({ label: 'Show', options: [{ id, label }], value, onChange })
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';

/**
 * @param {{ label: string, options: { id: string, label: string }[], value: string, onChange: (id: string) => void, prefix?: string, iconName?: string, display?: (option: { id: string, label: string }) => string, className?: string }} options
 *   iconName: an icon before the words; display: the button's words for a choice (default: its label)
 */
export function choiceMenu({ label, options, value, onChange, prefix = '', iconName = '', display = (o) => o.label, className = '' }) {
  let current = value;
  let open = false;
  const button = h('button', { type: 'button', class: 'choice-menu__button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
  const list = h('ul', { class: 'choice-menu__list', role: 'listbox', 'aria-label': label, hidden: true, tabindex: '-1' });
  const root = h('div', { class: `choice-menu ${className}` }, button, list);

  const drawButton = () => {
    const chosen = options.find((o) => o.id === current) ?? options[0];
    button.setAttribute('aria-label', `${label}: ${chosen.label}`);
    replaceChildren(button, iconName ? icon(iconName, 14) : null, prefix ? h('span', { class: 'choice-menu__prefix' }, prefix) : null, display(chosen), icon('chevronDown', 13));
  };

  const close = (refocus = true) => {
    if (!open) return;
    open = false;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (refocus) button.focus();
  };
  const outside = (event) => { if (!root.contains(event.target)) close(false); };

  const pick = (id) => {
    current = id;
    drawButton();
    close();
    onChange(id);
  };

  const openList = () => {
    open = true;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    replaceChildren(list, options.map((o) => h('li', {
      role: 'option', tabindex: '-1', class: `choice-menu__option${o.id === current ? ' is-current' : ''}`, 'aria-selected': String(o.id === current),
      onClick: () => pick(o.id),
      onKeydown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(o.id); } },
    }, o.label, o.id === current ? icon('check', 13) : null)));
    document.addEventListener('pointerdown', outside, true);
    /** @type {HTMLElement | null} */ (list.querySelector('.is-current') ?? list.firstElementChild)?.focus();
  };

  button.addEventListener('click', () => (open ? close() : openList()));
  root.addEventListener('keydown', (event) => {
    if (!open) return;
    const items = /** @type {HTMLElement[]} */ ([...list.children]);
    const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); items[(at + 1) % items.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
    else if (event.key === 'Tab') close(false);
  });

  drawButton();
  return root;
}
