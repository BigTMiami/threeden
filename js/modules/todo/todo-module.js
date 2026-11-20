// @ts-check
/**
 * todo-module.js — the Tasks module: tasks for people, as a list or a board.
 *
 * One module, three views (Kanban and To-do were merged on Nov 15; the List
 * module joined as Lists on Nov 20):
 *   Tasks  a checklist with due dates, priorities, people, and subtasks
 *   Board  the same tasks as cards across columns (the last column = done)
 *   Lists  shared lists: groceries, supplies, who's bringing what, sorted
 *          into sections, with quantities, "I'll get it", bought, and usual
 *          items, as many lists as you like (js/modules/grocery/, which the
 *          List module used to be)
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
 * Data shape: { tasks: [ …see todo-data.js… ], view?: 'list' | 'board' | 'lists', columns?: [{ id, title }],
 *               lists?: [{ id, name, items, history }]  ← the Lists view (or a single list's
 *               items?, history?                           items and history, as the List module kept them) }
 */

import { renderLists } from '../grocery/grocery-lists.js';
import { renderGroceryCard } from '../grocery/grocery-card.js';
import { renderGroceryPage } from '../grocery/grocery-page.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { renderTodoCard } from './todo-card.js';
import { renderTodoPage } from './todo-page.js';
import { renderKanbanCard } from '../kanban/kanban-card.js';
import { renderKanbanPage } from '../kanban/kanban-page.js';
import { normalizeTask, isAssignedTo } from './todo-data.js';
import { boardContext, columnLabel } from './tasks-board.js';

const isBoard = (context) => context.getData()?.view === 'board';
const isLists = (context) => context.getData()?.view === 'lists';

/**
 * The Lists view's context: the List module's code (grocery-lists.js) reads
 * and saves its own fields (lists, items, history) in the Tasks module's data.
 */
function listsContext(context) {
  return {
    ...context,
    getData: () => context.getData() ?? {},
    saveData: (data) => {
      const { lists, items, history } = data ?? {};
      context.saveData({ ...context.getData(), ...(lists ? { lists } : {}), ...(items ? { items } : {}), ...(history ? { history } : {}) });
    },
  };
}
const VIEWS = [['list', 'Tasks'], ['board', 'Board'], ['lists', 'Lists']];
const viewOf = (context) => (isBoard(context) ? 'board' : isLists(context) ? 'lists' : 'list');

export const todoModule = {
  type: 'todo',
  label: 'Tasks',
  description: 'Tasks for people, as a list or a board, and shared lists (groceries, who’s bringing what)',
  icon: 'todo',
  defaultSpan: 6,
  defaultRows: 12,
  available: true,

  createInitialData() {
    return { tasks: [] };
  },

  render(container, context) {
    if (isLists(context)) return renderLists(container, listsContext(context), { full: false, renderList: renderGroceryCard });
    if (isBoard(context)) renderKanbanCard(container, boardContext(context));
    else renderTodoCard(container, context);
    return undefined;
  },

  renderFullPage(container, context) {
    const body = h('div', { class: 'tasks-page__body' });
    const toggle = h('div', { class: 'segmented tasks-page__view', role: 'group', 'aria-label': 'Show as' });
    let cleanup = null;
    function draw() {
      const view = viewOf(context);
      replaceChildren(toggle, VIEWS.map(([id, label]) => h('button', {
        type: 'button', class: `segmented__option${id === view ? ' is-active' : ''}`, 'aria-pressed': String(id === view),
        disabled: context.isVisitor,
        onClick: () => {
          if (id === viewOf(context)) return;
          context.saveData({ ...context.getData(), view: id });
          draw();
        },
      }, label)));
      if (typeof cleanup === 'function') cleanup();
      cleanup = null;
      replaceChildren(body);
      if (view === 'lists') cleanup = renderLists(body, listsContext(context), { full: true, renderList: renderGroceryPage });
      else if (view === 'board') renderKanbanPage(body, boardContext(context));
      else renderTodoPage(body, context);
    }
    container.append(h('div', { class: 'tasks-page__bar' }, toggle), body);
    draw();
    return () => { if (typeof cleanup === 'function') cleanup(); };
  },

  // Group tasks assigned to you also show in your own Tasks (see linked-items.js).
  assignments: {
    items: (data) => data.tasks,
    isAssignedTo: (task, memberId) => isAssignedTo(normalizeTask(task), memberId),
    describe: (task, data) => columnLabel(task, data),
  },
};
