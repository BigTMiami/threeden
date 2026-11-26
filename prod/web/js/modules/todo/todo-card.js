/**
 * todo-card.js — the to-do list as it appears on the homepage.
 *
 * A compact view of what's left to do: progress bar, an All ▾ / Mine filter,
 * the open tasks, and a quick "add task" form.
 *
 * Completed tasks are hidden here. Checking one off removes it from the
 * card (with an Undo), and a link at the bottom opens the full page, where
 * completed tasks can still be seen. Everything else (notes, subtasks,
 * grouping, sorting) also lives in the full page, todo-page.js.
 *
 * On a personal homepage (where you're the only member), the people
 * controls are hidden and new tasks are assigned to you. Tasks assigned to
 * you in your groups show here too, labeled with the group's name (see
 * js/editor/linked-items.js); checking one off checks it off in the group.
 */

import { firstFew } from '../../ui/more-link.js';
import { emptyState } from '../../ui/empty-state.js';
import { sourceLinkOf, openSource } from './tracking.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { createMemberPicker } from '../../ui/member-picker.js';
import {
  normalizeTask, createTask, applyTaskChanges, filterTasks, isOverdue, dueLabel, subtaskProgress, nextDue, repeatLabel, assignChanges,
} from './todo-data.js';
import { assigneePicker, priorityBadge } from './todo-parts.js';
import { sourceTag } from '../../ui/source-tag.js';
import { choiceMenu } from '../../ui/choice-menu.js';
import { formatShortDate } from '../../utils/dates.js';
import { openTaskOverlay } from '../../ui/item-overlay.js';

/** Card filters. Both show open tasks only; the full page shows done ones. */
const FILTERS = [
  { id: 'open', label: 'All' },
  { id: 'mine', label: 'Mine' },
];

