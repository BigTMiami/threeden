// @ts-check
/**
 * vault-data.js — helpers for reading and changing the vault's items.
 *
 * The vault stores a flat list of items. Folders don't contain their
 * children directly; instead every item points at its folder through
 * `parentId` (null = the top level). Flat lists are easy to save and update.
 *
 * Item shape:
 *   {
 *     id, name, kind,          // kind: 'folder' | 'note' | 'link' | 'file' | 'module'
 *     parentId,                // folder id, or null for the top level
 *     createdBy, updatedBy,    // member ids
 *     updatedAt,               // ms timestamp
 *
 *     html,                    // notes only: sanitized rich text
 *     url,                     // links only
 *     moduleType, data,        // module files only: e.g. 'todo' and its tasks
 *                              // (see vault-module-files.js)
 *     file: {                  // uploaded files only
 *       mimeType, size,        // size in bytes
 *       dataUrl                // the file itself, or null if it was too big to store
 *     }
 *   }
 */

import { getModuleType } from '../registry.js';

/** A module file's module type, or null if it's unknown. */
function moduleTypeOf(item) {
  try { return getModuleType(item.moduleType); } catch { return null; }
}

/** How each kind of item is labeled and drawn. */
export const ITEM_KINDS = {
  folder: { label: 'Folder', icon: 'folder' },
  note: { label: 'Document', icon: 'note' }, // called a note in the code (kind 'note'); people see Document (Nov 18)
  link: { label: 'Link', icon: 'link' },
  file: { label: 'File', icon: 'file' },
  module: { label: 'Module file', icon: 'file' }, // the real icon and label come from its module type
};

/**
 * Uploaded files are kept in the browser's storage, which only holds a few
 * megabytes in total. Files bigger than this are listed by name and size
 * only. A real backend would store files properly.
 */
export const MAX_STORED_FILE_BYTES = 1024 * 1024; // 1 MB

/** The icon for an item. Images get their own icon. */
export function iconForItem(item) {
  if (item.kind === 'file' && item.file?.mimeType.startsWith('image/')) return 'image';
  if (item.kind === 'module') return moduleTypeOf(item)?.icon ?? 'file';
  if (item.kind === 'note' && item.article) return 'newspaper';
  return ITEM_KINDS[item.kind].icon;
}

/** What kind of item it is, in words: "Document", "Article", "Spreadsheet"… */
export function labelForItem(item) {
  if (item.kind === 'module') return moduleTypeOf(item)?.label ?? ITEM_KINDS.module.label;
  if (item.kind === 'note' && item.article) return 'Article';
  return ITEM_KINDS[item.kind].label;
}

/** Items directly inside a folder: folders first, then A–Z. */
export function childrenOf(items, folderId) {
  return items
    .filter((item) => item.parentId === folderId)
    .sort((a, b) => {
      if ((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** The chain of folders from the top level down to `folderId` (for breadcrumbs). */
export function pathTo(items, folderId) {
  const path = [];
  let current = items.find((item) => item.id === folderId);
  while (current) {
    path.unshift(current);
    current = items.find((item) => item.id === current.parentId);
  }
  return path;
}

/** The ids of an item and everything inside it (when deleting a folder). */
export function idsWithDescendants(items, itemId) {
  const ids = new Set([itemId]);
  let added = true;
  while (added) {
    added = false;
    for (const item of items) {
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        added = true;
      }
    }
  }
  return ids;
}

/** A short description shown under an item's name. */
export function describeItem(item, items) {
  if (item.kind === 'folder') {
    const count = items.filter((other) => other.parentId === item.id).length;
    return `Folder · ${count} ${count === 1 ? 'item' : 'items'}`;
  }
  if (item.kind === 'note' || item.kind === 'module') return labelForItem(item);
  if (item.kind === 'link') return `Link · ${hostOf(item.url)}`;
  return `${fileTypeLabel(item.file.mimeType, item.name)} · ${formatBytes(item.file.size)}`;
}

/** 'https://www.example.org/page' → 'example.org' */
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Make sure a link starts with http:// or https://. */
export function normalizeUrl(text) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(mimeType, name) {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('text/')) return 'Text';
  const extension = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
  return extension || 'File';
}

/** Read a File from an <input type="file"> as a data: URL. */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Decode the text inside a base64 data: URL (for previewing text files). */
export function textFromDataUrl(dataUrl) {
  const base64 = dataUrl.split(',')[1] ?? '';
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ─── Sorting, searching and folder lists (used by the full page) ────────────

export const SORT_OPTIONS = [
  { id: 'name', label: 'Name' },
  { id: 'updated', label: 'Last changed' },
  { id: 'kind', label: 'Type' },
];

/** Folders always come first; then by name, newest change, or type. */
export function sortItems(items, sortId) {
  return [...items].sort((a, b) => {
    if ((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1;
    if (sortId === 'updated') return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    if (sortId === 'kind') return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}

/** Items anywhere in the vault whose name (or note text, or link) matches. */
export function searchItems(items, query) {
  const text = query.trim().toLowerCase();
  if (!text) return [];
  return items.filter((item) => {
    const noteText = item.kind === 'note' ? (item.html ?? '').replace(/<[^>]+>/g, ' ') : '';
    return `${item.name} ${item.url ?? ''} ${noteText}`.toLowerCase().includes(text);
  });
}

/** "House documents › Leases": where an item lives, for search results. */
export function locationLabel(items, item, topLevelName) {
  const path = pathTo(items, item.parentId).map((folder) => folder.name);
  return path.length ? path.join(' › ') : topLevelName;
}

/**
 * Every folder as a flat list in tree order, with its depth, for the
 * sidebar tree and the "Move to" menu:
 *   [{ folder, depth: 0 }, { folder, depth: 1 }, …]
 * Folders in `excludeIds` (and everything inside them) are left out.
 */
export function folderTree(items, excludeIds = new Set()) {
  const rows = [];
  const walk = (parentId, depth) => {
    for (const folder of childrenOf(items, parentId)) {
      if (folder.kind !== 'folder' || excludeIds.has(folder.id)) continue;
      rows.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}
