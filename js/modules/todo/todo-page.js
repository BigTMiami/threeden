// @ts-check
/**
 * todo-page.js — the to-do list as a full page.
 *
 * Layout:
 *
 *   5 open · 1 overdue · 1 done · 2 yours                       ← summary (click a count)
 *   [ Add a task…                                    ][ + Add ]  ← quick add
 *     Assign (?)  Due [    ]  [No priority ▾]                     ← once you type
 *   [ Search ][ Show: Open ▾ ]  ⇅ Sort and filter                 ← toolbar
 *     Person [Anyone ▾]  Group by [Due date ▾]  Sort by [Due ▾]   ← when opened
 *
 *   ┌ task list (grouped) ─────────────┐ ┌ details panel ────────┐
 *   │ Overdue                          │ │ title, status, person │
 *   │ ☐ Print flyers   High  Nov 14 JK │ │ due, priority, notes  │
 *   │ …                                │ │ subtasks, delete      │
 *   └──────────────────────────────────┘ └───────────────────────┘
 *
 * Clicking a task opens its details panel. Edits in the panel save as you
 * type, and the list redraws beside it.
 *
 * On a personal homepage (where you're the only member), everything about
 * choosing people is hidden and new tasks are assigned to you. Group tasks
 * assigned to you are listed too, labeled with their group; editing one
 * here edits it in the group (see js/editor/linked-items.js).
 */

import { h, replaceChildren, debounce } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { formatShortDate, toDateKey, todayKey } from '../../utils/dates.js';
import {
  normalizeTask, createTask, applyTaskChanges, createSubtask, summarize, filterTasks, sortTasks, groupTasks,
  isOverdue, dueLabel, subtaskProgress, SORT_OPTIONS, GROUP_OPTIONS, REPEATS, repeatLabel, assignChanges,
} from './todo-data.js';
import { createMemberPicker } from '../../ui/member-picker.js';
import { prioritySelect, assigneePicker, priorityBadge } from './todo-parts.js';
import { renderTaskPeople } from '../../ui/task-people.js';
import { sourceTag, linkedNote } from '../../ui/source-tag.js';
import { sourceLinkOf, openSource } from './tracking.js';
import { reminderFor, setTaskReminder, TASK_LEADS } from '../../state/reminders.js';
import { choiceMenu } from '../../ui/choice-menu.js';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'mine', label: 'Mine' },
  { id: 'done', label: 'Done' },
];

const SEARCH_DELAY_MS = 200;
const NOTES_SAVE_DELAY_MS = 500;

