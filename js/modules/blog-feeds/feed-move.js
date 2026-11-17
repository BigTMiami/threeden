// @ts-check
/**
 * feed-move.js — moving a post from one feed module to another on the same
 * blog (or group), by dragging it or from its "…" menu.
 *
 *   ┌ Photos ──────────────┐      ┌ Posts ───────────────────┐
 *   │ [▣] [▣] [▣]  ──drag──┼────▶ │  Drop to move it here     │
 *   └──────────────────────┘      └───────────────────────────┘
 *
 * Whoever can manage a post (the blogger; in a group, its author or a
 * moderator) can drag its tile, row, square, or card onto another feed on
 * the page they can post in. A feed that can't hold it says why while
 * you're over it ("Photo feeds need a picture", "Text feeds are words only")
 * and doesn't take it. The "…" menu has "Move to <feed>" for each other
 * feed that fits, for phones, keyboards, and the full page.
 *
 * The post keeps its id, so its likes, comments, and saves come along.
 * A toast offers Undo.
 *
 *   fitsFeed(post, variant)                 → null if it fits, or why not
 *   otherFeeds(space, moduleId)             → [{ module, variant, label }]
 *   movePost(fromId, toId, postId)          → true when moved
 *   makePostDraggable(el, { spaceId, moduleId, post })
 *   makeFeedDropTarget(el, { spaceId, moduleId, variant, frameOf: () => element })
 */

import { getModule, getTabs, updateModuleData, changeState } from '../../state/store.js';
import { showToast } from '../../ui/toast.js';
import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { trackPointer } from '../../ui/pointer-tracker.js';
import { VARIANTS } from './feed-data.js';

const FEED_VARIANT = { photofeed: 'photo', textfeed: 'text', generalfeed: 'general' };

/** What's being dragged right now. */
/** @type {{ spaceId: string, moduleId: string, postId: string, post: any } | null} */
let dragging = null;

/** Null when this post can live in a feed of this kind, or a short reason it can't. */
export function fitsFeed(post, variant) {
  const rules = VARIANTS[variant];
  const media = post.media ?? [];
  const attachments = post.attachments ?? [];
  if ((post.text ?? '').trim().length > rules.textLimit) return `Too long for a ${variant} feed (${rules.textLimit} characters)`;
  if (rules.needsMedia && media.length === 0) return 'Photo feeds need a picture or a video';
  if (!rules.allowsMedia && media.length) return 'Text feeds are words only';
  const others = attachments.filter((a) => !(a.kind === 'event' && rules.allowsEvent) && !(a.kind === 'poll' && rules.allowsPolls));
  if (!rules.allowsAttachments && others.length) return variant === 'text' ? 'Text feeds are words only' : 'Photo feeds can’t hold files or links';
  return null;
}

/** The other feed modules in this space, with a name to show ("Posts", or "Posts · Photos tab" when there are tabs). */
export function otherFeeds(space, moduleId) {
  const tabs = getTabs(space);
  return (space?.modules ?? [])
    .filter((m) => m.id !== moduleId && FEED_VARIANT[m.type])
    .map((m) => {
      const tab = tabs.length > 1 ? tabs.find((t) => t.id === (m.tabId ?? 'home')) : null;
      return { module: m, variant: FEED_VARIANT[m.type], label: tab ? `${m.title} (${tab.name})` : m.title };
    });
}

/** Move a post between two feed modules. Undo puts both back. */
export function movePost(fromId, toId, postId) {
  const from = getModule(fromId);
  const to = getModule(toId);
  if (!from || !to || fromId === toId) return false;
  const post = (from.data?.posts ?? []).find((p) => p.id === postId);
  if (!post) return false;
  const why = fitsFeed(post, FEED_VARIANT[to.type]);
  if (why) { showToast(why); return false; }
  const beforeFrom = structuredClone(from.data);
  const beforeTo = structuredClone(to.data);
  // Saved like any module change, then the page redraws both cards ('layout').
  const redraw = () => changeState(() => {}, 'layout');
  updateModuleData(fromId, { ...from.data, posts: from.data.posts.filter((p) => p.id !== postId) });
  updateModuleData(toId, { ...to.data, posts: [...(to.data?.posts ?? []), structuredClone(post)] });
  redraw();
  showToast(`Moved to ${to.title}.`, {
    actionLabel: 'Undo',
    onAction: () => { updateModuleData(fromId, beforeFrom); updateModuleData(toId, beforeTo); redraw(); },
  });
  return true;
}

