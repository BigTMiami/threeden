// @ts-check
/**
 * gantt-chart.js — draws the Gantt chart: task names on the left, a
 * timeline of bars on the right.
 *
 *                 │ November               │ December
 *                 │ 2   9   16  23  30     │ 7 …
 *   ──────────────┼────────────────────────┼────────
 *   Clear the bed │ ████████░░░            │            ← bar, filled part = progress
 *   Build frames  │      ██████████        │
 *   Planting day  │               ◆        │            ← milestone
 *                          ┆ today
 *
 * Used by both the homepage card (compact, read-only) and the full page
 * (editable). The chart doesn't save anything itself; like the kanban
 * board, it reads through getters and reports changes through callbacks:
 *
 *   const chart = createGanttChart({
 *     getTasks, getSelectedId, getDayWidth,   ← read on every draw
 *     getMember, isSolo, compact, editable,
 *     fitWidth,                               ← widen days to fill the box (card)
 *     onSelect(taskId),
 *     onChangeDates(taskId, { start, end }),  ← after a drag (editable only)
 *     onReorder(taskId, beforeTaskId),        ← after dragging a name (editable only;
 *                                               beforeTaskId null = to the end)
 *   });
 *
 * In the editable chart, drag a bar to move it, or drag either end to
 * change its length. Drag a task's name up or down to reorder the rows. Bars snap to whole days. With a bar focused, the
 * arrow keys move it a day; Shift + arrows change its end date.
 *
 * Tasks with a `_link` (group tasks shown on a personal homepage, see
 * js/editor/linked-items.js) are drawn with their group's name and can't
 * be dragged here.
 *
 * Layout: the whole chart is one scrolling box. The names column and the
 * date header are `position: sticky`, so they stay put while the timeline
 * scrolls under them.
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { avatarStack } from '../../ui/avatar.js';
import { trackPointer } from '../../ui/pointer-tracker.js';
import { sourceLabel } from '../../ui/source-tag.js';
import { todayKey, addDays, daysBetween, fromDateKey, monthName, weekdayName, formatShortDate } from '../../utils/dates.js';
import { chartRange, shiftedDates, isLate, dateRangeLabel } from './gantt-data.js';

/** Below this day width, only week starts get a date label. */
const LABEL_EVERY_DAY_FROM_PX = 30;

