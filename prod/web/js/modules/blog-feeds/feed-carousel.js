// @ts-check
/**
 * feed-carousel.js — a Carousel: a blog's posts, one at a time, moving on
 * by itself. It holds the same posts as a General feed (photos, videos,
 * any file from a vault, events, links, polls), each shown as the same big
 * preview a General feed's grid tile has.
 *
 *   ┌ On stage ───────────────────────────────── ↗ ┐
 *   │ ‹ [▓▓▓▓▓▓▓▓▓▓ the post's preview ▓▓▓▓▓▓▓▓▓▓] ›  │
 *   │   The post's words                       ♥ 3  │
 *   │              ● ○ ○ ○                          │
 *   └───────────────────────────────────────────────┘
 *
 * Tapping a slide opens the post (likes, comments, Send) over the page. It
 * moves on every few seconds and stops while the pointer is over it or it
 * has keyboard focus (and for people who prefer reduced motion). Arrow keys
 * and swiping move it too. The owner turns the moving on or off, and picks
 * how fast, on the full page.
 *
 *   createPostSlideshow({ posts, settings: { autoplay, seconds }, onOpen }) → { element, stop }
 *   renderCarouselSettings(settings, onChange)
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { getReactions } from '../../state/reactions.js';
import { summarize, visual } from './feed-layouts.js';
import { postKey } from './feed-data.js';

const SECONDS_CHOICES = [3, 5, 8, 12];
const SWIPE_PX = 40;

/** @param {{ posts: any[], settings?: { autoplay?: boolean, seconds?: number }, onOpen: (index: number) => void }} options */
export function createPostSlideshow({ posts, settings = {}, onOpen }) {
  let index = 0;
  let timer = null;
  let isPaused = false;
  const prefersStill = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const element = h('div', { class: 'carousel feed-carousel', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': 'Posts', tabindex: '0' });

  function draw() {
    index = ((index % posts.length) + posts.length) % posts.length;
    const post = posts[index];
    const summary = /** @type {any} */ (summarize(post));
    const words = summary.kind === 'text' ? '' : summary.text || summary.title || '';
    const { likes, comments } = getReactions(postKey(post.id));
    replaceChildren(element,
      h('div', { class: 'carousel__frame feed-carousel__frame' },
        h('button', {
          type: 'button', class: `feed-carousel__slide feed-tile--${summary.kind}`,
          'aria-label': `Open post: ${(summary.title || summary.text || summary.label).slice(0, 80)}`,
          onClick: () => onOpen(index),
        }, visual(summary, { big: true })),
        posts.length > 1 ? h('button', { type: 'button', class: 'carousel__nav carousel__nav--prev', 'aria-label': 'Previous slide', onClick: () => go(index - 1) }, icon('chevronLeft', 22)) : null,
        posts.length > 1 ? h('button', { type: 'button', class: 'carousel__nav carousel__nav--next', 'aria-label': 'Next slide', onClick: () => go(index + 1) }, icon('chevronRight', 22)) : null),
      h('div', { class: 'carousel__below' },
        h('p', { class: 'carousel__caption feed-carousel__caption', 'aria-live': isPaused ? 'polite' : 'off' },
          h('span', {}, words || ' '),
          likes.length || comments.length
            ? h('span', { class: 'feed-carousel__counts' }, [likes.length ? `♥ ${likes.length}` : null, comments.length ? `💬 ${comments.length}` : null].filter(Boolean).join(' · '))
            : null),
        posts.length > 1 ? h('div', { class: 'carousel__dots', role: 'group', 'aria-label': 'Choose a slide' },
          posts.map((p, i) => h('button', {
            type: 'button',
            class: `carousel__dot${i === index ? ' is-current' : ''}`,
            'aria-label': `Slide ${i + 1}`,
            'aria-current': i === index ? 'true' : null,
            onClick: () => go(i),
          }))) : null));
  }

  function go(next) {
    index = next;
    draw();
    restart();
  }

  function restart() {
    clearInterval(timer);
    const { autoplay = true, seconds = 5 } = settings;
    if (!autoplay || prefersStill || isPaused || posts.length < 2) return;
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
  element.addEventListener('focusout', (event) => { if (!element.contains(/** @type {Node} */ (event.relatedTarget))) pause(false); });
  element.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') go(index - 1);
    else if (event.key === 'ArrowRight') go(index + 1);
  });
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
  return { element, stop: () => clearInterval(timer) };
}

/** The owner's settings, on the full page: move on by itself, and how often. */
export function renderCarouselSettings(settings, onChange) {
  const { autoplay = true, seconds = 5 } = settings;
  return h('div', { class: 'feed-carousel__settings' },
    h('label', { class: 'feed-carousel__setting' },
      h('input', { type: 'checkbox', checked: autoplay, onChange: (event) => onChange({ autoplay: event.target.checked }) }),
      ' Move on by itself'),
    h('label', { class: 'feed-carousel__setting' }, 'Every ',
      h('select', { class: 'input input--compact', disabled: !autoplay, 'aria-label': 'Seconds per slide', onChange: (event) => onChange({ seconds: Number(event.target.value) }) },
        SECONDS_CHOICES.map((n) => h('option', { value: String(n), selected: n === seconds }, `${n} seconds`)))));
}
