/**
 * pointer-tracker.js — a small helper for dragging things *inside* a
 * module: kanban cards, gantt bars, power-map dots.
 *
 * (Dragging whole modules around the homepage is a bigger job with its own
 * file, js/editor/pointer-drag.js.)
 *
 * Usage, from a pointerdown listener:
 *
 *   element.addEventListener('pointerdown', (event) => {
 *     trackPointer(event, {
 *       onStart(point)        { …the press became a drag… },
 *       onMove(point, delta)  { …follow the pointer… },
 *       onEnd(point, delta)   { …drop… },
 *       onCancel()            { …Escape was pressed: put things back… },
 *     });
 *   });
 *
 *   point = { x, y }            the pointer, in viewport coordinates
 *   delta = { dx, dy }          how far it has moved since pointerdown
 *
 * Nothing happens until the pointer moves `threshold` pixels, so a plain
 * click still works as a click. After a real drag, the click that the
 * browser fires on release is swallowed, so dropping a card doesn't also
 * open it.
 */

const DEFAULT_THRESHOLD_PX = 5;

/**
 * @param {PointerEvent} downEvent
 * @param {object} handlers  { onStart, onMove, onEnd, onCancel, threshold }
 */
export function trackPointer(downEvent, handlers) {
  if (downEvent.button !== 0) return; // Left button / touch / pen only.

  const { onStart, onMove, onEnd, onCancel, threshold = DEFAULT_THRESHOLD_PX } = handlers;
  const startX = downEvent.clientX;
  const startY = downEvent.clientY;
  let isDragging = false;

  const pointOf = (event) => ({ x: event.clientX, y: event.clientY });
  const deltaOf = (event) => ({ dx: event.clientX - startX, dy: event.clientY - startY });

  function handleMove(event) {
    if (event.pointerId !== downEvent.pointerId) return;

    if (!isDragging) {
      const { dx, dy } = deltaOf(event);
      if (Math.hypot(dx, dy) < threshold) return;
      isDragging = true;
      document.body.classList.add('is-pointer-dragging'); // stops text selection
      onStart?.(pointOf(event));
    }

    event.preventDefault();
    onMove?.(pointOf(event), deltaOf(event));
  }

  function handleUp(event) {
    if (event.pointerId !== downEvent.pointerId) return;
    stopListening();
    if (!isDragging) return;
    swallowNextClick();
    onEnd?.(pointOf(event), deltaOf(event));
  }

  function handleKey(event) {
    if (event.key !== 'Escape') return;
    stopListening();
    if (isDragging) onCancel?.();
  }

  function stopListening() {
    document.body.classList.remove('is-pointer-dragging');
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleUp);
    window.removeEventListener('keydown', handleKey);
  }

  window.addEventListener('pointermove', handleMove, { passive: false });
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', handleUp);
  window.addEventListener('keydown', handleKey);
}

/** Ignore the click the browser fires right after a drag ends. */
function swallowNextClick() {
  const swallow = (event) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  // If no click comes (e.g. released over another element), stop waiting.
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}
