/**
 * lightbox.js — a photo shown large over the page, with the ones before
 * and after it.
 *
 *   openLightbox(photos, startIndex, { editable, onCaption, onDelete, onMove });
 *
 *   ┌──────────────────────────────────────────── × ┐
 *   │  ‹              [ the photo ]              ›  │
 *   │                 Caption text                  │
 *   │                 3 of 8                        │
 *   │  (owner) [caption……] [← Earlier] [Later →] Delete
 *   └───────────────────────────────────────────────┘
 *
 * ← → move between photos, Esc closes. Photos are { id, src, caption }.
 *
 * Touch: pinch to zoom (or double-tap), drag to look around a zoomed photo,
 * swipe left or right for the next or previous one, swipe down to close.
 * Mouse: double-click zooms, drag pans, Ctrl + wheel (a trackpad pinch) zooms.
 * The callbacks save changes; the lightbox then shows the updated list
 * from `getPhotos()` if given (so captions and order stay current).
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';

/**
 * @param {object[]} photos
 * @param {number}   startIndex
 * @param {object}   [options]
 * @param {boolean}  [options.editable]
 * @param {function} [options.getPhotos]          () → the latest photos, after a change
 * @param {function} [options.onCaption]          (photoId, text)
 * @param {function} [options.onDelete]           (photoId)
 * @param {function} [options.onMove]             (photoId, direction -1 | 1)
 */