export function renderTodoPage(container, context) {
  // View settings (not saved).
  const view = {
    status: 'open',
    assigneeId: '',
    search: '',
    groupId: 'due',
    sortId: 'due',
    // A card or a linked item can ask for a task to be open on arrival.
    selectedTaskId: context.takeFocusRequest(),
  };

  const me = context.currentUser;
  const isSolo = context.members.length <= 1;
  // Your tasks, plus (on a personal homepage) group tasks assigned to you.
  // A linked task carries its link in `_link`.
  const tasks = () => [
    ...context.getData().tasks.map(normalizeTask),
    ...context.getLinkedItems().map((link) => ({ ...normalizeTask(link.item), _link: link })),
  ];
  const findTask = (taskId) => tasks().find((t) => t.id === taskId) ?? null;

  /**
   * Save a change to one task. Redraws the summary and the list, but not
   * the details panel, so typing there isn't interrupted.
   */
  function updateTask(taskId, changes) {
    const link = findTask(taskId)?._link;
    if (link) {
      // A group's task: change it where it lives.
      context.updateLinkedItem(link, (saved) => applyTaskChanges(saved, changes));
    } else {
      const data = structuredClone(context.getData());
      applyTaskChanges(data.tasks.find((t) => t.id === taskId), changes);
      context.saveData(data);
    }
    drawSummary();
    drawList();
    // A repeating task comes back instead of closing: say when.
    const after = findTask(taskId);
    if (changes.done === true && after?.repeat) {
      showToast(`Done. It’s back ${formatShortDate(after.due)}.`, { actionLabel: 'Undo', onAction: () => updateTask(taskId, { undoRepeat: true }) });
    }
  }

  function addTask(fields) {
    const data = structuredClone(context.getData());
    const task = createTask(fields);
    data.tasks.push(task);
    context.saveData(data);
    drawSummary();
    drawList();
    return task;
  }

  function deleteTask(taskId) {
    const before = structuredClone(context.getData());
    const data = structuredClone(before);
    const task = data.tasks.find((t) => t.id === taskId);
    data.tasks = data.tasks.filter((t) => t.id !== taskId);
    context.saveData(data);
    selectTask(null);
    showToast(`Deleted "${task.text}".`, {
      actionLabel: 'Undo',
      onAction: () => { context.saveData(before); drawAll(); },
    });
  }

  function selectTask(taskId) {
    view.selectedTaskId = taskId;
    drawList();
    drawDetails();
  }

  // ─── Summary row ───────────────────────────────────────────────────────────

  const summaryRow = h('div', { class: 'todo-page__summary' });

  function drawSummary() {
    const counts = summarize(tasks(), me.id);
    // One small line; each count shows those tasks when clicked.
    const stat = (value, label, statusFilter, modifier = '') => h('button', {
      type: 'button',
      class: `todo-stat ${modifier}`,
      onClick: () => { view.status = statusFilter; drawToolbar(); drawList(); },
    }, h('strong', { class: 'todo-stat__value' }, String(value)), ` ${label}`);

    const stats = [
      stat(counts.open, 'open', 'open'),
      counts.overdue ? stat(counts.overdue, 'overdue', 'open', 'todo-stat--alert') : null,
      stat(counts.done, 'done', 'done'),
      isSolo ? null : stat(counts.mine, 'yours', 'mine'),
    ].filter(Boolean);
    replaceChildren(summaryRow, stats.flatMap((s, i) => (i ? [h('span', { class: 'todo-stat__dot', 'aria-hidden': 'true' }, '·'), s] : [s])));
  }

  // ─── Quick add ─────────────────────────────────────────────────────────────

  const addText = h('input', { type: 'text', class: 'input', placeholder: 'Add a task and press Enter', 'aria-label': 'New task' });
  const addAssignees = createMemberPicker({ members: context.members, label: 'Assign new task to', size: 26, onChange: () => {} });
  const addDue = h('input', { type: 'date', class: 'input input--compact', 'aria-label': 'Due date' });
  const addPriority = prioritySelect('', { class: 'input input--compact', 'aria-label': 'Priority' });
  const addRepeat = h('select', { class: 'input input--compact', 'aria-label': 'Repeats' }, REPEATS.map((r) => h('option', { value: r.id }, r.label)));
  const addError = h('p', { class: 'form-error', role: 'alert' });
  const addExtras = h('div', { class: 'todo-page__add-extras', hidden: true },
    isSolo ? null : h('span', { class: 'form-picker' }, 'Assign', addAssignees.element),
    h('label', { class: 'todo-page__control' }, h('span', { class: 'todo-page__control-label' }, 'Due'), addDue),
    addPriority, addRepeat);
  const showExtras = () => { addExtras.hidden = false; };

  const addForm = h('form', {
    class: 'todo-page__add',
    onSubmit: (event) => {
      event.preventDefault();
      const text = addText.value.trim();
      if (!text) {
        addError.textContent = 'Type a task first.';
        addText.focus();
        return;
      }
      const assigneeIds = isSolo ? [me.id] : addAssignees.getSelected();
      addTask({ text, assigneeIds, due: addDue.value || (addRepeat.value ? todayKey() : ''), priority: addPriority.value, ...(addRepeat.value ? { repeat: addRepeat.value } : {}) });
      addRepeat.value = '';
      addText.value = '';
      addAssignees.setSelected([]);
      addDue.value = '';
      addError.textContent = '';
      addText.focus();
    },
  },
    h('div', { class: 'todo-page__add-row' },
      addText,
      h('button', { type: 'submit', class: 'button button--primary' }, icon('plus', 16), ' Add'),
    ),
    // Who, when, and how urgent: there once you start typing.
    addExtras,
    addError,
  );
  addText.addEventListener('input', () => { addError.textContent = ''; showExtras(); });
  addText.addEventListener('focus', () => { if (addText.value) showExtras(); });

  // ─── Toolbar: search, filters, grouping, sorting ───────────────────────────

  const toolbar = h('div', { class: 'todo-page__toolbar' });

  const searchInput = h('input', {
    type: 'search',
    class: 'input todo-page__search-input',
    placeholder: 'Search tasks and notes',
    'aria-label': 'Search tasks',
    onInput: debounce((event) => { view.search = event.target.value; drawList(); }, SEARCH_DELAY_MS),
  });

  function labeledSelect(labelText, select) {
    return h('label', { class: 'todo-page__control' }, h('span', { class: 'todo-page__control-label' }, labelText), select);
  }

  // "Sort and filter" (person, grouping, sort) stays folded until opened.
  let moreOpen = false;

  function drawToolbar() {
    // Just the filter in use; the others show when you click it.
    const statusBar = choiceMenu({
      label: 'Show',
      prefix: 'Show: ',
      options: STATUS_FILTERS.filter((filter) => !(isSolo && filter.id === 'mine')),
      value: view.status,
      onChange: (id) => { view.status = id; drawList(); },
    });

    const assigneeFilter = h('select', {
      class: 'input input--compact',
      onChange: (event) => { view.assigneeId = event.target.value; drawList(); },
    },
      h('option', { value: '', selected: view.assigneeId === '' }, 'Anyone'),
      h('option', { value: 'unassigned', selected: view.assigneeId === 'unassigned' }, 'Unassigned'),
      context.members.map((m) => h('option', { value: m.id, selected: m.id === view.assigneeId }, m.name)),
    );

    const groupSelect = h('select', {
      class: 'input input--compact',
      onChange: (event) => { view.groupId = event.target.value; drawList(); },
    }, GROUP_OPTIONS
      .filter((o) => !(isSolo && o.id === 'assignee'))
      .map((o) => h('option', { value: o.id, selected: o.id === view.groupId }, o.label)));

    const sortSelect = h('select', {
      class: 'input input--compact',
      onChange: (event) => { view.sortId = event.target.value; drawList(); },
    }, SORT_OPTIONS.map((o) => h('option', { value: o.id, selected: o.id === view.sortId }, o.label)));

    const changed = (view.assigneeId ? 1 : 0) + (view.groupId !== 'due' ? 1 : 0) + (view.sortId !== 'due' ? 1 : 0);
    replaceChildren(toolbar,
      h('label', { class: 'todo-page__search' }, icon('search', 16), searchInput),
      statusBar,
      h('button', {
        type: 'button', class: `link-button todo-page__select${selecting ? ' is-on' : ''}`, 'aria-pressed': String(selecting),
        onClick: () => setSelecting(!selecting),
      }, icon('checklist', 14), selecting ? ' Stop selecting' : ' Select'),
      h('button', {
        type: 'button', class: `link-button todo-page__more${moreOpen ? ' is-open' : ''}`, 'aria-expanded': String(moreOpen),
        onClick: () => { moreOpen = !moreOpen; drawToolbar(); },
      }, icon('sort', 14), ` Sort and filter${changed ? ` (${changed})` : ''}`),
      moreOpen ? h('div', { class: 'todo-page__more-row' },
        isSolo ? null : labeledSelect('Person', assigneeFilter),
        labeledSelect('Group by', groupSelect),
        labeledSelect('Sort by', sortSelect)) : null,
    );
  }

  // ─── Task list ─────────────────────────────────────────────────────────────

  const listElement = h('div', { class: 'todo-page__list' });

  // ─── Select several (assign, date, finish, or delete them together) ──────

  let selecting = false;
  const picked = new Set();
  const bulkBar = h('div', { class: 'todo-bulk', role: 'region', 'aria-label': 'Selected tasks', hidden: true });

  function setSelecting(on) {
    selecting = on;
    picked.clear();
    drawToolbar();
    drawList();
  }

  function drawBulkBar() {
    bulkBar.hidden = !selecting;
    if (!selecting) { replaceChildren(bulkBar); return; }
    const ids = [...picked];
    const none = ids.length === 0;
    const snapshot = () => structuredClone(context.getData());
    const undoable = (message, before) => showToast(message, { actionLabel: 'Undo', onAction: () => { context.saveData(before); drawAll(); } });
    const assign = h('select', {
      class: 'input input--compact', 'aria-label': 'Assign the selected tasks to', disabled: none,
      onChange: (e) => {
        if (!e.target.value) return;
        const before = snapshot();
        for (const id of ids) updateTask(id, { assigneeIds: e.target.value === 'nobody' ? [] : [e.target.value] });
        undoable(`Assigned ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}.`, before);
        setSelecting(false);
      },
    }, h('option', { value: '' }, 'Assign to…'), h('option', { value: 'nobody' }, 'Nobody'), context.members.map((m) => h('option', { value: m.id }, m.name)));
    const due = h('input', {
      type: 'date', class: 'input input--compact', 'aria-label': 'Due date for the selected tasks', disabled: none,
      onChange: (e) => {
        const before = snapshot();
        for (const id of ids) updateTask(id, { due: e.target.value });
        undoable(`Changed the due date of ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}.`, before);
        setSelecting(false);
      },
    });
    replaceChildren(bulkBar,
      h('strong', { class: 'todo-bulk__count' }, none ? 'Pick tasks' : `${ids.length} selected`),
      h('button', {
        type: 'button', class: 'button button--small', disabled: none,
        onClick: () => {
          const before = snapshot();
          for (const id of ids) updateTask(id, { done: true });
          undoable(`Marked ${ids.length} done.`, before);
          setSelecting(false);
        },
      }, icon('check', 13), ' Done'),
      isSolo ? null : assign,
      due,
      h('button', {
        type: 'button', class: 'link-button link-button--danger', disabled: none,
        onClick: () => {
          const before = snapshot();
          const data = structuredClone(before);
          data.tasks = data.tasks.filter((t) => !picked.has(t.id));
          context.saveData(data);
          undoable(`Deleted ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}.`, before);
          setSelecting(false);
          drawSummary();
        },
      }, 'Delete'),
      h('button', { type: 'button', class: 'link-button todo-bulk__cancel', onClick: () => setSelecting(false) }, 'Cancel'));
  }

  function drawList() {
    drawBulkBar();
    const filtered = filterTasks(tasks(), view, me.id);
    const groups = groupTasks(sortTasks(filtered, view.sortId), view.groupId, context.members);

    if (filtered.length === 0) {
      replaceChildren(listElement, h('p', { class: 'todo-page__empty' },
        view.search ? `No tasks match "${view.search}".` : 'No tasks here. Add one above, or try another filter.'));
      return;
    }

    replaceChildren(listElement, groups.map((group) => h('section', { class: 'todo-group' },
      group.label
        ? h('h2', { class: `todo-group__title${group.key === 'overdue' ? ' is-overdue' : ''}` },
            group.label, h('span', { class: 'todo-group__count' }, ` ${group.tasks.length}`))
        : null,
      h('ul', { class: 'todo-page__rows' }, group.tasks.map(renderRow)),
    )));
  }

  function renderRow(task) {
    const isSelected = task.id === view.selectedTaskId;
    const subtasks = subtaskProgress(task);

    // Selecting several: the row's box picks it instead of finishing it.
    if (selecting) {
      const isPicked = picked.has(task.id);
      const toggle = () => { if (isPicked) picked.delete(task.id); else picked.add(task.id); drawList(); };
      return h('li', { class: `todo-row todo-row--picking${isPicked ? ' is-picked' : ''}`, onClick: toggle },
        h('input', { type: 'checkbox', class: 'todo-item__check', checked: isPicked, 'aria-label': `Select "${task.text}"`, onClick: (e) => e.stopPropagation(), onChange: toggle }),
        h('span', { class: 'todo-row__main' }, h('span', { class: 'todo-row__title' }, task.text)),
        h('span', { class: `todo-row__due${isOverdue(task) ? ' is-overdue' : ''}` }, task.due ? dueLabel(task) : ''));
    }

    return h('li', {
      class: `todo-row${task.done ? ' todo-row--done' : ''}${isSelected ? ' is-selected' : ''}`,
      onClick: () => selectTask(task.id),
    },
      h('input', {
        type: 'checkbox',
        class: 'todo-item__check',
        checked: task.done,
        'aria-label': `Mark "${task.text}" as done`,
        onClick: (event) => event.stopPropagation(),
        onChange: (event) => {
          updateTask(task.id, { done: event.target.checked });
          if (task.id === view.selectedTaskId) drawDetails();
        },
      }),
      h('span', { class: 'todo-row__main' },
        h('button', { type: 'button', class: 'todo-row__title' }, task.text),
        h('span', { class: 'todo-row__extras' },
          subtasks ? h('span', {}, icon('todo', 12), ` ${subtasks}`) : null,
          task.notes ? h('span', {}, icon('note', 12), ' Notes') : null,
          task.repeat ? h('span', { title: 'Comes back when it’s done' }, icon('repeat', 12), ` ${repeatLabel(task)}`) : null,
        ),
      ),
      task._link ? sourceTag(task._link, context.openLinkedItem) : null,
      // Tracked from a group's board: a link back to the card (js/modules/todo/tracking.js).
      !task._link && sourceLinkOf(task) ? sourceTag(sourceLinkOf(task), openSource) : null,
      priorityBadge(task.priority),
      h('span', { class: `todo-row__due${isOverdue(task) ? ' is-overdue' : ''}` }, task.due ? dueLabel(task) : ''),
      isSolo ? null : assigneePicker(task, context, (assigneeIds) => {
        updateTask(task.id, assignChanges(task, assigneeIds));
        if (task.id === view.selectedTaskId) drawDetails();
      }),
    );
  }

  // ─── Details panel ─────────────────────────────────────────────────────────

  const detailsPanel = h('aside', { class: 'todo-details', 'aria-label': 'Task details' });

  function drawDetails() {
    const task = view.selectedTaskId ? findTask(view.selectedTaskId) : null;
    detailsPanel.hidden = !task;
    layout.classList.toggle('has-details', Boolean(task));
    if (!task) {
      replaceChildren(detailsPanel);
      return;
    }

    const field = (labelText, control) => h('label', { class: 'todo-details__field' },
      h('span', { class: 'todo-details__label' }, labelText), control);

    const titleInput = h('textarea', {
      class: 'todo-details__title',
      rows: '2',
      'aria-label': 'Task',
      onInput: (event) => {
        const text = event.target.value.trim();
        if (text) updateTask(task.id, { text });
      },
    });
    titleInput.value = task.text;

    const notesInput = h('textarea', {
      class: 'input todo-details__notes',
      rows: '5',
      placeholder: 'Add details, links, or context for whoever picks this up',
      onInput: debounce((event) => updateTask(task.id, { notes: event.target.value }), NOTES_SAVE_DELAY_MS),
    });
    notesInput.value = task.notes;

    const subtaskSection = h('div', { class: 'todo-details__subtasks' });
    drawSubtasks(subtaskSection, task.id);

    const created = task.createdAt ? `Created ${formatShortDate(toDateKey(new Date(task.createdAt)))}` : '';

    replaceChildren(detailsPanel,
      h('div', { class: 'todo-details__top' },
        h('label', { class: 'todo-details__done' },
          h('input', {
            type: 'checkbox',
            checked: task.done,
            onChange: (event) => updateTask(task.id, { done: event.target.checked }),
          }),
          ' Done'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close details', onClick: () => selectTask(null) }, icon('close', 16)),
      ),
      titleInput,
      task._link ? linkedNote(task._link, context.openLinkedItem) : null,
      !task._link && sourceLinkOf(task) ? linkedNote(sourceLinkOf(task), openSource, 'The card stays on the board; this is your own reminder.') : null,
      h('div', { class: 'todo-details__grid' },
        // Who's on it: everyone already on it, "I'll take it", and Assign (js/ui/task-people.js).
        isSolo ? null : h('div', { class: 'todo-details__field todo-details__field--wide' },
          renderTaskPeople({
            key: task.id, members: context.members, assigneeIds: task.assigneeIds, acceptedIds: task.acceptedIds ?? null, me: context.currentUser,
            canTake: !context.isVisitor && !task._link, canAssign: !context.isVisitor && !task._link,
            onChange: (changes) => updateTask(task.id, changes),
          }),
        ),
        field('Due date', h('input', {
          type: 'date',
          class: 'input',
          value: task.due,
          onChange: (event) => updateTask(task.id, { due: event.target.value }),
        })),
        field('Priority', prioritySelect(task.priority, {
          class: 'input',
          onChange: (event) => updateTask(task.id, { priority: event.target.value }),
        })),
        // A repeating task comes back with its next due date when it's done.
        field('Repeats', h('select', {
          class: 'input',
          onChange: (event) => updateTask(task.id, { repeat: event.target.value, due: task.due || (event.target.value ? todayKey() : '') }),
        }, REPEATS.map((r) => h('option', { value: r.id, selected: (task.repeat ?? '') === r.id }, r.label)))),
        // Remind me (js/state/reminders.js): only for a task with a due date that isn't done.
        task.due && !task.done ? field('Remind me', h('select', {
          class: 'input',
          onChange: (event) => {
            const reminder = setTaskReminder(context.currentUser.id, task, task._link?.moduleId ?? context.moduleId, event.target.value || null);
            showToast(reminder ? `We’ll remind you ${TASK_LEADS.find((l) => l.id === reminder.lead).label.toLowerCase()}.` : 'No reminder for this task.');
          },
        },
        h('option', { value: '', selected: !reminderFor(context.currentUser.id, task.id) }, 'Off'),
        TASK_LEADS.map((lead) => h('option', { value: lead.id, selected: reminderFor(context.currentUser.id, task.id)?.lead === lead.id }, lead.label)))) : null,
      ),
      field('Notes', notesInput),
      subtaskSection,
      h('div', { class: 'todo-details__footer' },
        h('span', {}, created),
        task._link ? null : h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => deleteTask(task.id) }, 'Delete task'),
      ),
    );
  }

  /** The subtask checklist inside the details panel. Redraws only itself. */
  function drawSubtasks(section, taskId) {
    const task = findTask(taskId);

    const saveSubtasks = (subtasks) => {
      updateTask(taskId, { subtasks });
      drawSubtasks(section, taskId);
    };

    const newSubtaskInput = h('input', { type: 'text', class: 'input', placeholder: 'Add a step', 'aria-label': 'New subtask' });

    replaceChildren(section,
      h('span', { class: 'todo-details__label' }, `Subtasks ${subtaskProgress(task) ? `(${subtaskProgress(task)})` : ''}`),
      h('ul', { class: 'todo-details__subtask-list' }, task.subtasks.map((subtask) => h('li', { class: `subtask${subtask.done ? ' subtask--done' : ''}` },
        h('input', {
          type: 'checkbox',
          checked: subtask.done,
          'aria-label': `Mark "${subtask.text}" as done`,
          onChange: (event) => saveSubtasks(task.subtasks.map((s) => (s.id === subtask.id ? { ...s, done: event.target.checked } : s))),
        }),
        h('span', { class: 'subtask__text' }, subtask.text),
        h('button', {
          type: 'button',
          class: 'icon-button icon-button--subtle',
          'aria-label': `Remove "${subtask.text}"`,
          onClick: () => saveSubtasks(task.subtasks.filter((s) => s.id !== subtask.id)),
        }, icon('close', 12)),
      ))),
      h('form', {
        class: 'subtask__form',
        onSubmit: (event) => {
          event.preventDefault();
          const text = newSubtaskInput.value.trim();
          if (!text) return;
          saveSubtasks([...task.subtasks, createSubtask(text)]);
          section.querySelector('input[aria-label="New subtask"]')?.focus();
        },
      }, newSubtaskInput),
    );
  }

  // ─── Layout ────────────────────────────────────────────────────────────────

  const layout = h('div', { class: 'todo-page__layout' }, listElement, detailsPanel);

  function drawAll() {
    drawSummary();
    drawToolbar();
    drawList();
    drawDetails();
  }

  container.append(summaryRow, addForm, toolbar, bulkBar, layout);
  drawAll();
}
