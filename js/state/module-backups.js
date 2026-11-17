// @ts-check
/**
 * module-backups.js — nothing is lost when a module comes off a page.
 *
 * Removing a module that holds something (a note with words in it, a
 * spreadsheet, a to-do list with tasks…) keeps a copy:
 *
 *   - in the page's vault, if it has one: a folder "Removed from the page"
 *     gets the module as a file (a note or document becomes a vault note;
 *     anything else a module file, which opens as that module's full page);
 *   - otherwise on the page itself (space.removedModules), shown in edit
 *     mode under the module list's "Removed" tab.
 *
 * Either way it can be put back on the page with its contents, and Undo on
 * the "Removed" toast takes the copy away again.
 *
 *   backupRemovedModule(removed)  → backup ref, or null when nothing needed keeping
 *   dropBackup(ref)                → after Undo
 *   removedFor(space)              → [{ ref, title, type, removedAt, removedBy, where }]
 *   putBack(ref)                   → the module back on the page (its original tab, else Home)
 *
 * Kept per page: the newest 30 in space.removedModules. Vault copies stay
 * until someone deletes them, like any file.
 */

import { makeId } from '../ui/dom.js';
import { getModuleType } from '../modules/registry.js';
import { changeState, getSpace, getTabs, getCurrentUser, HOME_TAB_ID } from './store.js';
import { migrateModule } from '../data/module-migrations.js';

export const BACKUP_FOLDER = 'Removed from the page';
const MAX_ON_PAGE = 30;

/** Module types that hold nothing of their own (they show other things), so nothing needs keeping. */
const VIEW_ONLY = new Set(['upnext', 'dashboard', 'recents', 'recentgroups', 'vaultfile']);
/** Types whose contents are a page of writing: kept as vault notes. */
const AS_NOTE = new Set(['note', 'document']);

/** True when a module holds something beyond what a new one starts with. */
export function hasContents(module) {
  if (!module || VIEW_ONLY.has(module.type)) return false;
  if (module.type === 'events' && !module.data?.ownEvents) return false; // a view of the group's calendars
  const data = module.data;
  if (data == null) return false;
  if (AS_NOTE.has(module.type)) return Boolean(textOf(data.html ?? ''));
  let fresh;
  try { fresh = getModuleType(module.type).createInitialData({ currentUserId: getCurrentUser()?.id }); } catch { fresh = null; }
  return JSON.stringify(stripIds(data)) !== JSON.stringify(stripIds(fresh));
}

const textOf = (html) => String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
/** New modules can start with made-up ids (a starter item…): compare without them. */
const stripIds = (value) => JSON.parse(JSON.stringify(value ?? null, (key, v) => (key === 'id' || key === 'createdAt' || key === 'updatedAt' ? undefined : v)));

/** The page's first vault module, or null. */
function vaultOf(space) {
  return space?.modules.find((m) => m.type === 'vault' && Array.isArray(m.data?.items)) ?? null;
}

/**
 * Keep a copy of a just-removed module (`removed` = what removeModule returned).
 * Returns { where: 'vault', spaceId, vaultId, itemId } | { where: 'page', spaceId, moduleId } | null.
 */
export function backupRemovedModule(removed) {
  if (!removed || !hasContents(removed.module)) return null;
  const { module, spaceId } = removed;
  const me = getCurrentUser();
  const now = Date.now();
  const where = { span: module.span, rows: module.rows, tabId: module.tabId ?? null, moduleId: module.id, title: module.title, type: module.type };
  const space = getSpace(spaceId);
  const vault = module.type === 'vault' ? null : vaultOf(space);
  if (vault) {
    const itemId = makeId('item');
    changeState((state) => {
      const live = state.spaces.find((s) => s.id === spaceId)?.modules.find((m) => m.id === vault.id);
      if (!live) return;
      const items = live.data.items;
      let folder = items.find((i) => i.kind === 'folder' && i.parentId === null && i.name === BACKUP_FOLDER);
      if (!folder) {
        folder = { id: makeId('item'), kind: 'folder', name: BACKUP_FOLDER, parentId: null, createdBy: me?.id ?? null, updatedBy: me?.id ?? null, updatedAt: now };
        items.push(folder);
      }
      const common = { id: itemId, name: module.title, parentId: folder.id, createdBy: me?.id ?? null, updatedBy: me?.id ?? null, updatedAt: now, removed: { ...where, at: now, by: me?.id ?? null } };
      items.push(AS_NOTE.has(module.type)
        ? { ...common, kind: 'note', html: module.data.html ?? '' }
        : { ...common, kind: 'module', moduleType: module.type, data: structuredClone(module.data) });
    }, 'layout');
    return { where: 'vault', spaceId, vaultId: vault.id, itemId };
  }
  changeState((state) => {
    const live = state.spaces.find((s) => s.id === spaceId);
    if (!live) return;
    live.removedModules = [{ module: structuredClone(module), removedAt: now, removedBy: me?.id ?? null }, ...(live.removedModules ?? []).filter((r) => r.module.id !== module.id)].slice(0, MAX_ON_PAGE);
  }, 'layout');
  return { where: 'page', spaceId, moduleId: module.id };
}

