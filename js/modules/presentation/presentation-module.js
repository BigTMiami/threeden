// @ts-check
/**
 * presentation-module.js — the Presentation module: slides made together,
 * presented full screen.
 *
 *   Card:       the current slide, ‹ 2 / 7 ›, and Present
 *   Full page:  slides down the side (add, move, duplicate, delete), the
 *               slide being edited (click the title or text to type), a
 *               picture, speaker notes, and Present
 *   Presenting: full screen; → / space / click for next, ← for back, Esc to stop
 *
 * Three layouts: 'title' (big title and a subtitle), 'content' (title and
 * points, one per line), 'picture' (title and a picture, with an optional
 * caption). Works on a page and as a vault file.
 *
 * Data shape:
 *   { slides: [{ id, layout, title, body, image: { src } | null, notes }] }
 */

import { h, replaceChildren, makeId } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { readImages } from '../../ui/image-upload.js';

const LAYOUTS = [
  { id: 'title', label: 'Title' },
  { id: 'content', label: 'Title and points' },
  { id: 'picture', label: 'Picture' },
];

const newSlide = (layout = 'content') => ({ id: makeId('slide'), layout, title: '', body: '', image: null, notes: '' });

function normalize(data) {
  const slides = (data?.slides ?? []).map((s) => ({ ...newSlide(), ...s }));
  return { slides: slides.length ? slides : [newSlide('title')] };
}

/**
 * One slide, drawn at any size (the text scales with the slide's width).
 * With `onEdit`, the title and text are typed into directly.
 */
export function renderSlide(slide, { onEdit = null, onPicture = null } = {}) {
  const editable = Boolean(onEdit);
  const field = (key, className, placeholder, multiline) => {
    const value = slide[key] ?? '';
    if (!editable) {
      if (key === 'body' && slide.layout === 'content') {
        const lines = value.split('\n').map((l) => l.trim()).filter(Boolean);
        return lines.length ? h('ul', { class: className }, lines.map((line) => h('li', {}, line))) : null;
      }
      return value ? h('div', { class: className }, value) : null;
    }
    const element = h(multiline ? 'textarea' : 'input', {
      class: `${className} pres-slide__field`,
      placeholder,
      'aria-label': placeholder,
      ...(multiline ? { rows: 1 } : { type: 'text', value }),
      onInput: (event) => onEdit({ [key]: event.target.value }),
    });
    if (multiline) element.value = value;
    return element;
  };
  const titlePlaceholder = slide.layout === 'title' ? 'Click to add a title' : 'Click to add a heading';
  const bodyPlaceholder = slide.layout === 'title' ? 'Click to add a subtitle' : slide.layout === 'content' ? 'Click to add points, one per line' : 'Caption (optional)';
  const picture = slide.layout === 'picture'
    ? h('div', { class: 'pres-slide__picture' },
      slide.image?.src ? h('img', { src: slide.image.src, alt: slide.body || slide.title || 'Slide picture' }) : null,
      onPicture ? h('button', { type: 'button', class: 'button button--small pres-slide__picture-button', onClick: onPicture }, icon('image', 13), slide.image ? ' Change picture' : ' Add a picture') : null)
    : null;
  const isEmpty = !editable && !slide.title && !slide.body && !slide.image;
  return h('div', { class: `pres-slide pres-slide--${slide.layout}${editable ? ' is-editing' : ''}` },
    h('div', { class: 'pres-slide__inner' },
      isEmpty ? h('div', { class: 'pres-slide__empty' }, 'Empty slide') : null,
      field('title', 'pres-slide__title', titlePlaceholder, false),
      picture,
      field('body', 'pres-slide__body', bodyPlaceholder, slide.layout !== 'picture')));
}

