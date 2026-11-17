/**
 * resize.js — the handle in a module's bottom-right corner that sets its
 * width and height (edit mode only).
 *
 * Module size never depends on content: it's set here and saved. Content
 * that doesn't fit scrolls inside the module.
 *
 * Two ways to resize:
 *   - Drag the handle. The module snaps to whole columns (width) and rows
 *     (height) as you go, with a label like "8 × 12".
 *   - Focus the handle (Tab) and use the arrow keys:
 *       ← →  one column narrower / wider
 *       ↑ ↓  one row shorter / taller
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import {
  resizeModule, setFeaturedRows, getPageLayout, getRows, GRID_COLUMNS, MIN_SPAN, MAX_SPAN, MIN_ROWS, MAX_ROWS, ROW_HEIGHT_PX,
} from '../state/store.js';

/** Build the resize handle for `frame`. Returns the handle element. */
export function attachResizeHandle(frame, module) {
  const startRows = getRows(module);
  const label = h('span', { class: 'resize-label', 'aria-hidden': 'true' });

  const handle = h('button', {
    type: 'button',
    class: 'resize-handle',
    title: 'Drag to resize (or use the arrow keys)',
    'aria-label': sizeDescription(module.span, startRows),
  }, icon('resize', 14), label);

  handle.addEventListener('pointerdown', (event) => startPointerResize(event, { frame, module, handle, label }));
  handle.addEventListener('keydown', (event) => handleKeyboardResize(event, module, frame));

  return handle;
}

// ─── Pointer resizing ────────────────────────────────────────────────────────

function startPointerResize(event, { frame, module, handle, label }) {
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);

  // In a page layout other than the grid (page-layouts.js) the column sets the
  // width, so only the height changes, and it changes as you drag, like the grid.
  const inLayout = Boolean(frame.closest('.module-grid--layout'));
  const grid = inLayout ? frame.closest('.module-grid') : frame.parentElement;
  const { columnStep, rowStep, gap } = getGridSteps(grid);
  const frameRect = frame.getBoundingClientRect();
  let span = module.span;
  let rows = getRows(module);
  // The featured module in Spotlight / Main and sidebar may be growing with its content: start from its height now.
  const featured = frame.classList.contains('module-frame--featured');
  if (featured) rows = clamp(Math.round((frameRect.height + gap) / rowStep), MIN_ROWS, MAX_ROWS);
  const startRows = rows;
  const describe = () => (inLayout ? `${rows} rows tall` : `${span} × ${rows}`);

  frame.classList.add('is-resizing');
  label.textContent = describe();

  const onMove = (moveEvent) => {
    // A module `n` steps wide measures n × step − gap, so add the gap back before dividing.
    const width = moveEvent.clientX - frameRect.left + gap;
    const height = moveEvent.clientY - frameRect.top + gap;
    rows = clamp(Math.round(height / rowStep), MIN_ROWS, MAX_ROWS);
    if (inLayout) {
      if (featured) frame.classList.replace('module-frame--grow', 'module-frame--fixed');
      frame.style.height = `calc(var(--grid-row-height) * ${rows} + var(--grid-gap) * ${rows - 1})`;
    } else {
      span = clamp(Math.round(width / columnStep), MIN_SPAN, MAX_SPAN);
      frame.style.gridColumn = `span ${span}`;
      frame.style.gridRow = `span ${rows}`;
    }
    label.textContent = describe();
  };

  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    frame.classList.remove('is-resizing');
    label.textContent = '';
    if (featured) { if (rows !== startRows || frame.classList.contains('module-frame--fixed')) setFeaturedRows(rows); return; }
    if (span !== module.span || rows !== getRows(module)) resizeModule(module.id, { span, rows });
  };

  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
}

// ─── Keyboard resizing ───────────────────────────────────────────────────────

const ARROW_KEY_CHANGES = {
  ArrowLeft: { span: -1 },
  ArrowRight: { span: +1 },
  ArrowUp: { rows: -1 },
  ArrowDown: { rows: +1 },
};

function handleKeyboardResize(event, module, frame) {
  const change = ARROW_KEY_CHANGES[event.key];
  if (!change) return;
  event.preventDefault();
  if (frame.classList.contains('module-frame--featured')) {
    // ↑ ↓ change the featured module's height in this layout (from its height now, if it was fitting its content).
    if (!change.rows) return;
    const now = getPageLayout().featuredRows ?? Math.round((frame.getBoundingClientRect().height + 26) / (ROW_HEIGHT_PX + 26));
    setFeaturedRows(now + change.rows);
    requestAnimationFrame(() => document.querySelector(`[data-module-id="${module.id}"] .resize-handle`)?.focus());
    return;
  }

  resizeModule(module.id, {
    span: module.span + (change.span ?? 0),
    rows: getRows(module) + (change.rows ?? 0),
  });

  // Resizing redraws the grid, so put focus back on this module's new handle.
  requestAnimationFrame(() => {
    document.querySelector(`[data-module-id="${module.id}"] .resize-handle`)?.focus();
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sizeDescription(span, rows) {
  return `Resize module: ${span} of ${GRID_COLUMNS} columns wide, ${rows} rows tall. Use arrow keys to change.`;
}

/** The size of one column step and one row step (cell + gap), in pixels. */
function getGridSteps(grid) {
  const styles = getComputedStyle(grid);
  const gap = parseFloat(styles.columnGap) || 0;
  return {
    gap,
    columnStep: (grid.clientWidth + gap) / GRID_COLUMNS,
    rowStep: ROW_HEIGHT_PX + gap,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
