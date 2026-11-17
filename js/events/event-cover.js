/**
 * event-cover.js — an event's cover image: a photo you upload. (Patterns
 * were dropped on Nov 15: an event without a photo has no banner, which
 * reads better than a pattern picked at random. Old pattern covers are
 * kept in the data but no longer shown.)
 *
 * Saved on the event as `cover` (missing = no cover):
 *
 *   { kind: 'none' | 'preset' | 'image',
 *     preset: 'sunrise',              ← one of COVER_PRESETS (js/groups/appearance.js)
 *     image: 'data:image/jpeg;…',     ← an uploaded photo, shrunk to fit storage
 *     width, height,                  ← the photo's size, so banners can fit it properly
 *     x: 50, y: 50,                   ← which part shows: 0 = left/top … 100 = right/bottom
 *     zoom: 1 }                       ← 1 = just covers the banner; up to 3
 *   (older covers have `focus` instead of y)
 *
 * Every banner keeps the same framing whatever its shape: CSS works out the
 * size from the photo's shape (--img-ar), the banner's (--box-ar), and the
 * zoom (css/events.css, .event-cover--photo). The event page shows the
 * whole photo at its own shape (between square and 3:1), large.
 *
 *   eventCoverStyle(event, { boxAr })  → inline styles for a banner, or null
 *   eventCoverBanner(event, class, { natural })  → a banner element, or null
 *   coverPicker(cover, onChange)       → the "Cover" field: a big drop area to
 *                                        add a photo, drag to frame it, scroll,
 *                                        pinch, or ± to zoom
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { readCoverImage } from '../groups/appearance.js';

const NO_COVER = { kind: 'none', preset: null, image: null, x: 50, y: 50, zoom: 1, width: 0, height: 0 };
const MAX_ZOOM = 3;
/** The shape the framing editor shows: the Feed's and the card's banners. */
const FRAME_AR = 3;

export function normalizeCover(cover) {
  const merged = { ...NO_COVER, ...(cover ?? {}) };
  if (cover && cover.y == null && cover.focus != null) merged.y = cover.focus;
  return merged;
}

export function hasCover(event) {
  const cover = normalizeCover(event?.cover);
  return cover.kind === 'image' && Boolean(cover.image);
}

const imageAr = (cover) => (cover.width && cover.height ? cover.width / cover.height : 1.5);

/** Styles for a photo cover, framed the same in any banner. */
function photoStyle(cover, boxAr = null) {
  return {
    backgroundImage: `url("${cover.image}")`,
    backgroundPosition: `${cover.x}% ${cover.y}%`,
    backgroundRepeat: 'no-repeat',
    '--img-ar': String(imageAr(cover)),
    '--zoom': String(cover.zoom || 1),
    ...(boxAr ? { '--box-ar': String(boxAr) } : {}),
  };
}

export function eventCoverStyle(event, { boxAr = null } = {}) {
  if (!hasCover(event)) return null;
  return photoStyle(normalizeCover(event.cover), boxAr);
}

/**
 * The cover as a banner (decorative, so screen readers skip it).
 * natural: show the photo at its own shape (clamped between 1:1 and 3:1),
 * for the event page.
 */
export function eventCoverBanner(event, className = '', { natural = false } = {}) {
  if (!hasCover(event)) return null;
  const cover = normalizeCover(event.cover);
  if (cover.kind === 'image') {
    const ar = natural ? Math.min(3, Math.max(1, imageAr(cover))) : null;
    const style = photoStyle(cover, ar);
    if (ar) style.aspectRatio = String(ar);
    return h('div', { class: `event-cover event-cover--photo ${className}${natural ? ' event-cover--natural' : ''}`, style, role: 'presentation' });
  }
  return null;
}

/** A photo's size (for the framing math). */
function measure(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = src;
  });
}

/**
 * The cover chooser:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │            ⬆ Add a cover photo                │  ← click, or drop a photo here
 *   │         or drop one here                      │
 *   └──────────────────────────────────────────────┘
 *   with a photo:
 *   ┌──────────────────────────────────────────────┐
 *   │   (the photo; drag to move it)        [−][+] │
 *   └──────────────────────────────────────────────┘
 *   Drag to choose what shows · scroll or pinch to zoom    Replace · Remove
 *
 * `onChange` gets the new cover each time it changes.
 */
