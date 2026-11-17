// @ts-check
/**
 * canvas-editor.js — drawing and painting, like a small Paint or
 * Photoshop: the Canvas module's full page.
 *
 *   [↶][↷] | 🖌 Brush ✏ Pencil ⌫ Eraser ╱ Line ▭ Box ◯ Ellipse 🪣 Fill T Text 💧 Pick ✋ Move ⧉ Crop | ✨ Adjust
 *   Color [■] ■■■■■■■■  Size ──●──  Opacity ──●──  ☐ Filled shapes
 *
 * Photo editing:
 *   Crop        drag over the part to keep (Free, Square, 4:5, 16:9), then Crop;
 *               "Rotate canvas" turns the whole picture a quarter turn
 *   Adjust      the selected layer: filters (Vivid, Warm, Cool, Mono, Noir, Sepia,
 *               Invert), Brightness, Contrast, Saturation, Warmth, Hue, Blur,
 *               Sharpen, and Rotate ↺ ↻, Flip ⇋ ⇵, Scale, Straighten; a live
 *               preview, then Apply (or Cancel)
 *   Edit a photo  starts over with a photo at its own size (up to 2400 px)
 *   ┌──────────────────────────────────────┐ ┌ Layers ─────────┐
 *   │                                      │ │ 👁 Sketch    ●   │
 *   │            (the drawing)             │ │ 👁 Color         │
 *   │                                      │ │ 👁 Background    │
 *   └──────────────────────────────────────┘ │ + Layer  Opacity │
 *   [Fit][100%][+][−]   Add picture  Download PNG    [Save]      └──────────────┘
 *
 * Layers are separate canvases stacked on top of each other; tools draw
 * on the selected one. Pens use pressure where the device reports it.
 * Undo keeps the last 40 steps. Saving keeps each layer (PNG) and a
 * flattened picture for the homepage card (canvas-module.js).
 *
 *   openCanvasEditor(container, { data, canEdit, onSave })
 */

import { h, replaceChildren, makeId } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';

const TOOLS = [
  { id: 'brush', label: 'Brush', icon: 'brush', key: 'b' },
  { id: 'pencil', label: 'Pencil', icon: 'pencil', key: 'p' },
  { id: 'eraser', label: 'Eraser', icon: 'eraser', key: 'e' },
  { id: 'line', label: 'Line', icon: 'line', key: 'l' },
  { id: 'rect', label: 'Box', icon: 'rect', key: 'r' },
  { id: 'ellipse', label: 'Ellipse', icon: 'ellipse', key: 'o' },
  { id: 'fill', label: 'Fill', icon: 'fill', key: 'g' },
  { id: 'text', label: 'Text', icon: 'textTool', key: 't' },
  { id: 'pick', label: 'Pick a color', icon: 'dropper', key: 'i' },
  { id: 'move', label: 'Move the layer', icon: 'hand', key: 'v' },
  { id: 'crop', label: 'Crop', icon: 'crop', key: 'c' },
];
const MAX_PHOTO_SIDE = 2400;
/** @type {[string, string, number | null][]} */
const CROP_RATIOS = [['free', 'Free', null], ['square', 'Square', 1], ['4:5', '4:5', 4 / 5], ['16:9', '16:9', 16 / 9]];
const ADJUST_FILTERS = [
  { id: 'none', label: 'Original', set: {} },
  { id: 'vivid', label: 'Vivid', set: { saturation: 35, contrast: 12 } },
  { id: 'warm', label: 'Warm', set: { warmth: 30, saturation: 8 } },
  { id: 'cool', label: 'Cool', set: { warmth: -30, brightness: 4 } },
  { id: 'mono', label: 'Mono', set: { saturation: -100 } },
  { id: 'noir', label: 'Noir', set: { saturation: -100, contrast: 35, brightness: -6 } },
  { id: 'sepia', label: 'Sepia', set: { sepia: true } },
  { id: 'invert', label: 'Invert', set: { invert: true } },
];
const ADJUST_SLIDERS = [
  ['brightness', 'Brightness', -100, 100], ['contrast', 'Contrast', -100, 100], ['saturation', 'Saturation', -100, 100],
  ['warmth', 'Warmth', -60, 60], ['hue', 'Hue', -180, 180], ['blur', 'Blur', 0, 20], ['sharpen', 'Sharpen', 0, 100],
];
const ADJUST_ZERO = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, hue: 0, blur: 0, sharpen: 0, sepia: false, invert: false, filter: 'none', turn: 0, flipX: false, flipY: false, scale: 100, angle: 0 };

