// @ts-check
/**
 * tasks-board.js — the Tasks module's Board view, and moving old Kanban
 * boards into Tasks.
 *
 * Tasks (type 'todo') is one list of tasks with two ways to look at it:
 * List (todo-page.js, todo-card.js) and Board (columns of cards, drawn by
 * js/modules/kanban/). The board code works on { columns, cards }, so this
 * file hands it that shape, made from the tasks, and writes its changes
 * back: a card is a task (title = text, description = notes), and the
 * board's last column means done.
 *
 *   Data: { tasks: [...], view: 'list' | 'board', columns: [{ id, title }] }
 *     task.columnId  where it sits on the board (missing: the first column,
 *                    or the last if it's done)
 *     task.color     its label on the board
 *
 *   boardColumns(data)       → the columns (To do, Doing, Done when none are saved)
 *   boardContext(context)    → a module context whose getData/saveData speak cards
 *   kanbanToTasks(board)     → an old Kanban board's data as Tasks data (view: 'board')
 *   columnLabel(task, data)  → the column a task sits in, for "Assigned to you" lines
 *
 * Ticking a task done in the List moves it to the last column; unticking
 * one that sits there moves it to the first.
 */

import { normalizeTask } from './todo-data.js';

export const DEFAULT_COLUMNS = [
  { id: 'col-todo', title: 'To do' },
  { id: 'col-doing', title: 'Doing' },
  { id: 'col-done', title: 'Done' },
];

export function boardColumns(data) {
  return Array.isArray(data?.columns) && data.columns.length ? data.columns : DEFAULT_COLUMNS.map((c) => ({ ...c }));
}

/** The column a task sits in: its own, kept in step with done. */
function columnOf(task, columns) {
  const first = columns[0].id;
  const last = columns[columns.length - 1].id;
  const own = columns.some((c) => c.id === task.columnId) ? task.columnId : null;
  if (task.done) return last;
  if (own === last) return columns.length > 1 ? first : last;
  return own ?? first;
}

/** A task as the board draws it. */
function taskToCard(task, columns) {
  const t = normalizeTask(task);
  return {
    id: t.id, columnId: columnOf(t, columns), title: t.text ?? '', description: t.notes ?? '',
    assigneeIds: t.assigneeIds, due: t.due ?? '', color: t.color ?? '', createdAt: t.createdAt ?? 0,
    ...(t.acceptedIds ? { acceptedIds: t.acceptedIds } : {}), // who has accepted (js/ui/task-people.js)
  };
}

/** The tasks as a board. */
export function toBoard(data) {
  const columns = boardColumns(data);
  return { columns: structuredClone(columns), cards: (data?.tasks ?? []).map((t) => taskToCard(t, columns)) };
}

/** The board's changes, written back into the tasks (in the board's order). */
export function fromBoard(data, board) {
  const columns = board.columns.length ? board.columns : boardColumns(data);
  const last = columns[columns.length - 1].id;
  const byId = new Map((data.tasks ?? []).map((t) => [t.id, t]));
  const tasks = board.cards.map((card) => {
    const before = byId.get(card.id);
    const nowDone = card.columnId === last;
    return {
      ...(before ?? { subtasks: [], priority: '', createdAt: card.createdAt || Date.now() }),
      id: card.id, text: card.title, notes: card.description, assigneeIds: card.assigneeIds ?? [],
      due: card.due ?? '', color: card.color ?? '', columnId: card.columnId,
      ...(card.acceptedIds ? { acceptedIds: card.acceptedIds } : {}),
      done: nowDone,
      ...(nowDone && !before?.done ? { completedAt: Date.now() } : {}),
    };
  });
  return { ...data, columns: structuredClone(board.columns), tasks };
}

/** A module context for the board code: same as the Tasks one, but in cards and columns. */
export function boardContext(context) {
  const adapted = Object.create(context);
  adapted.getData = () => toBoard(context.getData());
  adapted.saveData = (board) => context.saveData(fromBoard(context.getData(), board));
  adapted.getLinkedItems = () => context.getLinkedItems().map((link) => ({
    ...link, item: link.item.title !== undefined ? link.item : { ...link.item, title: link.item.text ?? '' },
  }));
  return adapted;
}

/** An old Kanban board ({ columns, cards }) as Tasks data. */
export function kanbanToTasks(board) {
  const columns = board?.columns?.length ? board.columns : DEFAULT_COLUMNS.map((c) => ({ ...c }));
  const last = columns[columns.length - 1].id;
  return {
    view: 'board',
    columns,
    tasks: (board?.cards ?? []).map((card) => ({
      id: card.id, text: card.title ?? '', notes: card.description ?? '', done: card.columnId === last,
      assigneeIds: card.assigneeIds ?? [], due: card.due ?? '', color: card.color ?? '', columnId: card.columnId,
      priority: '', subtasks: [], createdAt: card.createdAt ?? 0,
    })),
  };
}

/** The column a task sits in (for "Assigned to you" lines on your homepage), when its list is shown as a board. */
export function columnLabel(task, data) {
  if (data?.view !== 'board') return '';
  const columns = boardColumns(data);
  return columns.find((c) => c.id === columnOf(normalizeTask(task), columns))?.title ?? '';
}