export function coverPicker(initial, onChange) {
  let cover = normalizeCover(initial);
  const root = h('div', { class: 'cover-picker' });
  const fileInput = h('input', {
    type: 'file', accept: 'image/*', hidden: true,
    onChange: () => { const [file] = fileInput.files; fileInput.value = ''; if (file) usePhoto(file); },
  });

  async function usePhoto(file) {
    try {
      const image = await readCoverImage(file);
      const size = await measure(image);
      set({ kind: 'image', image, ...size, x: 50, y: 50, zoom: 1 });
    } catch (error) {
      showToast(error.message);
    }
  }

  // Older photo covers saved before sizes were kept: measure once.
  if (cover.image && !cover.width) measure(cover.image).then((size) => { cover = { ...cover, ...size }; draw(); });

  function set(changes, { quiet = false } = {}) {
    cover = { ...cover, ...changes };
    onChange({ ...cover });
    if (!quiet) draw();
  }

  /** The photo, framed in a 3:1 box: drag to move, wheel/pinch/± to zoom. */
  function framer() {
    const box = h('div', { class: 'event-cover event-cover--photo cover-picker__frame', style: { ...photoStyle(cover, FRAME_AR), aspectRatio: String(FRAME_AR) }, tabindex: '0', role: 'img', 'aria-label': 'Cover photo. Drag or use arrow keys to move it; plus and minus zoom.' });
    const apply = () => {
      box.style.backgroundPosition = `${cover.x}% ${cover.y}%`;
      box.style.setProperty('--zoom', String(cover.zoom));
    };
    /** How far the photo spills past the box, in px, at this zoom. */
    const spill = () => {
      const rect = box.getBoundingClientRect();
      const widthPx = Math.max(1, imageAr(cover) / FRAME_AR) * cover.zoom * rect.width;
      const heightPx = widthPx / imageAr(cover);
      return { x: Math.max(0, widthPx - rect.width), y: Math.max(0, heightPx - rect.height) };
    };
    const clamp = (v) => Math.min(100, Math.max(0, v));
    const pointers = new Map();
    let pinchStart = null;
    box.addEventListener('pointerdown', (event) => {
      box.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: cover.zoom };
      }
      box.classList.add('is-dragging');
    });
    box.addEventListener('pointermove', (event) => {
      const last = pointers.get(event.pointerId);
      if (!last) return;
      const now = { x: event.clientX, y: event.clientY };
      pointers.set(event.pointerId, now);
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        cover.zoom = Math.min(MAX_ZOOM, Math.max(1, pinchStart.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.distance)));
      } else {
        const { x, y } = spill();
        if (x) cover.x = clamp(cover.x - ((now.x - last.x) / x) * 100);
        if (y) cover.y = clamp(cover.y - ((now.y - last.y) / y) * 100);
      }
      apply();
    });
    const end = (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (!pointers.size) { box.classList.remove('is-dragging'); set({}, { quiet: true }); }
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('wheel', (event) => {
      event.preventDefault();
      cover.zoom = Math.min(MAX_ZOOM, Math.max(1, cover.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
      apply();
      clearTimeout(box.saveTimer);
      box.saveTimer = setTimeout(() => set({}, { quiet: true }), 250);
    }, { passive: false });
    box.addEventListener('keydown', (event) => {
      const moves = { ArrowLeft: ['x', -5], ArrowRight: ['x', 5], ArrowUp: ['y', -5], ArrowDown: ['y', 5] };
      if (moves[event.key]) { event.preventDefault(); const [axis, d] = moves[event.key]; cover[axis] = clamp(cover[axis] + d); apply(); set({}, { quiet: true }); }
      if (event.key === '+' || event.key === '=') { cover.zoom = Math.min(MAX_ZOOM, cover.zoom + 0.2); apply(); set({}, { quiet: true }); }
      if (event.key === '-') { cover.zoom = Math.max(1, cover.zoom - 0.2); apply(); set({}, { quiet: true }); }
    });
    const zoomButton = (label, delta, glyph) => h('button', {
      type: 'button', class: 'cover-picker__zoom-button', 'aria-label': label,
      onClick: () => { cover.zoom = Math.min(MAX_ZOOM, Math.max(1, cover.zoom + delta)); apply(); set({}, { quiet: true }); },
    }, glyph);
    return h('div', { class: 'cover-picker__framer' },
      box,
      h('span', { class: 'cover-picker__zoom' }, zoomButton('Zoom out', -0.25, '−'), zoomButton('Zoom in', 0.25, '+')));
  }

  function dropZone() {
    const zone = h('button', {
      type: 'button', class: 'cover-picker__drop',
      onClick: () => fileInput.click(),
    }, icon('image', 22), h('strong', {}, 'Add a cover photo'), h('span', {}, 'Click to choose one, or drop it here'));
    zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('is-over');
      const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) usePhoto(file);
    });
    return zone;
  }

  function draw() {
    const showingPhoto = cover.kind === 'image' && cover.image;
    replaceChildren(root,
      showingPhoto ? framer() : dropZone(),
      showingPhoto ? h('p', { class: 'cover-picker__hint' },
        h('span', {}, 'Drag to choose what shows · scroll, pinch, or ± to zoom'),
        h('span', { class: 'cover-picker__actions' },
          h('button', { type: 'button', class: 'link-button', onClick: () => set({ x: 50, y: 50, zoom: 1 }) }, 'Reset'),
          h('button', { type: 'button', class: 'link-button', onClick: () => fileInput.click() }, 'Replace'),
          h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => set({ kind: 'none', image: null }) }, 'Remove'))) : null,
      fileInput);
  }

  draw();
  return root;
}
