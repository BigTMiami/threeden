// @ts-check
/**
 * layout-tab.js — Settings → Layout: what's on the page, two ways.
 *
 *   [ Templates | Modules ]
 *
 *   Templates   ready-made pages for different kinds of people (a student,
 *               a musician, a freelancer…; for blogs a photographer, a
 *               writer…; for groups the same templates as Create a group).
 *               Each shows its modules; "Add to my page" puts them after
 *               what's there, "Replace my page" swaps everything (Undo).
 *   Modules     every module this page can have, with what it's for, to
 *               add one at a time. "Arrange on the page" opens edit mode.
 *
 * Templates live in js/data/page-templates.js (and GROUP_TEMPLATES in
 * js/data/starter-layouts.js). Only people who can edit the homepage can
 * change it; others see the tab, but the buttons are off.
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { changeState, getState, getSpace, setEditMode, getTabs } from '../state/store.js';
import { can } from '../state/permissions.js';
import { getModuleType, moduleTypesFor } from '../modules/registry.js';
import { inListOrder, offeredOn } from '../modules/module-lists.js';
import { PERSONAL_TEMPLATES, BLOG_TEMPLATES } from '../data/page-templates.js';
import { GROUP_TEMPLATES } from '../data/starter-layouts.js';
import { goTo, spaceHref } from '../router.js';
import { makeId } from '../ui/dom.js';
import { section, lockedNote } from './settings-page.js';

/** Which half of the tab is showing (kept while you stay on the page). */
let showing = 'templates';

const templatesFor = (space) => ({ personal: PERSONAL_TEMPLATES, blog: BLOG_TEMPLATES }[space.kind]
  ?? GROUP_TEMPLATES.filter((t) => !t.blank && !t.hidden).map((t) => ({ ...t, who: t.description })));

export function renderLayoutTab(space, me, redraw) {
  const canEdit = space.kind !== 'group' || can(space, me.id, 'editHomepage');
  const choose = (which) => { showing = which; redraw(); };

  return [
    h('div', { class: 'layout-switch', role: 'tablist', 'aria-label': 'Change the page with' },
      h('button', { type: 'button', role: 'tab', class: 'layout-switch__option', 'aria-selected': String(showing === 'templates'), onClick: () => choose('templates') },
        icon('dashboard', 16), ' Templates'),
      h('button', { type: 'button', role: 'tab', class: 'layout-switch__option', 'aria-selected': String(showing === 'modules'), onClick: () => choose('modules') },
        icon('plus', 16), ' Modules')),
    showing === 'templates' ? renderTemplates(space, canEdit) : renderModules(space, canEdit),
    canEdit ? null : lockedNote(space, 'editHomepage'),
  ];
}

// ─── Templates ───────────────────────────────────────────────────────────────

function renderTemplates(space, canEdit) {
  const intro = {
    personal: 'Start from a page made for people like you. You can change anything afterwards.',
    blog: 'Start from a blog made for what you share.',
  }[space.kind] ?? 'Start from a page made for groups like this one.';

  return section('Templates', intro,
    h('ul', { class: 'template-gallery' }, templatesFor(space).map((template) => {
      const preview = template.modules();
      return h('li', { class: 'template-card' },
        h('h3', { class: 'template-card__name' }, template.label),
        h('p', { class: 'template-card__who' }, template.who),
        h('ul', { class: 'template-card__modules', 'aria-label': 'What’s on it' }, preview.map((m) => h('li', {},
          icon(getModuleType(m.type).icon, 13), ` ${m.title}`))),
        h('div', { class: 'template-card__actions' },
          h('button', { type: 'button', class: 'button button--primary button--small', disabled: !canEdit, onClick: () => useTemplate(space, template, 'add') }, 'Add to my page'),
          h('button', { type: 'button', class: 'link-button', disabled: !canEdit, onClick: () => useTemplate(space, template, 'replace') }, 'Replace my page')));
    })),
    h('p', { class: 'settings-field__hint' }, 'Replace my page takes off the modules there now, with what’s in them. You can undo it right after.'));
}

/** Put a template's modules on the page: after what's there, or instead of it. */
function useTemplate(space, template, how) {
  const before = structuredClone(getSpace(space.id).modules);
  const fresh = template.modules().map((m) => (m.data ? m : { ...m, data: getModuleType(m.type).createInitialData(getState()) }));
  changeState((state) => {
    const target = state.spaces.find((s) => s.id === space.id);
    target.modules = how === 'replace' ? fresh : [...target.modules, ...fresh];
  }, 'layout');
  showToast(how === 'replace' ? `Your page now uses “${template.label}”.` : `Added ${fresh.length} modules from “${template.label}”.`, {
    actionLabel: 'Undo',
    onAction: () => changeState((state) => { state.spaces.find((s) => s.id === space.id).modules = before; }, 'layout'),
  });
  goTo(spaceHref(space.id));
}

// ─── Modules ─────────────────────────────────────────────────────────────────

function renderModules(space, canEdit) {
  // New ones go on the first tab: a group's public-page modules only when that tab is public.
  const publicTab = getTabs(space)[0]?.visibility === 'public';
  const types = inListOrder(moduleTypesFor(space.kind).filter((t) => !t.hiddenFromLibrary && t.available !== false && offeredOn(t, space.kind, { publicTab })), space.kind);
  const onPage = (type) => space.modules.filter((m) => m.type === type).length;

  return section('Modules', 'Add modules one at a time. New ones go at the end of the page’s first tab; drag them into place in edit mode.',
    h('ul', { class: 'module-picker' }, types.map((type) => h('li', { class: 'module-picker__row' },
      h('span', { class: 'module-picker__icon', 'aria-hidden': 'true' }, icon(type.icon, 18)),
      h('span', { class: 'module-picker__text' },
        h('strong', {}, type.label),
        h('span', {}, type.description),
        onPage(type.type) ? h('span', { class: 'module-picker__count' }, `${onPage(type.type)} on this page`) : null),
      h('button', {
        type: 'button', class: 'button button--small', disabled: !canEdit,
        onClick: () => {
          changeState((state) => {
            state.spaces.find((s) => s.id === space.id).modules.push({
              id: makeId('mod'), type: type.type, title: type.label, span: type.defaultSpan, rows: type.defaultRows,
              data: type.createInitialData(state),
            });
          }, 'layout');
          showToast(`Added ${type.label}.`, { actionLabel: 'See it', onAction: () => goTo(spaceHref(space.id)) });
        },
      }, icon('plus', 12), ' Add')))),
    canEdit ? h('button', {
      type: 'button', class: 'button',
      onClick: () => { goTo(spaceHref(space.id)); requestAnimationFrame(() => setEditMode(true)); },
    }, icon('pencil', 14), ' Arrange on the page') : null);
}
