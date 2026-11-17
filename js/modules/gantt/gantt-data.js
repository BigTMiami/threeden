// @ts-check
/**
 * gantt-data.js — the shape of a Gantt chart's tasks, and date math for them.
 *
 * Data saved for a Gantt module:
 *
 *   {
 *     tasks: [ {
 *       id,
 *       name,
 *       start: '2026-11-02',     ← first day (inclusive)
 *       end:   '2026-11-08',     ← last day (inclusive); same as start for one day
 *       milestone: false,        ← a single moment (drawn as a diamond on `start`)
 *       progress: 40,            ← percent done, 0–100
 *       color: 'blue' | '',      ← a label color (see .tint-- classes in page-parts.css)
 *       assigneeIds: ['m-leo'],
 *       notes: '',
 *     } ],
 *   }
 *
 * Tasks are drawn top to bottom in array order.
 *
 * Every function here works on plain data and never touches the page.
 */

import { makeId } from '../../ui/dom.js';
import { todayKey, addDays, daysBetween, startOfWeek, formatShortDate } from '../../utils/dates.js';

export const TASK_COLORS = [
  { id: '', label: 'Default' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'orange', label: 'Orange' },
  { id: 'purple', label: 'Purple' },
  { id: 'red', label: 'Red' },
];

/** How wide one day is at each zoom level, in pixels. */
export const ZOOM_LEVELS = [
  { id: 'months', label: 'Months', dayWidth: 8 },
  { id: 'weeks', label: 'Weeks', dayWidth: 18 },
  { id: 'days', label: 'Days', dayWidth: 36 },
];

// ─── Creating ────────────────────────────────────────────────────────────────

export function normalizeTask(task) {
  const normalized = {
    name: '',
    start: todayKey(),
    end: '',
    milestone: false,
    progress: 0,
    color: '',
    assigneeIds: [],
    notes: '',
    ...task,
  };
  if (!normalized.end || normalized.end < normalized.start || normalized.milestone) normalized.end = normalized.start;
  normalized.progress = Math.max(0, Math.min(100, Math.round(Number(normalized.progress) || 0)));
  return normalized;
}

export function createTask(fields) {
  return normalizeTask({ id: makeId('gtask'), ...fields });
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** Number of days a task covers, counting both ends (a one-day task is 1). */
export function durationDays(task) {
  return daysBetween(task.start, task.end) + 1;
}

/** Past its end date and not finished. */
export function isLate(task) {
  return task.progress < 100 && task.end < todayKey();
}

/** "Nov 2 – Nov 8 · 7 days", or "Nov 30" for a milestone. */
export function dateRangeLabel(task) {
  if (task.milestone) return formatShortDate(task.start);
  const days = durationDays(task);
  return `${formatShortDate(task.start)} – ${formatShortDate(task.end)} · ${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * The dates the chart should show: from the Sunday a week before the
 * earliest task (or today) to a few weeks after the last one, so there's
 * room to drag things later.
 */
export function chartRange(tasks) {
  const today = todayKey();
  const starts = [today, ...tasks.map((t) => t.start)].sort();
  const ends = [today, ...tasks.map((t) => t.end)].sort();
  const start = startOfWeek(addDays(starts[0], -7));
  let end = addDays(ends[ends.length - 1], 28);
  // At least ten weeks, so a near-empty chart doesn't look cramped.
  if (daysBetween(start, end) < 70) end = addDays(start, 70);
  return { start, end, days: daysBetween(start, end) + 1 };
}

/**
 * Overall numbers for the summary line. Progress is weighted by length,
 * so a month-long task counts more than a one-day one.
 */
export function summarize(tasks) {
  const work = tasks.filter((t) => !t.milestone);
  const totalDays = work.reduce((sum, t) => sum + durationDays(t), 0);
  const doneDays = work.reduce((sum, t) => sum + durationDays(t) * (t.progress / 100), 0);
  const today = todayKey();
  const nextMilestone = tasks
    .filter((t) => t.milestone && t.start >= today)
    .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;

  return {
    count: tasks.length,
    percent: totalDays ? Math.round((doneDays / totalDays) * 100) : 0,
    late: tasks.filter(isLate).length,
    nextMilestone,
  };
}

// ─── Changing ────────────────────────────────────────────────────────────────

/**
 * New dates after dragging by `days`:
 *   mode 'move'  → both ends shift
 *   mode 'start' → only the start moves (never past the end)
 *   mode 'end'   → only the end moves (never before the start)
 */
export function shiftedDates(task, mode, days) {
  if (mode === 'move' || task.milestone) {
    return { start: addDays(task.start, days), end: addDays(task.end, days) };
  }
  if (mode === 'start') {
    const start = addDays(task.start, days);
    return { start: start > task.end ? task.end : start, end: task.end };
  }
  const end = addDays(task.end, days);
  return { start: task.start, end: end < task.start ? task.start : end };
}
