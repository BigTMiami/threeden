// @ts-check
/**
 * todo-module.js — the Tasks module: tasks for people, as a list or a board.
 *
 * One module, two views (Kanban and To-do were merged on Nov 15):
 *   List   a checklist with due dates, priorities, people, and subtasks
 *   Board  the same tasks as cards across columns (the last column = done)
 * The choice is saved with the module (data.view), so everyone sees the
 * same view; a toggle at the top of the full page switches it.
 *
 * Files in this folder:
 *   todo-module.js  ← this file: the module definition
 *   todo-card.js    the compact homepage card (list view)
 *   todo-page.js    the full-page list (search, grouping, details panel)
 *   todo-data.js    task shape and the filter/sort/group rules
 *   todo-parts.js   small UI pieces both views use
 *   tasks-board.js  the board view's adapter (the board itself is js/modules/kanban/)
 *   tracking.js     a group's task on your own list
 *
 * Data shape: { tasks: [ …see todo-data.js… ], view?: 'list' | 'board', columns?: [{ id, title }] }
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { renderTodoCard } from './todo-card.js';
import { renderTodoPage } from './todo-page.js';
import { renderKanbanCard } from '../kanban/kanban-card.js';
import { renderKanbanPage } from '../kanban/kanban-page.js';
import { normalizeTask, isAssignedTo } from './todo-data.js';
import { boardContext, columnLabel } from './tasks-board.js';

const isBoard = (context) => context.getData()?.view === 'board';

export const todoModule = {
  type: 'todo',
  label: 'Tasks',
  description: 'Tasks for people, as a list or a board',
  icon: 'todo',
  defaultSpan: 6,
  defaultRows: 12,
  available: true,

  createInitialData() {
    return { tasks: [] };
  },

  render(container, context) {
    if (isBoard(context)) renderKanbanCard(container, boardContext(context));
    else renderTodoCard(container, context);
  },

  renderFullPage(container, context) {
    const body = h('div', { class: 'tasks-page__body' });
    const toggle = h('div', { class: 'segmented tasks-page__view', role: 'group', 'aria-label': 'Show as' });
    function draw() {
      const board = isBoard(context);
      replaceChildren(toggle, [['list', 'List'], ['board', 'Board']].map(([id, label]) => h('button', {
        type: 'button', class: `segmented__option${(id === 'board') === board ? ' is-active' : ''}`, 'aria-pressed': String((id === 'board') === board),
        disabled: context.isVisitor,
        onClick: () => {
          if ((id === 'board') === isBoard(context)) return;
          context.saveData({ ...context.getData(), view: id });
          draw();
        },
      }, label)));
      replaceChildren(body);
      if (board) renderKanbanPage(body, boardContext(context));
      else renderTodoPage(body, context);
    }
    container.append(h('div', { class: 'tasks-page__bar' }, toggle), body);
    draw();
  },

  // Group tasks assigned to you also show in your own Tasks (see linked-items.js).
  assignments: {
    items: (data) => data.tasks,
    isAssignedTo: (task, memberId) => isAssignedTo(normalizeTask(task), memberId),
    describe: (task, data) => columnLabel(task, data),
  },
};