/** Light and color, pixel by pixel (works in every browser). */
export function adjustPixels(image, e) {
  const px = image.data;
  const contrast = (e.contrast * 1.28);
  const cf = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const sat = 1 + e.saturation / 100;
  const bright = e.brightness * 1.5;
  const warm = e.warmth * 0.6;
  // Hue rotation matrix.
  const a = (e.hue * Math.PI) / 180;
  const cos = Math.cos(a); const sin = Math.sin(a);
  const m = e.hue ? [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ] : null;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    let r = px[i]; let g = px[i + 1]; let b = px[i + 2];
    if (m) { const r0 = r; const g0 = g; const b0 = b; r = m[0] * r0 + m[1] * g0 + m[2] * b0; g = m[3] * r0 + m[4] * g0 + m[5] * b0; b = m[6] * r0 + m[7] * g0 + m[8] * b0; }
    r += bright; g += bright; b += bright;
    r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * sat; g = gray + (g - gray) * sat; b = gray + (b - gray) * sat;
    r += warm; b -= warm;
    if (e.sepia) { const r0 = r; const g0 = g; const b0 = b; r = 0.393 * r0 + 0.769 * g0 + 0.189 * b0; g = 0.349 * r0 + 0.686 * g0 + 0.168 * b0; b = 0.272 * r0 + 0.534 * g0 + 0.131 * b0; }
    if (e.invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
    px[i] = r; px[i + 1] = g; px[i + 2] = b; // Uint8ClampedArray clamps
  }
  return image;
}

