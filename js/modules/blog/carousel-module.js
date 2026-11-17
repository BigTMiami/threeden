// @ts-check
/**
 * carousel-module.js — Photo carousel, a blog module: one photo at a time,
 * moving on by itself.
 *
 *   ┌ On stage ───────────────────────────────── ↗ ┐
 *   │ ‹ [▓▓▓▓▓▓▓▓▓▓▓▓ photo ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] ›  │
 *   │   Caption of this slide                      │
 *   │              ● ○ ○ ○                         │
 *   └──────────────────────────────────────────────┘
 *
 * It moves on every few seconds, and stops while the pointer is over it or
 * it has keyboard focus (and for people who prefer reduced motion). The
 * full page is where the blog's owner adds, captions, orders and removes
 * slides, and turns the automatic moving on or off.
 *
 * Data shape: { slides: [{ id, src, caption, addedAt }], autoplay: true, seconds: 5 }
 */

import { h, replaceChildren, makeId } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { openLightbox } from '../../ui/lightbox.js';
import { photoPicker } from '../../ui/image-upload.js';

const SECONDS_CHOICES = [3, 5, 8, 12];
const SWIPE_PX = 40;

export const carouselModule = {
  type: 'carousel',
  label: 'Photo carousel',
  description: 'A slideshow of photos with captions',
  icon: 'slides',
  defaultSpan: 8,
  defaultRows: 14,
  available: true,
  spaceKinds: ['blog'],

  createInitialData: () => ({ slides: [], autoplay: true, seconds: 5 }),
  render: renderCarouselCard,
  renderFullPage: renderCarouselPage,
};

// ─── The slideshow ───────────────────────────────────────────────────────────

/** The slideshow itself, used by the card and at the top of the full page. Returns { element, stop }. */
function createSlideshow(getData) {
  let index = 0;
  let timer = null;
  let isPaused = false;
  const prefersStill = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const element = h('div', { class: 'carousel', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': 'Photos', tabindex: '0' });

  function slides() { return getData().slides ?? []; }

  function draw() {
    const list = slides();
    if (list.length === 0) { replaceChildren(element, h('p', { class: 'module-empty' }, 'No slides yet.')); return; }
    index = ((index % list.length) + list.length) % list.length;
    const slide = list[index];
    replaceChildren(element,
      h('div', { class: 'carousel__frame' },
        h('img', {
          class: 'carousel__image',
          src: slide.src,
          alt: slide.caption || `Slide ${index + 1}`,
          onClick: () => openLightbox(list, index),
        }),
        list.length > 1 ? h('button', { type: 'button', class: 'carousel__nav carousel__nav--prev', 'aria-label': 'Previous slide', onClick: () => go(index - 1) }, icon('chevronLeft', 22)) : null,
        list.length > 1 ? h('button', { type: 'button', class: 'carousel__nav carousel__nav--next', 'aria-label': 'Next slide', onClick: () => go(index + 1) }, icon('chevronRight', 22)) : null),
      h('div', { class: 'carousel__below' },
        h('p', { class: 'carousel__caption', 'aria-live': isPaused ? 'polite' : 'off' }, slide.caption || ' '),
        list.length > 1 ? h('div', { class: 'carousel__dots', role: 'group', 'aria-label': 'Choose a slide' },
          list.map((s, i) => h('button', {
            type: 'button',
            class: `carousel__dot${i === index ? ' is-current' : ''}`,
            'aria-label': `Slide ${i + 1}${s.caption ? `: ${s.caption}` : ''}`,
            'aria-current': i === index ? 'true' : null,
            onClick: () => go(i),
          }))) : null),
    );
  }

  function go(next) {
    index = next;
    draw();
    restart();
  }

  function restart() {
    clearInterval(timer);
    const { autoplay = true, seconds = 5 } = getData();
    if (!autoplay || prefersStill || isPaused || slides().length < 2) return;
    timer = setInterval(() => {
      if (!element.isConnected) { clearInterval(timer); return; }
      index += 1;
      draw();
    }, seconds * 1000);
  }

  const pause = (value) => { isPaused = value; restart(); };
  element.addEventListener('pointerenter', () => pause(true));
  element.addEventListener('pointerleave', () => pause(false));
  element.addEventListener('focusin', () => pause(true));
  element.addEventListener('focusout', (event) => { if (!element.contains(event.relatedTarget)) pause(false); });
  element.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') go(index - 1);
    else if (event.key === 'ArrowRight') go(index + 1);
  });

  // Swipe on touch screens.
  let swipeStartX = null;
  element.addEventListener('pointerdown', (event) => { if (event.pointerType === 'touch') swipeStartX = event.clientX; });
  element.addEventListener('pointerup', (event) => {
    if (swipeStartX === null) return;
    const dx = event.clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(dx) > SWIPE_PX) go(index + (dx < 0 ? 1 : -1));
  });

  draw();
  restart();
  return { element, stop: () => clearInterval(timer), redraw: () => { draw(); restart(); } };
}