/** Take a copy away again (Undo put the module back). */
export function dropBackup(ref) {
  if (!ref) return;
  changeState((state) => {
    const space = state.spaces.find((s) => s.id === ref.spaceId);
    if (!space) return;
    if (ref.where === 'page') space.removedModules = (space.removedModules ?? []).filter((r) => r.module.id !== ref.moduleId);
    else {
      const vault = space.modules.find((m) => m.id === ref.vaultId);
      if (vault) vault.data.items = vault.data.items.filter((i) => i.id !== ref.itemId);
    }
  }, 'layout');
}

/** Everything removed from this page that can be put back, newest first. */
export function removedFor(space) {
  if (!space) return [];
  const onPage = (space.removedModules ?? []).map((r) => ({
    ref: { where: 'page', spaceId: space.id, moduleId: r.module.id },
    title: r.module.title, type: r.module.type, removedAt: r.removedAt, removedBy: r.removedBy, where: 'page', vaultName: null,
  }));
  const inVaults = space.modules.filter((m) => m.type === 'vault').flatMap((vault) => (vault.data?.items ?? [])
    .filter((i) => i.removed && (i.kind === 'module' || i.kind === 'note'))
    .map((i) => ({
      ref: { where: 'vault', spaceId: space.id, vaultId: vault.id, itemId: i.id },
      title: i.name, type: i.removed.type ?? i.moduleType ?? 'note', removedAt: i.removed.at, removedBy: i.removed.by, where: 'vault', vaultName: vault.title,
    })));
  return [...onPage, ...inVaults].sort((a, b) => b.removedAt - a.removedAt);
}

/** Is this vault item a module that came off the page (so it can be put back)? */
export const isRemovedModule = (item) => Boolean(item?.removed && (item.kind === 'module' || item.kind === 'note'));

/**
 * Put a removed module back on its page, with its contents (and whatever was
 * changed in its vault copy meanwhile). Returns the module, or null.
 */
export function putBack(ref) {
  let restored = null;
  changeState((state) => {
    const space = state.spaces.find((s) => s.id === ref.spaceId);
    if (!space) return;
    const tabIds = new Set(getTabs(space).map((t) => t.id));
    if (ref.where === 'page') {
      const entry = (space.removedModules ?? []).find((r) => r.module.id === ref.moduleId);
      if (!entry) return;
      restored = structuredClone(entry.module);
      space.removedModules = space.removedModules.filter((r) => r !== entry);
    } else {
      const vault = space.modules.find((m) => m.id === ref.vaultId);
      const item = vault?.data.items.find((i) => i.id === ref.itemId);
      if (!item?.removed) return;
      const { removed } = item;
      const type = removed.type ?? item.moduleType;
      const data = item.kind === 'note'
        ? { title: '', html: item.html ?? '', updatedAt: Date.now() }
        : structuredClone(item.data);
      restored = { id: space.modules.some((m) => m.id === removed.moduleId) ? makeId('mod') : removed.moduleId, type, title: item.name, span: removed.span, rows: removed.rows, data, ...(removed.tabId ? { tabId: removed.tabId } : {}) };
      vault.data.items = vault.data.items.filter((i) => i.id !== item.id);
      // The folder goes too once it's empty.
      const folder = vault.data.items.find((i) => i.kind === 'folder' && i.name === BACKUP_FOLDER && i.parentId === null);
      if (folder && !vault.data.items.some((i) => i.parentId === folder.id)) vault.data.items = vault.data.items.filter((i) => i !== folder);
    }
    if (!restored) return;
    restored = migrateModule(restored); // a type merged since (Kanban → Tasks…)
    if (restored.tabId && (restored.tabId === HOME_TAB_ID || !tabIds.has(restored.tabId))) delete restored.tabId;
    space.modules.push(restored);
  }, 'layout');
  return restored;
}
