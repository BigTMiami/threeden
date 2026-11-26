// @ts-check
/**
 * task-people.js — "Who's on it" for one task or card: everyone already on
 * it, a button to take it yourself (or leave it), and, for people who can
 * edit it, a way to assign others.
 *
 *   WHO'S ON IT
 *   (MC)(IN) Maya and Iris are on it          [✋ I'll take it]
 *   [+ Assign people]
 *        ↓ (opens)
 *   [(LL) Leo] [(MC) Maya ✓] [(IN) Iris ✓] [(OW) Owen]    Done
 *
 * When you're on it: "You and Maya are on it" with "Leave". Nobody yet:
 * "Nobody's on it yet". Someone assigned by another person stays listed
 * (faded, "Waiting on Owen to accept") until they answer the notification
 * with ✓ (item.acceptedIds) or ✕ (off the task; answerAssignment in
 * notifications.js). Taking it yourself counts as accepting. Older items
 * without acceptedIds count everyone on them as having accepted. Used by the task pop-up (item-overlay.js), the
 * to-do full page's task panel (todo-page.js), and a board card's panel
 * (kanban-page.js).
 *
 *   renderTaskPeople({ key, members, assigneeIds, acceptedIds, me, canTake, canAssign, onChange, label })
 *     key: the task's id, so an open Assign row stays open across redraws
 *     onChange({ assigneeIds, acceptedIds }, { took, left })  → save it (the caller redraws or not)
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { avatar } from './avatar.js';
import { memberToggles } from './member-toggles.js';

const STACK = 4;
/** Tasks whose Assign row is open (by `key`), so it stays open when the pop-up or panel redraws. */
const assigningKeys = new Set();

/** "You", "You and Maya", "Maya, Iris, and Owen", "Maya, Iris, and 3 others". */
function namesOf(people, meId) {
  const names = people.map((p) => (p.id === meId ? 'You' : p.name.split(' ')[0]));
  // You first.
  names.sort((a, b) => Number(b === 'You') - Number(a === 'You'));
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} others`;
}

/**
 * @param {{ key?: string | null, members: any[], assigneeIds: string[], acceptedIds?: string[] | null, me: any, canTake: boolean, canAssign: boolean,
 *           onChange: (changes: { assigneeIds: string[], acceptedIds: string[] }, how: { took?: boolean, left?: boolean }) => void, label?: string }} opts
 */
export function renderTaskPeople({ key = null, members, assigneeIds, acceptedIds = null, me, canTake, canAssign, onChange, label = 'Who’s on it' }) {
  let ids = [...assigneeIds];
  // Who has said yes. Older items (no acceptedIds) count everyone already on them.
  let accepted = [...(acceptedIds ?? assigneeIds)];
  let assigning = key ? assigningKeys.has(key) : false;
  const setAssigning = (open) => { assigning = open; if (key) { if (open) assigningKeys.add(key); else assigningKeys.delete(key); } draw(); };
  const root = h('div', { class: 'task-people' });

  function draw() {
    const people = ids.map((id) => members.find((m) => m.id === id)).filter(Boolean);
    const mine = Boolean(me) && ids.includes(me.id);
    const waiting = people.filter((p) => !accepted.includes(p.id));
    const save = (next, how = {}) => {
      ids = next;
      accepted = how.took && me ? [...new Set([...accepted, me.id])] : accepted.filter((id) => next.includes(id));
      onChange({ assigneeIds: [...next], acceptedIds: [...accepted] }, how);
      draw();
    };
    replaceChildren(root,
      h('span', { class: 'task-people__label' }, label),
      h('div', { class: 'task-people__row' },
        people.length
          ? h('span', { class: 'task-people__stack', 'aria-hidden': 'true' },
            people.slice(0, STACK).map((p) => h('span', { class: `task-people__face${accepted.includes(p.id) ? '' : ' is-waiting'}`, title: accepted.includes(p.id) ? p.name : `${p.name} hasn’t accepted yet` }, avatar(p, 26))),
            people.length > STACK ? h('span', { class: 'task-people__more' }, `+${people.length - STACK}`) : null)
          : h('span', { class: 'task-people__empty-icon', 'aria-hidden': 'true' }, icon('people', 16)),
        h('span', { class: 'task-people__names' },
          people.length ? `${namesOf(people, me?.id)} ${people.length === 1 && !mine ? 'is' : 'are'} on it` : 'Nobody’s on it yet'),
        canTake && me
          ? mine
            ? h('button', { type: 'button', class: 'link-button task-people__leave', onClick: () => save(ids.filter((id) => id !== me.id), { left: true }) }, 'Leave')
            : h('button', { type: 'button', class: 'button button--small button--primary task-people__take', onClick: () => save(members.map((m) => m.id).filter((id) => id === me.id || ids.includes(id)), { took: true }) }, '✋ I’ll take it')
          : null),
      waiting.length ? h('p', { class: 'task-people__waiting' }, `Waiting on ${namesOf(waiting, me?.id).replace(/^You\b/, 'you')} to accept`) : null,
      canAssign
        ? assigning
          ? h('div', { class: 'task-people__assign' },
            memberToggles(members, ids, (next) => save(next), 'Assigned to'),
            h('button', { type: 'button', class: 'link-button', onClick: () => setAssigning(false) }, 'Done'))
          : h('button', { type: 'button', class: 'link-button task-people__assign-open', onClick: () => setAssigning(true) }, icon('plus', 12), people.length ? ' Assign someone else' : ' Assign people')
        : null);
  }

  draw();
  return root;
}