export function openLightbox(photos, startIndex, options = {}) {
  const { editable = false, getPhotos = () => photos, onCaption, onDelete, onMove } = options;
  let index = startIndex;
  const previousFocus = document.activeElement;

  const stage = h('div', { class: 'lightbox__stage' });
  const overlay = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo' },
    h('button', { type: 'button', class: 'lightbox__close', 'aria-label': 'Close', onClick: close }, icon('close', 22)),
    stage);

  function current() {
    const list = getPhotos();
    index = Math.max(0, Math.min(index, list.length - 1));
    return { list, photo: list[index] };
  }

  function draw() {
    const { list, photo } = current();
    if (!photo) { close(); return; }
    const captionInput = editable ? h('input', {
      type: 'text',
      class: 'input lightbox__caption-input',
      value: photo.caption ?? '',
      placeholder: 'Add a caption',
      'aria-label': 'Caption',
      onChange: (event) => { onCaption?.(photo.id, event.target.value.trim()); draw(); },
      onKeydown: (event) => { if (event.key === 'Enter') event.target.blur(); },
    }) : null;

    replaceChildren(stage,
      list.length > 1 ? h('button', { type: 'button', class: 'lightbox__nav lightbox__nav--prev', 'aria-label': 'Previous photo', onClick: () => step(-1) }, icon('chevronLeft', 28)) : null,
      h('figure', { class: 'lightbox__figure' },
        zoomable(h('img', { class: 'lightbox__image', src: photo.src, alt: photo.caption || `Photo ${index + 1}`, draggable: 'false' }), list.length > 1),
        h('figcaption', { class: 'lightbox__caption' },
          photo.caption && !editable ? h('span', {}, photo.caption) : null,
          h('span', { class: 'lightbox__count' }, `${index + 1} of ${list.length}`))),
      list.length > 1 ? h('button', { type: 'button', class: 'lightbox__nav lightbox__nav--next', 'aria-label': 'Next photo', onClick: () => step(1) }, icon('chevronRight', 28)) : null,
      editable ? h('div', { class: 'lightbox__tools' },
        captionInput,
        onMove ? h('button', { type: 'button', class: 'button button--small', disabled: index === 0, onClick: () => { onMove(photo.id, -1); index -= 1; draw(); } }, '← Earlier') : null,
        onMove ? h('button', { type: 'button', class: 'button button--small', disabled: index === list.length - 1, onClick: () => { onMove(photo.id, 1); index += 1; draw(); } }, 'Later →') : null,
        onDelete ? h('button', { type: 'button', class: 'button button--small button--danger', onClick: () => { onDelete(photo.id); draw(); } }, 'Delete') : null) : null,
    );
  }

  /**
   * Pinch or double-tap to zoom, drag to pan when zoomed; at normal size a
   * sideways swipe steps through the gallery and a swipe down closes.
   */
  function zoomable(img, canStep) {
    const MAX = 4;
    let scale = 1; let tx = 0; let ty = 0;
    const pointers = new Map(); // pointerId → { x, y }
    let pinch = null; // { dist, scale, mid, tx, ty }
    let drag = null; // { x, y, tx, ty, moved }
    let lastTap = 0;

    const apply = (animate = false) => {
      img.style.transition = animate ? 'transform 0.18s ease' : 'none';
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      img.classList.toggle('is-zoomed', scale > 1.01);
    };
    /** Keep a zoomed photo covering its box (no dragging it off into the dark). */
    const clamp = () => {
      const maxX = (img.offsetWidth * (scale - 1)) / 2;
      const maxY = (img.offsetHeight * (scale - 1)) / 2;
      tx = Math.max(-maxX, Math.min(maxX, tx));
      ty = Math.max(-maxY, Math.min(maxY, ty));
    };
    /** Zoom to `next`, keeping the point under (cx, cy) on screen where it is. */
    const zoomAt = (next, cx, cy) => {
      const box = img.getBoundingClientRect();
      const ox = cx - (box.left + box.width / 2);
      const oy = cy - (box.top + box.height / 2);
      const ratio = next / scale;
      tx -= ox * (ratio - 1);
      ty -= oy * (ratio - 1);
      scale = next;
      if (scale <= 1.01) { scale = 1; tx = 0; ty = 0; }
      clamp();
    };
    const reset = () => { scale = 1; tx = 0; ty = 0; apply(true); };

    img.addEventListener('pointerdown', (event) => {
      img.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        drag = null;
      } else if (pointers.size === 1) {
        drag = { x: event.clientX, y: event.clientY, tx, ty, moved: false };
      }
    });
    img.addEventListener('pointermove', (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const next = Math.max(1, Math.min(MAX, pinch.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist)));
        zoomAt(next, pinch.mid.x, pinch.mid.y);
        apply();
        return;
      }
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (scale > 1) { tx = drag.tx + dx; ty = drag.ty + dy; clamp(); apply(); return; }
      // Normal size: the photo follows the finger, sideways (gallery) or down (close).
      if (Math.abs(dx) > Math.abs(dy)) { if (canStep) { tx = dx; ty = 0; apply(); } } else if (dy > 0) { tx = 0; ty = dy; apply(); img.style.opacity = String(Math.max(0.4, 1 - dy / 400)); }
    });
    const end = (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (pinch) { if (pointers.size < 2) pinch = null; if (pointers.size === 1) { const [p] = [...pointers.values()]; drag = { x: p.x, y: p.y, tx, ty, moved: true }; } return; }
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      const wasDrag = drag.moved;
      drag = null;
      if (wasDrag) {
        if (scale > 1) return; // looking around a zoomed photo
        img.style.opacity = '';
        if (canStep && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { step(dx < 0 ? 1 : -1); return; }
        if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
        reset();
        return;
      }
      // A tap: two quick ones zoom in (or back out).
      const now = Date.now();
      if (now - lastTap < 300) { lastTap = 0; if (scale > 1) reset(); else { zoomAt(2.5, event.clientX, event.clientY); apply(true); } } else lastTap = now;
    };
    img.addEventListener('pointerup', end);
    img.addEventListener('pointercancel', (event) => { pointers.delete(event.pointerId); pinch = null; drag = null; if (scale <= 1) reset(); });
    img.addEventListener('dblclick', (event) => { event.preventDefault(); });
    // A trackpad pinch arrives as Ctrl + wheel.
    img.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && scale <= 1) return;
      event.preventDefault();
      if (event.ctrlKey) zoomAt(Math.max(1, Math.min(MAX, scale * Math.exp(-event.deltaY / 200))), event.clientX, event.clientY);
      else { tx -= event.deltaX; ty -= event.deltaY; clamp(); }
      apply();
    }, { passive: false });
    return img;
  }

  function step(direction) {
    const { list } = current();
    index = (index + direction + list.length) % list.length;
    draw();
  }

  function handleKeydown(event) {
    if (event.target.closest?.('input')) { if (event.key === 'Escape') event.target.blur(); return; }
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'ArrowRight') step(1);
    else return;
    event.preventDefault();
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', handleKeydown, true);
    document.body.classList.remove('has-lightbox');
    previousFocus?.focus?.();
  }

  // Clicking the dark area around the photo closes it.
  overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target === stage) close(); });
  document.addEventListener('keydown', handleKeydown, true);
  document.body.classList.add('has-lightbox');
  document.body.append(overlay);
  draw();
  overlay.querySelector('.lightbox__close').focus();
}
