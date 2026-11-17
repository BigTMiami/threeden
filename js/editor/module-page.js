// @ts-check
/**
 * module-page.js — the full-page view of a single module.
 *
 * Shown instead of the homepage when the URL is #module-<id> (see
 * js/router.js). It draws a header with a way back to the homepage, then
 * hands the rest of the page to the module type's `renderFullPage()`.
 *
 *   ← 237 Hart Street        (or "← My homepage")
 *   ☑ To-do
 *   ──────────────────────────────────────────
 *   (drawn by the module type)
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getModule, getSpace, getSpaceOfModule, getCurrentSpace, getCurrentUser, isGuestBrowsing, renameModule } from '../state/store.js';
import { can } from '../state/permissions.js';
import { editInPlace } from '../ui/edit-in-place.js';
import { getModuleType } from '../modules/registry.js';
import { closeModulePage, getReturnSpaceId, previousPlace, backLabel } from '../router.js';
import { createModuleContext } from './module-context.js';

let pageElement = null;
let cleanup = () => {};

export function initModulePage(container) {
  pageElement = container;
}

/** Draw the full page for `moduleId`. */
export function renderModulePage(moduleId) {
  cleanup();
  cleanup = () => {};

  const module = getModule(moduleId);
  const moduleType = module ? getModuleType(module.type) : null;
  const space = getSpaceOfModule(moduleId) ?? getCurrentSpace();
  // Opened from your personal homepage (a linked item)? Then back goes there.
  const returnSpace = getSpace(getReturnSpaceId()) ?? space;
  const backLink = h('button', {
    type: 'button',
    class: 'link-button module-page__back',
    // Back goes wherever you came from (the Feed, a search, another group);
    // only on a fresh visit does it fall back to the module's homepage.
    onClick: () => (previousPlace() !== null ? history.back() : closeModulePage(space.id, module?.tabId)),
  }, icon('arrowLeft', 14), ` ${backLabel(returnSpace.name, (id) => getSpace(id)?.name ?? null)}`);

  if (!module || !moduleType.renderFullPage) {
    replaceChildren(pageElement,
      backLink,
      h('p', { class: 'module-empty' }, 'This module doesn’t exist anymore, or doesn’t have a full-page view yet.'),
    );
    return;
  }

  const body = h('div', { class: 'module-page__body' });

  replaceChildren(pageElement,
    h('header', { class: 'module-page__header' },
      backLink,
      h('div', { class: 'module-page__title-row' },
        h('span', { class: 'module-page__icon' }, icon(moduleType.icon, 22)),
        editInPlace('h1', {
          className: 'module-page__title', label: 'Title',
          canEdit: can(space, getCurrentUser()?.id, 'editHomepage') && !isGuestBrowsing(),
          fields: [{ key: 'title', value: module.title }],
          onSave: ({ title }) => { renameModule(module.id, title); renderModulePage(module.id); },
        })),
      returnSpace !== space ? h('p', { class: 'module-page__space-note' }, `In ${space.name}`) : null,
    ),
    body,
  );

  cleanup = moduleType.renderFullPage(body, createModuleContext(module.id)) || (() => {});
  window.scrollTo(0, 0);
}

/** Tear down the current module page (when going back to the homepage). */
export function clearModulePage() {
  cleanup();
  cleanup = () => {};
  replaceChildren(pageElement);
}