/** Present the slides full screen, starting at `start`. */
export function present(slides, start = 0) {
  let index = start;
  const stage = h('div', { class: 'pres-show__stage' });
  const counter = h('span', { class: 'pres-show__count' });
  const overlay = h('div', { class: 'pres-show', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Presenting', tabindex: '-1' },
    stage,
    h('div', { class: 'pres-show__bar' },
      h('button', { type: 'button', class: 'pres-show__button', 'aria-label': 'Previous slide', onClick: (e) => { e.stopPropagation(); go(-1); } }, icon('chevronLeft', 18)),
      counter,
      h('button', { type: 'button', class: 'pres-show__button', 'aria-label': 'Next slide', onClick: (e) => { e.stopPropagation(); go(1); } }, icon('chevronRight', 18)),
      h('button', { type: 'button', class: 'pres-show__button pres-show__exit', onClick: (e) => { e.stopPropagation(); stop(); } }, icon('close', 16), ' Stop')));

  function draw() {
    replaceChildren(stage, renderSlide(slides[index]));
    counter.textContent = `${index + 1} / ${slides.length}`;
  }
  function go(step) {
    const next = index + step;
    if (next < 0) return;
    if (next >= slides.length) { stop(); return; }
    index = next;
    draw();
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); stop(); }
    else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key)) { event.preventDefault(); go(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(event.key)) { event.preventDefault(); go(-1); }
  }
  function stop() {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    overlay.remove();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  function onFullscreenChange() { if (!document.fullscreenElement && overlay.isConnected && wentFullscreen) stop(); }
  let wentFullscreen = false;

  // Tap the left third to go back, anywhere else to go on.
  overlay.addEventListener('click', (event) => go(event.clientX < window.innerWidth / 3 ? -1 : 1));
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  draw();
  overlay.focus();
  overlay.requestFullscreen?.().then(() => { wentFullscreen = true; document.addEventListener('fullscreenchange', onFullscreenChange); }).catch(() => {});
  return { stop };
}

// ── The card: the current slide, with arrows ────────────────────────────────
function renderCard(container, context) {
  let index = 0;
  const root = h('div', { class: 'pres-card' });
  container.append(root);
  function draw() {
    const { slides } = normalize(context.getData());
    index = Math.min(index, slides.length - 1);
    replaceChildren(root,
      h('button', { type: 'button', class: 'pres-card__slide', 'aria-label': 'Open the presentation', onClick: () => context.openFullPage() }, renderSlide(slides[index])),
      h('div', { class: 'pres-card__bar' },
        h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Previous slide', disabled: index === 0, onClick: () => { index -= 1; draw(); } }, icon('chevronLeft', 14)),
        h('span', { class: 'pres-card__count' }, `${index + 1} / ${slides.length}`),
        h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Next slide', disabled: index >= slides.length - 1, onClick: () => { index += 1; draw(); } }, icon('chevronRight', 14)),
        h('button', { type: 'button', class: 'button button--small button--primary pres-card__present', onClick: () => present(slides, index) }, icon('play', 12), ' Present')));
  }
  draw();
}

