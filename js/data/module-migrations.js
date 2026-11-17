// @ts-check
/**
 * module-migrations.js — modules whose type was merged into another, moved
 * to the new type when the sample data is built (demo-state.js) and when a
 * module comes back from a backup.
 *
 *   'kanban'    → 'todo' (Tasks) shown as a board (js/modules/todo/tasks-board.js)
 *   'document'  → 'note' (Document; js/modules/note.js), same data
 *
 *   migrateModule(module)   → the module in its current type (or as it was)
 *   migrateSpace(space)     → the space with every module and vault module file moved
 */

import { kanbanToTasks } from '../modules/todo/tasks-board.js';

export function migrateModule(module) {
  if (module?.type === 'kanban') return { ...module, type: 'todo', data: kanbanToTasks(module.data) };
  if (module?.type === 'document') return { ...module, type: 'note' };
  return module;
}

/** A vault's module files ({ kind: 'module', moduleType, data }) get the same treatment. */
function migrateVaultItems(items) {
  return items.map((item) => {
    if (item.kind !== 'module') return item;
    const moved = migrateModule({ type: item.moduleType, data: item.data });
    return moved.type === item.moduleType ? item : { ...item, moduleType: moved.type, data: moved.data };
  });
}

export function migrateSpace(space) {
  return {
    ...space,
    modules: space.modules.map((m) => {
      const moved = migrateModule(m);
      return moved.type === 'vault' && Array.isArray(moved.data?.items) ? { ...moved, data: { ...moved.data, items: migrateVaultItems(moved.data.items) } } : moved;
    }),
  };
}
