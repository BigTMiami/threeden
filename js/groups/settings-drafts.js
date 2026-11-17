// @ts-check
/**
 * settings-drafts.js — unsaved changes to a space's settings, and preview.
 *
 * Changes made in settings (name and description, appearance, roles,
 * permissions) are kept here as a *draft* until you press Save. Nothing
 * changes for anyone else until then.
 *
 *   setDraft('juniper', 'appearance', look)   ← the settings page, as you edit
 *   getDraft('juniper')                       → { details, appearance, permissions, roles, removed }
 *   saveDraft('juniper')                      ← apply everything, then forget the draft
 *   discardDraft('juniper')
 *
 * "Preview" shows the space's homepage as it would look with the draft:
 *
 *   startPreview('juniper')                   ← then go to the homepage
 *   effectiveSpace(space)                  → the space with the draft laid over it,
 *                                            while previewing it (otherwise the space as saved)
 *
 * Drafts live only in memory: reloading the page throws them away.
 */

import { getSpace } from '../state/store.js';
import {
  updateGroupDetails, renameSpace, updateAppearance, setPermission, setRole, removeMember,
} from '../state/groups.js';

const drafts = new Map(); // spaceId → { details?, appearance?, permissions?, roles?, removed? }
let previewingSpaceId = null;

/** Human names for the parts of a draft, for "Unsaved changes: …". */
export const DRAFT_PART_LABELS = {
  details: 'name, description, and access',
  appearance: 'appearance',
  permissions: 'permissions',
  roles: 'roles',
  removed: 'members to remove',
};

export function getDraft(spaceId) {
  return drafts.get(spaceId) ?? {};
}

export function hasDraft(spaceId) {
  return Object.keys(getDraft(spaceId)).length > 0;
}

/** Set one part of a draft. Pass null to drop that part. */
export function setDraft(spaceId, part, value) {
  const draft = { ...getDraft(spaceId) };
  if (value === null || value === undefined) delete draft[part];
  else draft[part] = value;
  if (Object.keys(draft).length) drafts.set(spaceId, draft);
  else drafts.delete(spaceId);
}

export function discardDraft(spaceId) {
  drafts.delete(spaceId);
  if (previewingSpaceId === spaceId) previewingSpaceId = null;
}

/** Apply every part of the draft, then forget it. */
export function saveDraft(spaceId) {
  const space = getSpace(spaceId);
  const draft = getDraft(spaceId);
  if (!space) return;

  if (draft.details) {
    if (space.kind === 'personal') renameSpace(spaceId, draft.details.name);
    else if (space.kind === 'blog') updateGroupDetails(spaceId, { name: draft.details.name || space.name, description: draft.details.description });
    else updateGroupDetails(spaceId, draft.details);
  }
  if (draft.appearance) updateAppearance(spaceId, draft.appearance);
  for (const [permissionId, role] of Object.entries(draft.permissions ?? {})) setPermission(spaceId, permissionId, role);
  for (const [memberId, role] of Object.entries(draft.roles ?? {})) setRole(spaceId, memberId, role);
  for (const memberId of draft.removed ?? []) removeMember(spaceId, memberId);

  discardDraft(spaceId);
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export function startPreview(spaceId) {
  previewingSpaceId = spaceId;
}

export function stopPreview() {
  previewingSpaceId = null;
}

export function isPreviewing(spaceId) {
  return previewingSpaceId !== null && previewingSpaceId === spaceId;
}

/** The space as it would be with its draft, while previewing it; otherwise as saved. */
export function effectiveSpace(space) {
  if (!space || !isPreviewing(space.id)) return space;
  const draft = getDraft(space.id);
  return {
    ...space,
    ...(draft.details ?? {}),
    appearance: draft.appearance ?? space.appearance,
  };
}