/** Feeds on the page that take dropped posts: their element → what they are. */
/** @type {WeakMap<Element, { spaceId: string, moduleId: string, variant: string, frameOf: () => Element }>} */
const dropZones = new WeakMap();

/**
 * Let a post's tile, row, square, or card be dragged to another feed, with
 * the mouse or a pen (pointer events, like dragging modules: pointer-tracker.js).
 * On a touch screen, a press-and-move scrolls; "Move to" in the menu is there instead.
 */
export function makePostDraggable(el, { spaceId, moduleId, post }) {
  el.classList.add('is-post-draggable');
  // The browser's own drag (of the picture inside) would take over the pointer: stop it.
  el.addEventListener('dragstart', (event) => event.preventDefault());
  el.addEventListener('pointerdown', (downEvent) => {
    if (downEvent.pointerType === 'touch' || document.body.classList.contains('is-editing')) return;
    if (downEvent.target instanceof Element && downEvent.target.closest('input, textarea, select, a, .post-menu, .reactions, .feed-post__comments')) return;
    /** @type {HTMLElement | null} */
    let ghost = null;
    /** @type {{ zone: Element, info: any } | null} */
    let over = null;
    let last = { x: downEvent.clientX, y: downEvent.clientY };
    let scrollFrame = 0;
    // Near the window's top or bottom edge, the page scrolls (like dragging modules).
    const autoScroll = () => {
      const edge = 70;
      const speed = last.y < edge ? -18 * (1 - last.y / edge) : last.y > window.innerHeight - edge ? 18 * (1 - (window.innerHeight - last.y) / edge) : 0;
      if (speed) { window.scrollBy(0, speed); hover(last); }
      scrollFrame = requestAnimationFrame(autoScroll);
    };
    const clear = () => {
      if (!over) return;
      const frame = over.info.frameOf();
      frame.classList.remove('is-post-drop', 'is-post-drop-no');
      frame.removeAttribute('data-drop-label');
      over = null;
    };
    /** Light up the feed under the pointer: "Drop to move it here", or why it can't hold this post. */
    function hover(point) {
      const under = document.elementFromPoint(point.x, point.y);
      const zone = under?.closest('.feed-drop-zone') ?? null;
      const info = zone ? dropZones.get(zone) : null;
      if (!zone || !info || info.spaceId !== spaceId || info.moduleId === moduleId) { clear(); return; }
      if (over?.zone !== zone) clear();
      over = { zone, info };
      const why = fitsFeed(post, info.variant);
      const frame = info.frameOf();
      frame.classList.toggle('is-post-drop', !why);
      frame.classList.toggle('is-post-drop-no', Boolean(why));
      frame.setAttribute('data-drop-label', why ?? 'Drop to move it here');
    }
    trackPointer(downEvent, {
      onStart: () => {
        dragging = { spaceId, moduleId, postId: post.id, post };
        document.body.classList.add('is-dragging-post');
        el.classList.add('is-being-dragged');
        ghost = h('div', { class: 'drag-ghost feed-drag-ghost', 'aria-hidden': 'true' }, icon('announcements', 14),
          h('span', {}, (post.text ?? '').trim().slice(0, 40) || 'This post'));
        document.body.append(ghost);
        scrollFrame = requestAnimationFrame(autoScroll);
      },
      onMove: (point) => {
        last = point;
        if (ghost) ghost.style.transform = `translate(${point.x + 12}px, ${point.y + 12}px)`;
        hover(point);
      },
      onEnd: () => {
        const target = over && !fitsFeed(post, over.info.variant) ? over.info.moduleId : null;
        end();
        if (target) movePost(moduleId, target, post.id);
      },
      onCancel: () => end(),
    });
    function end() {
      cancelAnimationFrame(scrollFrame);
      clear();
      ghost?.remove();
      dragging = null;
      document.body.classList.remove('is-dragging-post');
      el.classList.remove('is-being-dragged');
    }
  });
}

/**
 * Let a feed take posts dragged from another feed in the same space.
 * `frameOf()` (the module card, or the page) shows the highlight and the label.
 */
export function makeFeedDropTarget(el, { spaceId, moduleId, variant, frameOf = () => el }) {
  el.classList.add('feed-drop-zone');
  dropZones.set(el, { spaceId, moduleId, variant, frameOf });
}

/** Is a post being dragged right now? */
export const isDraggingPost = () => Boolean(dragging);
