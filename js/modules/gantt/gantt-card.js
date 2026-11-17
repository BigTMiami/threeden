// @ts-check
/**
 * gantt-card.js — the Gantt chart as it appears on the homepage.
 *
 * A compact, read-only chart that opens scrolled to today, with the
 * overall progress above it. Clicking a task opens the full page with that
 * task selected; all editing happens there (gantt-page.js).
 *
 * On a personal homepage, group tasks you're on are drawn too (see
 * js/editor/linked-items.js); clicking one opens it in the group's chart.
 */

import { h } from '../../ui/dom.js';
import { createGanttChart } from './gantt-chart.js';
import { normalizeTask, summarize } from './gantt-data.js';

const CARD_DAY_WIDTH = 10;

export function renderGanttCard(container, context) {
  const tasks = () => [
    ...context.getData().tasks.map(normalizeTask),
    ...context.getLinkedItems().map((link) => ({ ...normalizeTask(link.item), _link: link })),
  ];
  const stats = summarize(tasks());

  const chart = createGanttChart({
    getTasks: tasks,
    getDayWidth: () => CARD_DAY_WIDTH,
    getMember: context.getMember,
    isSolo: context.members.length <= 1,
    compact: true,
    fitWidth: true,
    onSelect: (taskId) => {
      const link = tasks().find((t) => t.id === taskId)?._link;
      if (link) context.openLinkedItem(link);
      else context.openFullPage(taskId);
    },
  });

  container.append(
    h('div', { class: 'gantt-card__summary' },
      h('span', {}, `${stats.percent}% complete`),
      h('span', { class: 'progress-bar', role: 'progressbar', 'aria-valuenow': String(stats.percent), 'aria-valuemin': '0', 'aria-valuemax': '100' },
        h('span', { class: 'progress-bar__fill', style: { width: `${stats.percent}%` } })),
      stats.late ? h('span', { class: 'gantt-card__late' }, `${stats.late} late`) : null,
    ),
    chart.element,
  );
  chart.draw();

  // The card only has a width once it's on the page: redraw to fill it.
  requestAnimationFrame(() => {
    chart.draw();
    chart.scrollToToday();
  });
}