// ── The full page: slides down the side, the slide being edited ─────────────
function renderPage(container, context) {
  let selectedId = normalize(context.getData()).slides[0].id;
  const readOnly = context.isVisitor;
  const rail = h('ol', { class: 'pres-page__rail', 'aria-label': 'Slides' });
  const main = h('div', { class: 'pres-page__main' });
  const picker = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
  const root = h('div', { class: 'pres-page' }, rail, main, picker);
  container.append(root);

  const slides = () => normalize(context.getData()).slides;
  const selectedIndex = () => Math.max(0, slides().findIndex((s) => s.id === selectedId));

  function save(changeFn, redraw = true) {
    const next = normalize(context.getData());
    changeFn(next.slides);
    context.saveData(next);
    if (redraw) draw(); else drawRail();
  }
  const editSlide = (patch) => save((list) => Object.assign(list.find((s) => s.id === selectedId), patch), false);

  picker.addEventListener('change', async () => {
    const [photo] = await readImages(picker.files ?? []);
    picker.value = '';
    if (photo) save((list) => { list.find((s) => s.id === selectedId).image = { src: photo.src }; });
  });

  function addSlide(layout) {
    const slide = newSlide(layout);
    save((list) => { list.splice(selectedIndex() + 1, 0, slide); }, false);
    selectedId = slide.id;
    draw();
    main.querySelector('.pres-slide__field')?.focus();
  }

  function drawRail() {
    const list = slides();
    replaceChildren(rail, list.map((slide, index) => h('li', { class: `pres-page__thumb${slide.id === selectedId ? ' is-selected' : ''}` },
      h('button', { type: 'button', class: 'pres-page__thumb-button', 'aria-label': `Slide ${index + 1}${slide.title ? `: ${slide.title}` : ''}`, 'aria-current': slide.id === selectedId ? 'true' : null, onClick: () => { selectedId = slide.id; draw(); } },
        h('span', { class: 'pres-page__thumb-number' }, String(index + 1)),
        renderSlide(slide)))),
    readOnly ? null : h('li', { class: 'pres-page__add' },
      h('button', { type: 'button', class: 'button button--small', onClick: () => addSlide('content') }, icon('plus', 13), ' Slide')));
  }

  function drawMain() {
    const list = slides();
    const index = selectedIndex();
    const slide = list[index];
    const toolbar = h('div', { class: 'pres-page__toolbar' },
      readOnly ? null : h('label', { class: 'pres-page__layout' }, 'Layout ',
        h('select', { class: 'input input--compact', onChange: (event) => save((l) => { l[index].layout = event.target.value; }) },
          LAYOUTS.map((layout) => h('option', { value: layout.id, selected: layout.id === slide.layout }, layout.label)))),
      readOnly ? null : h('div', { class: 'pres-page__slide-actions' },
        h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Move slide up', disabled: index === 0, onClick: () => save((l) => { const [s] = l.splice(index, 1); l.splice(index - 1, 0, s); }) }, icon('arrowUp', 13)),
        h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Move slide down', disabled: index === list.length - 1, onClick: () => save((l) => { const [s] = l.splice(index, 1); l.splice(index + 1, 0, s); }) }, icon('arrowDown', 13)),
        h('button', { type: 'button', class: 'button button--small button--quiet', onClick: () => { const copy = { ...structuredClone(slide), id: makeId('slide') }; save((l) => { l.splice(index + 1, 0, copy); }, false); selectedId = copy.id; draw(); } }, 'Duplicate'),
        list.length > 1 ? h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Delete slide', onClick: () => { selectedId = list[index + 1]?.id ?? list[index - 1].id; save((l) => { l.splice(index, 1); }); } }, icon('trash', 13)) : null),
      h('button', { type: 'button', class: 'button button--small button--primary pres-page__present', onClick: () => present(slides(), index) }, icon('play', 12), ' Present'));
    replaceChildren(main,
      toolbar,
      h('div', { class: 'pres-page__stage' }, renderSlide(slide, readOnly ? {} : { onEdit: editSlide, onPicture: () => picker.click() })),
      readOnly
        ? null
        : h('label', { class: 'pres-page__notes' },
          h('span', { class: 'settings-field__hint' }, 'Speaker notes (not shown on the slides)'),
          h('textarea', { class: 'input', rows: 2, placeholder: 'What to say on this slide', onInput: (event) => editSlide({ notes: event.target.value }) }, slide.notes ?? '')));
  }

  function draw() { drawRail(); drawMain(); }
  draw();
}

export const presentationModule = {
  type: 'presentation',
  label: 'Presentation',
  description: 'Slides made together and presented full screen, with speaker notes',
  icon: 'slides',
  defaultSpan: 6,
  defaultRows: 11,
  available: true,

  createInitialData() {
    return { slides: [newSlide('title')] };
  },

  render: renderCard,
  renderFullPage: renderPage,
};
