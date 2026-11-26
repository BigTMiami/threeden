/**
 * member-toggles.js — a row of toggle buttons, one per member, for picking
 * several people at once inside a form or panel:
 *
 *   [(LL) Leo] [(AA) Anna] [(WW) William] [(TM) Tino]
 *
 * Pressed buttons are the chosen people. Used for a task's assignees and an
 * event's attendees. (For a compact picker in a list row, see
 * member-picker.js.)
 */

import { h, replaceChildren } from './dom.js';
import { avatar } from './avatar.js';

/**
 * @param {object[]} members
 * @param {string[]} selectedIds
 * @param {function} onChange   called with the new list of ids after each click
 * @param {string}   label      accessible name for the group of buttons
 */
export function memberToggles(members, selectedIds, onChange, label = 'People') {
  let selected = [...selectedIds];
  const container = h('div', { class: 'member-toggles', role: 'group', 'aria-label': label });

  function draw() {
    replaceChildren(container, members.map((member) => {
      const isOn = selected.includes(member.id);
      return h('button', {
        type: 'button',
        class: `member-toggle${isOn ? ' is-on' : ''}`,
        'aria-pressed': String(isOn),
        onClick: () => {
          // Keep the group's member order, so the list doesn't shuffle.
          selected = isOn
            ? selected.filter((id) => id !== member.id)
            : members.map((m) => m.id).filter((id) => id === member.id || selected.includes(id));
          draw();
          onChange([...selected]);
        },
      }, avatar(member, 20), ` ${member.name.split(' ')[0]}`);
    }));
  }

  draw();
  return container;
}
