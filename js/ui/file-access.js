// @ts-check
/**
 * file-access.js — what people can do with a vault file you share in a post
 * or show on a page: look at it, comment on it, or edit it.
 *
 *   Can view      a copy, as it was when shared (the default; nothing changes for them)
 *   Can comment   the file as it is now, live, with comments under it
 *   Can edit      the file as it is now; anyone who sees it can change it
 *                 (documents and module files like a spreadsheet; other files
 *                 can't be edited, so they get comments)
 *
 * Comments are kept on the vault item (item.comments) so they follow the file
 * wherever it's shared, and whoever added it is told about new ones.
 *
 *   accessPicker(value, onChange)          the "Can view ▾" select
 *   liveItem(from)                          { vault, item } for a { vaultModuleId, itemId }, or null
 *   effectiveAccess(item, access)           'edit' only for things that can be edited
 *   renderFileComments({ vaultModuleId, itemId, canComment })
 *   documentAccess(vaultModuleId, item, me)  what someone may do in the vault itself:
 *                                           'edit' | 'comment' | 'view' | 'none' (item.memberAccess in groups;
 *                                           set from the document's Sharing button, js/ui/document-sharing.js)
 */

import { h, replaceChildren, makeId } from './dom.js';
import { icon } from './icons.js';
import { avatar } from './avatar.js';
import { getModule, getMember, getCurrentUser, updateModuleData, getSpaceOfModule, getState } from '../state/store.js';
import { notify } from '../state/notifications.js';
import { can } from '../state/permissions.js';
import { timeAgo } from '../utils/dates.js';

export const ACCESS_LEVELS = [
  { id: 'view', label: 'Can view', hint: 'A copy, as it is now' },
  { id: 'comment', label: 'Can comment', hint: 'The live file, with comments' },
  { id: 'edit', label: 'Can edit', hint: 'The live file; anyone who sees it can change it' },
];

/** What `me` may do with a document in a vault (before any share's own access). */
export function documentAccess(vaultModuleId, item, me) {
  const space = getSpaceOfModule(vaultModuleId);
  if (!space || !me || !item) return 'none';
  if (space.kind !== 'group') return space.memberIds[0] === me.id ? 'edit' : sharedAccessFor(item, me) ?? 'none';
  if (!space.memberIds.includes(me.id)) return sharedAccessFor(item, me) ?? 'none';
  if (item.createdBy === me.id || can(space, me.id, 'moderate')) return 'edit';
  return item.memberAccess ?? 'edit';
}

// ─── Shared with people and groups (item.sharedWith, Nov 17) ────────────────
//
//   item.sharedWith = [{ kind: 'member' | 'space', id, access: 'view' | 'comment' | 'edit', by, at }]
//
// Sharing a vault file or folder with someone (or a group) puts it in their
// vault under "Shared with you" (a group's: "Shared with this group"), live
// from the original, with that access. A shared folder shares what's in it.

const RANK = { view: 1, comment: 2, edit: 3 };

/** The best access `me` has through item.sharedWith (directly or through a group), or null. */
export function sharedAccessFor(item, me) {
  if (!item || !me) return null;
  let best = null;
  for (const entry of item.sharedWith ?? []) {
    const reaches = entry.kind === 'member' ? entry.id === me.id : getState().spaces.find((x) => x.id === entry.id)?.memberIds.includes(me.id);
    if (reaches && (!best || RANK[entry.access] > RANK[best])) best = entry.access;
  }
  return best;
}

/** Files shared with this person (`{ memberId }`) or this group (`{ spaceId }`): [{ vault, item, entry }]. */
export function sharedWith({ memberId = null, spaceId = null }) {
  const found = [];
  for (const space of getState().spaces) {
    for (const vault of space.modules ?? []) {
      if (vault.type !== 'vault') continue;
      for (const item of vault.data?.items ?? []) {
        const entry = (item.sharedWith ?? []).find((e) => (memberId && e.kind === 'member' && e.id === memberId) || (spaceId && e.kind === 'space' && e.id === spaceId));
        if (entry && !item.removed) found.push({ vault, item, entry });
      }
    }
  }
  return found.sort((a, b) => (b.entry.at ?? 0) - (a.entry.at ?? 0));
}

