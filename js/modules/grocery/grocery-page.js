// @ts-check
/**
 * grocery-page.js — the List module as a full page.
 *
 *   9 to get · 2 you're getting · 3 checked off
 *   [ Item        ][ Qty ][ Section: Auto ▾ ][ Add ]
 *   Usual items: [+ oat milk] [+ bananas] …           ← bought before, one tap to re-add
 *   [ All | I'm getting | Nobody yet ]
 *
 *   PRODUCE ────────────────────────────────
 *   ☐ Lemons 2                 [I'll get it]  ×
 *   …
 *   CHECKED OFF (3) ────────────── [Clear]
 *   ☑ Bread                    got by Anna    ×
 *
 * Click an item's name to change its name, quantity, section or note.
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import {
  CATEGORIES, normalizeItem, createItem, parseItemText, groupByCategory, usualItems,
  toggleBought, claimItem, removeItem, clearBought, guessCategory,
} from './grocery-data.js';
import { renderItemRow } from './grocery-parts.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'I’m getting' },
  { id: 'unclaimed', label: 'Nobody yet' },
];

export function renderGroceryPage(container, context) {
  const me = context.currentUser;
  const isSolo = context.members.length <= 1;
  const view = { filter: 'all', editingItemId: null };

  const items = () => context.getData().items.map(normalizeItem);

  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    drawAll();
  }

  function updateWithUndo(message, changeFn) {
    const before = structuredClone(context.getData());
    update(changeFn);
    showToast(message, { actionLabel: 'Undo', onAction: () => { context.saveData(before); drawAll(); } });
  }

  function addItem(name, quantity = '', category = '') {
    update((data) => data.items.push(createItem({ name, quantity, category, addedBy: me.id })));
  }

  // ─── Summary ───────────────────────────────────────────────────────────────

  const summary = h('p', { class: 'grocery-page__summary' });

  function drawSummary() {
    const all = items();
    const toBuy = all.filter((i) => !i.bought);
    const mine = toBuy.filter((i) => i.claimedBy === me.id).length;
    summary.textContent = [
      `${toBuy.length} to get`,
      isSolo ? null : `${mine} you’re getting`,
      `${all.length - toBuy.length} checked off`,
    ].filter(Boolean).join(' · ');
  }

  // ─── Add form and usual items ──────────────────────────────────────────────

  const nameInput = h('input', { type: 'text', class: 'input', placeholder: 'Item, e.g. “2 lemons”', 'aria-label': 'Item' });
  const quantityInput = h('input', { type: 'text', class: 'input input--compact grocery-page__qty', placeholder: 'Qty', 'aria-label': 'Quantity' });
  const categorySelect = h('select', { class: 'input input--compact', 'aria-label': 'Section' },
    h('option', { value: '' }, 'Section: auto'),
    CATEGORIES.map((c) => h('option', { value: c.id }, c.label)));

  const addForm = h('form', {
    class: 'grocery-page__add',
    onSubmit: (event) => {
      event.preventDefault();
      const parsed = parseItemText(nameInput.value);
      if (!parsed.name) { nameInput.focus(); return; }
      addItem(parsed.name, quantityInput.value.trim() || parsed.quantity, categorySelect.value);
      nameInput.value = '';
      quantityInput.value = '';
      categorySelect.value = '';
      nameInput.focus();
    },
  }, nameInput, quantityInput, categorySelect, h('button', { type: 'submit', class: 'button button--primary' }, icon('plus', 16), ' Add'));

  const usualRow = h('div', { class: 'grocery-page__usual' });

  function drawUsual() {
    const names = usualItems(items(), context.getData().history ?? []);
    replaceChildren(usualRow, names.length ? [
      h('span', { class: 'page-control__label' }, 'Usual items:'),
      names.map((name) => h('button', { type: 'button', class: 'chip', onClick: () => addItem(name) }, icon('plus', 12), ` ${name}`)),
    ] : null);
  }

  // ─── Filters ───────────────────────────────────────────────────────────────

  const filterBar = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Show' });

  function drawFilters() {
    replaceChildren(filterBar, isSolo ? null : FILTERS.map((filter) => h('button', {
      type: 'button',
      class: `segmented__option${filter.id === view.filter ? ' is-active' : ''}`,
      'aria-pressed': String(filter.id === view.filter),
      onClick: () => { view.filter = filter.id; drawAll(); },
    }, filter.label)));
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  const listElement = h('div', { class: 'grocery-page__list' });

  const rowOptions = {
    me,
    getMember: context.getMember,
    isSolo,
    onToggleBought: (item) => update((data) => toggleBought(data, item.id, me.id)),
    onClaim: (item, memberId) => update((data) => claimItem(data, item.id, memberId)),
    onRemove: (item) => updateWithUndo(`Removed ${item.name}.`, (data) => removeItem(data, item.id)),
    onEdit: (item) => { view.editingItemId = item.id; drawList(); },
  };

  function shown(item) {
    if (view.filter === 'mine') return item.claimedBy === me.id;
    if (view.filter === 'unclaimed') return !item.claimedBy;
    return true;
  }

  function drawList() {
    const all = items();
    const toBuy = all.filter((i) => !i.bought && shown(i));
    const inCart = all.filter((i) => i.bought);
    const row = (item) => (item.id === view.editingItemId ? renderEditor(item) : renderItemRow(item, rowOptions));

    replaceChildren(listElement,
      toBuy.length
        ? groupByCategory(toBuy).map((group) => h('section', { class: 'grocery__group' },
            h('h2', { class: 'grocery__category' }, group.label, h('span', { class: 'grocery__count' }, ` ${group.items.length}`)),
            h('ul', { class: 'grocery__items' }, group.items.map(row))))
        : h('p', { class: 'module-empty grocery-page__empty' }, view.filter === 'all' ? 'Nothing left to get.' : 'Nothing here with this filter.'),
      inCart.length ? h('section', { class: 'grocery__group grocery__group--cart' },
        h('h2', { class: 'grocery__category' },
          'Checked off', h('span', { class: 'grocery__count' }, ` ${inCart.length}`),
          h('button', {
            type: 'button',
            class: 'button button--small grocery__clear',
            onClick: () => updateWithUndo(`Cleared ${inCart.length} checked-off ${inCart.length === 1 ? 'item' : 'items'}.`, clearBought),
          }, 'Clear')),
        h('ul', { class: 'grocery__items' }, inCart.map(row))) : null,
    );
  }

  /** Change an item's name, quantity, section or note in place. */
  function renderEditor(item) {
    const name = h('input', { type: 'text', class: 'input', value: item.name, 'aria-label': 'Name' });
    const quantity = h('input', { type: 'text', class: 'input input--compact grocery-page__qty', value: item.quantity, placeholder: 'Qty', 'aria-label': 'Quantity' });
    const category = h('select', { class: 'input input--compact', 'aria-label': 'Section' },
      CATEGORIES.map((c) => h('option', { value: c.id, selected: c.id === item.category }, c.label)));
    const note = h('input', { type: 'text', class: 'input', value: item.note, placeholder: 'Note (brand, size…)', 'aria-label': 'Note' });
    // Renaming to something obvious ("bread") moves it to the right section.
    name.addEventListener('change', () => {
      const guess = guessCategory(name.value);
      if (guess !== 'other') category.value = guess;
    });
    requestAnimationFrame(() => name.select());

    return h('li', { class: 'grocery-item grocery-item--editing' },
      h('form', {
        class: 'grocery-page__edit',
        onSubmit: (event) => {
          event.preventDefault();
          if (!name.value.trim()) return;
          view.editingItemId = null;
          update((data) => Object.assign(data.items.find((i) => i.id === item.id), {
            name: name.value.trim(), quantity: quantity.value.trim(), category: category.value, note: note.value.trim(),
          }));
        },
      },
        name, quantity, category, note,
        h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Save'),
        h('button', { type: 'button', class: 'link-button', onClick: () => { view.editingItemId = null; drawList(); } }, 'Cancel')),
    );
  }

  function drawAll() {
    drawSummary();
    drawUsual();
    drawFilters();
    drawList();
  }

  container.append(summary, addForm, usualRow, h('div', { class: 'page-toolbar' }, filterBar), listElement);
  drawAll();
}
