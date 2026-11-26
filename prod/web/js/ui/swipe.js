// @ts-check
/**
 * swipe.js — a sideways swipe with one finger, for paging (the calendar's
 * months and weeks).
 *
 *   onSwipe(element, { onNext, onPrevious })   ← swipe left = next, right = previous
 *   slideIn(element, direction)                ← a short slide as the new page arrives
 *   isPhone()                                  ← narrow screen (the phone layout)
 *
 * Vertical scrolling still works: only a mostly-sideways move of 50 px or
 * more counts.
 */

const MIN_DISTANCE = 50;
const MAX_TIME_MS = 800;

export const isPhone = () => window.matchMedia('(max-width: 640px)').matches;

export function onSwipe(element, { onNext, onPrevious }) {
  let start = null;
  element.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) { start = null; return; }
    const touch = event.touches[0];
    start = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  }, { passive: true });
  element.addEventListener('touchend', (event) => {
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const quick = Date.now() - start.at < MAX_TIME_MS;
    start = null;
    if (!quick || Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // A swipe isn't a tap: don't let it open whatever it started on.
    const swallow = (click) => { click.stopPropagation(); click.preventDefault(); };
    element.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => element.removeEventListener('click', swallow, true), 400);
    if (dx < 0) onNext(); else onPrevious();
  }, { passive: true });
}

export function slideIn(element, direction) {
  element.classList.remove('is-slide-next', 'is-slide-previous');
  void element.offsetWidth; // restart the animation
  element.classList.add(direction > 0 ? 'is-slide-next' : 'is-slide-previous');
}