export function createGanttChart(options) {
  const {
    getTasks, getSelectedId = () => null, getDayWidth,
    getMember, isSolo, compact = false, editable = false, fitWidth = false,
    onSelect, onChangeDates = () => {}, onReorder = () => {},
  } = options;

  const element = h('div', { class: `gantt${compact ? ' gantt--compact' : ''}` });
  let range = null; // { start, end, days } of the current drawing

  // ─── Drawing ───────────────────────────────────────────────────────────────

  function draw() {
    const tasks = getTasks();
    range = chartRange(tasks);
    const dayWidth = currentDayWidth();

    // Remember the scroll position, so redrawing after an edit doesn't jump.
    const { scrollLeft, scrollTop } = element;

    element.style.setProperty('--day-width', `${dayWidth}px`);
    element.style.setProperty('--timeline-width', `${range.days * dayWidth}px`);

    const inner = h('div', { class: 'gantt__inner' },
      h('div', { class: 'gantt__corner' }, compact ? '' : 'Task'),
      renderScale(dayWidth),
      tasks.length === 0
        ? h('p', { class: 'gantt__empty' }, editable ? 'No tasks yet. Add the first one above.' : 'No tasks yet.')
        : tasks.map((task) => renderRow(task, dayWidth)),
      renderTodayLine(dayWidth),
    );

    replaceChildren(element, inner);
    element.scrollLeft = scrollLeft;
    element.scrollTop = scrollTop;
  }

  /**
   * The width of one day. With `fitWidth`, days stretch so the timeline
   * fills the box (once it's on the page and has a width).
   */
  function currentDayWidth() {
    const wanted = getDayWidth();
    if (!fitWidth || !element.clientWidth) return wanted;
    const nameWidth = parseFloat(getComputedStyle(element).getPropertyValue('--name-width')) || 0;
    return Math.max(wanted, (element.clientWidth - nameWidth) / range.days);
  }

  /** Pixels from the start of the timeline to the start of `dateKey`. */
  const offsetOf = (dateKey, dayWidth) => daysBetween(range.start, dateKey) * dayWidth;

  /** The two header rows: months, then week starts (or every day when zoomed in). */
  function renderScale(dayWidth) {
    const months = [];
    const days = [];
    const everyDay = dayWidth >= LABEL_EVERY_DAY_FROM_PX;
    const today = todayKey();

    for (let i = 0; i < range.days; i += 1) {
      const key = addDays(range.start, i);
      const date = fromDateKey(key);

      if (i === 0 || date.getDate() === 1) {
        months.push({ label: `${monthName(date.getMonth())} ${date.getFullYear()}`, from: i, count: 0 });
      }
      months[months.length - 1].count += 1;

      if (everyDay || date.getDay() === 0) {
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        days.push(h('span', {
          class: `gantt__day${key === today ? ' is-today' : ''}${everyDay && isWeekend ? ' is-weekend' : ''}`,
          style: { left: `${i * dayWidth}px`, width: `${(everyDay ? 1 : 7) * dayWidth}px` },
          title: formatShortDate(key),
        }, everyDay ? `${weekdayName(date.getDay()).slice(0, 1)} ${date.getDate()}` : String(date.getDate())));
      }
    }

    return h('div', { class: 'gantt__scale' },
      h('div', { class: 'gantt__months' }, months.map((month) => h('span', {
        class: 'gantt__month',
        style: { left: `${month.from * dayWidth}px`, width: `${month.count * dayWidth}px` },
      }, month.count * dayWidth > 60 ? h('span', { class: 'gantt__month-label' }, month.label) : null))),
      h('div', { class: 'gantt__days' }, days),
    );
  }

  function renderRow(task, dayWidth) {
    const isSelected = task.id === getSelectedId();
    const people = task.assigneeIds.map(getMember).filter(Boolean);

    const canReorder = editable && !task._link;
    const nameButton = h('button', {
      type: 'button',
      class: `gantt__name${isSelected ? ' is-selected' : ''}${task.milestone ? ' gantt__name--milestone' : ''}${canReorder ? ' is-reorderable' : ''}`,
      dataset: { taskId: task.id },
      onClick: () => onSelect(task.id),
      title: canReorder ? `${task.name} (drag to reorder)` : task.name,
    },
        h('span', { class: 'gantt__name-text' }, task.name),
        task._link && !compact ? sourceLabel(task._link) : null,
        !compact && !isSolo && people.length ? avatarStack(people, 18, 2) : null,
    );
    if (canReorder) nameButton.addEventListener('pointerdown', (event) => startRowDrag(event, task, nameButton));

    return [
      nameButton,
      h('div', { class: `gantt__track${isSelected ? ' is-selected' : ''}` }, renderBar(task, dayWidth, isSelected)),
    ];
  }

  // ─── Reordering rows by dragging a name ────────────────────────────────────

  function startRowDrag(downEvent, task, nameButton) {
    const inner = element.querySelector('.gantt__inner');
    let dropLine = null;
    let beforeTaskId = undefined; // undefined = no valid spot yet

    trackPointer(downEvent, {
      onStart: () => {
        nameButton.classList.add('is-dragging');
        dropLine = h('div', { class: 'gantt__drop-line', 'aria-hidden': 'true' });
        inner.append(dropLine);
      },
      onMove: (point) => {
        // Only rows that can be reordered (linked group tasks stay at the end).
        const rows = [...inner.querySelectorAll('.gantt__name.is-reorderable')];
        const below = rows.find((row) => point.y < row.getBoundingClientRect().top + row.offsetHeight / 2);
        const anchor = below ?? rows[rows.length - 1];
        const innerTop = inner.getBoundingClientRect().top;
        const y = below ? below.getBoundingClientRect().top : anchor.getBoundingClientRect().bottom;
        dropLine.style.top = `${y - innerTop - 1}px`;
        beforeTaskId = below ? below.dataset.taskId : null;
      },
      onEnd: () => {
        nameButton.classList.remove('is-dragging');
        dropLine?.remove();
        if (beforeTaskId === undefined || beforeTaskId === task.id) { draw(); return; }
        onReorder(task.id, beforeTaskId);
      },
      onCancel: () => {
        nameButton.classList.remove('is-dragging');
        dropLine?.remove();
      },
    });
  }

  function renderBar(task, dayWidth, isSelected) {
    const canEdit = editable && !task._link; // linked tasks are edited in their group
    const left = offsetOf(task.start, dayWidth);
    const late = isLate(task);
    const label = `${task.name}: ${dateRangeLabel(task)}${task.milestone ? '' : `, ${task.progress}% done`}`;

    const bar = h('div', {
      class: [
        'gantt-bar',
        task.milestone ? 'gantt-bar--milestone' : '',
        task.color ? `tint--${task.color}` : '',
        late ? 'is-late' : '',
        task.progress >= 100 ? 'is-done' : '',
        isSelected ? 'is-selected' : '',
        canEdit ? 'is-editable' : '',
        task._link ? 'is-linked' : '',
      ].filter(Boolean).join(' '),
      style: {
        left: `${left}px`,
        width: task.milestone ? null : `${(daysBetween(task.start, task.end) + 1) * dayWidth}px`,
      },
      tabindex: '0',
      role: 'button',
      'aria-label': label,
      title: label,
      dataset: { taskId: task.id },
      onClick: () => onSelect(task.id),
      onKeydown: (event) => handleBarKey(event, task),
    },
      task.milestone ? null : h('span', { class: 'gantt-bar__progress', style: { width: `${task.progress}%` } }),
      canEdit && !task.milestone ? h('span', { class: 'gantt-bar__handle gantt-bar__handle--start', dataset: { mode: 'start' } }) : null,
      canEdit && !task.milestone ? h('span', { class: 'gantt-bar__handle gantt-bar__handle--end', dataset: { mode: 'end' } }) : null,
      h('span', { class: 'gantt-bar__label' }, compact ? task.name : [task.name, late ? h('span', { class: 'gantt-bar__late' }, ' · late') : null]),
    );

    if (canEdit) {
      bar.addEventListener('pointerdown', (event) => startBarDrag(event, task, bar, dayWidth));
    }
    return bar;
  }

  function renderTodayLine(dayWidth) {
    const today = todayKey();
    if (today < range.start || today > range.end) return null;
    // Centered in today's column.
    return h('div', { class: 'gantt__today', style: { '--today-offset': `${offsetOf(today, dayWidth) + dayWidth / 2}px` }, title: 'Today' });
  }

  // ─── Editing by dragging ───────────────────────────────────────────────────

  function startBarDrag(downEvent, task, bar, dayWidth) {
    const mode = downEvent.target.dataset.mode || 'move'; // 'start' | 'end' | 'move'
    const original = { left: bar.offsetLeft, width: bar.offsetWidth };
    let days = 0;
    let dateTip = null;

    trackPointer(downEvent, {
      threshold: 3,
      onStart: () => {
        bar.classList.add('is-dragging');
        dateTip = h('span', { class: 'gantt-bar__tip' });
        bar.append(dateTip);
      },
      onMove: (point, { dx }) => {
        days = Math.round(dx / dayWidth);
        const preview = shiftedDates(task, mode, days);
        bar.style.left = `${offsetOf(preview.start, dayWidth)}px`;
        if (!task.milestone) bar.style.width = `${(daysBetween(preview.start, preview.end) + 1) * dayWidth}px`;
        dateTip.textContent = dateRangeLabel({ ...task, ...preview });
      },
      onEnd: () => {
        if (days === 0) { draw(); return; }
        onChangeDates(task.id, shiftedDates(task, mode, days));
      },
      onCancel: () => {
        bar.classList.remove('is-dragging');
        dateTip?.remove();
        bar.style.left = `${original.left}px`;
        if (!task.milestone) bar.style.width = `${original.width}px`;
      },
    });
  }

  /** Arrow keys move the bar a day; with Shift they change the end date. */
  function handleBarKey(event, task) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(task.id);
      return;
    }
    if (!editable || task._link || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const days = event.key === 'ArrowLeft' ? -1 : 1;
    onChangeDates(task.id, shiftedDates(task, event.shiftKey ? 'end' : 'move', days));
    // The chart redraws; put focus back on the same bar.
    element.querySelector(`.gantt-bar[data-task-id="${task.id}"]`)?.focus();
  }

  /** Scroll so today is a little in from the left edge. */
  function scrollToToday() {
    const today = todayKey();
    if (!range || today < range.start) return;
    const nameColumn = element.querySelector('.gantt__corner')?.offsetWidth ?? 0;
    const offset = offsetOf(today, currentDayWidth());
    element.scrollLeft = Math.max(0, offset - (element.clientWidth - nameColumn) * 0.2);
  }

  return { element, draw, scrollToToday };
}
