// @ts-check
/**
 * registry.js — the list of every module type 3den knows about.
 *
 * ─── The module contract ────────────────────────────────────────────────────
 *
 * Each module type is a plain object exported from its own file:
 *
 *   export const todoModule = {
 *     type: 'todo',                  // unique id, saved in the state
 *     label: 'To-do',                // shown in the library and as default title
 *     description: 'Tasks …',        // one line, shown in the library
 *     icon: 'todo',                  // a name from js/ui/icons.js
 *     defaultSpan: 5,                // starting width, in grid columns (3–12)
 *     defaultRows: 12,               // starting height, in grid rows (5–40)
 *     available: true,               // false = listed as "Soon", can't be added
 *     iconFor: (module) => 'note',   // optional: a header icon for this module instead of `icon`
 *     hiddenFromLibrary: true,       // optional: not in the module list (e.g. Vault file,
 *                                    // which is added from the library's vault list)
 *     spaceKinds: ['group', 'personal'],  // optional: where it can be added
 *     isFeed: true,                  // optional: a blog feed, listed first under 'Feeds'
 *                                    // (default: groups and personal homepages; 'blog' for blogs)
 *     createInitialData(state) {},   // returns the data for a brand-new module
 *     render(container, context) {}, // draws the module's body (see below)
 *     renderFullPage(container, context) {}, // optional: full-page view
 *     assignments: {                 // optional: items that can be assigned to people
 *       items: (data) => data.tasks,
 *       isAssignedTo: (task, memberId) => task.assigneeIds.includes(memberId),
 *       describe: (task, data) => 'Doing',   // optional: a status to show
 *       includeOutsideGroups: false,         // optional: also look in groups you're not in
 *       sourceTypes: ['calendar', 'events'], // optional: module types to collect from
 *                                            // (default: just this type)
 *     },
 *   };
 *
 * `render` receives an empty element to fill and a `context` object:
 *
 *   context.moduleId, context.spaceId, context.spaceKind ('group' | 'personal')
 *   context.getData()         → this module's current data
 *   context.saveData(data)    → save new data (does not re-render the grid)
 *   context.members           → everyone in this space (just you, on a personal homepage)
 *   context.currentUser       → the person using the app
 *   context.getMember(id)     → look up one member
 *   context.can(permission)   → may the current user do this here? (js/state/permissions.js)
 *   context.role              → their role here: 'owner' | 'admin' | 'member'
 *   context.isVisitor         → true on someone else's blog, or a group's public tab seen
 *                               by a non-member: show, don't edit (saveData is refused)
 *   context.openFullPage(id?) → open this module's full page (if it has one);
 *                               pass an item id to open it with that item selected
 *   context.takeFocusRequest()→ (full page) that item id, or null; read it once
 *
 * On a personal homepage, modules whose type has `assignments` also get the
 * group items assigned to you (see js/editor/linked-items.js):
 *
 *   context.getLinkedItems()           → [{ item, itemId, moduleId, spaceName, … }]
 *   context.updateLinkedItem(link, fn) → change the item in its group
 *   context.openLinkedItem(link)       → open it in the group's module
 *
 * `render` may return a cleanup function, called when the module is removed
 * from the page or re-rendered (use it to clear timers or listeners).
 *
 * `renderFullPage` is optional. If a module type has it, its card gets an
 * expand button (↗) that shows the module on its own page (#module-<id>). It
 * receives the same `context` and follows the same rules as `render`.
 * Both views share the same data, so changes in one show up in the other.
 *
 * ─── Adding a new module type ───────────────────────────────────────────────
 *
 *   1. Create js/modules/your-module.js following the contract above.
 *      (A bigger module can get its own folder, like js/modules/vault/.)
 *   2. Import it below and add it to MODULE_TYPES.
 *   3. Add its styles to css/modules.css.
 */

import { announcementsModule } from './announcements/announcements-module.js';
import { todoModule } from './todo/todo-module.js';
import { noteModule } from './note.js';
import { calendarModule } from './calendar/calendar-module.js';
import { forumModule } from './forum/forum-module.js';
import { vaultModule } from './vault/vault-module.js';
import { ganttModule } from './gantt/gantt-module.js';
import { relationshipModule } from './relationship/relationship-module.js';
import { chatModule } from './chat/chat-module.js';
import { groceryModule } from './grocery/grocery-module.js';
import { budgetModule } from './budget/budget-module.js';
import { sheetModule } from './sheet/sheet-module.js';
import { shiftsModule } from './shifts/shifts-module.js';
import { eventsModule } from './events/events-module.js';
import { submissionsModule } from './submissions/submissions-module.js';
import { aboutModule } from './blog/about-module.js';
import { galleryModule } from './blog/gallery-module.js';
import { carouselModule } from './blog/carousel-module.js';
import { articlesModule } from './articles/articles-module.js';
import { photoFeedModule, textFeedModule, generalFeedModule } from './blog-feeds/feed-modules.js';
import { dashboardModule } from './dashboard/dashboard-module.js';
import { recentGroupsModule, recentsModule } from './recents/recents-modules.js';
import { vaultFileModule } from './vaultfile/vaultfile-module.js';
import { comingSoonModules } from './coming-soon.js';
import { upNextModule } from './upnext/upnext-module.js';
import { surveyModule } from './survey/survey-module.js';
import { presentationModule } from './presentation/presentation-module.js';

/** Every module type, in the order the library shows them. */
export const MODULE_TYPES = [
  dashboardModule, // personal homepages only
  recentGroupsModule, // personal homepages only
  recentsModule, // personal homepages only
  upNextModule, // groups: every group's first module
  announcementsModule,
  calendarModule,
  eventsModule,
  chatModule,
  todoModule,
  noteModule,
  sheetModule,
  forumModule,
  vaultModule,
  submissionsModule,
  groceryModule,
  budgetModule,
  shiftsModule,
  ganttModule,
  relationshipModule,
  surveyModule,
  presentationModule,
  articlesModule, // blogs and groups
  // Blog modules (spaceKinds: ['blog']). The feeds come first; the
  // library lists them under "Feeds" (isFeed: true).
  generalFeedModule,
  photoFeedModule,
  textFeedModule,
  aboutModule,
  galleryModule,
  carouselModule,
  // Shown from a vault (added from the library's "From your vaults" list)
  vaultFileModule,
  ...comingSoonModules,
];

const typesById = new Map(MODULE_TYPES.map((moduleType) => [moduleType.type, moduleType]));

const DEFAULT_SPACE_KINDS = ['group', 'personal'];

/** The module types that can be added to this kind of space ('group' | 'personal' | 'blog'). */
export function moduleTypesFor(spaceKind) {
  return MODULE_TYPES.filter((moduleType) => (moduleType.spaceKinds ?? DEFAULT_SPACE_KINDS).includes(spaceKind));
}

/** Look up a module type by its id. Throws if it doesn't exist. */
export function getModuleType(type) {
  const moduleType = typesById.get(type);
  if (!moduleType) throw new Error(`Unknown module type: "${type}"`);
  return moduleType;
}
