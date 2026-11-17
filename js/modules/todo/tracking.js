// @ts-check
/**
 * tracking.js — put something from a group onto your own to-do list.
 *
 * From a Kanban card's details: "Add to my to-do list". The task lands on
 * the first To-do module on your homepage (one is added if you have none),
 * remembers where it came from, and shows a link back to it:
 *
 *   task.source = { moduleId, itemId, kind: 'card' }
 *
 *   myTodoModule(me, { create })          → your homepage's To-do module (or null)
 *   trackedTaskFor(me, moduleId, itemId)  → the task tracking that item, or null
 *   trackOnMyList(me, item)               → adds it; returns { task, created }
 *   untrack(me, moduleId, itemId)         → takes it off; returns the removed task (for Undo)
 *   sourceLinkOf(task)                    → a link for sourceTag()/linkedNote(), or null
 *   openSource(link)                      → opens the item where it lives
 *
 * The task keeps its own title and due date (it's yours to tick off); the
 * card stays where it is on the group's board.
 */

import { changeState, getPersonalSpace, getModule, getSpaceOfModule } from '../../state/store.js';
import { makeId } from '../../ui/dom.js';
import { createTask } from './todo-data.js';
import { requestModuleFocus } from '../../editor/module-context.js';
import { openModulePage } from '../../router.js';

/** Your homepage's first Tasks module shown as a list (else the first Tasks module); with `create`, adds "My tasks" if there isn't one. */
export function myTodoModule(me, { create = false } = {}) {
  const home = getPersonalSpace();
  if (!home || home.memberIds[0] !== me.id) return null;
  const found = home.modules.find((m) => m.type === 'todo' && m.data?.view !== 'board') ?? home.modules.find((m) => m.type === 'todo');
  if (found || !create) return found ?? null;
  const module = { id: makeId('mod'), type: 'todo', title: 'My tasks', span: 7, rows: 12, data: { tasks: [] } };
  changeState(() => { home.modules.push(module); }, 'layout');
  return getModule(module.id);
}

export function trackedTaskFor(me, moduleId, itemId) {
  const module = myTodoModule(me);
  return (module?.data?.tasks ?? []).find((t) => t.source?.moduleId === moduleId && t.source?.itemId === itemId) ?? null;
}

/**
 * @param {any} me
 * @param {{ moduleId: string, itemId: string, title: string, due?: string, kind?: string }} item
 */
export function trackOnMyList(me, { moduleId, itemId, title, due = '', kind = 'card' }) {
  const existing = trackedTaskFor(me, moduleId, itemId);
  if (existing) return { task: existing, created: false };
  const module = myTodoModule(me, { create: true });
  const task = createTask({ text: title, due, assigneeIds: [me.id], source: { moduleId, itemId, kind } });
  changeState(() => {
    const live = getModule(module.id);
    live.data = { ...live.data, tasks: [task, ...(live.data?.tasks ?? [])] };
  }, 'layout');
  return { task, created: true };
}

export function untrack(me, moduleId, itemId) {
  const module = myTodoModule(me);
  const task = trackedTaskFor(me, moduleId, itemId);
  if (!module || !task) return null;
  changeState(() => {
    const live = getModule(module.id);
    live.data = { ...live.data, tasks: live.data.tasks.filter((t) => t.id !== task.id) };
  }, 'layout');
  return { task, moduleId: module.id };
}

/** Put a removed task back (Undo). */
export function restoreTracked(removed) {
  if (!removed) return;
  changeState(() => {
    const live = getModule(removed.moduleId);
    if (live && !live.data.tasks.some((t) => t.id === removed.task.id)) live.data = { ...live.data, tasks: [removed.task, ...live.data.tasks] };
  }, 'layout');
}

/** Where a tracked task came from, shaped like a linked item (js/ui/source-tag.js). */
export function sourceLinkOf(task) {
  if (!task?.source) return null;
  const module = getModule(task.source.moduleId);
  const space = getSpaceOfModule(task.source.moduleId);
  if (!module || !space) return null;
  return { moduleId: module.id, itemId: task.source.itemId, moduleTitle: module.title, spaceName: space.name, spaceId: space.id };
}

export function openSource(link) {
  requestModuleFocus(link.moduleId, link.itemId);
  openModulePage(link.moduleId);
}
