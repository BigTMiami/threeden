/**
 * share-module.js — "Share with other groups" for a module (edit mode, the
 * share button in its header). Pick groups you help run, and whether their
 * members can change it or only look. See js/state/shared-modules.js.
 *
 *   Share “League calendar”                                ×
 *   It shows on each group's homepage, the same calendar everywhere.
 *   ☑ Thunder FC          [Can edit ▾]
 *   ☑ River Foxes         [Can look ▾]
 *   ☐ Juniper Tenants Union
 *                                         [Cancel] [Save]
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { getCurrentUser, getModule, getSpaceOfModule } from '../state/store.js';
import { groupsToShareWith, setSharing } from '../state/shared-modules.js';

export function openShareModuleDialog(moduleId) {
  const me = getCurrentUser();
  const module = getModule(moduleId);
  const home = getSpaceOfModule(moduleId);
  const groups = groupsToShareWith(me.id, moduleId);
  const current = new Map((module.sharedWith ?? []).map((s) => [s.spaceId, s]));
  // Groups it's shared with that you can't edit stay shared (kept below).
  const previousFocus = document.activeElement;
  const rows = groups.map((group) => {
    const was = current.get(group.id);
    const check = h('input', { type: 'checkbox', checked: Boolean(was) });
    const mode = h('select', { class: 'input input--compact', 'aria-label': `What ${group.name} can do` },
      h('option', { value: 'edit', selected: was?.canEdit !== false }, 'Can edit'),
      h('option', { value: 'view', selected: was?.canEdit === false }, 'Can look'));
    return { group, check, mode, element: h('li', { class: 'share-module__row' }, h('label', { class: 'share-module__group' }, check, ` ${group.name}`), mode) };
  });

  const overlay = h('div', { class: 'sub-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Share ${module.title}` },
    h('div', { class: 'sub-viewer__panel share-module' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, icon('share', 18), ` Share “${module.title}”`),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => close() }, icon('close', 18))),
      h('p', { class: 'settings-field__hint' }, `It shows on each group’s homepage, the same ${module.title.toLowerCase().includes('calendar') ? 'calendar' : 'module'} everywhere: a change in one place shows in all of them. It stays part of ${home.name}.`),
      rows.length ? h('ul', { class: 'share-module__list' }, rows.map((r) => r.element))
        : h('p', { class: 'module-empty' }, 'You can share with groups where you can edit the homepage. You’re not an admin of any other group yet.'),
      h('div', { class: 'form-row form-row--end' },
        h('button', { type: 'button', class: 'button button--quiet', onClick: () => close() }, 'Cancel'),
        rows.length ? h('button', {
          type: 'button', class: 'button button--primary',
          onClick: () => {
            const kept = (module.sharedWith ?? []).filter((s) => !groups.some((g) => g.id === s.spaceId));
            const chosen = rows.filter((r) => r.check.checked).map((r) => ({ spaceId: r.group.id, canEdit: r.mode.value === 'edit' }));
            setSharing(moduleId, [...kept, ...chosen]);
            close();
            showToast(chosen.length ? `Shared with ${chosen.map((c) => rows.find((r) => r.group.id === c.spaceId).group.name).join(', ')}.` : 'Not shared with any other group.');
          },
        }, 'Save') : null)));
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    previousFocus?.focus?.();
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  overlay.querySelector('input, button')?.focus();
}
