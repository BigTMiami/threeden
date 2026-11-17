// @ts-check
/**
 * canvas-module.js — the Canvas module: a drawing or painting, made in
 * 3den (canvas-editor.js, on the full page).
 *
 * Data:
 *   { width, height,                       ← pixels, chosen when it's made
 *     layers: [{ id, name, visible, opacity, src }],   ← each layer as a PNG
 *     image: 'data:image/png…',            ← everything flattened, for the card
 *     savedAt }
 *
 * The card shows the picture; "Draw" (or the picture) opens the editor. A
 * new canvas asks what shape it should be first.
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { timeAgo } from '../../utils/dates.js';
import { openCanvasEditor } from './canvas-editor.js';

const SHAPES = [
  { label: 'Wide', width: 1200, height: 800 },
  { label: 'Square', width: 1080, height: 1080 },
  { label: 'Tall', width: 800, height: 1200 },
  { label: 'Banner', width: 1500, height: 500 },
];

function renderCanvasCard(container, context) {
  const root = h('div', { class: 'canvas-card' });
  const data = context.getData() ?? {};
  if (!data.image) {
    replaceChildren(root,
      h('p', { class: 'canvas-card__ask' }, context.isVisitor ? 'Nothing drawn yet.' : 'What shape should it be?'),
      context.isVisitor ? null : h('div', { class: 'canvas-card__shapes' }, SHAPES.map((shape) => h('button', {
        type: 'button', class: 'canvas-card__shape',
        onClick: () => { context.saveData({ ...data, width: shape.width, height: shape.height }); context.openFullPage(); },
      },
      h('span', { class: 'canvas-card__shape-box', style: { aspectRatio: `${shape.width} / ${shape.height}` } }),
      h('span', {}, shape.label), h('span', { class: 'canvas-card__px' }, `${shape.width} × ${shape.height}`)))));
  } else {
    replaceChildren(root,
      h('button', { type: 'button', class: 'canvas-card__picture', 'aria-label': 'Open the canvas', onClick: () => context.openFullPage() },
        h('img', { src: data.image, alt: '' })),
      h('div', { class: 'canvas-card__bar' },
        h('span', { class: 'canvas-card__meta' }, `${data.width} × ${data.height}${data.savedAt ? ` · saved ${timeAgo(data.savedAt)}` : ''}`),
        h('button', { type: 'button', class: 'button button--small', onClick: () => context.openFullPage() }, icon('brush', 14), context.isVisitor ? ' Look closer' : ' Draw')));
  }
  container.append(root);
}

function renderCanvasPage(container, context) {
  const data = context.getData() ?? {};
  const editor = openCanvasEditor(container, {
    data: { width: 1200, height: 800, ...data },
    canEdit: !context.isVisitor,
    onSave: (saved) => context.saveData({ ...context.getData(), ...saved }),
  });
  return editor.cleanup;
}

export const canvasModule = {
  type: 'canvas',
  label: 'Canvas',
  description: 'Draw and paint, with brushes, shapes, fill, text, layers, and pictures',
  icon: 'brush',
  defaultSpan: 6,
  defaultRows: 14,
  available: true,
  createInitialData: () => ({}),
  render: renderCanvasCard,
  renderFullPage: renderCanvasPage,
};
