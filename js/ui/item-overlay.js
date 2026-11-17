// @ts-check
/**
 * item-overlay.js — click a task, a list item, or a calendar entry on a
 * module and it opens over the page (a modal.js pop-up), with everything
 * about it and the changes you'd make, without leaving the page.
 *
 *   openTaskOverlay(task, opts)      done, title, due, priority, who's on it (task-people.js), notes, subtasks
 *   openListItemOverlay(item, opts)  got it, name, quantity, section, note, who's getting it
 *   openEventOverlay(event, opts)    the event's details and RSVP (event-details.js)
 *
 * Each takes callbacks that save the change where the item lives, and an
 * "Open in …" link to the module's full page. Visitors see it read-only.
 */

import { h, replaceChildren, makeId } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { avatar } from './avatar.js';
import { prioritySelect } from '../modules/todo/todo-parts.js';
import { renderTaskPeople } from './task-people.js';
import { getCurrentUser } from '../state/store.js';
import { dueLabel, isOverdue, repeatLabel } from '../modules/todo/todo-data.js';
import { CATEGORIES } from '../modules/grocery/grocery-data.js';
import { renderEventDetails } from '../events/event-details.js';

/** Redraw after the event that caused it (a change fires on blur, while the field is still in place). */
const later = (fn) => requestAnimationFrame(fn);

const footer = (...children) => h('div', { class: 'item-overlay__footer' }, ...children.filter(Boolean));

/**
 * @param {any} task
 * @param {{ getTask: () => any, onChange: (changes: object) => void, onDelete?: (() => void) | null,
 *           onOpenFull?: (() => void) | null, members: any[], canEdit: boolean, where?: string }} opts
 */
export function openTaskOverlay(task, { getTask, onChange, onDelete = null, onOpenFull = null, members, canEdit, where = 'the full list' }) {
  const box = h('div', { class: 'item-overlay item-overlay--task' });
  const modal = openModal(box, { label: task.text, className: 'item-overlay-modal' });
  const me = getCurrentUser();

  function draw() {
    const t = getTask();
    if (!t) { modal.close(); return; }
    const change = (changes) => { onChange(changes); later(draw); };
    const subtasks = t.subtasks ?? [];
    const newSub = h('input', { type: 'text', class: 'input input--compact', placeholder: 'Add a subtask', 'aria-label': 'New subtask' });
    replaceChildren(box,
      h('div', { class: 'item-overlay__top' },
        h('input', { type: 'checkbox', class: 'item-overlay__check', checked: t.done, disabled: !canEdit, 'aria-label': t.done ? 'Not done' : 'Done', onChange: () => change({ done: !t.done }) }),
        canEdit
          ? h('input', { type: 'text', class: 'item-overlay__title-input', value: t.text, 'aria-label': 'Task', onChange: (event) => { if (event.target.value.trim()) change({ text: event.target.value.trim() }); } })
          : h('h2', { class: 'item-overlay__title' }, t.text),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => modal.close() }, icon('close', 16))),
      h('div', { class: 'item-overlay__fields' },
        h('label', { class: 'item-overlay__field' }, h('span', {}, 'Due'),
          canEdit ? h('input', { type: 'date', class: 'input input--compact', value: t.due ?? '', onChange: (event) => change({ due: event.target.value }) })
            : h('span', { class: isOverdue(t) ? 'is-overdue' : '' }, dueLabel(t) || 'No date')),
        repeatLabel(t) ? h('p', { class: 'item-overlay__muted' }, `↻ ${repeatLabel(t)}`) : null,
        h('label', { class: 'item-overlay__field' }, h('span', {}, 'Priority'),
          prioritySelect(t.priority, { class: 'input input--compact', disabled: !canEdit, onChange: (event) => change({ priority: event.target.value }) })),
        // Who's on it: everyone already on it, "I'll take it", and (for people who can edit) Assign (task-people.js).
        members.length > 1 ? h('div', { class: 'item-overlay__field item-overlay__field--people' },
          renderTaskPeople({ key: t.id, members, assigneeIds: t.assigneeIds ?? [], acceptedIds: t.acceptedIds ?? null, me, canTake: canEdit && Boolean(me) && !me.isGuest, canAssign: canEdit, onChange: (changes) => change(changes) })) : null),
      h('label', { class: 'item-overlay__notes' }, h('span', { class: 'visually-hidden' }, 'Notes'),
        h('textarea', { class: 'input', rows: '3', placeholder: canEdit ? 'Notes' : '', readOnly: !canEdit, onChange: (event) => change({ notes: event.target.value }) }, t.notes ?? '')),
      h('div', { class: 'item-overlay__subtasks' },
        h('h3', { class: 'item-overlay__subhead' }, `Subtasks${subtasks.length ? ` · ${subtasks.filter((s) => s.done).length} of ${subtasks.length}` : ''}`),
        h('ul', { class: 'item-overlay__sublist' }, subtasks.map((s) => h('li', {},
          h('label', {}, h('input', { type: 'checkbox', checked: s.done, disabled: !canEdit, onChange: () => change({ subtasks: subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) }) }), ` ${s.text}`),
          canEdit ? h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': `Remove ${s.text}`, onClick: () => change({ subtasks: subtasks.filter((x) => x.id !== s.id) }) }, icon('close', 12)) : null))),
        canEdit ? h('form', {
          class: 'item-overlay__add',
          onSubmit: (event) => { event.preventDefault(); if (newSub.value.trim()) change({ subtasks: [...subtasks, { id: makeId('sub'), text: newSub.value.trim(), done: false }] }); },
        }, newSub, h('button', { type: 'submit', class: 'button button--small' }, 'Add')) : null),
      footer(
        onOpenFull ? h('button', { type: 'button', class: 'link-button', onClick: () => { modal.close(); onOpenFull(); } }, `Open in ${where}`) : null,
        canEdit && onDelete ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { modal.close(); onDelete(); } }, 'Delete task') : null));
  }
  draw();
  return modal;
}