export const accessLabel = (id) => (ACCESS_LEVELS.find((a) => a.id === id) ?? ACCESS_LEVELS[0]).label;

/** The select that sets who can do what. */
export function accessPicker(value, onChange, { label = 'What people who see it can do' } = {}) {
  return h('select', {
    class: 'input input--compact file-access__picker',
    'aria-label': label,
    title: label,
    onChange: (event) => onChange(event.target.value),
  }, ACCESS_LEVELS.map((a) => h('option', { value: a.id, selected: a.id === (value ?? 'view'), title: a.hint }, a.label)));
}

/** The vault item a share points at, as it is now. */
export function liveItem(from) {
  const vault = from?.vaultModuleId ? getModule(from.vaultModuleId) : null;
  const item = vault?.data?.items?.find((i) => i.id === from.itemId);
  return item ? { vault, item } : null;
}

/** Editing works for documents and module files; anything else falls back to comments. */
export function effectiveAccess(item, access) {
  if (access === 'edit' && !(item.kind === 'note' || item.kind === 'module')) return 'comment';
  return access ?? 'view';
}

/** A one-line note of what viewers may do, for the person looking. */
export function accessNote(access) {
  if (access === 'edit') return h('p', { class: 'file-access__note' }, icon('pencil', 12), ' You can edit this. Changes save to the original.');
  if (access === 'comment') return h('p', { class: 'file-access__note' }, icon('chat', 12), ' You can comment on this.');
  return null;
}

/** Comments under a shared file: the list, and a box to add one. */
export function renderFileComments({ vaultModuleId, itemId, canComment }) {
  const root = h('div', { class: 'file-comments' });
  const me = getCurrentUser();
  function draw() {
    const item = getModule(vaultModuleId)?.data.items.find((i) => i.id === itemId);
    const comments = item?.comments ?? [];
    const input = h('textarea', { class: 'input file-comments__input', rows: '1', placeholder: 'Add a comment', 'aria-label': `Comment on ${item?.name ?? 'the file'}` });
    replaceChildren(root,
      comments.length ? h('ul', { class: 'file-comments__list' }, comments.map((c) => h('li', { class: 'file-comments__item' },
        avatar(getMember(c.authorId), 22),
        h('div', {}, h('strong', {}, getMember(c.authorId)?.name ?? 'Someone'), h('span', { class: 'file-comments__when' }, ` · ${timeAgo(c.at)}`), h('p', { class: 'file-comments__text' }, c.text))))) : null,
      canComment && me ? h('form', {
        class: 'file-comments__form',
        onSubmit: (event) => {
          event.preventDefault();
          const text = input.value.trim();
          if (!text) return;
          const vault = getModule(vaultModuleId);
          if (!vault) return;
          const data = structuredClone(vault.data);
          const saved = data.items.find((i) => i.id === itemId);
          if (!saved) return;
          saved.comments = [...(saved.comments ?? []), { id: makeId('fc'), authorId: me.id, text, at: Date.now() }];
          updateModuleData(vaultModuleId, data);
          notify({
            recipientIds: [saved.createdBy].filter(Boolean),
            actorId: me.id,
            kind: 'comment',
            text: `${me.name} commented on “${saved.name}”: ${text.slice(0, 80)}`,
            spaceId: getSpaceOfModule(vaultModuleId)?.id ?? null,
            moduleId: vaultModuleId,
            itemId,
          });
          draw();
        },
      }, input, h('button', { type: 'submit', class: 'button button--small' }, 'Comment')) : null);
  }
  draw();
  return root;
}
