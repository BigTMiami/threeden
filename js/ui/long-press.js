// @ts-check
/**
 * long-press.js — press and hold (or press hard) on a touch screen.
 *
 *   onLongPress(dayCell, (point) => createAt(day, timeAt(point.y)));
 *
 * Fires after the finger has stayed put for half a second (a small wobble
 * is fine; moving further is a scroll or a swipe, and cancels it). A hard
 * press fires sooner on screens that sense pressure: the pressure has to
 * rise well above where the touch started, with the finger still. The tap that
 * follows a long press is swallowed, so the element's own click (select
 * the day, say) doesn't also happen, and so is the phone's own
 * press-and-hold menu.
 *
 * Touch and pen only: a mouse has right-click and drag for this.
 */

const HOLD_MS = 500;
const WOBBLE_PX = 10;
// A hard press: the pressure has to climb this far above where the touch
// started (some screens report full pressure for every touch, so a high
// reading alone means nothing), with the finger still, after HARD_MIN_MS.
const HARD_RISE = 0.35;
const HARD_MIN_MS = 120;

/**
 * @param {HTMLElement} element
 * @param {(point: { x: number, y: number, target: EventTarget | null }) => void} handler
 * @param {{ shouldStart?: (event: PointerEvent) => boolean }} [options]
 */
export function onLongPress(element, handler, { shouldStart = () => true } = {}) {
  let timer = 0;
  let start = null;
  let fired = false;

  const cancel = () => { clearTimeout(timer); timer = 0; start = null; };
  const fire = () => {
    if (!start) return;
    const point = start;
    cancel();
    fired = true;
    try { navigator.vibrate?.(12); } catch { /* not allowed: fine */ }
    handler(point);
  };

  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || !event.isPrimary || !shouldStart(event)) return;
    fired = false;
    start = { x: event.clientX, y: event.clientY, target: event.target, pressure: event.pressure, at: event.timeStamp };
    clearTimeout(timer);
    timer = window.setTimeout(fire, HOLD_MS);
  });
  element.addEventListener('pointermove', (event) => {
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > WOBBLE_PX) { cancel(); return; }
    const rise = event.pressure - (start.pressure ?? 0);
    if (rise >= HARD_RISE && event.timeStamp - start.at >= HARD_MIN_MS) fire();
  });
  element.addEventListener('pointerup', cancel);
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('pointerleave', cancel);
  // The phone's own press-and-hold menu, and the tap after a long press.
  element.addEventListener('contextmenu', (event) => { if (start || fired) event.preventDefault(); });
  element.addEventListener('click', (event) => {
    if (!fired) return;
    fired = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}
