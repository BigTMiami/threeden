/**
 * pointer-drag.js — dragging modules around the homepage.
 *
 * We use pointer events (mouse, pen and touch alike) instead of the
 * browser's built-in HTML drag-and-drop, which doesn't work on touch
 * screens and can be unreliable inside embedded pages.
 *
 * How a drag works:
 *
 *   1. pointerdown on a drag source calls `beginPointerDrag(event, drag)`.
 *   2. Nothing happens until the pointer moves a few pixels, so plain
 *      clicks still work (e.g. clicking a library item adds it).
 *   3. Once moving: a small "ghost" card follows the pointer, the original
 *      module is dimmed, and the grid shows where the module would land.
 *      Near the top or bottom of the window, the page scrolls.
 *   4. pointerup over the grid drops it; anywhere else (or Escape) cancels.
 *
 * A drag is described by:
 *   { kind: 'new',  moduleType: 'todo',    label, icon }   ← from the library
 *   { kind: 'new',  moduleType: 'vaultfile', overrides: { title, data }, label, icon }  ← a vault file
 *   { kind: 'move', moduleId:   'mod-123', label, icon, sourceElement }
 *
 * The grid (grid.js) tells us where things would land via the functions
 * passed to `setDropHandlers`.
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/** How far (px) the pointer must move before a press becomes a drag. */
const DRAG_START_DISTANCE = 6;

/** Within this many px of the window's top/bottom edge, the page scrolls. */
const AUTO_SCROLL_EDGE = 70;
const AUTO_SCROLL_MAX_SPEED = 18; // px per frame

/** Set by grid.js: { findDropIndex(x, y), showIndicator(index), hideIndicator(), drop(drag, index) } */
let dropHandlers = null;

export function setDropHandlers(handlers) {
  dropHandlers = handlers;
}

/**
 * Start tracking a possible drag. Call from a pointerdown listener.
 * @param {PointerEvent} downEvent
 * @param {object} drag   see the top of this file
 */
export function beginPointerDrag(downEvent, drag) {
  if (downEvent.button !== 0) return; // Left button / touch / pen only.

  const startX = downEvent.clientX;
  const startY = downEvent.clientY;
  let isDragging = false;
  let ghost = null;
  let lastPointer = { x: startX, y: startY };
  let dropIndex = null;
  let scrollFrame = null;

  // ─── Phases ────────────────────────────────────────────────────────────────

  function startDragging() {
    isDragging = true;
    document.body.classList.add('is-dragging-module');
    drag.sourceElement?.classList.add('is-drag-source');

    ghost = h('div', { class: 'drag-ghost', 'aria-hidden': 'true' },
      icon(drag.icon, 16), h('span', {}, drag.label));
    document.body.append(ghost);

    scrollFrame = requestAnimationFrame(autoScroll);
  }

  function updatePosition(x, y) {
    lastPointer = { x, y };
    ghost.style.transform = `translate(${x + 12}px, ${y + 12}px)`;

    dropIndex = dropHandlers?.findDropIndex(x, y) ?? null;
    if (dropIndex === null) dropHandlers?.hideIndicator();
    else dropHandlers.showIndicator(dropIndex);
  }

  function finish(shouldDrop) {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKeydown);

    if (!isDragging) return;

    cancelAnimationFrame(scrollFrame);
    ghost.remove();
    document.body.classList.remove('is-dragging-module');
    drag.sourceElement?.classList.remove('is-drag-source');
    dropHandlers?.hideIndicator();

    // A drag ends with a click on whatever is under the pointer; swallow it
    // so dropping onto a button doesn't also press it.
    window.addEventListener('click', swallowClick, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 0);

    if (shouldDrop && dropIndex !== null) dropHandlers.drop(drag, dropIndex);
  }

  // ─── Auto-scroll ───────────────────────────────────────────────────────────

  function autoScroll() {
    const { y } = lastPointer;
    let speed = 0;
    if (y < AUTO_SCROLL_EDGE) speed = -AUTO_SCROLL_MAX_SPEED * (1 - y / AUTO_SCROLL_EDGE);
    else if (y > window.innerHeight - AUTO_SCROLL_EDGE) speed = AUTO_SCROLL_MAX_SPEED * (1 - (window.innerHeight - y) / AUTO_SCROLL_EDGE);

    if (speed !== 0) {
      window.scrollBy(0, speed);
      updatePosition(lastPointer.x, lastPointer.y); // The grid moved under the pointer.
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  // ─── Listeners ─────────────────────────────────────────────────────────────

  function onMove(event) {
    if (!isDragging) {
      const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (distance < DRAG_START_DISTANCE) return;
      startDragging();
    }
    event.preventDefault();
    updatePosition(event.clientX, event.clientY);
  }

  const onUp = () => finish(true);
  const onCancel = () => finish(false);
  const onKeydown = (event) => { if (event.key === 'Escape') finish(false); };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKeydown);
}

function swallowClick(event) {
  event.stopPropagation();
  event.preventDefault();
}
