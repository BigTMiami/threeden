/**
 * grocery-parts.js — one item on the grocery list, used by both the card
 * and the full page.
 *
 *   ☐ Lemons  2                     (LL) or [I'll get it]   ×
 *
 * Checking the box checks it off (saved as `bought`). "I'll get it" claims it,
 * so two people don't buy the same thing; click your avatar to unclaim.
 */

import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';

/**
 * @param {object} item
 * @param {object} options { me, getMember, isSolo, onToggleBought, onClaim, onRemove, onEdit }
 */
export function renderItemRow(item, { me, getMember, isSolo, onToggleBought, onClaim, onRemove, onEdit = null }) {
  const claimer = item.claimedBy ? getMember(item.claimedBy) : null;
  const isMine = item.claimedBy === me.id;

  let claimControl = null;
  if (!isSolo && !item.bought) {
    claimControl = claimer
      ? h('button', {
          type: 'button',
          class: `grocery-item__claimer${isMine ? ' is-mine' : ''}`,
          title: isMine ? 'You’re getting this. Click to unclaim.' : `${claimer.name} is getting this`,
          'aria-label': isMine ? `Unclaim ${item.name}` : `${claimer.name} is getting ${item.name}`,
          disabled: !isMine,
          onClick: () => onClaim(item, ''),
        }, avatar(claimer, 20), isMine ? ' You' : '')
      : h('button', { type: 'button', class: 'link-button grocery-item__claim', onClick: () => onClaim(item, me.id) }, 'I’ll get it');
  }

  const bought = item.bought && item.boughtBy ? getMember(item.boughtBy) : null;

  return h('li', { class: `grocery-item${item.bought ? ' is-bought' : ''}`, dataset: { itemId: item.id } },
    h('input', {
      type: 'checkbox',
      class: 'grocery-item__check',
      checked: item.bought,
      'aria-label': item.bought ? `Put ${item.name} back on the list` : `Got ${item.name}`,
      onChange: () => onToggleBought(item),
    }),
    h('span', { class: 'grocery-item__text' },
      onEdit
        ? h('button', { type: 'button', class: 'grocery-item__name grocery-item__name--button', onClick: () => onEdit(item) }, item.name)
        : h('span', { class: 'grocery-item__name' }, item.name),
      item.quantity ? h('span', { class: 'grocery-item__quantity' }, item.quantity) : null,
      item.note ? h('span', { class: 'grocery-item__note' }, item.note) : null,
      item.bought && bought && !isSolo ? h('span', { class: 'grocery-item__note' }, `got by ${bought.name.split(' ')[0]}`) : null,
    ),
    claimControl,
    h('button', {
      type: 'button',
      class: 'icon-button icon-button--subtle',
      'aria-label': `Remove ${item.name}`,
      title: 'Remove',
      onClick: () => onRemove(item),
    }, icon('close', 14)),
  );
}
