/**
 * photo-editor.js — common edits to a photo before it's posted or sent, or
 * to a photo in a vault: crop, rotate, flip, straighten, light and color,
 * and filters.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │                 (the photo)                  │   ← in Crop, drag the box or its corners
 *   └──────────────────────────────────────────────┘
 *   [Filters] [Adjust] [Crop]
 *   Filters:  Original  Vivid  Warm  Cool  Mono  Noir  Faded  Vintage
 *   Adjust:   Brightness ─●─  Contrast ─●─  Saturation ─●─  Warmth ─●─  Fade ─●─  Vignette ─●─
 *   Crop:     Free  Square  4:5  16:9  Original · ↺ Rotate  ⇋ Flip · Straighten ─●─
 *                                                    [Reset]  [Cancel]  [Done]
 *
 *   const edited = await openPhotoEditor(src);   → { src, width, height } or null (cancelled)
 *   photoEditButton(src, onEdited)               → a small "Edit" button for a thumbnail
 *
 * Only offered where the person may change the photo: their own picture
 * before posting or sending, or a vault photo they added (or, for
 * moderators, any). Edits make a new picture; nothing is changed until
 * Done (and in a vault, the original can be kept as a copy).
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';

const MAX_SIDE = 1600;

const FILTERS = [
  { id: 'none', label: 'Original', adjust: {} },
  { id: 'vivid', label: 'Vivid', adjust: { saturation: 35, contrast: 12 } },
  { id: 'warm', label: 'Warm', adjust: { warmth: 30, saturation: 8 } },
  { id: 'cool', label: 'Cool', adjust: { warmth: -30, brightness: 4 } },
  { id: 'mono', label: 'Mono', adjust: { saturation: -100 } },
  { id: 'noir', label: 'Noir', adjust: { saturation: -100, contrast: 35, brightness: -6 } },
  { id: 'faded', label: 'Faded', adjust: { fade: 35, contrast: -10, saturation: -15 } },
  { id: 'vintage', label: 'Vintage', adjust: { warmth: 25, fade: 25, saturation: -25, vignette: 35 } },
];

const SLIDERS = [
  { id: 'brightness', label: 'Brightness', min: -50, max: 50 },
  { id: 'contrast', label: 'Contrast', min: -50, max: 50 },
  { id: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { id: 'warmth', label: 'Warmth', min: -50, max: 50 },
  { id: 'fade', label: 'Fade', min: 0, max: 60 },
  { id: 'vignette', label: 'Vignette', min: 0, max: 80 },
];

const RATIOS = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'square', label: 'Square', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: 'original', label: 'Original', ratio: 'original' },
];

const ZERO = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, fade: 0, vignette: 0 };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That photo couldn’t be opened.'));
    image.src = src;
  });
}

/** Draw the photo with every edit applied. `crop` is in the rotated photo's pixels. */
function render(image, edits, { maxSide = MAX_SIDE, preview = false } = {}) {
  const { rotate, flip, straighten, crop } = edits;
  const quarter = ((rotate % 360) + 360) % 360;
  const swapped = quarter === 90 || quarter === 270;
  const baseW = swapped ? image.naturalHeight : image.naturalWidth;
  const baseH = swapped ? image.naturalWidth : image.naturalHeight;
  const area = crop ?? { x: 0, y: 0, w: baseW, h: baseH };
  const scale = Math.min(1, maxSide / Math.max(area.w, area.h));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(area.w * scale));
  out.height = Math.max(1, Math.round(area.h * scale));
  const ctx = out.getContext('2d');
  const a = { ...ZERO, ...edits.adjust };
  ctx.filter = `brightness(${100 + a.brightness}%) contrast(${100 + a.contrast}%) saturate(${100 + a.saturation}%)`;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-area.x, -area.y);
  // Rotate and straighten around the middle of the (rotated) photo; straightening zooms in to hide the corners.
  ctx.translate(baseW / 2, baseH / 2);
  const tilt = (straighten * Math.PI) / 180;
  const zoom = Math.abs(tilt) ? Math.cos(Math.abs(tilt)) + Math.sin(Math.abs(tilt)) * Math.max(baseW / baseH, baseH / baseW) : 1;
  ctx.rotate((quarter * Math.PI) / 180 + tilt);
  ctx.scale(zoom * (flip ? -1 : 1), zoom);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();
  ctx.filter = 'none';
  // Warmth: a soft orange or blue wash.
  if (a.warmth) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = a.warmth > 0 ? `rgba(255, 150, 40, ${a.warmth / 100})` : `rgba(40, 120, 255, ${-a.warmth / 100})`;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  // Fade: lift the blacks toward gray.
  if (a.fade) {
    ctx.globalCompositeOperation = 'lighten';
    ctx.fillStyle = `rgba(60, 60, 60, ${a.fade / 100})`;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  if (a.vignette) {
    ctx.globalCompositeOperation = 'source-over';
    const r = Math.hypot(out.width, out.height) / 2;
    const g = ctx.createRadialGradient(out.width / 2, out.height / 2, r * 0.45, out.width / 2, out.height / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${a.vignette / 100})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.globalCompositeOperation = 'source-over';
  void preview;
  return out;
}

export function openPhotoEditor(src, { title = 'Edit photo', doneLabel = 'Done' } = {}) {
  return new Promise(async (resolve) => {
    let image;
    try { image = await loadImage(src); } catch { resolve(null); return; }
    const edits = { rotate: 0, flip: false, straighten: 0, crop: null, adjust: { ...ZERO }, filter: 'none' };
    let tab = 'filters';
    let ratio = 'free';
    const previousFocus = document.activeElement;

    const stage = h('div', { class: 'photo-editor__stage' });
    const panelId = `photo-editor-panel-${Math.random().toString(36).slice(2, 7)}`;
    const controls = h('div', { class: 'photo-editor__controls', role: 'tabpanel', id: panelId });
    const tabs = h('div', { class: 'segmented photo-editor__tabs', role: 'tablist', 'aria-label': 'Edit' });

    const rotatedSize = () => {
      const swapped = ((edits.rotate % 360) + 360) % 360 % 180 !== 0;
      return swapped ? { w: image.naturalHeight, h: image.naturalWidth } : { w: image.naturalWidth, h: image.naturalHeight };
    };

    /** The preview: the photo with edits (without the crop while cropping, so the box shows on the whole photo). */
    function drawStage() {
      const showCrop = tab === 'crop';
      const canvas = render(image, { ...edits, crop: showCrop ? null : edits.crop }, { maxSide: 1000, preview: true });
      canvas.className = 'photo-editor__canvas';
      replaceChildren(stage, h('div', { class: 'photo-editor__frame' }, canvas, showCrop ? cropBox(canvas) : null));
    }

    /** The crop rectangle over the whole photo: drag inside to move, corners to resize. */
    function cropBox(canvas) {
      const full = rotatedSize();
      const area = edits.crop ?? { x: 0, y: 0, w: full.w, h: full.h };
      const box = h('div', { class: 'photo-editor__crop' }, ['nw', 'ne', 'sw', 'se'].map((corner) => h('span', { class: `photo-editor__handle photo-editor__handle--${corner}`, dataset: { corner } })));
      const place = () => {
        Object.assign(box.style, { left: `${(area.x / full.w) * 100}%`, top: `${(area.y / full.h) * 100}%`, width: `${(area.w / full.w) * 100}%`, height: `${(area.h / full.h) * 100}%` });
      };
      place();
      let drag = null;
      box.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        box.setPointerCapture(event.pointerId);
        drag = { corner: event.target.dataset?.corner ?? null, x: event.clientX, y: event.clientY, start: { ...area } };
      });
      box.addEventListener('pointermove', (event) => {
        if (!drag) return;
        const rect = canvas.getBoundingClientRect();
        const dx = ((event.clientX - drag.x) / rect.width) * full.w;
        const dy = ((event.clientY - drag.y) / rect.height) * full.h;
        const s = drag.start;
        const min = Math.min(full.w, full.h) * 0.08;
        const r = currentRatio();
        if (!drag.corner) {
          area.x = Math.min(full.w - s.w, Math.max(0, s.x + dx));
          area.y = Math.min(full.h - s.h, Math.max(0, s.y + dy));
        } else {
          let { x, y, w, h: hh } = s;
          if (drag.corner.includes('e')) w = s.w + dx;
          if (drag.corner.includes('w')) { w = s.w - dx; x = s.x + dx; }
          if (drag.corner.includes('s')) hh = s.h + dy;
          if (drag.corner.includes('n')) { hh = s.h - dy; y = s.y + dy; }
          w = Math.max(min, w);
          hh = Math.max(min, hh);
          if (r) {
            hh = w / r;
            if (drag.corner.includes('n')) y = s.y + s.h - hh;
          }
          x = Math.max(0, x);
          y = Math.max(0, y);
          w = Math.min(w, full.w - x);
          hh = Math.min(hh, full.h - y);
          if (r) { if (w / hh > r) w = hh * r; else hh = w / r; }
          Object.assign(area, { x, y, w, h: hh });
        }
        place();
      });
      const end = () => { if (drag) { drag = null; edits.crop = { ...area }; } };
      box.addEventListener('pointerup', end);
      box.addEventListener('pointercancel', end);
      return box;
    }

    function currentRatio() {
      const choice = RATIOS.find((r) => r.id === ratio);
      if (choice?.ratio === 'original') { const full = rotatedSize(); return full.w / full.h; }
      return choice?.ratio ?? null;
    }

    /** A centered crop at a ratio (or the whole photo for Free). */
    function applyRatio(id) {
      ratio = id;
      const full = rotatedSize();
      const r = currentRatio();
      if (!r) { edits.crop = null; return; }
      let w = full.w;
      let hh = w / r;
      if (hh > full.h) { hh = full.h; w = hh * r; }
      edits.crop = { x: (full.w - w) / 2, y: (full.h - hh) / 2, w, h: hh };
    }

    function drawControls() {
      const tabFocused = tabs.contains(document.activeElement);
      const TABS = [['filters', 'Filters'], ['adjust', 'Adjust'], ['crop', 'Crop']];
      const pick = (id) => { tab = id; drawControls(); drawStage(); };
      // Tabs: one tab stop; arrow keys move between them (and switch).
      replaceChildren(tabs, TABS.map(([id, label], i) => h('button', {
        type: 'button', role: 'tab', class: `segmented__option${tab === id ? ' is-active' : ''}`, 'aria-selected': String(tab === id),
        'aria-controls': panelId, tabindex: tab === id ? '0' : '-1',
        onClick: () => pick(id),
        onKeydown: (event) => {
          const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
          if (!step) return;
          event.preventDefault();
          pick(TABS[(i + step + TABS.length) % TABS.length][0]);
        },
      }, label)));
      controls.setAttribute('aria-label', TABS.find(([id]) => id === tab)[1]);
      if (tabFocused) tabs.querySelector('[aria-selected="true"]')?.focus();
      if (tab === 'filters') {
        const thumbSource = render(image, { ...edits, adjust: ZERO }, { maxSide: 120 });
        replaceChildren(controls, h('div', { class: 'photo-editor__filters' }, FILTERS.map((filter) => {
          const thumb = render(image, { ...edits, adjust: { ...ZERO, ...filter.adjust } }, { maxSide: 120 });
          thumb.className = 'photo-editor__filter-thumb';
          void thumbSource;
          return h('button', {
            type: 'button', class: `photo-editor__filter${edits.filter === filter.id ? ' is-on' : ''}`, 'aria-pressed': String(edits.filter === filter.id),
            onClick: () => { edits.filter = filter.id; edits.adjust = { ...ZERO, ...filter.adjust }; drawControls(); drawStage(); },
          }, thumb, h('span', {}, filter.label));
        })));
      } else if (tab === 'adjust') {
        replaceChildren(controls, h('div', { class: 'photo-editor__sliders' }, SLIDERS.map((slider) => h('label', { class: 'photo-editor__slider' },
          h('span', {}, slider.label),
          h('input', {
            type: 'range', min: String(slider.min), max: String(slider.max), value: String(edits.adjust[slider.id] ?? 0), 'aria-label': slider.label,
            onInput: (event) => { edits.adjust[slider.id] = Number(event.target.value); edits.filter = 'custom'; scheduleStage(); },
            onDblclick: (event) => { event.target.value = '0'; edits.adjust[slider.id] = 0; drawStage(); },
          })))));
      } else {
        replaceChildren(controls,
          h('div', { class: 'photo-editor__row' }, RATIOS.map((r) => h('button', {
            type: 'button', class: `chip photo-editor__ratio${ratio === r.id ? ' is-on' : ''}`, 'aria-pressed': String(ratio === r.id),
            onClick: () => { applyRatio(r.id); drawControls(); drawStage(); },
          }, r.label))),
          h('div', { class: 'photo-editor__row' },
            h('button', { type: 'button', class: 'button button--small', 'aria-label': 'Rotate left a quarter turn', onClick: () => { edits.rotate = (edits.rotate - 90 + 360) % 360; edits.crop = null; ratio = 'free'; drawControls(); drawStage(); } }, h('span', { 'aria-hidden': 'true' }, '↺'), ' Rotate'),
            h('button', { type: 'button', class: 'button button--small', 'aria-label': 'Flip left to right', 'aria-pressed': String(edits.flip), onClick: (event) => { edits.flip = !edits.flip; event.currentTarget.setAttribute('aria-pressed', String(edits.flip)); drawStage(); } }, h('span', { 'aria-hidden': 'true' }, '⇋'), ' Flip'),
            h('label', { class: 'photo-editor__slider photo-editor__slider--inline' }, h('span', {}, 'Straighten'),
              h('input', { type: 'range', min: '-15', max: '15', step: '0.5', value: String(edits.straighten), 'aria-label': 'Straighten', onInput: (event) => { edits.straighten = Number(event.target.value); scheduleStage(); } }))));
      }
    }

    let pending = false;
    function scheduleStage() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; drawStage(); });
    }

    const finish = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      previousFocus?.focus?.();
      resolve(result);
    };
    const untouched = () => !edits.rotate && !edits.flip && !edits.straighten && !edits.crop && Object.values(edits.adjust).every((v) => !v);
    const done = () => {
      if (untouched()) { finish({ src, width: image.naturalWidth, height: image.naturalHeight, unchanged: true }); return; }
      const canvas = render(image, edits);
      finish({ src: canvas.toDataURL('image/jpeg', 0.88), width: canvas.width, height: canvas.height });
    };
    const reset = () => {
      Object.assign(edits, { rotate: 0, flip: false, straighten: 0, crop: null, adjust: { ...ZERO }, filter: 'none' });
      ratio = 'free';
      drawControls();
      drawStage();
    };

    const overlay = h('div', { class: 'sub-viewer photo-editor', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sub-viewer__panel photo-editor__panel' },
        h('div', { class: 'sub-viewer__top' },
          h('h2', { class: 'sub-viewer__title' }, icon('image', 18), ` ${title}`),
          h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Cancel', onClick: () => finish(null) }, icon('close', 18))),
        stage, tabs, controls,
        h('div', { class: 'form-row photo-editor__actions' },
          h('button', { type: 'button', class: 'link-button', onClick: reset }, 'Reset'),
          h('span', { class: 'photo-editor__spacer' }),
          h('button', { type: 'button', class: 'button button--quiet', onClick: () => finish(null) }, 'Cancel'),
          h('button', { type: 'button', class: 'button button--primary', onClick: done }, doneLabel))));
    function onKey(event) {
      if (event.key === 'Escape') { event.stopPropagation(); finish(null); return; }
      // Keep Tab inside the editor while it's open.
      if (event.key === 'Tab') {
        const focusable = [...overlay.querySelectorAll('button:not([disabled]), input, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    drawControls();
    drawStage();
    overlay.querySelector('.photo-editor__actions .button--primary')?.focus();
  });
}

/** A small pencil button on a photo thumbnail that opens the editor. */
export function photoEditButton(getSrc, onEdited, { className = '' } = {}) {
  return h('button', {
    type: 'button', class: `photo-edit-button ${className}`, 'aria-label': 'Edit photo', title: 'Edit photo',
    onClick: async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const edited = await openPhotoEditor(typeof getSrc === 'function' ? getSrc() : getSrc);
      if (edited) onEdited(edited);
    },
  }, icon('pencil', 12));
}
