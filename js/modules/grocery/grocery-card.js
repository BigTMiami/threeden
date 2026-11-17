/**
 * grocery-card.js — the List module as it appears on the homepage.
 *
 *   [ Add an item (e.g. "2 lemons") ][ Add ]
 *   PRODUCE
 *   ☐ Lemons 2                        [I'll get it]  ×
 *   DAIRY & EGGS
 *   ☐ Oat milk                        (LL) You       ×
 *   3 checked off · Clear · Full list
 *
 * Items sort themselves into sections (grocery-data.js). Checked-off
 * items leave the list once someone clears them.
 */

import { emptyState } from '../../ui/empty-state.js';
import { h, replaceChildren, appendChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import {
  normalizeItem, createItem, parseItemText, groupByCategory, toggleBought, claimItem, removeItem, clearBought,
} from './grocery-data.js';
import { renderItemRow } from './grocery-parts.js';
import { openListItemOverlay } from '../../ui/item-overlay.js';

export function renderGroceryCard(container, context) {
  const me = context.currentUser;
  const isSolo = context.members.length <= 1;
  const listElement = h('div', { class: 'grocery__list' });
  const footer = h('p', { class: 'grocery__footer' });

  const items = () => context.getData().items.map(normalizeItem);

  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    draw();
  }

  /** Remove something with an Undo that restores the whole list. */
  function updateWithUndo(message, changeFn) {
    const before = structuredClone(context.getData());
    update(changeFn);
    showToast(message, { actionLabel: 'Undo', onAction: () => { context.saveData(before); draw(); } });
  }

  const rowOptions = {
    me,
    getMember: context.getMember,
    isSolo,
    onToggleBought: (item) => update((data) => toggleBought(data, item.id, me.id)),
    onClaim: (item, memberId) => update((data) => claimItem(data, item.id, memberId)),
    onRemove: (item) => updateWithUndo(`Removed ${item.name}.`, (data) => removeItem(data, item.id)),
    // Click an item to see and change it over the page (item-overlay.js).
    onEdit: (item) => openListItemOverlay(item, {
      getItem: () => items().find((i) => i.id === item.id),
      onChange: (changes) => update((data) => Object.assign(data.items.find((i) => i.id === item.id), changes)),
      onToggleBought: () => update((data) => toggleBought(data, item.id, me.id)),
      onClaim: (memberId) => update((data) => claimItem(data, item.id, memberId)),
      onRemove: () => updateWithUndo(`Removed ${item.name}.`, (data) => removeItem(data, item.id)),
      onOpenFull: () => context.openFullPage(),
      me, getMember: context.getMember, isSolo, canEdit: !context.isVisitor,
    }),
  };

  function draw() {
    const all = items();
    const toBuy = all.filter((i) => !i.bought);
    const inCart = all.filter((i) => i.bought);

    replaceChildren(listElement, toBuy.length
      ? groupByCategory(toBuy).map((group) => h('section', { class: 'grocery__group' },
          h('h3', { class: 'grocery__category' }, group.label),
          h('ul', { class: 'grocery__items' }, group.items.map((item) => renderItemRow(item, rowOptions)))))
      : all.length ? emptyState({ icon: 'check', title: 'Everything’s checked off' }) : emptyState({ icon: 'cart', title: 'The list is empty', text: 'Add what you need. People can claim what they’ll pick up or bring.' }));

    replaceChildren(footer,
      inCart.length ? [
        `${inCart.length} checked off · `,
        h('button', {
          type: 'button',
          class: 'link-button',
          onClick: () => updateWithUndo(`Cleared ${inCart.length} checked-off ${inCart.length === 1 ? 'item' : 'items'}.`, clearBought),
        }, 'Clear'),
        ' · ',
      ] : null,
      h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage() }, 'Full list'),
    );
  }

  // ─── Quick add ─────────────────────────────────────────────────────────────

  const input = h('input', { type: 'text', class: 'input', placeholder: 'Add an item, e.g. “2 lemons”', 'aria-label': 'New list item' });
  const form = h('form', {
    class: 'grocery__add',
    onSubmit: (event) => {
      event.preventDefault();
      const { name, quantity } = parseItemText(input.value);
      if (!name) { input.focus(); return; }
      update((data) => data.items.push(createItem({ name, quantity, addedBy: me.id })));
      input.value = '';
      input.focus();
    },
  }, input, h('button', { type: 'submit', class: 'button button--small' }, icon('plus', 14), ' Add'));

  appendChildren(container, [form, listElement, footer]);
  draw();
}
