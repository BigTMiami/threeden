// @ts-check
/**
 * grid.js — the homepage itself: a 12-column grid of modules.
 *
 * The grid re-renders from the store whenever the layout or edit mode
 * changes. In edit mode it also accepts drops: new modules from the library
 * and existing modules being moved. The dragging itself is handled by
 * pointer-drag.js; this file answers "where would it land?" and performs
 * the drop.
 *
 * Drop position: while something is dragged over the grid, we work out which
 * module the pointer is before (in reading order) and draw a vertical line
 * there. The line is positioned on top of the grid rather than inserted into
 * it, so the layout doesn't jump around while dragging.
 *
 * Other layouts (store.getPageLayout, js/editor/page-layouts.js): instead
 * of the grid, rows of columns. Dropping on a layout's featured column
 * features the module; on a slot column, places it there; elsewhere, moves
 * it in the order. Channels shows a list of the modules and one open at a
 * time. An empty column disappears outside edit mode. On phones every
 * layout is one stack, the featured module first.
 */

import { h, clear } from '../ui/dom.js';
import { getCurrentSpace, getCurrentTabId, getVisibleModules, isEditMode, subscribe, addModule, moveModule, getPageLayout, placeModule, setFeaturedModule, phoneOrdered, naturalPhoneOrder } from '../state/store.js';
import { arrange, layoutById, lastActivity } from './page-layouts.js';
import { getModuleType } from '../modules/registry.js';
import { icon } from '../ui/icons.js';
import { timeAgo } from '../utils/dates.js';
import { createModuleFrame } from './module-frame.js';
import { setDropHandlers } from './pointer-drag.js';

/** How far outside the grid (px) a drop still counts, so edges are easy to hit. */
const DROP_MARGIN = 40;
const PHONE = window.matchMedia('(max-width: 640px)');
/** Channels: which module is open, per space and tab (not saved). */
const openChannel = {};

let gridElement = null;
let dropIndicator = null;
let moduleCleanups = [];