/** Sharpen: an unsharp 3×3 kernel, `amount` 0–100. */
function sharpenPixels(image, amount, w, hgt) {
  const src = new Uint8ClampedArray(image.data);
  const px = image.data;
  const k = amount / 100;
  for (let y = 1; y < hgt - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = (y * w + x) * 4;
      if (src[i + 3] === 0) continue;
      for (let c = 0; c < 3; c += 1) {
        const v = src[i + c] * (1 + 4 * k) - k * (src[i - 4 + c] + src[i + 4 + c] + src[i - w * 4 + c] + src[i + w * 4 + c]);
        px[i + c] = v;
      }
    }
  }
  return image;
}
const SWATCHES = ['#000000', '#ffffff', '#7f7f7f', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41'];
const MAX_UNDO = 40;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function openCanvasEditor(container, { data, canEdit, onSave }) {
  let width = data.width ?? 1200;
  let height = data.height ?? 800;
  const state = {
    tool: 'brush', color: '#1e88e5', size: 8, opacity: 1, filled: false,
    zoom: 1, fit: true, dirty: false,
    layers: [], active: null,
    undo: [], redo: [],
    crop: null, cropRatio: 'free', // the crop box, in canvas pixels
    adjusting: null, // { layer, snapshot, edits } while the Adjust panel is open
  };

  const stack = h('div', { class: 'canvas-editor__stack', style: { width: `${width}px`, height: `${height}px` } });
  const overlay = h('canvas', { class: 'canvas-editor__overlay', width, height }); // shape previews
  const viewport = h('div', { class: 'canvas-editor__viewport' }, h('div', { class: 'canvas-editor__paper' }, stack));
  const layersList = h('ul', { class: 'canvas-editor__layers' });
  const toolbar = h('div', { class: 'canvas-editor__tools', role: 'toolbar', 'aria-label': 'Tools' });
  const options = h('div', { class: 'canvas-editor__options' });
  const zoomLabel = h('span', { class: 'canvas-editor__zoom-label' });
  const saveButton = h('button', { type: 'button', class: 'button button--primary button--small', disabled: !canEdit, onClick: () => save() }, 'Save');

  // ─── Layers ────────────────────────────────────────────────────────────────

  function makeLayer(name, { fillWhite = false } = {}) {
    const canvas = h('canvas', { class: 'canvas-editor__layer', width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (fillWhite) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
    return { id: makeId('layer'), name, visible: true, opacity: 1, canvas, ctx };
  }

  function arrange() {
    stack.replaceChildren(...state.layers.map((layer) => {
      layer.canvas.style.opacity = String(layer.opacity);
      layer.canvas.style.visibility = layer.visible ? 'visible' : 'hidden';
      return layer.canvas;
    }), overlay);
    drawLayers();
  }

  const activeLayer = () => state.layers.find((l) => l.id === state.active) ?? state.layers[state.layers.length - 1];

  function drawLayers() {
    replaceChildren(layersList, [...state.layers].reverse().map((layer) => {
      const index = state.layers.indexOf(layer);
      const isActive = layer.id === activeLayer()?.id;
      return h('li', { class: `canvas-editor__layer-row${isActive ? ' is-active' : ''}` },
        h('button', {
          type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`,
          onClick: () => { layer.visible = !layer.visible; arrange(); },
        }, icon(layer.visible ? 'eye' : 'eyeOff', 14)),
        h('input', {
          type: 'text', class: 'canvas-editor__layer-name', value: layer.name, 'aria-label': 'Layer name',
          onFocus: () => { state.active = layer.id; drawLayers(); },
          onChange: (event) => { layer.name = event.target.value.trim() || layer.name; state.dirty = true; },
        }),
        h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': `Move ${layer.name} up`, disabled: index === state.layers.length - 1, onClick: () => moveLayer(layer, 1) }, icon('chevronUp', 13)),
        h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': `Move ${layer.name} down`, disabled: index === 0, onClick: () => moveLayer(layer, -1) }, icon('chevronDown', 13)),
        h('button', { type: 'button', class: 'canvas-editor__layer-pick', 'aria-label': `Draw on ${layer.name}`, 'aria-pressed': String(isActive), onClick: () => { state.active = layer.id; drawLayers(); } }));
    }),
    h('li', { class: 'canvas-editor__layer-tools' },
      h('button', { type: 'button', class: 'link-button', onClick: () => addLayer() }, icon('plus', 12), ' Layer'),
      h('button', { type: 'button', class: 'link-button link-button--danger', disabled: state.layers.length <= 1, onClick: () => deleteLayer() }, 'Delete'),
      h('label', { class: 'canvas-editor__layer-opacity' }, 'Opacity ',
        h('input', {
          type: 'range', min: '0', max: '100', value: String(Math.round((activeLayer()?.opacity ?? 1) * 100)), 'aria-label': 'Layer opacity',
          onInput: (event) => { const layer = activeLayer(); layer.opacity = Number(event.target.value) / 100; layer.canvas.style.opacity = String(layer.opacity); state.dirty = true; },
        }))));
  }

  function addLayer() {
    const layer = makeLayer(`Layer ${state.layers.length + 1}`);
    const index = state.layers.indexOf(activeLayer()) + 1;
    state.layers.splice(index, 0, layer);
    state.active = layer.id;
    state.dirty = true;
    arrange();
  }
  function deleteLayer() {
    if (state.layers.length <= 1) return;
    const layer = activeLayer();
    state.layers = state.layers.filter((l) => l !== layer);
    state.undo = state.undo.filter((u) => u.layer !== layer);
    state.active = state.layers[state.layers.length - 1].id;
    state.dirty = true;
    arrange();
  }
  function moveLayer(layer, delta) {
    const from = state.layers.indexOf(layer);
    const to = from + delta;
    if (to < 0 || to >= state.layers.length) return;
    state.layers.splice(to, 0, state.layers.splice(from, 1)[0]);
    state.dirty = true;
    arrange();
  }

  // ─── Undo ──────────────────────────────────────────────────────────────────

  function remember(layer = activeLayer()) {
    state.undo.push({ layer, image: layer.ctx.getImageData(0, 0, width, height) });
    if (state.undo.length > MAX_UNDO) state.undo.shift();
    state.redo = [];
    state.dirty = true;
  }
  /** Every layer and the canvas size: for steps that change the size (crop, rotate, a new photo). */
  const snapshotAll = () => ({ all: state.layers.map((layer) => ({ layer, image: layer.ctx.getImageData(0, 0, width, height) })), width, height });
  function rememberAll() {
    state.undo.push(snapshotAll());
    if (state.undo.length > MAX_UNDO) state.undo.shift();
    state.redo = [];
    state.dirty = true;
  }
  function stepBack(from, to) {
    if (state.adjusting) cancelAdjust();
    const step = from.pop();
    if (!step) return;
    if (step.all) {
      to.push(snapshotAll());
      setSize(step.width, step.height);
      for (const { layer, image } of step.all) if (state.layers.includes(layer)) layer.ctx.putImageData(image, 0, 0);
      state.dirty = true;
      return;
    }
    if (!state.layers.includes(step.layer)) return;
    to.push({ layer: step.layer, image: step.layer.ctx.getImageData(0, 0, width, height) });
    step.layer.ctx.putImageData(step.image, 0, 0);
    state.dirty = true;
  }

  /** Change the canvas size (layers are cleared: the caller redraws them). */
  function setSize(w, hgt) {
    width = Math.max(1, Math.round(w));
    height = Math.max(1, Math.round(hgt));
    for (const layer of state.layers) { layer.canvas.width = width; layer.canvas.height = height; }
    overlay.width = width;
    overlay.height = height;
    stack.style.width = `${width}px`;
    stack.style.height = `${height}px`;
    applyZoom();
  }

  /** Copies of every layer, then a new size, then `draw(ctx, copy)` for each. */
  function reshape(w, hgt, draw) {
    rememberAll();
    const copies = state.layers.map((layer) => { const c = h('canvas', { width, height }); c.getContext('2d').drawImage(layer.canvas, 0, 0); return c; });
    setSize(w, hgt);
    state.layers.forEach((layer, i) => draw(layer.ctx, copies[i]));
  }

  // ─── Drawing ───────────────────────────────────────────────────────────────

  const pointOf = (event) => {
    const rect = stack.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * width, y: ((event.clientY - rect.top) / rect.height) * height, pressure: event.pressure || 0.5 };
  };
  const overlayCtx = overlay.getContext('2d');
  let stroke = null;

  function setStroke(ctx, pressure = 0.5) {
    ctx.globalAlpha = state.opacity;
    ctx.strokeStyle = state.color;
    ctx.fillStyle = state.color;
    ctx.lineCap = state.tool === 'pencil' ? 'square' : 'round';
    ctx.lineJoin = 'round';
    const scale = state.tool === 'brush' ? 0.4 + pressure * 1.2 : 1;
    ctx.lineWidth = Math.max(1, state.size * scale);
    ctx.globalCompositeOperation = state.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.imageSmoothingEnabled = state.tool !== 'pencil';
  }

  function shapePath(ctx, a, b) {
    ctx.beginPath();
    if (state.tool === 'line') { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    if (state.tool === 'rect') ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    if (state.tool === 'ellipse') ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    if (state.filled && state.tool !== 'line') ctx.fill(); else ctx.stroke();
  }

  stack.addEventListener('pointerdown', (event) => {
    if (!canEdit || event.button > 0 || state.adjusting) return;
    if (state.tool === 'crop') {
      stack.setPointerCapture(event.pointerId);
      const point = pointOf(event);
      stroke = { start: point, crop: true };
      state.crop = { x: point.x, y: point.y, w: 0, h: 0 };
      drawCrop();
      return;
    }
    const layer = activeLayer();
    if (!layer.visible) { showToast('That layer is hidden. Show it to draw on it.'); return; }
    const point = pointOf(event);
    if (state.tool === 'pick') { pickColor(point); return; }
    if (state.tool === 'fill') { remember(); floodFill(layer.ctx, Math.round(point.x), Math.round(point.y), state.color); return; }
    if (state.tool === 'text') { event.preventDefault(); placeText(point); return; }
    stack.setPointerCapture(event.pointerId);
    remember();
    if (state.tool === 'move') {
      stroke = { start: point, snapshot: layer.ctx.getImageData(0, 0, width, height) };
      return;
    }
    stroke = { start: point, last: point };
    if (['brush', 'pencil', 'eraser'].includes(state.tool)) {
      setStroke(layer.ctx, point.pressure);
      layer.ctx.beginPath();
      layer.ctx.arc(point.x, point.y, layer.ctx.lineWidth / 2, 0, Math.PI * 2);
      if (state.tool === 'eraser') layer.ctx.fill(); else { layer.ctx.fillStyle = state.color; layer.ctx.fill(); }
    }
  });
  stack.addEventListener('pointermove', (event) => {
    if (!stroke) return;
    const layer = activeLayer();
    const point = pointOf(event);
    if (stroke.crop) {
      const ratio = CROP_RATIOS.find((r) => r[0] === state.cropRatio)?.[2];
      const w = point.x - stroke.start.x;
      let hh = point.y - stroke.start.y;
      if (ratio) hh = Math.sign(hh || 1) * Math.abs(w) / ratio;
      const x = Math.max(0, Math.min(stroke.start.x, stroke.start.x + w));
      const y = Math.max(0, Math.min(stroke.start.y, stroke.start.y + hh));
      state.crop = { x, y, w: Math.min(Math.abs(w), width - x), h: Math.min(Math.abs(hh), height - y) };
      drawCrop();
      return;
    }
    if (state.tool === 'move') {
      layer.ctx.clearRect(0, 0, width, height);
      layer.ctx.putImageData(stroke.snapshot, Math.round(point.x - stroke.start.x), Math.round(point.y - stroke.start.y));
      return;
    }
    if (['brush', 'pencil', 'eraser'].includes(state.tool)) {
      for (const e of event.getCoalescedEvents?.() ?? [event]) {
        const p = pointOf(e);
        setStroke(layer.ctx, p.pressure);
        layer.ctx.beginPath();
        layer.ctx.moveTo(stroke.last.x, stroke.last.y);
        layer.ctx.lineTo(p.x, p.y);
        layer.ctx.stroke();
        stroke.last = p;
      }
      return;
    }
    // Shapes: preview on the overlay until you let go.
    overlayCtx.clearRect(0, 0, width, height);
    setStroke(overlayCtx);
    overlayCtx.globalCompositeOperation = 'source-over';
    shapePath(overlayCtx, stroke.start, point);
    stroke.last = point;
  });
  const finish = () => {
    if (!stroke) return;
    if (stroke.crop) { stroke = null; if (state.crop && (state.crop.w < 4 || state.crop.h < 4)) state.crop = null; drawCrop(); drawOptions(); return; }
    if (['line', 'rect', 'ellipse'].includes(state.tool)) {
      overlayCtx.clearRect(0, 0, width, height);
      const layer = activeLayer();
      setStroke(layer.ctx);
      shapePath(layer.ctx, stroke.start, stroke.last);
    }
    activeLayer().ctx.globalCompositeOperation = 'source-over';
    activeLayer().ctx.globalAlpha = 1;
    stroke = null;
  };
  stack.addEventListener('pointerup', finish);
  stack.addEventListener('pointercancel', finish);

  function pickColor(point) {
    const flat = flatten();
    const [r, g, b] = flat.getContext('2d').getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
    state.color = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    state.tool = 'brush';
    drawToolbar();
    drawOptions();
  }

  function placeText(point) {
    const rect = stack.getBoundingClientRect();
    const input = h('input', {
      type: 'text', class: 'canvas-editor__text-input', placeholder: 'Type, then Enter',
      style: { left: `${(point.x / width) * rect.width}px`, top: `${(point.y / height) * rect.height}px`, color: state.color, fontSize: `${Math.max(12, state.size * 3 * (rect.width / width))}px` },
    });
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      input.remove();
      if (!text) return;
      remember();
      const ctx = activeLayer().ctx;
      ctx.globalAlpha = state.opacity;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = state.color;
      ctx.font = `${Math.max(12, state.size * 3)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textBaseline = 'top';
      ctx.fillText(text, point.x, point.y);
      ctx.globalAlpha = 1;
    };
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') { done = true; input.remove(); } event.stopPropagation(); });
    input.addEventListener('blur', commit);
    stack.parentElement.append(input);
    // After the click that placed it has finished (so it keeps the focus).
    setTimeout(() => input.focus(), 0);
  }

  /** Fill the area of one color that you clicked, like a paint bucket. */
  function floodFill(ctx, x, y, hex) {
    const image = ctx.getImageData(0, 0, width, height);
    const px = image.data;
    const at = (x * 1 + y * width) * 4;
    const target = [px[at], px[at + 1], px[at + 2], px[at + 3]];
    const fill = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), Math.round(state.opacity * 255)];
    if (target.every((v, i) => Math.abs(v - fill[i]) < 2)) return;
    const near = (i) => Math.abs(px[i] - target[0]) + Math.abs(px[i + 1] - target[1]) + Math.abs(px[i + 2] - target[2]) + Math.abs(px[i + 3] - target[3]) < 60;
    const seen = new Uint8Array(width * height);
    const queue = [[x, y]];
    while (queue.length) {
      const [cx, cy] = queue.pop();
      let left = cx;
      while (left >= 0 && !seen[cy * width + left] && near((cy * width + left) * 4)) left -= 1;
      left += 1;
      let up = false;
      let down = false;
      for (let ix = left; ix < width; ix += 1) {
        const index = cy * width + ix;
        if (seen[index] || !near(index * 4)) break;
        seen[index] = 1;
        px.set(fill, index * 4);
        if (cy > 0) { const n = index - width; const ok = !seen[n] && near(n * 4); if (ok && !up) { queue.push([ix, cy - 1]); up = true; } else if (!ok) up = false; }
        if (cy < height - 1) { const n = index + width; const ok = !seen[n] && near(n * 4); if (ok && !down) { queue.push([ix, cy + 1]); down = true; } else if (!ok) down = false; }
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  /** All visible layers as one picture. */
  function flatten() {
    const out = h('canvas', { width, height });
    const ctx = out.getContext('2d');
    for (const layer of state.layers) {
      if (!layer.visible) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layer.canvas, 0, 0);
    }
    return out;
  }

  // ─── Crop and rotate the canvas ─────────────────────────────────────────────

  function drawCrop() {
    overlayCtx.clearRect(0, 0, width, height);
    const c = state.crop;
    if (!c || state.tool !== 'crop') return;
    overlayCtx.save();
    overlayCtx.fillStyle = 'rgba(0,0,0,0.5)';
    overlayCtx.fillRect(0, 0, width, height);
    overlayCtx.clearRect(c.x, c.y, c.w, c.h);
    overlayCtx.strokeStyle = '#fff';
    overlayCtx.lineWidth = Math.max(1, width / 600);
    overlayCtx.setLineDash([8, 6]);
    overlayCtx.strokeRect(c.x, c.y, c.w, c.h);
    overlayCtx.restore();
  }
  function applyCrop() {
    const c = state.crop;
    if (!c) return;
    state.crop = null;
    overlayCtx.clearRect(0, 0, width, height);
    reshape(c.w, c.h, (ctx, copy) => ctx.drawImage(copy, -Math.round(c.x), -Math.round(c.y)));
    showToast(`Cropped to ${width} × ${height}.`);
    drawOptions();
  }
  /** Turn the whole picture a quarter turn (1 = clockwise, -1 = counterclockwise). */
  function rotateCanvas(direction) {
    const oldW = width; const oldH = height;
    reshape(oldH, oldW, (ctx, copy) => {
      ctx.save();
      ctx.translate(oldH / 2, oldW / 2);
      ctx.rotate((direction * Math.PI) / 2);
      ctx.drawImage(copy, -oldW / 2, -oldH / 2);
      ctx.restore();
    });
  }

  // ─── Adjust a layer: filters, light and color, transform ──────────────────

  function startAdjust() {
    const layer = activeLayer();
    if (!layer) return;
    if (!layer.visible) { showToast('That layer is hidden. Show it to adjust it.'); return; }
    const snapshot = h('canvas', { width, height });
    snapshot.getContext('2d').drawImage(layer.canvas, 0, 0);
    state.adjusting = { layer, snapshot, before: layer.ctx.getImageData(0, 0, width, height), edits: { ...ADJUST_ZERO } };
    state.crop = null;
    drawCrop();
    drawToolbar();
    drawOptions();
  }
  let previewQueued = false;
  function previewAdjust() {
    if (previewQueued) return;
    previewQueued = true;
    requestAnimationFrame(() => { previewQueued = false; if (state.adjusting) renderAdjusted(); });
  }
  function renderAdjusted() {
    const { layer, snapshot, edits: e } = state.adjusting;
    const ctx = layer.ctx;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2);
    ctx.rotate(((e.turn * 90 + e.angle) * Math.PI) / 180);
    ctx.scale((e.flipX ? -1 : 1) * (e.scale / 100), (e.flipY ? -1 : 1) * (e.scale / 100));
    if (e.blur && 'filter' in ctx) ctx.filter = `blur(${e.blur}px)`;
    ctx.drawImage(snapshot, -width / 2, -height / 2);
    ctx.restore();
    const needsPixels = e.brightness || e.contrast || e.saturation || e.warmth || e.hue || e.sepia || e.invert || e.sharpen;
    if (needsPixels) {
      let image = ctx.getImageData(0, 0, width, height);
      if (e.sharpen) image = sharpenPixels(image, e.sharpen, width, height);
      ctx.putImageData(adjustPixels(image, e), 0, 0);
    }
  }
  function applyAdjust() {
    const { layer, before } = state.adjusting;
    state.undo.push({ layer, image: before });
    if (state.undo.length > MAX_UNDO) state.undo.shift();
    state.redo = [];
    state.dirty = true;
    state.adjusting = null;
    drawToolbar();
    drawOptions();
    showToast('Applied.');
  }
  function cancelAdjust() {
    const { layer, before } = state.adjusting;
    layer.ctx.putImageData(before, 0, 0);
    state.adjusting = null;
    drawToolbar();
    drawOptions();
  }

  function drawAdjustPanel() {
    const e = state.adjusting.edits;
    const set = (patch) => { Object.assign(e, patch); previewAdjust(); };
    const slider = ([key, label, min, max]) => {
      if (key === 'blur' && !('filter' in state.adjusting.layer.ctx)) return null; // older Safari: no canvas blur
      const value = h('span', { class: 'canvas-editor__value' }, String(e[key]));
      return h('label', { class: 'canvas-editor__slider canvas-adjust__slider' }, `${label} `,
        h('input', { type: 'range', min: String(min), max: String(max), value: String(e[key]), 'aria-label': label,
          onInput: (event) => { value.textContent = event.target.value; set({ [key]: Number(event.target.value) }); } }),
        value);
    };
    return h('div', { class: 'canvas-adjust' },
      h('div', { class: 'canvas-adjust__row' },
        h('strong', { class: 'canvas-adjust__title' }, `Adjust “${state.adjusting.layer.name}”`),
        h('span', { class: 'canvas-adjust__filters', role: 'group', 'aria-label': 'Filters' }, ADJUST_FILTERS.map((f) => h('button', {
          type: 'button', class: `canvas-adjust__chip${e.filter === f.id ? ' is-on' : ''}`, 'aria-pressed': String(e.filter === f.id),
          onClick: () => { Object.assign(e, { brightness: 0, contrast: 0, saturation: 0, warmth: 0, sepia: false, invert: false }, f.set, { filter: f.id }); drawOptions(); previewAdjust(); },
        }, f.label)))),
      h('div', { class: 'canvas-adjust__row' }, ADJUST_SLIDERS.map(slider)),
      h('div', { class: 'canvas-adjust__row' },
        h('button', { type: 'button', class: 'button button--small', 'aria-label': 'Rotate left', onClick: () => set({ turn: (e.turn + 3) % 4 }) }, '↺ Rotate'),
        h('button', { type: 'button', class: 'button button--small', 'aria-label': 'Rotate right', onClick: () => set({ turn: (e.turn + 1) % 4 }) }, '↻'),
        h('button', { type: 'button', class: 'button button--small', 'aria-pressed': String(e.flipX), onClick: () => { set({ flipX: !e.flipX }); } }, '⇋ Flip'),
        h('button', { type: 'button', class: 'button button--small', 'aria-label': 'Flip upside down', 'aria-pressed': String(e.flipY), onClick: () => { set({ flipY: !e.flipY }); } }, '⇵'),
        slider(['scale', 'Scale', 10, 300]),
        slider(['angle', 'Straighten', -45, 45]),
        h('span', { class: 'canvas-editor__spacer' }),
        h('button', { type: 'button', class: 'button button--small button--quiet', onClick: () => { Object.assign(e, ADJUST_ZERO); drawOptions(); previewAdjust(); } }, 'Reset'),
        h('button', { type: 'button', class: 'button button--small', onClick: cancelAdjust }, 'Cancel'),
        h('button', { type: 'button', class: 'button button--small button--primary', onClick: applyAdjust }, 'Apply')));
  }

  /** Start over from a photo, at its own size (the canvas takes the photo's shape). */
  const photoInput = h('input', {
    type: 'file', accept: 'image/*', hidden: true,
    onChange: async () => {
      const [file] = photoInput.files;
      photoInput.value = '';
      if (!file) return;
      const url = URL.createObjectURL(file);
      const image = await loadImage(url);
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      const w = Math.round(image.naturalWidth * scale);
      const hh = Math.round(image.naturalHeight * scale);
      if (state.adjusting) cancelAdjust();
      reshape(w, hh, () => {});
      const photo = state.layers[0];
      photo.name = file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Photo';
      photo.ctx.drawImage(image, 0, 0, w, hh);
      state.active = photo.id;
      arrange();
      showToast(`Opened at ${w} × ${hh}. Undo brings back what was here.`);
    },
  });

  // ─── Pictures, zoom, saving ────────────────────────────────────────────────

  const pictureInput = h('input', {
    type: 'file', accept: 'image/*', hidden: true,
    onChange: async () => {
      const [file] = pictureInput.files;
      pictureInput.value = '';
      if (!file) return;
      const url = URL.createObjectURL(file);
      const image = await loadImage(url);
      URL.revokeObjectURL(url);
      const layer = makeLayer(file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Picture');
      const scale = Math.min(1, width / image.naturalWidth, height / image.naturalHeight);
      const w = image.naturalWidth * scale;
      const hh = image.naturalHeight * scale;
      layer.ctx.drawImage(image, (width - w) / 2, (height - hh) / 2, w, hh);
      state.layers.push(layer);
      state.active = layer.id;
      state.dirty = true;
      arrange();
      showToast('Added as its own layer. Move places it; Adjust resizes, rotates, and edits it.');
    },
  });

  function applyZoom() {
    const paper = viewport.firstChild;
    let zoom = state.zoom;
    if (state.fit) {
      const available = viewport.clientWidth - 24;
      const availableH = Math.max(240, window.innerHeight - viewport.getBoundingClientRect().top - 90);
      zoom = Math.min(1, available / width, availableH / height);
    }
    stack.style.transform = `scale(${zoom})`;
    paper.style.width = `${width * zoom}px`;
    paper.style.height = `${height * zoom}px`;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }
  const resizeObserver = new ResizeObserver(() => applyZoom());
  resizeObserver.observe(viewport);

  async function save() {
    const flat = flatten();
    const preview = h('canvas', { width: Math.min(800, width), height: Math.round(Math.min(800, width) * (height / width)) });
    preview.getContext('2d').drawImage(flat, 0, 0, preview.width, preview.height);
    onSave({
      width, height,
      layers: state.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, src: l.canvas.toDataURL('image/png') })),
      image: preview.toDataURL('image/png'),
      savedAt: Date.now(),
    });
    state.dirty = false;
    showToast('Saved.');
  }

  function download() {
    const link = h('a', { href: flatten().toDataURL('image/png'), download: `${(data.title || 'canvas').replace(/[^\w-]+/g, '-')}.png` });
    link.click();
  }

  // ─── Toolbar and options ───────────────────────────────────────────────────

  function drawToolbar() {
    replaceChildren(toolbar,
      h('button', { type: 'button', class: 'canvas-editor__tool', 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', onClick: () => stepBack(state.undo, state.redo) }, icon('undo', 16)),
      h('button', { type: 'button', class: 'canvas-editor__tool', 'aria-label': 'Redo', title: 'Redo (Ctrl+Shift+Z)', onClick: () => stepBack(state.redo, state.undo) }, icon('redo', 16)),
      h('span', { class: 'canvas-editor__divider' }),
      TOOLS.map((tool) => h('button', {
        type: 'button', class: `canvas-editor__tool${state.tool === tool.id && !state.adjusting ? ' is-active' : ''}`,
        'aria-label': tool.label, 'aria-pressed': String(state.tool === tool.id && !state.adjusting), title: `${tool.label} (${tool.key.toUpperCase()})`,
        onClick: () => selectTool(tool.id),
      }, icon(tool.icon, 16))),
      h('span', { class: 'canvas-editor__divider' }),
      h('button', {
        type: 'button', class: `canvas-editor__tool canvas-editor__tool--wide${state.adjusting ? ' is-active' : ''}`, 'aria-pressed': String(Boolean(state.adjusting)),
        title: 'Filters, light and color, rotate, flip, and resize the selected layer',
        onClick: () => (state.adjusting ? cancelAdjust() : startAdjust()),
      }, icon('sparkle', 16), ' Adjust'));
    stack.dataset.tool = state.adjusting ? 'adjust' : state.tool;
  }

  function selectTool(id) {
    if (state.adjusting) cancelAdjust();
    state.tool = id;
    if (id !== 'crop') state.crop = null;
    drawCrop();
    drawToolbar();
    drawOptions();
  }

  function drawOptions() {
    if (state.adjusting) { replaceChildren(options, drawAdjustPanel()); return; }
    if (state.tool === 'crop') {
      replaceChildren(options,
        h('span', { class: 'canvas-editor__hint' }, state.crop ? `${Math.round(state.crop.w)} × ${Math.round(state.crop.h)}` : 'Drag over the part to keep'),
        h('span', { class: 'canvas-adjust__filters', role: 'group', 'aria-label': 'Shape' }, CROP_RATIOS.map(([id, label]) => h('button', {
          type: 'button', class: `canvas-adjust__chip${state.cropRatio === id ? ' is-on' : ''}`, 'aria-pressed': String(state.cropRatio === id),
          onClick: () => { state.cropRatio = id; drawOptions(); },
        }, label))),
        h('button', { type: 'button', class: 'button button--small button--primary', disabled: !state.crop, onClick: applyCrop }, 'Crop'),
        state.crop ? h('button', { type: 'button', class: 'button button--small button--quiet', onClick: () => { state.crop = null; drawCrop(); drawOptions(); } }, 'Cancel') : null,
        h('span', { class: 'canvas-editor__divider' }),
        h('button', { type: 'button', class: 'button button--small', onClick: () => rotateCanvas(-1) }, '↺ Rotate canvas'),
        h('button', { type: 'button', class: 'button button--small', 'aria-label': 'Rotate canvas right', onClick: () => rotateCanvas(1) }, '↻'),
        h('span', { class: 'canvas-editor__hint' }, `Canvas ${width} × ${height}`));
      return;
    }
    const shapeTool = ['rect', 'ellipse'].includes(state.tool);
    replaceChildren(options,
      h('label', { class: 'canvas-editor__color' },
        h('input', { type: 'color', value: state.color, 'aria-label': 'Color', onInput: (event) => { state.color = event.target.value; } })),
      h('span', { class: 'canvas-editor__swatches' }, SWATCHES.map((color) => h('button', {
        type: 'button', class: `canvas-editor__swatch${state.color === color ? ' is-on' : ''}`, style: { background: color }, 'aria-label': `Color ${color}`,
        onClick: () => { state.color = color; drawOptions(); },
      }))),
      h('label', { class: 'canvas-editor__slider' }, 'Size ',
        h('input', { type: 'range', min: '1', max: '80', value: String(state.size), 'aria-label': 'Size', onInput: (event) => { state.size = Number(event.target.value); sizeValue.textContent = String(state.size); } }),
        h('span', { class: 'canvas-editor__value' }, String(state.size))),
      h('label', { class: 'canvas-editor__slider' }, 'Opacity ',
        h('input', { type: 'range', min: '5', max: '100', value: String(Math.round(state.opacity * 100)), 'aria-label': 'Opacity', onInput: (event) => { state.opacity = Number(event.target.value) / 100; } })),
      shapeTool ? h('label', { class: 'canvas-editor__check' }, h('input', { type: 'checkbox', checked: state.filled, onChange: (event) => { state.filled = event.target.checked; } }), ' Filled') : null);
    const sizeValue = options.querySelector('.canvas-editor__value');
  }

  function onKey(event) {
    if (!container.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (event.target.closest('input, textarea, [contenteditable="true"]')) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) stepBack(state.redo, state.undo); else stepBack(state.undo, state.redo); return; }
    if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); if (canEdit) save(); return; }
    if (mod) return;
    if (event.key === 'Escape' && state.adjusting) { cancelAdjust(); return; }
    if (event.key === 'Enter' && state.adjusting) { applyAdjust(); return; }
    if (event.key === 'Enter' && state.crop) { applyCrop(); return; }
    if (event.key.toLowerCase() === 'a' && canEdit) { if (state.adjusting) cancelAdjust(); else startAdjust(); return; }
    const tool = TOOLS.find((t) => t.key === event.key.toLowerCase());
    if (tool) selectTool(tool.id);
    if (event.key === '[') { state.size = Math.max(1, state.size - 2); drawOptions(); }
    if (event.key === ']') { state.size = Math.min(80, state.size + 2); drawOptions(); }
  }
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', (event) => { if (state.dirty && container.isConnected) { event.preventDefault(); } });

  // ─── Start ─────────────────────────────────────────────────────────────────

  async function load() {
    if (data.layers?.length) {
      for (const saved of data.layers) {
        const layer = makeLayer(saved.name);
        Object.assign(layer, { visible: saved.visible !== false, opacity: saved.opacity ?? 1 });
        try { layer.ctx.drawImage(await loadImage(saved.src), 0, 0); } catch { /* an unreadable layer starts blank */ }
        state.layers.push(layer);
      }
    } else {
      state.layers.push(makeLayer('Background', { fillWhite: true }), makeLayer('Drawing'));
    }
    state.active = state.layers[state.layers.length - 1].id;
    arrange();
    applyZoom();
  }

  const zoomButton = (label, onClick, content) => h('button', { type: 'button', class: 'button button--small button--quiet', 'aria-label': label, onClick }, content);
  replaceChildren(container, h('div', { class: 'canvas-editor' },
    canEdit ? h('div', { class: 'canvas-editor__bar' }, toolbar, options) : h('p', { class: 'settings-field__hint' }, 'You can look at this canvas but not draw on it.'),
    h('div', { class: 'canvas-editor__main' },
      viewport,
      canEdit ? h('aside', { class: 'canvas-editor__side' }, h('h3', { class: 'canvas-editor__side-title' }, icon('layers', 14), ' Layers'), layersList) : null),
    h('div', { class: 'canvas-editor__footer' },
      zoomButton('Fit to screen', () => { state.fit = true; applyZoom(); }, 'Fit'),
      zoomButton('Actual size', () => { state.fit = false; state.zoom = 1; applyZoom(); }, '100%'),
      zoomButton('Zoom out', () => { state.fit = false; state.zoom = Math.max(0.1, (parseFloat(zoomLabel.textContent) / 100) / 1.25); applyZoom(); }, '−'),
      zoomButton('Zoom in', () => { state.fit = false; state.zoom = Math.min(4, (parseFloat(zoomLabel.textContent) / 100) * 1.25); applyZoom(); }, '+'),
      zoomLabel,
      h('span', { class: 'canvas-editor__spacer' }),
      canEdit ? h('button', { type: 'button', class: 'button button--small', onClick: () => photoInput.click(), title: 'Start over from a photo, at its own size' }, icon('image', 14), ' Edit a photo') : null,
      canEdit ? h('button', { type: 'button', class: 'button button--small', onClick: () => pictureInput.click(), title: 'Add a picture as a new layer' }, icon('plus', 14), ' Add a picture') : null,
      h('button', { type: 'button', class: 'button button--small', onClick: download }, icon('download', 14), ' Download PNG'),
      canEdit ? saveButton : null,
      pictureInput,
      photoInput)));
  drawToolbar();
  drawOptions();
  load();
  return { cleanup: () => { document.removeEventListener('keydown', onKey); resizeObserver.disconnect(); } };
}
