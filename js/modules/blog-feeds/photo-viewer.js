/**
 * photo-viewer.js — one post from a Photo & video feed, opened over the
 * page from its grid, like on photo apps.
 *
 *   ┌──────────────────────────────┬──────────────────────┐
 *   │                              │ (JB) Jamal · 2d       │
 *   │        the photo             │ Walking home after…   │
 *   │   ‹                     ›    │ ♥ 2  💬 1  ↗ Send     │
 *   │          • • ○               │ (comments)            │
 *   └──────────────────────────────┴──────────────────────┘
 *  (‹)  ‹ Previous post            2 of 4            Next post ›  (›)
 *
 * A post without pictures (from a General feed) opens as just the post,
 * full width. ‹ › inside the picture step through a post's photos. The round
 * ‹ › beside the panel, the buttons under it, and the arrow keys step through
 * the feed's posts, newest first (Previous is newer, Next is older); a button
 * is hidden when there's no post that way, and all of them when there's only
 * one post. On a phone only the buttons under it show. Esc or clicking
 * outside closes it.
 *
 *   openPhotoPost(posts, index, postOptions)   ← postOptions(post) → options for renderFeedPost
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { renderFeedPost } from './feed-post.js';

export function openPhotoPost(posts, startIndex, postOptions) {
  let index = startIndex;
  let mediaIndex = 0;
  const previousFocus = document.activeElement;

  const stage = h('div', { class: 'photo-viewer__stage' });
  const side = h('div', { class: 'photo-viewer__side' });
  const prevPost = h('button', { type: 'button', class: 'button button--small photo-viewer__prev', onClick: () => go(-1) }, icon('chevronLeft', 14), ' Previous post');
  const nextPost = h('button', { type: 'button', class: 'button button--small photo-viewer__next', onClick: () => go(1) }, 'Next post ', icon('chevronRight', 14));
  const position = h('span', { class: 'photo-viewer__position', 'aria-live': 'polite' });
  const sidePrev = h('button', { type: 'button', class: 'photo-viewer__post-step photo-viewer__post-step--prev', 'aria-label': 'Previous post', title: 'Previous post', onClick: () => go(-1) }, icon('chevronLeft', 24));
  const sideNext = h('button', { type: 'button', class: 'photo-viewer__post-step photo-viewer__post-step--next', 'aria-label': 'Next post', title: 'Next post', onClick: () => go(1) }, icon('chevronRight', 24));

  function go(step) {
    const next = index + step;
    if (next < 0 || next >= posts.length) return;
    index = next;
    mediaIndex = 0;
    draw();
  }

  function draw() {
    const post = posts[index];
    const media = post.media;
    const item = media[mediaIndex];
    replaceChildren(stage,
      item?.kind === 'video'
        ? h('video', { class: 'photo-viewer__media', src: item.src, controls: true, autoplay: true })
        : item ? h('img', { class: 'photo-viewer__media', src: item.src, alt: item.caption ?? '' }) : null,
      media.length > 1 ? [
        h('button', { type: 'button', class: 'photo-viewer__step photo-viewer__step--prev', 'aria-label': 'Previous photo', disabled: mediaIndex === 0, onClick: () => { mediaIndex -= 1; draw(); } }, icon('chevronLeft', 20)),
        h('button', { type: 'button', class: 'photo-viewer__step photo-viewer__step--next', 'aria-label': 'Next photo', disabled: mediaIndex === media.length - 1, onClick: () => { mediaIndex += 1; draw(); } }, icon('chevronRight', 20)),
        h('span', { class: 'photo-viewer__dots', 'aria-hidden': 'true' }, media.map((_, i) => h('span', { class: `photo-viewer__dot${i === mediaIndex ? ' is-current' : ''}` }))),
      ] : null);
    panel.classList.toggle('is-words', media.length === 0);
    replaceChildren(side, renderFeedPost(post, { ...postOptions(post, close), hideMedia: media.length > 0, startOpen: true }));
    const first = index === 0;
    const last = index === posts.length - 1;
    prevPost.hidden = first; sidePrev.hidden = first;
    nextPost.hidden = last; sideNext.hidden = last;
    position.textContent = posts.length > 1 ? `${index + 1} of ${posts.length}` : '';
    nav.hidden = posts.length < 2;
    stage.closest('.photo-viewer__panel')?.scrollTo?.(0, 0);
    side.scrollTop = 0;
  }

  const nav = h('div', { class: 'photo-viewer__nav' },
    h('span', { class: 'photo-viewer__nav-side' }, prevPost), position, h('span', { class: 'photo-viewer__nav-side photo-viewer__nav-side--end' }, nextPost));
  const panel = h('div', { class: 'photo-viewer__panel' },
    h('button', { type: 'button', class: 'icon-button photo-viewer__close', 'aria-label': 'Close', onClick: () => close() }, icon('close', 18)),
    h('div', { class: 'photo-viewer__body' }, stage, side),
    nav);
  const overlay = h('div', { class: 'sub-viewer photo-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Post' },
    h('div', { class: 'photo-viewer__row' }, h('span', { class: 'photo-viewer__gutter' }, sidePrev), panel, h('span', { class: 'photo-viewer__gutter' }, sideNext)));

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    previousFocus?.focus?.();
  }
  function onKey(event) {
    if (event.target.closest?.('input, textarea')) return;
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    else if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === 'ArrowRight') go(1);
  }
  overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.classList?.contains('photo-viewer__row') || event.target.classList?.contains('photo-viewer__gutter')) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  draw();
  overlay.querySelector('.photo-viewer__close').focus();
  return close;
}
