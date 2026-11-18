// @ts-check
/**
 * vault-module-files.js — module files: a to-do list, kanban board,
 * relationship map (and more) kept in a vault as a file instead of sitting
 * on a homepage.
 *
 *   "+ New" in a vault → Relationship map → "Who funds the council race"
 *   It's saved as an item:  { kind: 'module', moduleType: 'relationship', name, data }
 *   Opening it shows that module type's full page, working on the item's data.
 *
 * Any module type listed in FILE_MODULE_TYPES works, with no changes to
 * the module itself: it gets a `context` (see js/modules/registry.js)
 * whose getData/saveData read and write the vault item instead of a
 * homepage module. The same context lets a homepage show a vault file as
 * a module (js/modules/vaultfile/).
 */

import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { getModuleType } from '../registry.js';
import { getModule, getSpaceOfModule, getSpaceMembers, getCurrentUser, getMember, updateModuleData } from '../../state/store.js';
import { can, roleOf } from '../../state/permissions.js';
import { documentAccess } from '../../ui/file-access.js';

/**
 * Module types that can be made as vault files (the "+ New" menu in
 * vault-parts.js lists them, with short descriptions of its own).
 */
export const FILE_MODULE_TYPES = ['sheet', 'grocery', 'todo', 'relationship', 'gantt', 'survey', 'presentation'];

/** The data for a new file of this type (the same as a new module of it). */
export function initialFileData(type) {
  return getModuleType(type).createInitialData({ currentUserId: getCurrentUser()?.id });
}

/**
 * A module `context` for one vault item: what a module type's render or
 * renderFullPage needs, reading and writing `vault module → item.data`.
 *
 * Who can change it follows the vault's own space: its members can (with
 * "Add to vaults"), and anyone else, like visitors to a blog showing the
 * file, only looks.
 */
export function createItemContext(vaultModuleId, itemId, { openFullPage = () => {}, access = null } = {}) {
  const vaultSpace = getSpaceOfModule(vaultModuleId);
  const me = getCurrentUser();
  const item = () => getModule(vaultModuleId)?.data.items.find((i) => i.id === itemId);
  // Shared with "Can edit" (js/ui/file-access.js): anyone signed in who sees it may change it.
  const sharedToEdit = access === 'edit' && Boolean(me) && !me.isGuest;
  // A group member the document's maker limited to commenting or viewing (item.memberAccess) can't change it.
  const level = documentAccess(vaultModuleId, item(), me);
  const limited = level === 'comment' || level === 'view';
  const isMember = (Boolean(vaultSpace?.memberIds.includes(me?.id)) && !limited) || sharedToEdit;

  return {
    moduleId: `${vaultModuleId}:${itemId}`,
    spaceId: vaultSpace?.id ?? null,
    spaceKind: vaultSpace?.kind ?? null,
    getData: () => item()?.data,
    saveData: (data) => {
      const vault = getModule(vaultModuleId);
      if (!vault || !isMember) return;
      const vaultData = structuredClone(vault.data);
      const saved = vaultData.items.find((i) => i.id === itemId);
      if (!saved) return;
      Object.assign(saved, { data, updatedBy: me.id, updatedAt: Date.now() });
      updateModuleData(vaultModuleId, vaultData);
    },
    members: getSpaceMembers(vaultSpace ?? { memberIds: [] }),
    currentUser: me,
    getMember,
    can: (permissionId) => (sharedToEdit && !vaultSpace?.memberIds.includes(me?.id) ? permissionId === 'createInVault' : isMember && can(vaultSpace, me.id, permissionId)),
    role: roleOf(vaultSpace, me?.id),
    isVisitor: !isMember,
    openFullPage,
    takeFocusRequest: () => null,
    getLinkedItems: () => [],
    updateLinkedItem: () => {},
    openLinkedItem: () => {},
  };
}

/**
 * An open module file in the vault: a back link, its name, and the module
 * type's full page (or its card, if it has no full page). Returns
 * { element, cleanup }.
 */
export function renderModuleFileView(item, { vaultModuleId, folderName, onBack, onRename, shareButton = null }) {
  const moduleType = getModuleType(item.moduleType);
  const body = h('div', { class: `vault-module-file vault-module-file--${item.moduleType}` });
  const context = createItemContext(vaultModuleId, item.id);
  const render = moduleType.renderFullPage ?? moduleType.render;
  const cleanup = render(body, context) || (() => {});

  const element = h('div', { class: 'vault-module-file__wrapper' },
    h('button', { type: 'button', class: 'link-button vault__back', onClick: () => { cleanup(); onBack(); } }, icon('arrowLeft', 14), ` Back to ${folderName}`),
    h('div', { class: 'vault-module-file__header' },
      h('span', { class: 'vault-module-file__icon' }, icon(moduleType.icon, 18)),
      h('input', {
        type: 'text',
        class: 'vault-note__title',
        value: item.name,
        'aria-label': 'Name',
        disabled: context.isVisitor,
        onChange: (event) => onRename(event.target.value),
      }),
      h('span', { class: 'vault-module-file__kind' }, `${moduleType.label} · in the vault`),
      shareButton),
    body);
  return { element, cleanup };
}