/**
 * @param {any} item
 * @param {{ getItem: () => any, onChange: (changes: object) => void, onToggleBought: () => void, onClaim: (memberId: string) => void,
 *           onRemove: () => void, onOpenFull?: (() => void) | null, me: any, getMember: Function, isSolo: boolean, canEdit: boolean }} opts
 */
export function openListItemOverlay(item, { getItem, onChange, onToggleBought, onClaim, onRemove, onOpenFull = null, me, getMember, isSolo, canEdit }) {
  const box = h('div', { class: 'item-overlay item-overlay--list' });
  const modal = openModal(box, { label: item.name, className: 'item-overlay-modal' });
  function draw() {
    const it = getItem();
    if (!it) { modal.close(); return; }
    const claimer = it.claimedBy ? getMember(it.claimedBy) : null;
    replaceChildren(box,
      h('div', { class: 'item-overlay__top' },
        h('input', { type: 'checkbox', class: 'item-overlay__check', checked: it.bought, disabled: !canEdit, 'aria-label': it.bought ? 'Put it back on the list' : 'Got it', onChange: () => { onToggleBought(); later(draw); } }),
        canEdit
          ? h('input', { type: 'text', class: 'item-overlay__title-input', value: it.name, 'aria-label': 'Item', onChange: (event) => { if (event.target.value.trim()) { onChange({ name: event.target.value.trim() }); later(draw); } } })
          : h('h2', { class: 'item-overlay__title' }, it.name),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => modal.close() }, icon('close', 16))),
      h('div', { class: 'item-overlay__fields' },
        h('label', { class: 'item-overlay__field' }, h('span', {}, 'Quantity'),
          h('input', { type: 'text', class: 'input input--compact', value: it.quantity ?? '', placeholder: 'e.g. 2', readOnly: !canEdit, onChange: (event) => { onChange({ quantity: event.target.value.trim() }); later(draw); } })),
        h('label', { class: 'item-overlay__field' }, h('span', {}, 'Section'),
          h('select', { class: 'input input--compact', disabled: !canEdit, onChange: (event) => { onChange({ category: event.target.value }); later(draw); } },
            CATEGORIES.map((c) => h('option', { value: c.id, selected: c.id === it.category }, c.label)))),
        isSolo ? null : h('div', { class: 'item-overlay__field' }, h('span', {}, 'Getting it'),
          claimer ? [avatar(claimer, 22), ` ${claimer.id === me.id ? 'You' : claimer.name}`, claimer.id === me.id && canEdit ? h('button', { type: 'button', class: 'link-button', onClick: () => { onClaim(''); later(draw); } }, ' Unclaim') : null]
            : canEdit ? h('button', { type: 'button', class: 'button button--small', onClick: () => { onClaim(me.id); later(draw); } }, 'I’ll get it') : 'Nobody yet')),
      h('label', { class: 'item-overlay__notes' }, h('span', { class: 'visually-hidden' }, 'Note'),
        h('textarea', { class: 'input', rows: '2', placeholder: canEdit ? 'Note (brand, size…)' : '', readOnly: !canEdit, onChange: (event) => { onChange({ note: event.target.value.trim() }); later(draw); } }, it.note ?? '')),
      footer(
        onOpenFull ? h('button', { type: 'button', class: 'link-button', onClick: () => { modal.close(); onOpenFull(); } }, 'Open the full list') : null,
        canEdit ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { modal.close(); onRemove(); } }, 'Remove') : null));
  }
  draw();
  return modal;
}

/**
 * @param {any} event
 * @param {{ getEvent: () => any, me: any, getMember: Function, onRsvp?: ((answer: string) => void) | null,
 *           onOpenFull?: (() => void) | null, onEdit?: (() => void) | null, where?: string, date?: string }} opts
 */
export function openEventOverlay(event, { getEvent, me, getMember, onRsvp = null, onOpenFull = null, onEdit = null, where = 'the calendar', date = undefined }) {
  const box = h('div', { class: 'item-overlay item-overlay--event' });
  const modal = openModal(box, { label: event.title, className: 'item-overlay-modal' });
  function draw() {
    const e = getEvent() ?? event;
    replaceChildren(box,
      renderEventDetails(e, {
        me, getMember, date,
        onRsvp: onRsvp && e.kind === 'event' && !me.isGuest ? (answer) => { onRsvp(answer); later(draw); } : null,
        onEdit: onEdit ? () => { modal.close(); onEdit(); } : null,
        onClose: () => modal.close(),
        showPageLink: e.kind === 'event',
        onChanged: () => later(draw),
      }),
      onOpenFull ? footer(h('button', { type: 'button', class: 'link-button', onClick: () => { modal.close(); onOpenFull(); } }, `Open in ${where}`)) : null);
  }
  draw();
  return modal;
}
