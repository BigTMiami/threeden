// @ts-check
/**
 * gantt-page.js — the Gantt chart as a full page.
 *
 * Layout:
 *
 *   6 tasks · 42% complete · 1 running late · Next milestone: Planting day, Nov 30
 *   [ Task name…        ][ start ][ end ][ ☐ Milestone ][ Add task ]   ← quick add
 *   [ Months | Weeks | Days ] [ Today ]
 *
 *   ┌ chart (drag bars to move or resize) ──────────┐ ┌ task details ─────┐
 *   │ names  │ timeline                             │ │ name, dates       │
 *   │        │                                      │ │ progress, color   │
 *   └───────────────────────────────────────────────┘ │ people, notes     │
 *                                                     └───────────────────┘
 *
 * Clicking a task (its name or its bar) opens the details panel, where
 * edits save as you go.
 *
 * On a personal homepage, group tasks you're on are listed after your own,
 * with their group's name; clicking one opens it in the group's chart.
 */

import { h, replaceChildren, debounce } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { memberToggles } from '../../ui/member-toggles.js';
import { todayKey, addDays, formatShortDate } from '../../utils/dates.js';
import { createGanttChart } from './gantt-chart.js';
import {
  TASK_COLORS, ZOOM_LEVELS, normalizeTask, createTask, summarize, dateRangeLabel,
} from './gantt-data.js';

const TEXT_SAVE_DELAY_MS = 400;
const NEW_TASK_LENGTH_DAYS = 7;

