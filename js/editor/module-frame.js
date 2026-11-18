// @ts-check
/**
 * module-frame.js — the box around every module on the homepage.
 *
 * The frame is the same for every module type. It draws:
 *   - a header with the module's title
 *   - in edit mode: a drag strip, move/remove controls, and a resize
 *     handle in the bottom-right corner
 *   - a body, which the module type's own `render()` fills in
 *
 *   ┌──────────────────── ⠿⠿⠿ ───────────────────────┐   ← drag strip (edit mode)
 *   │ ⋮⋮  Calendar ──────────────────────── ↑ ↓ 🗑    │   (edit mode)
 *   │                                                │
 *   │   (module body, drawn by js/modules/*.js)      │
 *   │   scrolls when its content is taller           │
 *   │                                              ◢ │ ← resize handle (edit mode)
 *   └────────────────────────────────────────────────┘
 *
 * The frame's size comes from the module's saved `span` (columns) and
 * `rows`, never from its content: the body scrolls instead.
 *
 * Module types that have a full-page view (`renderFullPage`) also get an
 * expand button (↗) in the header, in both modes.
 */

import { h, appendChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { getModuleType } from '../modules/registry.js';
import {
  renameModule, removeModule, restoreModule, 
  setEditMode, getRows, getSpaceOfModule, getModule,
} from '../state/store.js';
import { backupRemovedModule, dropBackup, BACKUP_FOLDER } from '../state/module-backups.js';
import { openModulePage } from '../router.js';
import { beginPointerDrag } from './pointer-drag.js';
import { attachResizeHandle } from './resize.js';
import { createModuleContext, expandTargetOf, requestModuleFocus } from './module-context.js';
import { sharingOf, setSharing } from '../state/shared-modules.js';
import { openShareModuleDialog } from './share-module.js';

/**
 * Build the frame for one module.
 * Returns { element, cleanup } — call cleanup() before throwing it away.
 */
export function createModuleFrame(module, { editMode }) {
  const moduleType = getModuleType(module.type);

  const frame = h('section', {
    class: `module-frame${editMode ? ' module-frame--editing' : ''}`,
    dataset: { moduleId: module.id, moduleType: module.type },
    style: { gridColumn: `span ${module.span}`, gridRow: `span ${getRows(module)}` },
    'aria-label': module.title,
  });

  const body = h('div', { class: 'module-frame__body' });

  if (editMode) {
    // A full-width strip across the top that's always free to grab, even
    // in narrow modules where the header is full of controls.
    const dragStrip = h('div', { class: 'module-frame__drag-strip', title: 'Drag to move' }, icon('grip', 14));
    makeDraggable(dragStrip, module, moduleType, frame);
    frame.append(dragStrip);
  }

  frame.append(
    renderHeader(module, moduleType, { editMode, frame }),
    body,
  );

  if (editMode) {
    frame.append(attachResizeHandle(frame, module));
  }

  // A module shared from another group that's no longer shared: say so.
  const sharing = sharingOf(module.id);
  if (sharing.link && !sharing.source) {
    body.append(h('p', { class: 'module-empty' }, `${sharing.home?.name ?? 'The group that shared this'} stopped sharing it. You can remove it.`));
    return { element: frame, cleanup: () => {} };
  }
  // Let the module type draw its content.
  const cleanup = moduleType.render(body, createModuleContext(module.id)) || (() => {});

  return { element: frame, cleanup };
}

// ─── Header ──────────────────────────────────────────────────────────────────

function renderHeader(module, moduleType, { editMode, frame }) {
  const header = h('header', { class: 'module-frame__header' });

  if (!editMode) {
    // appendChildren (not header.append) skips the null that
    // renderOpenButton returns for modules without a full page.
    appendChildren(header, [
      h('span', { class: 'module-frame__icon' }, icon(moduleType.iconFor?.(module) ?? moduleType.icon, 16)),
      h('h2', { class: 'module-frame__title' }, module.title),
      sharedTag(module),
      renderOpenButton(module, moduleType),
    ]);
    return header;
  }

  makeDraggable(header, module, moduleType, frame);

  appendChildren(header, [
    renderDragHandle(),
    h('label', { class: 'visually-hidden', for: `title-${module.id}` }, 'Module title'),
    h('input', {
      id: `title-${module.id}`,
      class: 'module-frame__title-input',
      type: 'text',
      value: module.title,
      // Sized to its text, so the rest of the header is free to grab.
      size: String(Math.max(8, module.title.length + 1)),
      onInput: (event) => { event.target.size = Math.max(8, event.target.value.length + 1); },
      onChange: (event) => renameModule(module.id, event.target.value),
    }),
    // No expand button or ↑ ↓ while editing (drag to move); Share and Remove stay in reach.
    renderEditControls(module),
  ]);
  return header;
}

/** "Shared from Northside Rec League" (or "Shared with 3 groups") next to the title. */
function sharedTag(module) {
  const sharing = sharingOf(module.id);
  if (sharing.link) {
    return h('span', { class: 'module-frame__shared', title: sharing.canEdit ? 'You can change it here too' : 'To look at only' },
      icon('link', 11), ` ${sharing.home?.name ?? 'Shared'}`);
  }
  const count = module.sharedWith?.length ?? 0;
  return count ? h('span', { class: 'module-frame__shared', title: 'This module also shows in other groups' }, icon('link', 11), ` Shared with ${count}`) : null;
}

/** Expand button (↗ icon only) for module types with a full-page view; nothing otherwise. */
function renderOpenButton(module, moduleType) {
  if (!moduleType.renderFullPage) return null;
  const label = `Open ${module.title} full page`;
  return h('button', {
    type: 'button',
    class: 'icon-button module-frame__open',
    'aria-label': label,
    title: label,
    onClick: () => {
      // A card with something open (a vault document, say) opens it in the full page.
      // (Read first: leaving edit mode redraws the card, which forgets it.)
      const target = expandTargetOf(module.id);
      setEditMode(false);
      if (target) requestModuleFocus(module.id, target);
      openModulePage(module.id);
    },
  }, icon('expand', 16));
}

/**
 * The ⋮⋮ handle. Dragging works from anywhere on the header and the strip
 * above it (see `makeDraggable`); the handle is there so people can see it.
 */
function renderDragHandle() {
  return h('span', { class: 'module-frame__grip', title: 'Drag to move', 'aria-hidden': 'true' }, icon('grip', 18));
}

/** Controls inside the header that should keep working instead of starting a drag. */
const INTERACTIVE_SELECTOR = 'input, select, textarea, button, a, label';

/**
 * In edit mode, pressing on `element` (anywhere except its inputs and
 * buttons) and moving the pointer drags the module.
 */
function makeDraggable(element, module, moduleType, frame) {
  element.classList.add('is-drag-handle');
  element.addEventListener('pointerdown', (event) => {
    if (event.target.closest(INTERACTIVE_SELECTOR)) return;
    event.preventDefault(); // Don't start selecting text.
    beginPointerDrag(event, {
      kind: 'move',
      moduleId: module.id,
      label: module.title,
      icon: moduleType.icon,
      sourceElement: frame,
    });
  });
}

function renderEditControls(module) {
  // Size is changed with the corner resize handle (drag, or arrow keys); place by dragging.
  return h('div', { class: 'module-frame__controls' },
    // Share with other groups (only from the module's home, not from a link).
    !module.linkedFrom && getSpaceOfModuleKind(module.id) === 'group' ? iconButton('share', 'Share with other groups', () => openShareModuleDialog(module.id)) : null,
    iconButton('trash', 'Remove module', () => handleRemove(module.id)),
  );
}

function getSpaceOfModuleKind(moduleId) {
  return getSpaceOfModule(moduleId)?.kind ?? null;
}

function iconButton(iconName, label, onClick, isAtEdge = false) {
  return h('button', {
    type: 'button',
    class: 'icon-button',
    'aria-label': label,
    title: label,
    // At the first/last position the button does nothing; we leave it
    // enabled (disabled buttons are hard to see) but dim it with a class.
    'data-at-edge': isAtEdge ? 'true' : null,
    onClick,
  }, icon(iconName, 16));
}

/** Take a module off the page, keeping a copy, with Undo (also the phone widget editor's ×, mobile-editor.js). */
export function handleRemove(moduleId) {
  // Removing a shared module's link here stops sharing it with this group.
  const sharing = sharingOf(moduleId);
  if (sharing.link && sharing.source) {
    const here = getSpaceOfModule(moduleId);
    setSharing(sharing.source.id, sharing.source.sharedWith.filter((s) => s.spaceId !== here.id));
    showToast(`Removed. ${sharing.home?.name ?? 'The other group'} still has it.`);
    return;
  }
  const removed = removeModule(moduleId);
  if (!removed) return;
  // Anything it held is kept: in the page's vault, or under "Removed" in the module list (module-backups.js).
  const backup = backupRemovedModule(removed);
  const vaultName = backup?.where === 'vault' ? getModule(backup.vaultId)?.title : null;
  const kept = !backup ? '' : vaultName ? ` A copy is in ${vaultName}, in “${BACKUP_FOLDER}”.` : ' You can put it back from Removed, next to the module list.';
  showToast(`Removed "${removed.module.title}".${kept}`, {
    actionLabel: 'Undo',
    onAction: () => { dropBackup(backup); restoreModule(removed); },
  });
}
