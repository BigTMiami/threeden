// @ts-check
/**
 * vault-actions.js — the changes people can make to a vault: create,
 * upload, rename, move, delete. Shared by the homepage card and the full
 * page, so both behave the same.
 *
 *   const actions = createVaultActions(context, { onChange: redraw });
 *   actions.createItem({ kind: 'folder', name: 'Bills' }, parentId);
 *
 * Every change is saved straight away and then `onChange()` is called so
 * the view can redraw. `saveQuietly` is the exception: it saves without
 * redrawing, for the note editor, where a redraw would interrupt typing.
 */

import { makeId } from '../../ui/dom.js';
import { showToast } from '../../ui/toast.js';
import { idsWithDescendants, readFileAsDataUrl, MAX_STORED_FILE_BYTES } from './vault-data.js';

export function createVaultActions(context, { onChange }) {
  const me = context.currentUser;
  const items = () => context.getData().items;

  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    onChange();
  }

  /** Who changed an item last, and when. */
  const touched = () => ({ updatedBy: me.id, updatedAt: Date.now() });

  /** Add a folder, note, link or file to `parentId` (null = top level). */
  function createItem(fields, parentId) {
    const item = { id: makeId('item'), parentId, createdBy: me.id, ...touched(), ...fields };
    update((data) => data.items.push(item));
    return item;
  }

  /** Add files picked from the device. Big files are listed without their contents. */
  async function uploadFiles(files, parentId) {
    for (const file of files) {
      const isSmallEnough = file.size <= MAX_STORED_FILE_BYTES;
      const dataUrl = isSmallEnough ? await readFileAsDataUrl(file) : null;
      createItem({
        kind: 'file',
        name: file.name,
        file: { mimeType: file.type || 'application/octet-stream', size: file.size, dataUrl },
      }, parentId);
      if (!isSmallEnough) showToast(`"${file.name}" is listed without a preview (over 1 MB).`);
    }
    if (files.length) showToast(`Uploaded ${files.length} ${files.length === 1 ? 'file' : 'files'}.`);
  }

  /** Returns false (and changes nothing) for an empty name. */
  function renameItem(itemId, newName) {
    const name = newName.trim();
    if (!name) return false;
    update((data) => Object.assign(data.items.find((i) => i.id === itemId), { name }, touched()));
    return true;
  }

  /**
   * Move an item into another folder (null = top level). A folder can't
   * go inside itself or one of its own subfolders; returns false then.
   */
  function moveItem(itemId, folderId) {
    if (folderId && idsWithDescendants(items(), itemId).has(folderId)) return false;
    update((data) => Object.assign(data.items.find((i) => i.id === itemId), { parentId: folderId }, touched()));
    return true;
  }

  /** Delete an item (and, for a folder, everything in it), with Undo. */
  function deleteItem(item) {
    const before = structuredClone(context.getData());
    const removedIds = idsWithDescendants(items(), item.id);
    update((data) => { data.items = data.items.filter((i) => !removedIds.has(i.id)); });

    const extra = removedIds.size > 1 ? ` and ${removedIds.size - 1} inside it` : '';
    showToast(`Deleted "${item.name}"${extra}.`, {
      actionLabel: 'Undo',
      onAction: () => { context.saveData(before); onChange(); },
    });
  }

  /** Save changes to one item without redrawing (used while editing a note). */
  function saveQuietly(itemId, changes) {
    const data = structuredClone(context.getData());
    Object.assign(data.items.find((i) => i.id === itemId), changes, touched());
    context.saveData(data);
  }

  /** Save changes to an item and redraw (e.g. an edited photo). */
  function saveItem(itemId, changes) {
    update((data) => Object.assign(data.items.find((i) => i.id === itemId), changes, touched()));
  }

  return { createItem, uploadFiles, renameItem, moveItem, deleteItem, saveQuietly, saveItem };
}
