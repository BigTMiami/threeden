// @ts-check
/**
 * shortcuts.js — press ? (anywhere you're not typing) for every keyboard
 * shortcut in 3den, grouped by where they work. Also in the account menu
 * and Help. The calendar's full page keeps its own ? (its shortcuts are
 * listed here too).
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/** @type {[string, [string[], string][]][]} */
const GROUPS = [
  ['Anywhere', [
    [[MOD, 'K'], 'Jump to a group, page, person, or event'],
    [['?'], 'These shortcuts'],
    [['Esc'], 'Close a menu, dialog, or sheet'],
  ]],
  ['Changing a name or date in place', [
    [['Enter'], 'Save'],
    [['Esc'], 'Put it back'],
  ]],
  ['Writing (notes, documents, articles)', [
    [[MOD, 'B'], 'Bold'], [[MOD, 'I'], 'Italic'], [[MOD, 'U'], 'Underline'],
    [[MOD, 'K'], 'Add a link'],
    [[MOD, 'Shift', '7 / 8 / 9'], 'Numbered list, bullets, checklist'],
    [[MOD, 'Alt', '1–3'], 'Headings'],
    [[MOD, '\\'], 'Clear formatting'],
    [['#', 'Space'], 'Heading (also - for bullets, [] for a checklist, > for a quote)'],
  ]],
  ['Spreadsheets', [
    [['Arrows'], 'Move'], [['Shift', 'Arrows'], 'Select'],
    [['Enter'], 'Edit a cell'], [['Delete'], 'Clear'],
    [[MOD, 'D'], 'Fill down'], [[MOD, 'R'], 'Fill right'], [[MOD, 'C'], 'Copy'],
  ]],
  ['Calendar (full page)', [
    [['T'], 'Today'], [['J'], 'Next'], [['K'], 'Previous'],
    [['M / W / D / A'], 'Month, week, day, agenda'],
    [['N'], 'New entry'], [['E'], 'New event'], [['/'], 'Search'],
  ]],
  ['Drawing', [
    [['B / P / E'], 'Brush, pencil, eraser'],
    [['[ ]'], 'Smaller or bigger brush'],
    [[MOD, 'Z'], 'Undo'], [[MOD, 'S'], 'Save'],
  ]],
];

let open = null;

const isTyping = (target) => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));

export function initShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    // The calendar's full page shows its own list for ?.
    const calendar = /** @type {HTMLElement | null} */ (document.querySelector('.calendar-page__toolbar'));
    if (calendar?.offsetParent) return;
    event.preventDefault();
    if (open) closeShortcuts(); else openShortcuts();
  });
}

export function openShortcuts() {
  if (open) return;
  const previous = /** @type {HTMLElement | null} */ (document.activeElement);
  const close = () => { closeShortcuts(); previous?.focus?.(); };
  open = h('div', { class: 'shortcuts-backdrop', onClick: (e) => { if (e.target === open) close(); } },
    h('div', { class: 'shortcuts', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'shortcuts-title', onKeydown: (e) => { if (e.key === 'Escape') close(); } },
      h('div', { class: 'shortcuts__head' },
        h('h2', { class: 'shortcuts__title', id: 'shortcuts-title' }, 'Keyboard shortcuts'),
        h('button', { type: 'button', class: 'icon-button shortcuts__close', 'aria-label': 'Close', onClick: close }, icon('close', 16))),
      h('div', { class: 'shortcuts__groups' }, GROUPS.map(([title, rows]) => h('section', { class: 'shortcuts__group' },
        h('h3', { class: 'shortcuts__group-title' }, title),
        h('dl', { class: 'shortcuts__list' }, rows.map(([keys, what]) => [
          h('dt', {}, keys.map((k, i) => [i ? ' ' : null, h('kbd', {}, k)])),
          h('dd', {}, what),
        ])))))));
  document.body.append(open);
  /** @type {HTMLElement | null} */ (open.querySelector('.shortcuts__close'))?.focus();
}

export function closeShortcuts() {
  open?.remove();
  open = null;
}
