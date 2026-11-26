// @ts-check
/**
 * gantt-module.js — the Gantt chart module: tasks and phases on a timeline.
 *
 * Files in this folder:
 *   gantt-module.js  ← this file: the module definition
 *   gantt-card.js    the compact, read-only homepage card
 *   gantt-page.js    the full-page view (quick add, zoom, details panel)
 *   gantt-chart.js   draws the chart and handles dragging bars (used by both)
 *   gantt-data.js    the task shape and the date math
 *
 * Data shape: { tasks: [...] }, see gantt-data.js.
 */

import { renderGanttCard } from './gantt-card.js';
import { renderGanttPage } from './gantt-page.js';

export const ganttModule = {
  type: 'gantt',
  label: 'Gantt chart',
  description: 'Plan phases over time',
  icon: 'gantt',
  defaultSpan: 8,
  defaultRows: 11,
  available: true,

  createInitialData() {
    return { tasks: [] };
  },

  render: renderGanttCard,
  renderFullPage: renderGanttPage,

  // Group tasks you're on also show in your own Gantt chart (see linked-items.js).
  assignments: {
    items: (data) => data.tasks,
    isAssignedTo: (task, memberId) => (task.assigneeIds ?? []).includes(memberId),
  },
};