export function renderTodoCard(container, context) {
  let activeFilter = 'open'; // View setting, not saved.

  // Just you in this space (a personal homepage): no need to choose people.
  const isSolo = context.members.length <= 1;

  const progress = h('div', { class: 'todo__progress' });
  const filterBar = h('div', { class: 'todo__filter' });
  const taskList = h('ul', { class: 'todo__list' });
  const completedLink = h('p', { class: 'todo__completed' });

  // Your own tasks, then (on a personal homepage) group tasks assigned to
  // you. A linked task carries its link in `_link`; it isn't saved here.
  const tasks = () => [
    ...context.getData().tasks.map(normalizeTask),
    ...context.getLinkedItems().map((link) => ({ ...normalizeTask(link.item), _link: link })),
  ];

  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    drawTasks();
  }

  function updateTask(taskId, changes) {
    update((data) => applyTaskChanges(data.tasks.find((t) => t.id === taskId), changes));
  }

  /** Change a task, wherever it lives: here, or in a group (linked tasks). */
  function changeTask(task, changes) {
    if (task._link) {
      context.updateLinkedItem(task._link, (saved) => applyTaskChanges(saved, changes));
      drawTasks();
    } else {
      updateTask(task.id, changes);
    }
  }

  /** Checking a task off hides it from the card, so offer a way back. */
  function completeTask(task) {
    changeTask(task, { done: true });
    showToast(task.repeat ? `Done. It’s back ${formatShortDate(nextDue(task.due, task.repeat))}.` : `Done: "${task.text}"`, {
      actionLabel: 'Undo',
      onAction: () => changeTask(task, task.repeat ? { undoRepeat: true } : { done: false }),
    });
  }

  /** The task over the page: done, due, priority, people, notes, subtasks. */
  function openTask(task) {
    const fresh = () => tasks().find((t) => t.id === task.id && Boolean(t._link) === Boolean(task._link));
    openTaskOverlay(task, {
      getTask: fresh,
      onChange: (changes) => { const t = fresh(); if (t) changeTask(t, changes); },
      onDelete: task._link ? null : () => update((data) => { data.tasks = data.tasks.filter((t) => t.id !== task.id); }),
      onOpenFull: task._link ? () => context.openLinkedItem(task._link) : () => context.openFullPage(task.id),
      members: task._link ? [] : context.members,
      canEdit: !context.isVisitor,
      where: task._link ? task._link.spaceName ?? 'its group' : 'the full list',
    });
  }

  // ─── Filters and progress ──────────────────────────────────────────────────

  // Just the filter in use ("All ▾"); "Mine" shows when you click it.
  function drawFilters() {
    replaceChildren(filterBar, choiceMenu({
      label: 'Show tasks',
      options: FILTERS,
      value: activeFilter,
      onChange: (id) => { activeFilter = id; drawTasks(); },
    }));
  }

  function drawProgress(allTasks) {
    const doneCount = allTasks.filter((t) => t.done).length;
    const percent = allTasks.length ? Math.round((doneCount / allTasks.length) * 100) : 0;
    replaceChildren(progress,
      h('span', { class: 'todo__progress-label' }, `${doneCount} of ${allTasks.length} done`),
      h('span', { class: 'progress-bar', role: 'progressbar', 'aria-valuenow': String(percent), 'aria-valuemin': '0', 'aria-valuemax': '100' },
        h('span', { class: 'progress-bar__fill', style: { width: `${percent}%` } }),
      ),
    );
  }

  /** "3 completed · View all" under the list, linking to the full page. */
  function drawCompletedLink(allTasks) {
    const doneCount = allTasks.filter((t) => t.done).length;
    replaceChildren(completedLink, doneCount === 0 ? null : [
      `${doneCount} completed · `,
      h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage() }, 'View in full list'),
    ]);
  }

  // ─── Task rows ─────────────────────────────────────────────────────────────

  function drawTasks() {
    const allTasks = tasks();
    drawProgress(allTasks);

    drawCompletedLink(allTasks);

    // 'mine' needs an extra open-only filter; 'open' already is.
    const shown = filterTasks(allTasks, { status: activeFilter }, context.currentUser.id).filter((t) => !t.done);
    if (shown.length === 0) {
      replaceChildren(taskList, allTasks.length === 0
        ? emptyState({ tag: 'li', icon: 'todo', title: 'No tasks yet', text: 'Add what needs doing, and who’s doing it.' })
        : emptyState({ tag: 'li', icon: 'check', title: activeFilter === 'mine' ? 'Nothing assigned to you' : 'All caught up', text: activeFilter === 'mine' ? 'Nice.' : 'Everything here is done.' }));
      return;
    }
    // The first three, then "4 more" to the full page (more-link.js).
    const few = firstFew(shown, context.openFullPage ? () => context.openFullPage() : null, { tag: 'li' });
    replaceChildren(taskList, few.shown.map(renderTask), few.more);
  }

  function renderTask(task) {
    const details = [dueLabel(task), repeatLabel(task) && `↻ ${repeatLabel(task).toLowerCase()}`, subtaskProgress(task) && `${subtaskProgress(task)} subtasks`].filter(Boolean).join(' · ');

    return h('li', { class: 'todo-item' },
      h('input', {
        type: 'checkbox',
        class: 'todo-item__check',
        'aria-label': `Mark "${task.text}" as done`,
        onChange: () => completeTask(task),
      }),
      h('span', { class: 'todo-item__text' },
        // Click the task to see and change everything about it over the page (item-overlay.js).
        h('button', { type: 'button', class: 'todo-item__label todo-item__label--button', title: 'Open this task', onClick: () => openTask(task) }, task.text, task.priority === 'high' ? [' ', priorityBadge('high')] : null),
        details ? h('span', { class: `todo-item__due${isOverdue(task) ? ' is-overdue' : ''}` }, details) : null,
      ),
      // A linked task shows its group (click to open it there) and can't be
      // deleted from here.
      task._link ? sourceTag(task._link, context.openLinkedItem) : null,
      // Tracked from a group's board: a link back to the card (js/modules/todo/tracking.js).
      !task._link && sourceLinkOf(task) ? sourceTag(sourceLinkOf(task), openSource) : null,
      isSolo || task._link ? null : assigneePicker(task, context, (assigneeIds) => updateTask(task.id, assignChanges(task, assigneeIds))),
      task._link ? null : h('button', {
        type: 'button',
        class: 'icon-button icon-button--subtle',
        'aria-label': `Delete "${task.text}"`,
        title: 'Delete task',
        onClick: () => update((data) => { data.tasks = data.tasks.filter((t) => t.id !== task.id); }),
      }, icon('close', 14)),
    );
  }

  // ─── Quick add form ────────────────────────────────────────────────────────

  const textInput = h('input', { type: 'text', class: 'input', placeholder: 'Add a task', 'aria-label': 'New task' });
  const assigneePickerForNewTask = createMemberPicker({ members: context.members, label: 'Assign new task to', onChange: () => {} });
  const dueInput = h('input', { type: 'date', class: 'input input--compact', 'aria-label': 'Due date' });
  const errorText = h('p', { class: 'form-error', role: 'alert' });
  const extras = h('div', { class: 'form-row todo__form-extras', hidden: true },
    isSolo ? null : h('span', { class: 'form-picker' }, 'Assign', assigneePickerForNewTask.element),
    dueInput,
    h('button', { type: 'submit', class: 'button button--small' }, icon('plus', 14), ' Add'));

  const form = h('form', {
    class: 'todo__form',
    onSubmit: (event) => {
      event.preventDefault();
      const text = textInput.value.trim();
      if (!text) {
        errorText.textContent = 'Type a task first.';
        textInput.focus();
        return;
      }
      update((data) => {
        const assigneeIds = isSolo ? [context.currentUser.id] : assigneePickerForNewTask.getSelected();
        data.tasks.push(createTask({ text, assigneeIds, due: dueInput.value }));
      });
      form.reset();
      extras.hidden = true;
      assigneePickerForNewTask.setSelected([]);
      errorText.textContent = '';
      textInput.focus();
    },
  },
    textInput,
    // Who and when come up once you start typing.
    extras,
    errorText,
  );

  textInput.addEventListener('input', () => { errorText.textContent = ''; extras.hidden = !textInput.value; });

  container.append(
    h('div', { class: 'todo__toolbar' }, progress, isSolo ? null : filterBar),
    taskList,
    completedLink,
    form,
  );
  drawFilters();
  drawTasks();
}
