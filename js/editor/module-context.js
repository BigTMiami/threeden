// @ts-check
/**
 * module-context.js — the `context` object handed to module types.
 *
 * Both the homepage card (`render`) and the full-page view
 * (`renderFullPage`) get the same context, so they read and write the
 * same data. See js/modules/registry.js for what each field does.
 */

import {
  getCurrentUser, memberIn, getModule, getSpaceOfModule, getSpaceMembers, updateModuleData,
} from '../state/store.js';
import { openModulePage } from '../router.js';
import { can, roleOf } from '../state/permissions.js';
import { getLinkedItems, updateLinkedItem } from './linked-items.js';
import { showToast } from '../ui/toast.js';
import { sharingOf } from '../state/shared-modules.js';

/**
 * When a card opens its full page "at" one item (a kanban card, a gantt
 * task…), the item's id waits here until the full page picks it up.
 * Keyed by module id.
 */
const focusRequests = new Map();

/** Ask a module's full page to open at one item (used from outside the module, e.g. an event page). */
export function requestModuleFocus(moduleId, itemId) {
  focusRequests.set(moduleId, itemId);
}

export function createModuleContext(moduleId) {
  const space = getSpaceOfModule(moduleId);
  // A module shared from another group (js/state/shared-modules.js) shows and
  // saves its home module's data; editing there depends on how it was shared.
  const sharing = sharingOf(moduleId);
  const dataId = sharing.source?.id ?? moduleId;
  // Someone else's blog, or a group's public tab seen by a non-member, or a
  // view-only shared module.
  const isVisitor = !space?.memberIds.includes(getCurrentUser()?.id) || (sharing.link && !sharing.canEdit);
  return {
    moduleId,
    spaceId: space?.id ?? null,
    spaceKind: space?.kind ?? null, // 'group' | 'personal'
    getData: () => getModule(dataId)?.data,
    // Visitors can look but not change things. (RSVPs, likes and poll votes
    // are saved elsewhere, so visitors can still do those where allowed.)
    saveData: (data) => {
      if (isVisitor) { showToast(sharing.link ? `This is shared from ${sharing.home?.name ?? 'another group'}, to look at only.` : 'Only members can change this.'); return; }
      updateModuleData(dataId, data);
    },
    // Shared from another group: { home, canEdit }; null for an ordinary module.
    sharedFrom: sharing.link ? { home: sharing.home, canEdit: sharing.canEdit, available: Boolean(sharing.source) } : null,
    // Only the people in this module's space: in a personal homepage, just you.
    members: getSpaceMembers(space),
    currentUser: getCurrentUser(),
    // A member by the name they go by here (their alias in a group that allows them).
    getMember: (memberId) => memberIn(space, memberId),
    // What the current user may do here, e.g. context.can('postAnnouncements').
    // See js/state/permissions.js. Always true on your own homepage.
    can: (permissionId) => can(space, getCurrentUser()?.id, permissionId),
    role: roleOf(space, getCurrentUser()?.id),
    // Looking at someone else's blog, or a group's public tab from outside:
    // modules show their content but no editing.
    isVisitor,
    // Show this module full-page (only meaningful for types with renderFullPage).
    // Pass an item id to have the full page open with that item selected.
    openFullPage: (itemId) => {
      if (itemId) focusRequests.set(moduleId, itemId);
      else focusRequests.delete(moduleId);
      openModulePage(moduleId);
    },
    // In a full page: the item the card asked to show, or null. Read once.
    takeFocusRequest: () => {
      const itemId = focusRequests.get(moduleId) ?? null;
      focusRequests.delete(moduleId);
      return itemId;
    },

    // ─── Linked items (personal homepage only; see linked-items.js) ───
    // Group items assigned to you, e.g. tasks for "My tasks". Empty elsewhere.
    getLinkedItems: () => getLinkedItems(moduleId),
    // Change a linked item in its group: updateLinkedItem(link, (item) => { … }).
    updateLinkedItem,
    // Open a linked item in its group's module; "back" returns here.
    openLinkedItem: (link) => {
      focusRequests.set(link.moduleId, link.itemId);
      openModulePage(link.moduleId, { returnTo: space.id });
    },
  };
}