export function renderGanttPage(container, context) {
  const me = context.currentUser;
  const isSolo = context.members.length <= 1;

  // View settings (not saved).
  const view = {
    zoomId: 'weeks',
    selectedTaskId: context.takeFocusRequest(),
  };

  // Your tasks, then (personal homepage) group tasks you're on, with `_link`.
  const tasks = () => [
    ...context.getData().tasks.map(normalizeTask),
    ...context.getLinkedItems().map((link) => ({ ...normalizeTask(link.item), _link: link })),
  ];
  const ownTaskCount = () => context.getData().tasks.length;
  const findTask = (taskId) => tasks().find((t) => t.id === taskId) ?? null;
  const dayWidth = () => ZOOM_LEVELS.find((z) => z.id === view.zoomId).dayWidth;

  /**
   * Save a change. Redraws the summary and the chart; the details panel
   * only when asked, so typing in it isn't interrupted.
   */
  function update(changeFn, { redrawDetails = false } = {}) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    drawSummary();
    chart.draw();
    if (redrawDetails) drawDetails();
  }

  function updateTask(taskId, changes, options) {
    update((data) => {
      const index = data.tasks.findIndex((t) => t.id === taskId);
      data.tasks[index] = normalizeTask({ ...data.tasks[index], ...changes });
    }, options);
  }

  function selectTask(taskId) {
    const link = taskId ? findTask(taskId)?._link : null;
    if (link) {
      context.openLinkedItem(link); // a group's task: edit it there
      return;
    }
    view.selectedTaskId = taskId;
    chart.draw();
    drawDetails();
  }

  function deleteTask(task) {
    const before = structuredClone(context.getData());
    update((data) => { data.tasks = data.tasks.filter((t) => t.id !== task.id); });
    selectTask(null);
    showToast(`Deleted "${task.name}".`, {
      actionLabel: 'Undo',
      onAction: () => { context.saveData(before); drawAll(); },
    });
  }

  /** Move a task one row up (-1) or down (+1). */
  function shiftTask(taskId, direction) {
    update((data) => {
      const from = data.tasks.findIndex((t) => t.id === taskId);
      const to = from + direction;
      if (to < 0 || to >= data.tasks.length) return;
      const [task] = data.tasks.splice(from, 1);
      data.tasks.splice(to, 0, task);
    }, { redrawDetails: true });
  }

  // ─── Summary line ──────────────────────────────────────────────────────────

  const summary = h('p', { class: 'gantt-page__summary' });

  function drawSummary() {
    const stats = summarize(tasks());
    replaceChildren(summary,
      `${stats.count} ${stats.count === 1 ? 'task' : 'tasks'} · ${stats.percent}% complete`,
      stats.late ? h('span', { class: 'is-late' }, ` · ${stats.late} running late`) : null,
      stats.nextMilestone ? ` · Next milestone: ${stats.nextMilestone.name}, ${formatShortDate(stats.nextMilestone.start)}` : null,
    );
  }

  // ─── Quick add ─────────────────────────────────────────────────────────────

  const addName = h('input', { type: 'text', class: 'input', placeholder: 'Add a task or phase', 'aria-label': 'New task name' });
  const addStart = h('input', { type: 'date', class: 'input input--compact', 'aria-label': 'Start date' });
  const addEnd = h('input', { type: 'date', class: 'input input--compact', 'aria-label': 'End date' });
  const addMilestone = h('input', { type: 'checkbox' });
  const addError = h('p', { class: 'form-error', role: 'alert' });

  function resetAddForm() {
    addName.value = '';
    addStart.value = todayKey();
    addEnd.value = addDays(todayKey(), NEW_TASK_LENGTH_DAYS - 1);
    addMilestone.checked = false;
    addEnd.disabled = false;
  }

  addMilestone.addEventListener('change', () => { addEnd.disabled = addMilestone.checked; });
  addName.addEventListener('input', () => { addError.textContent = ''; });

  const addForm = h('form', {
    class: 'gantt-page__add',
    onSubmit: (event) => {
      event.preventDefault();
      const name = addName.value.trim();
      if (!name) {
        addError.textContent = 'Give the task a name first.';
        addName.focus();
        return;
      }
      if (!addMilestone.checked && addEnd.value && addEnd.value < addStart.value) {
        addError.textContent = 'The end date is before the start date.';
        addEnd.focus();
        return;
      }
      const task = createTask({
        name,
        start: addStart.value || todayKey(),
        end: addEnd.value,
        milestone: addMilestone.checked,
        assigneeIds: isSolo ? [me.id] : [],
      });
      update((data) => data.tasks.push(task));
      resetAddForm();
      addName.focus();
    },
  },
    h('div', { class: 'gantt-page__add-row' },
      addName,
      h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'From'), addStart),
      h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'to'), addEnd),
      h('label', { class: 'page-control' }, addMilestone, h('span', {}, 'Milestone')),
      h('button', { type: 'submit', class: 'button button--primary' }, icon('plus', 16), ' Add'),
    ),
    addError,
  );

  // ─── Toolbar: zoom and "Today" ─────────────────────────────────────────────

  const zoomBar = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Zoom' });

  function drawZoomBar() {
    replaceChildren(zoomBar, ZOOM_LEVELS.map((zoom) => h('button', {
      type: 'button',
      class: `segmented__option${zoom.id === view.zoomId ? ' is-active' : ''}`,
      'aria-pressed': String(zoom.id === view.zoomId),
      onClick: () => {
        view.zoomId = zoom.id;
        drawZoomBar();
        chart.draw();
        chart.scrollToToday();
      },
    }, zoom.label)));
  }

  const toolbar = h('div', { class: 'page-toolbar' },
    h('span', { class: 'page-control__label' }, 'Zoom'),
    zoomBar,
    h('button', { type: 'button', class: 'button button--small', onClick: () => chart.scrollToToday() }, 'Today'),
    h('span', { class: 'page-toolbar__spacer' }),
    h('span', { class: 'gantt-page__hint' }, 'Drag a bar to move it, drag its ends to change the dates, or drag a name to reorder.'),
  );

  // ─── Chart ─────────────────────────────────────────────────────────────────

  const chart = createGanttChart({
    getTasks: tasks,
    getSelectedId: () => view.selectedTaskId,
    getDayWidth: dayWidth,
    getMember: context.getMember,
    isSolo,
    editable: true,
    onSelect: selectTask,
    onChangeDates: (taskId, dates) => updateTask(taskId, dates, { redrawDetails: taskId === view.selectedTaskId }),
    onReorder: (taskId, beforeTaskId) => update((data) => {
      const task = data.tasks.find((t) => t.id === taskId);
      data.tasks = data.tasks.filter((t) => t.id !== taskId);
      const beforeIndex = beforeTaskId ? data.tasks.findIndex((t) => t.id === beforeTaskId) : -1;
      data.tasks.splice(beforeIndex === -1 ? data.tasks.length : beforeIndex, 0, task);
    }, { redrawDetails: Boolean(view.selectedTaskId) }), // the panel's Up/Down buttons may change
  });

  // ─── Details panel ─────────────────────────────────────────────────────────

  const detailsPanel = h('aside', { class: 'side-panel', 'aria-label': 'Task details' });

  function drawDetails() {
    const task = view.selectedTaskId ? findTask(view.selectedTaskId) : null;
    detailsPanel.hidden = !task;
    if (!task) {
      replaceChildren(detailsPanel);
      return;
    }

    const allTasks = tasks();
    const index = allTasks.findIndex((t) => t.id === task.id);
    const field = (labelText, control, wide = false) => h('label', { class: `side-panel__field${wide ? ' side-panel__field--wide' : ''}` },
      h('span', { class: 'side-panel__label' }, labelText), control);

    const nameInput = h('textarea', {
      class: 'side-panel__title',
      rows: '2',
      'aria-label': 'Task name',
      onInput: debounce((event) => {
        const name = event.target.value.trim();
        if (name) updateTask(task.id, { name });
      }, TEXT_SAVE_DELAY_MS),
    });
    nameInput.value = task.name;

    const notesInput = h('textarea', {
      class: 'input side-panel__notes',
      rows: '5',
      placeholder: 'What this phase involves, what it’s waiting on',
      onInput: debounce((event) => updateTask(task.id, { notes: event.target.value }), TEXT_SAVE_DELAY_MS),
    });
    notesInput.value = task.notes;

    // Progress: a slider and the number beside it, kept in step.
    const progressValue = h('output', { class: 'gantt-progress__value' }, `${task.progress}%`);
    const progressSlider = h('input', {
      type: 'range',
      min: '0',
      max: '100',
      step: '5',
      value: String(task.progress),
      'aria-label': 'Progress',
      onInput: (event) => { progressValue.textContent = `${event.target.value}%`; },
      onChange: (event) => updateTask(task.id, { progress: Number(event.target.value) }),
    });

    const dateInput = (value, onChange, label) => h('input', {
      type: 'date',
      class: 'input',
      value,
      'aria-label': label,
      onChange: (event) => { if (event.target.value) onChange(event.target.value); },
    });

    replaceChildren(detailsPanel,
      h('div', { class: 'side-panel__top' },
        h('span', { class: `side-panel__kicker tint-swatch${task.color ? ` tint--${task.color}` : ''}` }, task.milestone ? 'Milestone' : 'Task'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close details', onClick: () => selectTask(null) }, icon('close', 16)),
      ),
      nameInput,
      h('p', { class: 'side-panel__hint' }, dateRangeLabel(task)),
      h('div', { class: 'side-panel__grid' },
        field(task.milestone ? 'Date' : 'Start', dateInput(task.start, (start) => updateTask(task.id, { start }, { redrawDetails: true }), 'Start date')),
        task.milestone ? null : field('End', dateInput(task.end, (end) => updateTask(task.id, { end }, { redrawDetails: true }), 'End date')),
        h('label', { class: 'side-panel__field side-panel__field--wide gantt-page__check' },
          h('input', {
            type: 'checkbox',
            checked: task.milestone,
            onChange: (event) => updateTask(task.id, { milestone: event.target.checked }, { redrawDetails: true }),
          }),
          ' Milestone (a single date, like a deadline or an event)'),
        task.milestone ? null : h('div', { class: 'side-panel__field side-panel__field--wide' },
          h('span', { class: 'side-panel__label' }, 'Progress'),
          h('div', { class: 'gantt-progress' }, progressSlider, progressValue),
        ),
        field('Color', h('select', {
          class: 'input',
          onChange: (event) => updateTask(task.id, { color: event.target.value }, { redrawDetails: true }),
        }, TASK_COLORS.map((c) => h('option', { value: c.id, selected: c.id === task.color }, c.label)))),
        h('div', { class: 'side-panel__field' },
          h('span', { class: 'side-panel__label' }, 'Order'),
          h('span', { class: 'gantt-page__order' },
            h('button', { type: 'button', class: 'button button--small', disabled: index === 0, onClick: () => shiftTask(task.id, -1) }, icon('arrowUp', 14), ' Up'),
            h('button', { type: 'button', class: 'button button--small', disabled: index >= ownTaskCount() - 1, onClick: () => shiftTask(task.id, 1) }, icon('arrowDown', 14), ' Down'),
          ),
        ),
        isSolo ? null : h('div', { class: 'side-panel__field side-panel__field--wide' },
          h('span', { class: 'side-panel__label' }, 'Who’s on it'),
          memberToggles(context.members, task.assigneeIds, (assigneeIds) => updateTask(task.id, { assigneeIds }), 'Who’s on it'),
        ),
      ),
      field('Notes', notesInput, true),
      h('div', { class: 'side-panel__footer' },
        h('span', {}),
        h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => deleteTask(task) }, task.milestone ? 'Delete milestone' : 'Delete task'),
      ),
    );
  }

  // ─── Layout ────────────────────────────────────────────────────────────────

  const layout = h('div', { class: 'page-layout' }, h('div', { class: 'page-layout__main' }, chart.element), detailsPanel);

  function drawAll() {
    drawSummary();
    drawZoomBar();
    chart.draw();
    drawDetails();
  }

  resetAddForm();
  container.append(summary, addForm, toolbar, layout);
  drawAll();
  requestAnimationFrame(() => {
    chart.scrollToToday();
    // Opened from a task on the homepage: make sure it's in view.
    chart.element.querySelector(`.gantt-bar[data-task-id="${view.selectedTaskId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
