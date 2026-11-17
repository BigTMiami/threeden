// @ts-check
/**
 * linked-items.js — group items assigned to you, shown on your personal
 * homepage.
 *
 * When something in a group is assigned to you (a task, a kanban card, an
 * event you're attending, a gantt task you're on, a contact on a power map),
 * it also shows up in the matching module on your personal homepage, with
 * a label saying which group it's from:
 *
 *   My tasks
 *   ☐ Call the landlord about the heater      [237 Hart Street]
 *   ☐ Fix the truing stand                    [Saturday Bike Kitchen]
 *   ☐ Return library books                    ← your own task
 *
 * These are *links*, not copies: the item still lives in the group's
 * module, and the personal homepage reads it from there each time it's
 * drawn. Checking a task off on your homepage checks it off in the group,
 * and clicking the label opens the item in the group's module.
 *
 * Which module types take part is up to each type: it lists its items and
 * says who they're assigned to with an `assignments` field (see
 * registry.js). Only the *first* module of that type on your homepage
 * shows linked items, so two to-do lists don't show the same tasks twice.
 *
 * A link looks like:
 *   {
 *     item,          ← a copy of the item (change it through updateLinkedItem)
 *     itemId,
 *     moduleId, moduleTitle,   ← the group module it lives in
 *     spaceId, spaceName,      ← the group
 *     status,                  ← optional words from the type's `describe`,
 *                                e.g. a kanban card's column: "In the stand"
 *   }
 */

import { getSpaces, getSpaceOfModule, getModule, updateModuleData } from '../state/store.js';
import { getModuleType } from '../modules/registry.js';

/**
 * Does this module show linked items? Only the first module of each
 * participating type, on a personal homepage.
 */
export function receivesLinkedItems(moduleId) {
  const module = getModule(moduleId);
  const space = getSpaceOfModule(moduleId);
  if (!module || space?.kind !== 'personal') return false;
  if (!getModuleType(module.type).assignments) return false;
  return space.modules.find((m) => m.type === module.type)?.id === module.id;
}

/** Every group item of this module's type assigned to the homepage's owner. */
export function getLinkedItems(moduleId) {
  if (!receivesLinkedItems(moduleId)) return [];
  const module = getModule(moduleId);
  // My calendar can also show every event in your groups ("One calendar for all my groups").
  return linksFor(module.type, getSpaceOfModule(moduleId).memberIds[0], { allInMyGroups: module.type === 'calendar' && Boolean(module.data?.allGroups) });
}

/**
 * Everything on your calendars apart from one space's: your own homepage
 * calendar, plus events and entries from other groups you're going to,
 * invited to or involved in. A group's full-page calendar can lay these
 * over its own ("Show my other calendars"), so you can spot clashes.
 * They come back as links, so opening or editing one goes to where it lives.
 */
export function otherCalendarLinks(memberId, exceptSpaceId) {
  const personal = getSpaces().find((s) => s.kind === 'personal' && s.memberIds[0] === memberId);
  const ownCalendar = personal?.modules.find((m) => m.type === 'calendar');
  const own = (ownCalendar?.data.events ?? []).map((item) => ({
    item: structuredClone(item), itemId: item.id, moduleId: ownCalendar.id, moduleTitle: ownCalendar.title,
    spaceId: personal.id, spaceName: 'My calendar', status: '',
  }));
  return [...own, ...linksFor('calendar', memberId)].filter((link) => link.spaceId !== exceptSpaceId);
}

/** Items of a module type, in spaces other than `ownerId`'s homepage, assigned to them. */
function linksFor(moduleType, ownerId, { allInMyGroups = false } = {}) {
  const { assignments } = getModuleType(moduleType);
  // Some types share items: Calendar and Upcoming events both show events.
  const sourceTypes = assignments.sourceTypes ?? [moduleType];
  const links = [];

  for (const group of getSpaces()) {
    // Most items only come from your own groups; some types (events you're
    // invited to) can come from groups you're not in.
    // For types like events, blogs and other people's homepages count too: a gig on a
    // friend's blog you're going to, or an event someone made in a chat and invited you to.
    const isMine = group.memberIds.includes(ownerId);
    if (group.kind === 'personal' && isMine) continue; // your own homepage: not "linked"
    if (group.kind !== 'group' && !assignments.includeOutsideGroups) continue;
    if (!isMine && !assignments.includeOutsideGroups) continue;

    for (const source of group.modules) {
      if (!sourceTypes.includes(source.type)) continue;

      for (const item of getModuleType(source.type).assignments.items(source.data)) {
        const everything = allInMyGroups && isMine && group.kind === 'group';
        if (!everything && !assignments.isAssignedTo(item, ownerId)) continue;
        links.push({
          item: structuredClone(item),
          itemId: item.id,
          moduleId: source.id,
          moduleTitle: source.title,
          spaceId: group.id,
          spaceName: group.name,
          status: assignments.describe?.(item, source.data) ?? '',
        });
      }
    }
  }
  return links;
}

/**
 * Change a linked item where it lives, in the group's module.
 * `changeFn(item)` edits the item in place, e.g. `(task) => { task.done = true; }`.
 */
export function updateLinkedItem(link, changeFn) {
  const source = getModule(link.moduleId);
  if (!source) return;

  const data = structuredClone(source.data);
  const item = getModuleType(source.type).assignments.items(data).find((i) => i.id === link.itemId);
  if (!item) return;

  changeFn(item);
  updateModuleData(link.moduleId, data);
}