function renderCarouselCard(container, context) {
  const show = createSlideshow(context.getData);
  container.append(show.element);
  if (!context.isVisitor && (context.getData().slides ?? []).length === 0) {
    container.append(h('p', { class: 'module-empty' }, h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage() }, 'Add slides'), ' on the full page.'));
  }
  return show.stop;
}

// ─── Full page: the slideshow, and managing slides ───────────────────────────

function renderCarouselPage(container, context) {
  const show = createSlideshow(context.getData);
  container.append(h('div', { class: 'carousel-page__show' }, show.element));
  if (context.isVisitor) return show.stop;

  const manage = h('section', { class: 'carousel-page__manage' });

  function update(changeFn) {
    const data = structuredClone(context.getData());
    data.slides = data.slides ?? [];
    changeFn(data);
    context.saveData(data);
    show.redraw();
    drawManage();
  }

  function drawManage() {
    const { slides = [], autoplay = true, seconds = 5 } = context.getData();
    replaceChildren(manage,
      h('h2', { class: 'carousel-page__heading' }, `Slides (${slides.length})`),
      h('div', { class: 'carousel-page__settings' },
        photoPicker({ label: '+ Add photos', onPhotos: (picked) => {
          update((data) => { for (const p of picked) data.slides.push({ id: makeId('slide'), src: p.src, caption: '', addedAt: Date.now() }); });
          showToast(`Added ${picked.length} ${picked.length === 1 ? 'slide' : 'slides'}.`);
        } }),
        h('label', { class: 'page-control' },
          h('input', { type: 'checkbox', checked: autoplay, onChange: (event) => update((data) => { data.autoplay = event.target.checked; }) }),
          h('span', {}, ' Move on by itself every')),
        h('select', {
          class: 'input input--compact',
          'aria-label': 'Seconds per slide',
          disabled: !autoplay,
          onChange: (event) => update((data) => { data.seconds = Number(event.target.value); }),
        }, SECONDS_CHOICES.map((s) => h('option', { value: s, selected: s === seconds }, `${s} seconds`)))),
      slides.length === 0 ? h('p', { class: 'module-empty' }, 'Add photos to start the slideshow.') : h('ol', { class: 'carousel-page__list' },
        slides.map((slide, i) => h('li', { class: 'carousel-page__row' },
          h('img', { class: 'carousel-page__thumb', src: slide.src, alt: '' }),
          h('input', {
            type: 'text',
            class: 'input',
            value: slide.caption,
            placeholder: 'Caption',
            'aria-label': `Caption for slide ${i + 1}`,
            onChange: (event) => update((data) => { data.slides[i].caption = event.target.value.trim(); }),
          }),
          h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Move up', disabled: i === 0, onClick: () => update((data) => { data.slides.splice(i - 1, 0, data.slides.splice(i, 1)[0]); }) }, icon('arrowUp', 16)),
          h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Move down', disabled: i === slides.length - 1, onClick: () => update((data) => { data.slides.splice(i + 1, 0, data.slides.splice(i, 1)[0]); }) }, icon('arrowDown', 16)),
          h('button', {
            type: 'button',
            class: 'link-button link-button--danger',
            onClick: () => {
              const before = structuredClone(context.getData());
              update((data) => { data.slides.splice(i, 1); });
              showToast('Slide removed.', { actionLabel: 'Undo', onAction: () => { context.saveData(before); show.redraw(); drawManage(); } });
            },
          }, 'Remove')))),
    );
  }

  container.append(manage);
  drawManage();
  return show.stop;
}
