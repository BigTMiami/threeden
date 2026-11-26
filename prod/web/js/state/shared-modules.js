// @ts-check
/**
 * shared-modules.js — one module shown in several groups: a rec league's
 * calendar on every team's homepage, a coalition's shared vault, one sign-up
 * sheet for three congregations.
 *
 * The module lives in one group (its "home"). Sharing it puts a linked copy
 * on each other group's homepage, which shows and saves the very same data:
 *
 *   in the home group:   { id, type, title, data, sharedWith: [{ spaceId, canEdit, linkId }] }
 *   in each other group: { id: linkId, type, title, span, rows, linkedFrom: { moduleId, spaceId },
 *                          data: an empty copy of the shape (so code that looks through every
 *                          module finds nothing twice); the module itself reads the home's data }
 *
 * canEdit: members of that group can change it (add events, upload files…);
 * otherwise they can only look. People in the home group always can.
 *
 *   sourceOf(module)                the module whose data a module shows (itself, or its home)
 *   sharingOf(moduleId)             { home, source, link, canEdit } for a module id
 *   groupsToShareWith(memberId, sourceId)   groups you can add it to
 *   setSharing(sourceId, targets)   share with exactly these [{ spaceId, canEdit }]
 */

import { changeState, getModule, getSpace, getSpaces, getSpaceOfModule } from './store.js';
import { can } from './permissions.js';
import { makeId } from '../ui/dom.js';

/** The same shape with every list emptied: { events: [] } for a calendar. */
export function emptyLike(value) {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, emptyLike(v)]));
  return value;
}

export function sourceOf(module) {
  if (!module?.linkedFrom) return module;
  return getModule(module.linkedFrom.moduleId);
}

/** For a module id: its home group, the module holding the data, and (for a link) whether you can edit there. */
export function sharingOf(moduleId) {
  const module = getModule(moduleId);
  if (!module?.linkedFrom) return { home: getSpaceOfModule(moduleId), source: module, link: null, canEdit: true };
  const source = getModule(module.linkedFrom.moduleId);
  const share = source?.sharedWith?.find((s) => s.linkId === moduleId) ?? null;
  return {
    home: source ? getSpaceOfModule(source.id) : getSpace(module.linkedFrom.spaceId),
    source: share ? source : null, // unshared (or deleted) at home: nothing to show
    link: module,
    canEdit: Boolean(share?.canEdit),
  };
}

/** Groups you can put the module on: ones where you may edit the homepage, other than its home. */
export function groupsToShareWith(memberId, sourceId) {
  const home = getSpaceOfModule(sourceId);
  return getSpaces().filter((space) => space.kind === 'group' && space.id !== home?.id
    && space.memberIds.includes(memberId) && can(space, memberId, 'editHomepage'));
}

/**
 * Share a module with exactly these groups ([{ spaceId, canEdit }]):
 * adds links to new ones (at the end of their first tab), updates
 * permissions, and takes links away from groups no longer listed.
 */
export function setSharing(sourceId, targets) {
  changeState((state) => {
    const homeSpace = state.spaces.find((s) => s.modules.some((m) => m.id === sourceId));
    const source = homeSpace?.modules.find((m) => m.id === sourceId);
    if (!source) return;
    const before = source.sharedWith ?? [];
    const next = [];
    for (const target of targets) {
      const space = state.spaces.find((s) => s.id === target.spaceId);
      if (!space) continue;
      const existing = before.find((s) => s.spaceId === target.spaceId);
      const linkId = existing?.linkId ?? makeId('mod');
      if (!space.modules.some((m) => m.id === linkId)) {
        space.modules.push({
          id: linkId, type: source.type, title: source.title, span: source.span ?? 12, rows: source.rows,
          tabId: space.tabs?.[0]?.id ?? 'home', data: emptyLike(source.data ?? {}), linkedFrom: { moduleId: source.id, spaceId: homeSpace.id },
        });
      }
      next.push({ spaceId: target.spaceId, canEdit: Boolean(target.canEdit), linkId });
    }
    for (const old of before) {
      if (next.some((s) => s.spaceId === old.spaceId)) continue;
      const space = state.spaces.find((s) => s.id === old.spaceId);
      if (space) space.modules = space.modules.filter((m) => m.id !== old.linkId);
    }
    source.sharedWith = next;
  }, 'layout');
}