/** Set up the grid inside `container`. Called once at startup. */
export function initGrid(container) {
  gridElement = h('div', { class: 'module-grid' });
  dropIndicator = h('div', { class: 'drop-indicator', 'aria-hidden': 'true' });

  container.append(gridElement, dropIndicator);

  setDropHandlers({
    findDropIndex: (x, y) => (isEditMode() && isOverGrid(x, y) ? findDropIndex(x, y) : null),
    showIndicator: showDropIndicator,
    hideIndicator: hideDropIndicator,
    drop: handleDrop,
  });

  subscribe('layout', renderGrid);
  subscribe('mode', renderGrid);
  PHONE.addEventListener('change', renderGrid);
  renderGrid();
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Redraw every module from the latest data. Called automatically on layout
 * and mode changes, and by main.js when returning from a module's full page
 * (where its data may have changed).
 */
export function renderGrid() {
  const space = getCurrentSpace();
  if (!space) { // signed out
    clear(gridElement);
    return;
  }
  const modules = getVisibleModules(); // the current tab's
  const editMode = isEditMode();

  // Let the old modules clean up (timers, listeners) before replacing them.
  moduleCleanups.forEach((cleanup) => cleanup());
  moduleCleanups = [];
  clear(gridElement);

  gridElement.classList.toggle('module-grid--editing', editMode);
  const layout = getPageLayout();
  const custom = layout.kind !== 'grid' && modules.length > 0;
  for (const c of [...gridElement.classList]) if (c.startsWith('layout--')) gridElement.classList.remove(c);
  gridElement.classList.toggle('module-grid--layout', custom && !PHONE.matches);
  if (custom && !PHONE.matches) gridElement.classList.add(`layout--${layout.kind}`);

  if (modules.length === 0) {
    gridElement.append(renderEmptyState(editMode));
    return;
  }

  const frameOf = (module, mode = null, { rows: setRows = null, featured = false } = {}) => {
    const { element, cleanup } = createModuleFrame(module, { editMode });
    moduleCleanups.push(cleanup);
    // The featured module in Spotlight / Main and sidebar: its handle sets the layout's featuredRows (resize.js).
    if (featured) element.classList.add('module-frame--featured');
    if (mode) {
      const rows = setRows ?? Number(/span (\d+)/.exec(element.style.gridRow)?.[1] ?? module.rows ?? 10);
      element.style.gridColumn = '';
      element.style.gridRow = '';
      element.classList.add(`module-frame--${mode}`);
      if (mode === 'fixed') element.style.height = `calc(var(--grid-row-height) * ${rows} + var(--grid-gap) * ${rows - 1})`;
    }
    return element;
  };

  if (PHONE.matches) {
    // Phones: one stack, in the phone order people set (the small numbers in edit mode), else the featured module first.
    phoneOrdered(naturalPhoneOrder(modules)).forEach((module) => gridElement.append(frameOf(module)));
    return;
  }
  if (!custom) {
    modules.forEach((module) => gridElement.append(frameOf(module)));
    return;
  }
  if (layout.kind === 'channels') { renderChannels(modules, frameOf, editMode); return; }

  const plan = arrange(layout.kind, modules, layout.featuredId, layout.featuredRows);
  const def = layoutById(layout.kind);
  for (const row of plan.rows) {
    const rowElement = h('div', { class: `layout-row ${row.className}` });
    for (const col of row.columns) {
      const column = h('div', {
        class: `layout-col ${col.className}${col.frames.length ? '' : ' is-empty'}`,
        'data-slot': col.slot,
        'data-drop': col.drop ?? '',
      });
      for (const { module, mode, rows, featured } of col.frames) {
        const element = frameOf(module, mode, { rows, featured });
        if (layout.kind === 'timeline') {
          const at = lastActivity(module);
          column.append(h('div', { class: 'timeline__item' },
            h('span', { class: 'timeline__when' }, at ? timeAgo(at) : 'Quiet'),
            h('span', { class: 'timeline__dot', 'aria-hidden': 'true' }),
            element));
        } else column.append(element);
      }
      if (editMode && !col.frames.length && col.drop) {
        column.append(h('p', { class: 'layout-col__drop-here' }, col.drop === 'featured' ? `Drag a module here to feature it (${def.label})` : 'Drag modules here'));
      }
      rowElement.append(column);
    }
    gridElement.append(rowElement);
  }
  if (editMode && layout.kind === 'timeline') gridElement.prepend(h('p', { class: 'layout-note' }, 'Timeline puts the most recently active module first, so the order changes by itself.'));
}

/** Channels: the modules as a list on the left, one open at a time beside it. */
function renderChannels(modules, frameOf, editMode) {
  const key = `${getCurrentSpace()?.id}:${getCurrentTabId()}`;
  const open = modules.find((m) => m.id === openChannel[key]) ?? modules[0];
  const list = h('nav', { class: 'channels__list', 'aria-label': 'Modules on this page' },
    modules.map((module) => {
      let iconName = 'file';
      try { iconName = getModuleType(module.type).icon; } catch { /* unknown type */ }
      return h('button', {
        type: 'button',
        class: `channels__item${module === open ? ' is-open' : ''}`,
        'aria-current': module === open ? 'true' : null,
        'data-channel-id': module.id,
        onClick: () => { openChannel[key] = module.id; renderGrid(); },
      }, icon(iconName, 15), h('span', {}, module.title));
    }),
    editMode ? h('p', { class: 'layout-note' }, 'Drag in the list to reorder.') : null);
  const panel = h('div', { class: 'layout-col channels__panel', 'data-slot': 'channel', 'data-drop': '' }, frameOf(open, 'grow'));
  gridElement.append(h('div', { class: 'layout-row layout-row--channels' }, list, panel));
}

function renderEmptyState(editMode) {
  return h('div', { class: 'module-grid__empty' },
    h('p', {}, editMode
      ? 'This tab is empty. Drag a module here from the list on the left.'
      : 'This tab is empty. Choose "Edit homepage" to add modules.'),
  );
}

// ─── Drag and drop ───────────────────────────────────────────────────────────

/** Is the pointer over the grid (or close enough to its edge)? */
function isOverGrid(x, y) {
  const rect = gridElement.getBoundingClientRect();
  return x >= rect.left - DROP_MARGIN && x <= rect.right + DROP_MARGIN
    && y >= rect.top - DROP_MARGIN && y <= rect.bottom + DROP_MARGIN;
}

/** Called by pointer-drag.js when a drag is released over the grid. */
function handleDrop(drag, index) {
  if (typeof index === 'object') { // another layout: { drop, slot, beforeId, afterId }
    const moduleId = drag.kind === 'new' ? addModule(drag.moduleType, undefined, drag.overrides).id : drag.moduleId;
    if (!moduleId) return;
    if (index.drop === 'featured') setFeaturedModule(moduleId);
    else placeModule(moduleId, { slot: index.drop === 'slot' ? index.slot : null, beforeId: index.beforeId, afterId: index.afterId });
    return;
  }
  if (drag.kind === 'new') {
    addModule(drag.moduleType, index, drag.overrides);
  } else if (drag.kind === 'move') {
    moveModule(drag.moduleId, index);
  }
}

/** All module frames currently on the grid, in order. */
function getFrames() {
  return [...gridElement.querySelectorAll(':scope > .module-frame')];
}

/**
 * Which position (0 … number of modules) the pointer is at, reading the
 * grid left-to-right, top-to-bottom. The drop goes before the first module
 * that is:
 *   - on a lower row than the pointer, or
 *   - on the pointer's row, with the pointer in its first half. For a
 *     module sharing its row, "first half" means the left half; for a
 *     module filling the whole row (always the case on phones), the top half.
 */
function findDropIndex(x, y) {
  if (gridElement.classList.contains('module-grid--layout')) return findLayoutDrop(x, y);
  const frames = getFrames();
  const gridWidth = gridElement.getBoundingClientRect().width;

  for (let i = 0; i < frames.length; i++) {
    const rect = frames[i].getBoundingClientRect();
    if (y < rect.top) return i;

    const fillsRow = rect.width > gridWidth * 0.9;
    const isInFirstHalf = fillsRow
      ? y < rect.top + rect.height / 2
      : y <= rect.bottom && x < rect.left + rect.width / 2;
    if (isInFirstHalf) return i;
  }
  return frames.length;
}

/**
 * Draw the drop line at `index`. Between modules that share a row it's a
 * vertical line in the gap; above a module that fills its row it's a
 * horizontal line.
 */
function showDropIndicator(index) {
  if (typeof index === 'object') { showLayoutIndicator(index); return; }
  const frames = getFrames();
  const containerRect = dropIndicator.parentElement.getBoundingClientRect();
  const gridRect = gridElement.getBoundingClientRect();
  const fillsRow = (rect) => rect.width > gridRect.width * 0.9;

  let box; // { left, top, width, height } in viewport coordinates
  if (frames.length === 0) {
    box = { left: gridRect.left, top: gridRect.top, width: gridRect.width, height: 4 };
  } else if (index < frames.length) {
    const rect = frames[index].getBoundingClientRect();
    box = fillsRow(rect)
      ? { left: rect.left, top: rect.top - 10, width: rect.width, height: 4 }      // above it
      : { left: rect.left - 10, top: rect.top, width: 4, height: rect.height };    // to its left
  } else {
    const rect = frames[frames.length - 1].getBoundingClientRect();
    box = fillsRow(rect)
      ? { left: rect.left, top: rect.bottom + 6, width: rect.width, height: 4 }    // below it
      : { left: rect.right + 6, top: rect.top, width: 4, height: rect.height };    // to its right
  }

  Object.assign(dropIndicator.style, {
    display: 'block',
    left: `${box.left - containerRect.left}px`,
    top: `${box.top - containerRect.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
}

/** Another layout: which column the pointer is nearest, and where in it. */
function findLayoutDrop(x, y) {
  // Channels: reorder by the list.
  const items = [...gridElement.querySelectorAll('.channels__item')];
  if (items.length) {
    const target = items.find((item) => { const r = item.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return { drop: 'order', slot: null, beforeId: target?.dataset.channelId ?? null, afterId: target ? null : items[items.length - 1].dataset.channelId, column: null };
  }
  const columns = [...gridElement.querySelectorAll('.layout-col[data-drop]:not([data-drop=""])')];
  let best = null;
  for (const column of columns) {
    const r = column.getBoundingClientRect();
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { column, distance };
  }
  if (!best) return null;
  const { column } = best;
  const drop = column.dataset.drop;
  if (drop === 'featured') return { drop, slot: column.dataset.slot, column };
  const horizontal = column.classList.contains('layout-col--lanes');
  const frames = [...column.querySelectorAll('.module-frame')];
  const target = frames.find((frame) => {
    const r = frame.getBoundingClientRect();
    return horizontal ? x < r.left + r.width / 2 : y < r.top + r.height / 2;
  });
  return {
    drop, slot: column.dataset.slot, column, horizontal,
    beforeId: target?.dataset.moduleId ?? null,
    afterId: target ? null : frames[frames.length - 1]?.dataset.moduleId ?? null,
  };
}

function showLayoutIndicator(target) {
  const containerRect = dropIndicator.parentElement.getBoundingClientRect();
  let box;
  if (target.drop === 'featured' && target.column) {
    const r = target.column.getBoundingClientRect();
    box = { left: r.left - 6, top: r.top - 6, width: r.width + 12, height: Math.max(40, r.height) + 12 };
    dropIndicator.classList.add('drop-indicator--outline');
  } else {
    dropIndicator.classList.remove('drop-indicator--outline');
    const find = (id) => (id ? gridElement.querySelector(`.module-frame[data-module-id="${CSS.escape(id)}"], .channels__item[data-channel-id="${CSS.escape(id)}"]`) : null);
    const before = find(target.beforeId);
    const after = find(target.afterId);
    const anchor = (before ?? after)?.getBoundingClientRect();
    const colRect = target.column?.getBoundingClientRect() ?? anchor;
    if (!anchor) box = { left: colRect.left, top: colRect.top, width: colRect.width, height: 4 };
    else if (target.horizontal) box = { left: before ? anchor.left - 9 : anchor.right + 5, top: anchor.top, width: 4, height: anchor.height };
    else box = { left: anchor.left, top: before ? anchor.top - 9 : anchor.bottom + 5, width: anchor.width, height: 4 };
  }
  Object.assign(dropIndicator.style, {
    display: 'block',
    left: `${box.left - containerRect.left}px`,
    top: `${box.top - containerRect.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
}

function hideDropIndicator() {
  dropIndicator.classList.remove('drop-indicator--outline');
  dropIndicator.style.display = 'none';
}
