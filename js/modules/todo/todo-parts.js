// @ts-check
/**
 * todo-parts.js — small pieces of to-do UI used by both the homepage card
 * and the full-page view.
 */

import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { createMemberPicker } from '../../ui/member-picker.js';
import { memberToggles } from '../../ui/member-toggles.js';
import { PRIORITIES, priorityLabel } from './todo-data.js';

/** A <select> listing "No priority" plus each priority level. */
export function prioritySelect(selectedId, props = {}) {
  return h('select', props,
    h('option', { value: '', selected: !selectedId }, 'No priority'),
    PRIORITIES.map((p) => h('option', { value: p.id, selected: p.id === selectedId }, p.label)),
  );
}

/**
 * The avatars of a task's people; clicking opens a checklist to change
 * them. `onChange` gets the new list of member ids.
 */
export function assigneePicker(task, context, onChange) {
  return createMemberPicker({
    members: context.members,
    selectedIds: task.assigneeIds,
    label: `Assign "${task.text}"`,
    onChange,
  }).element;
}

/** Toggle buttons for a task's people, in the details panel (see member-toggles.js). */
export function assigneeToggles(members, selectedIds, onChange) {
  return memberToggles(members, selectedIds, onChange, 'Assigned to');
}

/** A small colored flag like "▶ High". Returns null when there's no priority. */
export function priorityBadge(priorityId) {
  if (!priorityId) return null;
  return h('span', { class: `priority-badge priority-badge--${priorityId}` },
    icon('flag', 12), ` ${priorityLabel(priorityId)}`);
}
