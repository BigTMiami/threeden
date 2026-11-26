// @ts-check
/**
 * scroll-flow.js — one continuous scroll over a homepage's modules.
 *
 * Browsers "latch" a wheel stroke onto whatever starts scrolling first: roll
 * over a module, it scrolls to its end, and the rest of that stroke is thrown
 * away until you start a new one. On a page made of modules that feels like
 * getting stuck.
 *
 * Here, over a module on a homepage grid, each bit of wheel movement goes to
 * the innermost thing that can still scroll that way, and whatever it can't
 * use goes on to the next one out, and finally to the page, all within the
 * same stroke. Small trackpad steps apply at once; mouse-wheel notches glide
 * (unless the system asks for reduced motion).
 *
 * Only when it's needed (Nov 16): if nothing in the module under the pointer
 * can scroll the way you're going (most modules on most pages, and the whole
 * of a page with one module), the browser scrolls the page itself, natively,
 * with its own smoothness. A stroke that started out needing help keeps it
 * until it ends, so it never switches halfway.
 *
 * Left alone: sideways scrolling, Ctrl/⌘ + wheel (pinch zoom, map zoom), the
 * one-module-at-a-time phone view, and every page that isn't a module grid.
 */

const LINE_PX = 16;
const GLIDE_FROM_PX = 40; // steps this big or bigger are mouse-wheel notches: glide them
const STROKE_GAP_MS = 180; // wheel events closer together than this are one stroke

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Does `el` scroll up and down? */
function scrollsY(el) {
  if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight + 1) return false;
  return /auto|scroll/.test(getComputedStyle(el).overflowY);
}

/** The page's own scroller: the window, unless the module grid sits in a scrolling box. */
function pageScrollerFor(frame) {
  for (let el = frame.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (scrollsY(el)) return el;
  }
  return null;
}

/** Innermost first: everything between the pointer and the module's edge that scrolls. */
function chainFor(target, frame) {
  const chain = [];
  for (let el = target; el && el !== frame.parentElement; el = el.parentElement) {
    if (scrollsY(el)) chain.push(el);
  }
  return chain;
}

/** Can anything in the chain still scroll by `dy` (down when positive)? */
const hasRoom = (chain, dy) => chain.some((el) => (dy > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop > 0.5 : el.scrollTop > 0.5));

/** Give `dy` pixels to the chain, innermost first; the rest scrolls the page. */
function apply(chain, page, dy) {
  let left = dy;
  for (const el of chain) {
    if (!el.isConnected || left === 0) continue;
    const room = left > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop : -el.scrollTop;
    const take = left > 0 ? Math.min(left, Math.max(0, room)) : Math.max(left, Math.min(0, room));
    if (take) { el.scrollTop += take; left -= take; }
  }
  if (Math.abs(left) >= 0.5) {
    if (page) page.scrollTop += left;
    else window.scrollBy(0, left);
  }
}

export function initScrollFlow() {
  let pending = 0;
  let chain = [];
  let page = null;
  let frameRequest = 0;
  let lastHandled = 0; // when this script last took a wheel event (a stroke it took, it keeps)

  function glide() {
    // A quarter of what's left each frame: quick, but smooth.
    const step = Math.abs(pending) < 1 ? pending : pending * 0.25 + Math.sign(pending) * 0.5;
    pending -= step;
    apply(chain, page, step);
    frameRequest = Math.abs(pending) >= 0.5 ? requestAnimationFrame(glide) : 0;
  }

  document.addEventListener('wheel', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const target = /** @type {Element} */ (event.target);
    const frame = target.closest?.('.module-frame');
    const grid = frame?.closest('.module-grid');
    if (!frame || !grid?.classList.contains('module-grid') || grid.classList.contains('is-swiping')) return;
    // Drop-down lists (and anything marked data-own-wheel) handle the wheel themselves.
    if (target.closest('select, [data-own-wheel]')) return;

    const dy = event.deltaY * (event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? window.innerHeight : 1);
    const nextChain = chainFor(target, frame);
    const midStroke = event.timeStamp - lastHandled < STROKE_GAP_MS;
    // Nothing here can scroll this way: let the browser scroll the page (unless this stroke is already ours).
    if (!midStroke && !pending && !hasRoom(nextChain, dy)) return;
    lastHandled = event.timeStamp;
    event.preventDefault();
    chain = nextChain;
    page = pageScrollerFor(frame);
    if (Math.abs(dy) < GLIDE_FROM_PX || reducedMotion()) {
      // Trackpads send many small steps: apply each at once (and finish any glide first).
      if (pending) { apply(chain, page, pending); pending = 0; }
      apply(chain, page, dy);
      return;
    }
    // Turning around mid-glide drops what was left going the other way.
    if (Math.sign(pending) !== Math.sign(dy)) pending = 0;
    pending += dy;
    if (!frameRequest) frameRequest = requestAnimationFrame(glide);
  }, { capture: true, passive: false });
}
